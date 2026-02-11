import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const token = req.headers.get("authorization");
    const brandId = req.headers.get("brand-id") || "default";
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const forceSync = searchParams.get("sync") === "true";

    if (!token) {
        return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    if (!forceSync) {
        try {
            const whereClause: any = {
                courier: "Tranzo",
                brandId: brandId
            };
            if (startDate || endDate) {
                whereClause.AND = [];
                if (startDate) whereClause.AND.push({ orderDate: { gte: startDate + "T00:00:00.000Z" } });
                if (endDate) whereClause.AND.push({ orderDate: { lte: endDate + "T23:59:59.999Z" } });
            }

            const localOrders = await prisma.order.findMany({
                where: whereClause,
                orderBy: { transactionDate: 'desc' }
            });

            console.log(`Served ${localOrders.length} Tranzo orders from DB for brand ${brandId}`);

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
        console.log(`Syncing Tranzo orders from API for Brand: ${brandId}...`);

        let targetUrl = "https://api-merchant.tranzo.pk/merchant/api/v1/status-orders-list/";
        let response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Tranzo API Error: ${response.status} ${await response.text()}`);
        }

        let data = await response.json();

        const totalCount = data.count || 0;
        const currentCount = Array.isArray(data) ? data.length : (data.results?.length || 0);

        if (totalCount > currentCount) {
            console.log(`Detected Pagination. Total: ${totalCount}, Fetched: ${currentCount}. Re-fetching ALL with limit=${totalCount}...`);
            targetUrl = `https://api-merchant.tranzo.pk/merchant/api/v1/status-orders-list/?page=1&limit=${totalCount}`;
            const fullResp = await fetch(targetUrl, {
                method: "GET",
                headers: {
                    "Authorization": token,
                    "Content-Type": "application/json"
                }
            });

            if (fullResp.ok) {
                data = await fullResp.json();
            }
        }

        const results = Array.isArray(data) ? data : (data.results || data.data || []);

        console.log(`Fetched ${results.length} live orders. Storing to DB...`);

        // Snapshot existing orders for diff comparison
        const incomingTrackingNumbers = (results as any[]).map((o: any) => o.tracking_number).filter(Boolean);
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

        if (results.length > 0) {
            const chunkSize = 50;
            for (let i = 0; i < results.length; i += chunkSize) {
                const chunk = results.slice(i, i + chunkSize);

                await prisma.$transaction(
                    chunk.map((order: any) => {
                        const amount = parseFloat(order.cod_amount || "0");
                        const statusVal = (order.order_status || "Unknown").toLowerCase();
                        const cityVal = (order.destination_city_name || order.city_name || "").toLowerCase();
                        const safeOrderDate = order.created_at ? new Date(order.created_at).toISOString() : new Date().toISOString();

                        let fee = 0;
                        let tax = 0;
                        let other = 0;

                        if (!statusVal.includes("cancel")) {
                            if (cityVal.includes("lahore")) {
                                fee = 90;
                                tax = 13.44;
                                other = 4;
                            } else if (cityVal.includes("karachi")) {
                                fee = 140;
                                tax = 21.84;
                                other = 6.5;
                            } else {
                                fee = 130;
                                tax = 20.16;
                                other = 0;
                            }
                        }

                        let withholding = 0;
                        const net = amount - (fee + tax + other) - withholding;

                        return prisma.order.upsert({
                            where: { trackingNumber: order.tracking_number },
                            update: {
                                brandId: brandId,
                                courier: "Tranzo",
                                orderRefNumber: order.reference_number || "",
                                invoicePayment: amount,
                                customerName: order.customer_name || "N/A",
                                customerPhone: order.customer_phone || "",
                                deliveryAddress: order.delivery_address || "",
                                cityName: order.destination_city_name || order.city_name || null,
                                transactionDate: safeOrderDate,
                                orderDetail: order.order_details || "",
                                orderType: "COD",
                                orderDate: safeOrderDate,
                                orderAmount: amount,
                                orderStatus: order.order_status || "Unknown",
                                transactionStatus: order.order_status || "Unknown",
                                actualWeight: parseFloat(order.actual_weight || "0"),
                                transactionTax: tax,
                                transactionFee: fee + other,
                                upfrontPayment: 0,
                                salesWithholdingTax: withholding,
                                netAmount: net,
                                lastFetchedAt: new Date()
                            },
                            create: {
                                trackingNumber: order.tracking_number,
                                brandId: brandId,
                                courier: "Tranzo",
                                orderRefNumber: order.reference_number || "",
                                invoicePayment: amount,
                                customerName: order.customer_name || "N/A",
                                customerPhone: order.customer_phone || "",
                                deliveryAddress: order.delivery_address || "",
                                cityName: order.destination_city_name || order.city_name || null,
                                transactionDate: safeOrderDate,
                                orderDetail: order.order_details || "",
                                orderType: "COD",
                                orderDate: safeOrderDate,
                                orderAmount: amount,
                                orderStatus: order.order_status || "Unknown",
                                transactionStatus: order.order_status || "Unknown",
                                actualWeight: parseFloat(order.actual_weight || "0"),
                                transactionTax: tax,
                                transactionFee: fee + other,
                                upfrontPayment: 0,
                                salesWithholdingTax: withholding,
                                netAmount: net
                            }
                        });
                    })
                );
            }
        }

        // Calculate sync diff
        let newOrders = 0;
        let newDelivered = 0;
        let newReturned = 0;
        let statusChanged = 0;

        for (const order of results as any[]) {
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

        const syncSummary = {
            totalFetched: results.length,
            newOrders,
            newDelivered,
            newReturned,
            statusChanged,
        };

        const whereClause: any = {
            courier: "Tranzo",
            brandId: brandId
        };
        if (startDate || endDate) {
            whereClause.AND = [];
            if (startDate) whereClause.AND.push({ orderDate: { gte: startDate + "T00:00:00.000Z" } });
            if (endDate) whereClause.AND.push({ orderDate: { lte: endDate + "T23:59:59.999Z" } });
        }

        const freshOrders = await prisma.order.findMany({
            where: whereClause,
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
            const whereClause: any = {
                courier: "Tranzo",
                brandId: brandId
            };
            if (startDate || endDate) {
                whereClause.AND = [];
                if (startDate) whereClause.AND.push({ orderDate: { gte: startDate + "T00:00:00.000Z" } });
                if (endDate) whereClause.AND.push({ orderDate: { lte: endDate + "T23:59:59.999Z" } });
            }

            const localOrders = await prisma.order.findMany({
                where: whereClause,
                orderBy: { transactionDate: 'desc' }
            });

            console.log(`Sync failed, served ${localOrders.length} orders from DB for brand ${brandId}.`);

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
