import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpsProxyAgent } from "https-proxy-agent";

export async function GET(req: NextRequest) {
    const token = req.headers.get("token");
    const brandId = req.headers.get("brand-id") || "default";
    const proxyUrl = req.headers.get("proxy-url"); // Optional proxy for geo-restricted access
    const { searchParams } = new URL(req.url);

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    try {
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const forceRefresh = searchParams.get("force") === "true";

        const hasDateFilter = !!startDate;
        const startQuery = startDate ? startDate + "T00:00:00.000Z" : undefined;
        const endQuery = startDate ? ((endDate || startDate) + "T23:59:59.999Z") : undefined;

        if (!forceRefresh) {
            const where: any = {
                brandId: brandId,
                courier: "PostEx",
            };
            if (hasDateFilter) {
                where.AND = [
                    { orderDate: { gte: startQuery } },
                    { orderDate: { lte: endQuery } }
                ];
            }

            const cachedOrders = await prisma.order.findMany({
                where,
                include: {
                    trackingStatus: true,
                    paymentStatus: true
                }
            });

            console.log(`Served ${cachedOrders.length} PostEx orders from DB for brand ${brandId}`);
            return NextResponse.json({
                dist: cachedOrders,
                source: "local",
                count: cachedOrders.length
            });
        }

        if (!startDate) {
            return NextResponse.json({ error: "Date range is required for syncing live data. Please select a month." }, { status: 400 });
        }

        console.log("Fetching freshly from PostEx API...");
        if (proxyUrl) {
            console.log(`Using proxy: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`);
        }

        try {
            const CHUNK_DAYS = 5;
            const rangeStart = new Date(startDate);
            const rangeEnd = new Date(endDate || startDate);
            const chunks: { from: string; to: string }[] = [];
            let cursor = new Date(rangeStart);

            while (cursor <= rangeEnd) {
                const chunkEnd = new Date(cursor);
                chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS - 1);
                if (chunkEnd > rangeEnd) chunkEnd.setTime(rangeEnd.getTime());

                const fromStr = cursor.toISOString().slice(0, 10);
                const toStr = chunkEnd.toISOString().slice(0, 10);
                chunks.push({ from: fromStr, to: toStr });

                cursor = new Date(chunkEnd);
                cursor.setDate(cursor.getDate() + 1);
            }

            console.log(`Splitting ${startDate} → ${endDate} into ${chunks.length} chunks of ~${CHUNK_DAYS} days`);

            const allOrdersMap = new Map<string, any>();

            for (const chunk of chunks) {
                const msgUrl = new URL("https://api.postex.pk/services/integration/api/order/v1/get-all-order");
                msgUrl.searchParams.append("startDate", chunk.from);
                msgUrl.searchParams.append("endDate", chunk.to);
                msgUrl.searchParams.append("orderStatusId", "0");

                const fetchOptions: RequestInit & { agent?: any } = {
                    method: "GET",
                    headers: { token: token },
                };
                if (proxyUrl) {
                    fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
                }

                const response = await fetch(msgUrl.toString(), fetchOptions);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`PostEx API chunk ${chunk.from}→${chunk.to} failed: ${response.status} ${errorText}`);
                    continue;
                }

                const data = await response.json();
                const chunkOrders = data.dist || [];
                console.log(`  Chunk ${chunk.from} → ${chunk.to}: ${chunkOrders.length} orders`);

                for (const order of chunkOrders) {
                    if (order.trackingNumber) {
                        allOrdersMap.set(order.trackingNumber, order);
                    }
                }
            }

            const orders = Array.from(allOrdersMap.values());
            console.log(`Total unique orders fetched: ${orders.length} (from ${chunks.length} chunks)`);

            // 3. Snapshot existing orders for diff comparison
            const incomingTrackingNumbers = (orders as any[]).map((o: any) => o.trackingNumber).filter(Boolean);
            const existingOrdersMap: Record<string, string> = {};
            if (incomingTrackingNumbers.length > 0) {
                const batchSize = 200;
                for (let i = 0; i < incomingTrackingNumbers.length; i += batchSize) {
                    const batch = incomingTrackingNumbers.slice(i, i + batchSize);
                    const existing = await prisma.order.findMany({
                        where: { trackingNumber: { in: batch }, brandId, courier: "PostEx" },
                        select: { trackingNumber: true, transactionStatus: true },
                    });
                    existing.forEach((o) => {
                        existingOrdersMap[o.trackingNumber] = (o.transactionStatus || "").toLowerCase();
                    });
                }
            }

            // 4. Save/Update to DB with Brand ID (small batches to avoid 10s timeout)
            if (Array.isArray(orders) && orders.length > 0) {
                console.log(`Caching ${orders.length} orders to DB for brand ${brandId}...`);
                const chunkSize = 10;
                for (let i = 0; i < orders.length; i += chunkSize) {
                    const chunk = orders.slice(i, i + chunkSize);
                    await Promise.allSettled(
                        chunk.map((order: any) => {
                            const status = (order.transactionStatus || order.orderStatus || "").toLowerCase();
                            const isReturn = status.includes("return");
                            const isCancelled = status.includes("cancel");

                            const pay = Number(order.invoicePayment) || 0;
                            const salesWithholdingTax = isReturn ? 0 : pay * 0.04;
                            const taxVal = isReturn ? (Number(order.reversalTax) || 0) : (Number(order.transactionTax) || 0);
                            const feeVal = isReturn ? (Number(order.reversalFee) || 0) : (Number(order.transactionFee) || 0);

                            let netAmount = 0;
                            if (isCancelled) {
                                netAmount = 0;
                            } else if (isReturn) {
                                netAmount = -(taxVal + feeVal);
                            } else {
                                netAmount = pay - taxVal - feeVal - salesWithholdingTax;
                            }

                            const safeOrderType = order.orderType || "COD";
                            const safeOrderStatus = order.orderStatus || order.transactionStatus || "Unknown";

                            const safeTransactionDate = order.transactionDate ? new Date(order.transactionDate).toISOString() : new Date().toISOString();
                            const safeOrderDate = order.orderDate ? new Date(order.orderDate).toISOString() : safeTransactionDate;

                            const updateData: any = {
                                brandId: brandId,
                                courier: "PostEx",
                                orderRefNumber: order.orderRefNumber,
                                invoicePayment: pay,
                                customerName: order.customerName,
                                customerPhone: order.customerPhone,
                                deliveryAddress: order.deliveryAddress,
                                cityName: order.cityName,
                                transactionDate: safeTransactionDate,
                                orderDetail: order.orderDetail,
                                orderType: safeOrderType,
                                orderDate: safeOrderDate,
                                orderAmount: Number(order.orderAmount) || 0,
                                orderStatus: safeOrderStatus,
                                transactionStatus: order.transactionStatus,

                                transactionTax: taxVal,
                                transactionFee: feeVal,
                                upfrontPayment: Number(order.upfrontPayment) || 0,
                                salesWithholdingTax: salesWithholdingTax,
                                netAmount: netAmount,

                                lastFetchedAt: new Date()
                            };

                            return prisma.order.upsert({
                                where: { trackingNumber: order.trackingNumber },
                                update: updateData,
                                create: {
                                    trackingNumber: order.trackingNumber,
                                    brandId: brandId,
                                    courier: "PostEx",
                                    orderRefNumber: order.orderRefNumber,
                                    invoicePayment: pay,
                                    customerName: order.customerName,
                                    customerPhone: order.customerPhone,
                                    deliveryAddress: order.deliveryAddress,
                                    cityName: order.cityName,
                                    transactionDate: safeTransactionDate,
                                    orderDetail: order.orderDetail,
                                    orderType: safeOrderType,
                                    orderDate: safeOrderDate,
                                    orderAmount: Number(order.orderAmount) || 0,
                                    orderStatus: safeOrderStatus,
                                    transactionStatus: order.transactionStatus,

                                    transactionTax: taxVal,
                                    transactionFee: feeVal,
                                    upfrontPayment: Number(order.upfrontPayment) || 0,
                                    salesWithholdingTax: salesWithholdingTax,
                                    netAmount: netAmount
                                }
                            });
                        })
                    );
                }
            }

            // 5. Fetch delivery dates from track-order API for delivered orders needing real delivery dates
            // This covers: orders with null lastStatusTime, AND orders where lastStatusTime was
            // incorrectly set by old sync logic (lastStatusTime ≈ lastFetchedAt, within 2 minutes)
            const deliveredOrders = await prisma.order.findMany({
                where: {
                    brandId,
                    courier: "PostEx",
                    OR: [
                        { transactionStatus: { contains: "Deliver", mode: "insensitive" } },
                        { orderStatus: { contains: "Deliver", mode: "insensitive" } },
                        { lastStatus: { contains: "Deliver", mode: "insensitive" } },
                    ],
                },
                select: { trackingNumber: true, lastStatusTime: true, lastFetchedAt: true },
            });

            const needsDeliveryDate = deliveredOrders.filter((order) => {
                if (!order.lastStatusTime) return true;
                if (order.lastFetchedAt) {
                    const statusTime = new Date(order.lastStatusTime).getTime();
                    const fetchTime = new Date(order.lastFetchedAt).getTime();
                    if (!isNaN(statusTime) && !isNaN(fetchTime) && Math.abs(statusTime - fetchTime) < 2 * 60 * 1000) {
                        return true;
                    }
                }
                return false;
            });

            if (needsDeliveryDate.length > 0) {
                console.log(`Fetching delivery dates for ${needsDeliveryDate.length} PostEx orders via track-order API (${deliveredOrders.length} delivered total)...`);
                const batchSize = 10;
                for (let i = 0; i < needsDeliveryDate.length; i += batchSize) {
                    const batch = needsDeliveryDate.slice(i, i + batchSize);
                    await Promise.allSettled(
                        batch.map(async (order) => {
                            try {
                                const trackUrl = `https://api.postex.pk/services/integration/api/order/v1/track-order/${order.trackingNumber}`;
                                const trackFetchOptions: RequestInit & { agent?: any } = {
                                    method: "GET",
                                    headers: { token: token },
                                };
                                if (proxyUrl) {
                                    trackFetchOptions.agent = new HttpsProxyAgent(proxyUrl);
                                }
                                const trackRes = await fetch(trackUrl, trackFetchOptions);
                                if (trackRes.ok) {
                                    const trackData = await trackRes.json();
                                    const orderData = trackData.dist || trackData.data || trackData;
                                    const deliveryDateStr = orderData.orderDeliveryDate;
                                    if (deliveryDateStr) {
                                        const deliveryDate = new Date(deliveryDateStr);
                                        if (!isNaN(deliveryDate.getTime())) {
                                            await prisma.order.update({
                                                where: { trackingNumber: order.trackingNumber },
                                                data: { lastStatusTime: deliveryDate },
                                            });
                                        }
                                    }
                                }
                            } catch (trackErr) {
                                console.warn(`Track-order failed for ${order.trackingNumber}:`, trackErr instanceof Error ? trackErr.message : trackErr);
                            }
                        })
                    );
                }
                console.log(`Finished fetching delivery dates for PostEx orders.`);
            }

            // 6. Calculate sync diff
            let newOrders = 0;
            let newDelivered = 0;
            let newReturned = 0;
            let statusChanged = 0;

            for (const order of orders as any[]) {
                const tn = order.trackingNumber;
                if (!tn) continue;
                const newStatus = (order.transactionStatus || order.orderStatus || "").toLowerCase();
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
                totalFetched: orders.length,
                newOrders,
                newDelivered,
                newReturned,
                statusChanged,
            };

            const freshOrders = await prisma.order.findMany({
                where: {
                    brandId: brandId,
                    courier: "PostEx",
                    AND: [
                        { orderDate: { gte: startQuery } },
                        { orderDate: { lte: endQuery } }
                    ]
                },
                include: {
                    trackingStatus: true,
                    paymentStatus: true
                }
            });

            return NextResponse.json({
                dist: freshOrders,
                source: "live",
                count: freshOrders.length,
                syncSummary,
            });

        } catch (error: any) {
            console.warn("PostEx Live Fetch Failed, attempting Fallback to DB...", error.message);

            // Fallback
            const cachedOrders = await prisma.order.findMany({
                where: {
                    brandId: brandId,
                    courier: "PostEx",
                    AND: [
                        { orderDate: { gte: startQuery } },
                        { orderDate: { lte: endQuery } }
                    ]
                },
                include: {
                    trackingStatus: true,
                    paymentStatus: true
                }
            });

            return NextResponse.json({
                dist: cachedOrders,
                source: "local_fallback",
                error: error.message
            });
        }

    } catch (error: any) {
        console.error("Internal API Error:", error);
        return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
    }
}
