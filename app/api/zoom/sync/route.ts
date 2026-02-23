import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import * as cheerio from "cheerio";

const ZOOM_DELIVERY_FEE = 150;
const ZOOM_COMMISSION_RATE = 0.04;

async function scrapeTrackingStatus(trackingNumber: string): Promise<{
    currentStatus: string;
    lastUpdate: string;
    consigneeName: string;
    destination: string;
    shipper: string;
    origin: string;
    trackingHistory: { date: string; status: string }[];
} | null> {
    try {
        const url = `https://portal.zoomcod.com/track-detail.php?track_code=${encodeURIComponent(trackingNumber)}&track=`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });

        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);
        const panelBody = $(".panel-body");
        if (panelBody.length === 0) return null;

        let shipper = "";
        let origin = "";
        let consigneeName = "";
        let destination = "";

        const shippingInfo = panelBody.find(".sender_info").first();
        shippingInfo.find("p").each((_, el) => {
            const text = $(el).text().trim();
            if (text.startsWith("Shipper:")) shipper = text.replace("Shipper:", "").trim();
            else if (text.startsWith("Origin:")) origin = text.replace("Origin:", "").trim();
        });

        const consigneeInfo = panelBody.find(".sender_info").eq(1);
        consigneeInfo.find("p").each((_, el) => {
            const text = $(el).text().trim();
            if (text.startsWith("Name:")) consigneeName = text.replace("Name:", "").trim();
            else if (text.startsWith("Destination:")) destination = text.replace("Destination:", "").trim();
        });

        const trackingHistory: { date: string; status: string }[] = [];
        panelBody.find(".table_info").first().find("tr").each((i, el) => {
            if (i === 0) return;
            const cells = $(el).find("td");
            if (cells.length >= 2) {
                trackingHistory.push({
                    date: $(cells[0]).text().trim(),
                    status: $(cells[1]).text().trim(),
                });
            }
        });

        const currentStatus = trackingHistory.length > 0
            ? trackingHistory[trackingHistory.length - 1].status
            : "Unknown";
        const lastUpdate = trackingHistory.length > 0
            ? trackingHistory[trackingHistory.length - 1].date
            : "";

        return { currentStatus, lastUpdate, consigneeName, destination, shipper, origin, trackingHistory };
    } catch {
        return null;
    }
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
        let synced = 0;
        let failed = 0;
        let skipped = 0;

        const BATCH_SIZE = 5;
        for (let i = 0; i < trackingNumbers.length; i += BATCH_SIZE) {
            const batch = trackingNumbers.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(async (tn) => {
                    const shopifyOrder = trackingMap[tn];
                    const trackingData = await scrapeTrackingStatus(tn);

                    if (!trackingData) {
                        failed++;
                        return;
                    }

                    const orderAmount = shopifyOrder.totalPrice || 0;
                    const deliveryFee = ZOOM_DELIVERY_FEE;
                    const commission = orderAmount * ZOOM_COMMISSION_RATE;
                    const netAmount = orderAmount - deliveryFee - commission;

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
