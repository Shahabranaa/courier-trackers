import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function extractOrderDate(order: any, fallbackDate: string): string {
    const dateFields = [
        "created_at", "booking_date", "order_date", "createDatetime",
        "create_datetime", "booked_date", "booked_packet_date",
        "created_date", "order_created_at", "packet_date"
    ];

    for (const field of dateFields) {
        if (order[field]) {
            try {
                const parsed = new Date(order[field]);
                if (!isNaN(parsed.getTime())) {
                    return parsed.toISOString();
                }
            } catch {}
        }
    }

    return `${fallbackDate}T12:00:00.000Z`;
}

export async function GET(req: NextRequest) {
    const token = req.headers.get("api-token");
    const brandId = req.headers.get("brand-id") || "default";
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const forceSync = searchParams.get("sync") === "true";

    if (!token) {
        return NextResponse.json({ error: "Missing api-token header" }, { status: 401 });
    }

    const buildWhereClause = () => {
        const where: any = { courier: "Tranzo", brandId };
        if (startDate || endDate) {
            where.AND = [];
            if (startDate) where.AND.push({ orderDate: { gte: startDate + "T00:00:00.000Z" } });
            if (endDate) where.AND.push({ orderDate: { lte: endDate + "T23:59:59.999Z" } });
        }
        return where;
    };

    if (!forceSync) {
        try {
            const localOrders = await prisma.order.findMany({
                where: buildWhereClause(),
                orderBy: { transactionDate: 'desc' }
            });

            return NextResponse.json({
                source: "local",
                count: localOrders.length,
                results: localOrders
            });
        } catch (dbError: any) {
            console.error("DB read failed, attempting live fetch:", dbError.message);
        }
    }

    try {
        const dateFrom = startDate || (() => {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        })();
        const dateTo = endDate || (() => {
            const now = new Date();
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
        })();

        const targetUrl = `https://api-integration.tranzo.pk/api/custom/v1/get-order-logs/?date_from=${dateFrom}&date_to=${dateTo}`;

        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "api-token": token,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Tranzo API Error: ${response.status} ${await response.text()}`);
        }

        const data = await response.json();
        const results: any[] = Array.isArray(data) ? data : (data.results || data.data || data.orders || []);

        let sampleApiKeys: string[] = [];
        let sampleOrder: any = null;
        if (results.length > 0) {
            sampleApiKeys = Object.keys(results[0]);
            sampleOrder = results[0];
        }

        const uniqueOrders = new Map<string, any>();
        for (const order of results) {
            const tn = order.tracking_number;
            if (!tn) continue;
            if (!uniqueOrders.has(tn)) {
                uniqueOrders.set(tn, order);
            }
        }
        const dedupedOrders = Array.from(uniqueOrders.values());

        const incomingTrackingNumbers = dedupedOrders.map((o: any) => o.tracking_number).filter(Boolean);
        const existingOrdersMap: Record<string, string> = {};
        if (incomingTrackingNumbers.length > 0) {
            const batchSize = 200;
            for (let i = 0; i < incomingTrackingNumbers.length; i += batchSize) {
                const batch = incomingTrackingNumbers.slice(i, i + batchSize);
                const existing = await prisma.order.findMany({
                    where: { trackingNumber: { in: batch }, brandId, courier: "Tranzo" },
                    select: { trackingNumber: true, transactionStatus: true },
                });
                existing.forEach((o) => {
                    existingOrdersMap[o.trackingNumber] = (o.transactionStatus || "").toLowerCase();
                });
            }
        }

        if (dedupedOrders.length > 0) {
            const chunkSize = 10;
            for (let i = 0; i < dedupedOrders.length; i += chunkSize) {
                const chunk = dedupedOrders.slice(i, i + chunkSize);

                await Promise.allSettled(
                    chunk.map((order: any) => {
                        const bookingAmount = parseFloat(order.booking_amount || "0");
                        const deliveryFee = parseFloat(order.delivery_fee || "0");
                        const deliveryTax = parseFloat(order.delivery_tax || "0");
                        const deliveryFuelFee = parseFloat(order.delivery_fuel_fee || "0");
                        const cashHandlingFee = parseFloat(order.cash_handling_fee || "0");

                        const transactionFee = deliveryFee + deliveryFuelFee + cashHandlingFee;
                        const transactionTax = deliveryTax;
                        const netAmount = bookingAmount - deliveryFee - deliveryTax - deliveryFuelFee - cashHandlingFee;

                        const orderDateStr = extractOrderDate(order, dateFrom);

                        const orderData: any = {
                            brandId: brandId,
                            courier: "Tranzo",
                            orderRefNumber: order.reference_number || "",
                            invoicePayment: bookingAmount,
                            customerName: order.customer_name || "N/A",
                            customerPhone: order.customer_phone || "",
                            deliveryAddress: order.delivery_address || "",
                            cityName: order.destination_city || null,
                            orderDetail: order.order_details || "",
                            orderType: order.ds_shipment_type || "COD",
                            orderAmount: bookingAmount,
                            orderStatus: order.order_status || "Unknown",
                            transactionStatus: order.order_status || "Unknown",
                            actualWeight: parseFloat(order.actual_weight || "0"),
                            transactionTax: transactionTax,
                            transactionFee: transactionFee,
                            upfrontPayment: 0,
                            salesWithholdingTax: 0,
                            netAmount: netAmount,
                            orderDate: orderDateStr,
                            transactionDate: orderDateStr,
                            lastFetchedAt: new Date()
                        };

                        return prisma.order.upsert({
                            where: { trackingNumber: order.tracking_number },
                            update: orderData,
                            create: {
                                trackingNumber: order.tracking_number,
                                ...orderData,
                            }
                        });
                    })
                );
            }
        }

        let newOrders = 0;
        let newDelivered = 0;
        let newReturned = 0;
        let statusChanged = 0;

        for (const order of dedupedOrders) {
            const tn = order.tracking_number;
            if (!tn) continue;
            const newStatus = (order.order_status || "Unknown").toLowerCase();
            const oldStatus = existingOrdersMap[tn];

            if (oldStatus === undefined) {
                newOrders++;
                if (newStatus.includes("deliver")) newDelivered++;
                if (newStatus.includes("return")) newReturned++;
            } else {
                if (oldStatus !== newStatus) {
                    statusChanged++;
                    if (!oldStatus.includes("deliver") && newStatus.includes("deliver")) newDelivered++;
                    if (!oldStatus.includes("return") && newStatus.includes("return")) newReturned++;
                }
            }
        }

        const syncSummary: any = {
            totalFetched: results.length,
            uniqueOrders: dedupedOrders.length,
            newOrders,
            newDelivered,
            newReturned,
            statusChanged,
        };

        if (sampleApiKeys.length > 0) {
            syncSummary.apiFieldNames = sampleApiKeys;
            syncSummary.sampleOrderRaw = sampleOrder;
        }

        const freshOrders = await prisma.order.findMany({
            where: buildWhereClause(),
            orderBy: { transactionDate: 'desc' }
        });

        return NextResponse.json({
            source: "live",
            count: freshOrders.length,
            results: freshOrders,
            syncSummary,
        });

    } catch (error: any) {
        console.warn("Tranzo API Sync Failed:", error.message);

        try {
            const localOrders = await prisma.order.findMany({
                where: buildWhereClause(),
                orderBy: { transactionDate: 'desc' }
            });

            return NextResponse.json({
                source: "local",
                count: localOrders.length,
                results: localOrders,
                error: error.message
            });

        } catch (dbError: any) {
            console.error("Local DB Access Failed:", dbError);
            return NextResponse.json({ error: "Service unavailable", source: "error" }, { status: 503 });
        }
    }
}
