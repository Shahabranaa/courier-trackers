import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { scrapeLeopardsTracking } from "@/lib/leopards";

const ZOOM_DELIVERY_FEE = 150;
const ZOOM_COMMISSION_RATE = 0.04;
const BATCH_SIZE = 15;

const TERMINAL_STATUSES = ["delivered", "returned", "return", "cancelled", "canceled"];
const SKIP_RESCRAPE_DAYS = 7;

function isTerminalStatus(status: string): boolean {
    const s = (status || "").toLowerCase();
    return TERMINAL_STATUSES.some(t => s.includes(t));
}

export async function POST(req: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
    }

    try {
        const allShopifyOrders = await prisma.shopifyOrder.findMany({
            where: { brandId },
            orderBy: { createdAt: "desc" },
        });

        const zoomOrders = allShopifyOrders.filter(order => {
            try {
                const fulfillments = JSON.parse(order.fulfillments || "[]");
                if (Array.isArray(fulfillments)) {
                    for (const f of fulfillments) {
                        if (f.tracking_company && f.tracking_company.toLowerCase().includes("zoom")) {
                            return true;
                        }
                    }
                }
            } catch {}
            if (order.courierPartner && order.courierPartner.toLowerCase().includes("zoom")) {
                return true;
            }
            return false;
        });

        const trackingMap: Record<string, typeof zoomOrders[0]> = {};
        for (const order of zoomOrders) {
            const trackingNumbers: string[] = [];
            try {
                const fulfillments = JSON.parse(order.fulfillments || "[]");
                if (Array.isArray(fulfillments)) {
                    for (const f of fulfillments) {
                        if (f.tracking_company && f.tracking_company.toLowerCase().includes("zoom")) {
                            if (f.tracking_numbers && Array.isArray(f.tracking_numbers)) {
                                trackingNumbers.push(...f.tracking_numbers);
                            } else if (f.tracking_number) {
                                trackingNumbers.push(f.tracking_number);
                            }
                        }
                    }
                }
            } catch {}

            if (trackingNumbers.length === 0) {
                try {
                    const allTracking = JSON.parse(order.trackingNumbers || "[]");
                    if (Array.isArray(allTracking)) trackingNumbers.push(...allTracking);
                } catch {}
            }

            for (const tn of trackingNumbers) {
                if (tn && tn.trim()) {
                    trackingMap[tn.trim()] = order;
                }
            }
        }

        const trackingNumbers = Object.keys(trackingMap);

        // Load existing orders to check for terminal status skip
        const existingOrders = await prisma.order.findMany({
            where: {
                trackingNumber: { in: trackingNumbers },
                brandId,
                courier: "Zoom",
            },
            select: { trackingNumber: true, transactionStatus: true, lastFetchedAt: true },
        });
        const existingMap: Record<string, { transactionStatus: string | null; lastFetchedAt: Date | null }> = {};
        for (const o of existingOrders) {
            existingMap[o.trackingNumber] = { transactionStatus: o.transactionStatus, lastFetchedAt: o.lastFetchedAt };
        }

        const skipCutoff = new Date(Date.now() - SKIP_RESCRAPE_DAYS * 24 * 60 * 60 * 1000);

        let synced = 0;
        let failed = 0;
        let skipped = 0;

        // Filter out orders we can skip
        const toScrape: string[] = [];
        for (const tn of trackingNumbers) {
            const existing = existingMap[tn];
            if (
                existing &&
                existing.transactionStatus &&
                isTerminalStatus(existing.transactionStatus) &&
                existing.lastFetchedAt &&
                existing.lastFetchedAt > skipCutoff
            ) {
                skipped++;
            } else {
                toScrape.push(tn);
            }
        }

        for (let i = 0; i < toScrape.length; i += BATCH_SIZE) {
            const batch = toScrape.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(
                batch.map(async (tn) => {
                    const shopifyOrder = trackingMap[tn];
                    const trackingData = await scrapeLeopardsTracking(tn);

                    if (!trackingData) {
                        failed++;
                        return;
                    }

                    const orderAmount = shopifyOrder.totalPrice || 0;
                    const deliveryFee = ZOOM_DELIVERY_FEE;
                    const commission = orderAmount * ZOOM_COMMISSION_RATE;
                    const statusLower = (trackingData.currentStatus || "").toLowerCase();
                    const isDelivered = statusLower.includes("delivered") && !statusLower.includes("un delivered") && !statusLower.includes("undelivered") && !statusLower.includes("not delivered");
                    const netAmount = isDelivered ? orderAmount - deliveryFee - commission : -deliveryFee;
                    const orderDate = shopifyOrder.createdAt || new Date().toISOString();

                    await prisma.order.upsert({
                        where: { trackingNumber: tn },
                        update: {
                            courier: "Zoom",
                            brandId,
                            transactionStatus: trackingData.currentStatus,
                            orderStatus: trackingData.currentStatus,
                            lastStatus: trackingData.currentStatus,
                            lastStatusTime: trackingData.lastUpdate ? new Date(trackingData.lastUpdate) : null,
                            customerName: trackingData.consigneeName || shopifyOrder.customerName || "N/A",
                            cityName: trackingData.destination || shopifyOrder.shippingCity || "Unknown",
                            deliveryAddress: shopifyOrder.shippingAddress || "",
                            customerPhone: shopifyOrder.phone || "",
                            orderAmount,
                            invoicePayment: orderAmount,
                            transactionFee: deliveryFee,
                            transactionTax: commission,
                            netAmount,
                            lastFetchedAt: new Date(),
                        },
                        create: {
                            trackingNumber: tn,
                            brandId,
                            courier: "Zoom",
                            orderRefNumber: shopifyOrder.orderName || shopifyOrder.orderNumber || "",
                            invoicePayment: orderAmount,
                            customerName: trackingData.consigneeName || shopifyOrder.customerName || "N/A",
                            customerPhone: shopifyOrder.phone || "",
                            deliveryAddress: shopifyOrder.shippingAddress || "",
                            transactionDate: orderDate,
                            orderDetail: shopifyOrder.lineItems || "Items",
                            orderType: "COD",
                            orderDate,
                            orderAmount,
                            orderStatus: trackingData.currentStatus,
                            transactionStatus: trackingData.currentStatus,
                            cityName: trackingData.destination || shopifyOrder.shippingCity || "Unknown",
                            transactionFee: deliveryFee,
                            transactionTax: commission,
                            netAmount,
                            lastStatus: trackingData.currentStatus,
                            lastStatusTime: trackingData.lastUpdate ? new Date(trackingData.lastUpdate) : null,
                            lastFetchedAt: new Date(),
                        },
                    });

                    synced++;
                })
            );
        }

        return NextResponse.json({
            success: true,
            totalZoomOrders: zoomOrders.length,
            totalTrackingNumbers: trackingNumbers.length,
            synced,
            failed,
            skipped,
        });
    } catch (error: any) {
        console.error("Zoom sync error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
