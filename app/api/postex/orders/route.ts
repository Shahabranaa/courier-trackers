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

        if (!startDate) {
            return NextResponse.json({ error: "Missing startDate" }, { status: 400 });
        }

        // Calculate End Query Boundary for String comparison
        // Issue: "2026-01-31 23:59:59" is < "2026-01-31T00:00:00Z" (Space < T)
        // Fix: Use "2026-01-31T23:59:59.999Z" OR simply use next day logic if simplistic.
        // Robust Fix: Append 'T23:59:59.999Z' if just date.
        // Or better: lexicographical safe boundary.

        const startQuery = startDate; // e.g., "2026-01-01"
        // If "2026-01-01" vs "2026-01-01T..." -> "2026-01-01" is smaller. "gte" works.

        let endQuery = endDate ? endDate : startDate;
        // Make endQuery lexicographically larger than any ISO string of that day
        // "2026-01-31" -> "2026-01-31T23:59:59.999Z" 
        // Adding 'T23...' works because 'T' matches 'T' and time is late.
        endQuery = endQuery + "T23:59:59.999Z";


        // 1. Try to fetch from DB
        if (!forceRefresh) {
            const cachedOrders = await prisma.order.findMany({
                where: {
                    brandId: brandId,
                    courier: "PostEx", // CRITICAL: Only fetch PostEx orders, not Tranzo
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

            if (cachedOrders.length > 0) {
                console.log(`Served ${cachedOrders.length} orders from Cache for brand ${brandId}`);
                console.log(`Debug Query: ${startQuery} to ${endQuery}`);
                return NextResponse.json({
                    dist: cachedOrders,
                    source: "cache"
                });
            }
        }

        console.log("Fetching freshly from PostEx API...");
        if (proxyUrl) {
            console.log(`Using proxy: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`); // Log proxy (hide password)
        }

        // 2. Fetch from PostEx API
        const msgUrl = new URL("https://api.postex.pk/services/integration/api/order/v1/get-all-order");
        msgUrl.searchParams.append("startDate", startDate);
        if (endDate) msgUrl.searchParams.append("endDate", endDate);
        msgUrl.searchParams.append("orderStatusId", "0");

        try {
            // Create fetch options with optional proxy
            const fetchOptions: RequestInit & { agent?: any } = {
                method: "GET",
                headers: {
                    token: token,
                },
            };

            // Add proxy agent if configured
            if (proxyUrl) {
                fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
            }

            const response = await fetch(msgUrl.toString(), fetchOptions);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`PostEx API Error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            const orders = data.dist || [];

            // 3. Save/Update to DB with Brand ID
            if (Array.isArray(orders) && orders.length > 0) {
                console.log(`Caching ${orders.length} orders to DB for brand ${brandId}...`);
                // Process in chunks to avoid Prisma Accelerate limits (P6009)
                const chunkSize = 50;
                for (let i = 0; i < orders.length; i += chunkSize) {
                    const chunk = orders.slice(i, i + chunkSize);
                    await prisma.$transaction(
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

                            // Simplified Date Parsing (Direct from API)
                            // CRITICAL FIX: If orderDate is missing, use transactionDate (NOT new Date())
                            // This ensures we preserve the actual order date, not the sync date.
                            const safeTransactionDate = order.transactionDate ? new Date(order.transactionDate).toISOString() : new Date().toISOString();
                            const safeOrderDate = order.orderDate ? new Date(order.orderDate).toISOString() : safeTransactionDate;

                            return prisma.order.upsert({
                                where: { trackingNumber: order.trackingNumber },
                                update: {
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
                                },
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

            return NextResponse.json({
                dist: orders,
                source: "live"
            });

        } catch (error: any) {
            console.warn("PostEx Live Fetch Failed, attempting Fallback to DB...", error.message);

            // Fallback
            const cachedOrders = await prisma.order.findMany({
                where: {
                    brandId: brandId,
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
