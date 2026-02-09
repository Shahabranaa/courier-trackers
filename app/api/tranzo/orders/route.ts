import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const token = req.headers.get("authorization");
    const brandId = req.headers.get("brand-id") || "default";

    // Allow local fetch without token if we want? No, let's keep security but maybe fallback if token is invalid? 
    // The user said "offline", implies might not have internet to validate token against Tranzo either.
    // But we are proxying. If network is down, we can't reach Tranzo.
    // If token is missing, we shouldn't even try? 
    // Let's assume we need a token to identify "who" is asking, but valid token check is done by Tranzo.
    // If we are offline, we can't validate token. 
    // For now, accept any token format if offline? Or just proceed.

    if (!token) {
        return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    try {
        console.log(`Fetching Tranzo orders (Live check) for Brand: ${brandId}...`);

        // Step 1: Initial Request to get COUNT
        let targetUrl = "https://api-merchant.tranzo.pk/merchant/api/v1/status-orders-list/";
        let response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            }
        });

        // Network failure will throw to catch block.
        // HTTP Error (401, 500) might not throw, but we should verify.
        if (!response.ok) {
            throw new Error(`Tranzo API Error: ${response.status} ${await response.text()}`);
        }

        let data = await response.json();

        // Step 2: Check limit and fetch all if needed
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

        // Extract results
        const results = Array.isArray(data) ? data : (data.results || data.data || []);

        console.log(`Fetched ${results.length} live orders. Syncing to DB...`);

        if (results.length > 0) {
            console.log(`Syncing ${results.length} Tranzo orders to DB...`);

            // Process in chunks to avoid Prisma Accelerate limits (P6009)
            const chunkSize = 50;
            for (let i = 0; i < results.length; i += chunkSize) {
                const chunk = results.slice(i, i + chunkSize);

                await prisma.$transaction(
                    chunk.map((order: any) => {
                        const amount = parseFloat(order.cod_amount || "0");
                        const statusVal = (order.order_status || "Unknown").toLowerCase();
                        const cityVal = (order.destination_city_name || order.city_name || "").toLowerCase();

                        // Calculate Fees
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

                        // Withholding (Requested to be 0 for all orders)
                        let withholding = 0;

                        const net = amount - (fee + tax + other) - withholding;

                        return prisma.order.upsert({
                            where: { trackingNumber: order.tracking_number },
                            update: {
                                brandId: brandId, // Update brand ownership if token/context changes (important!)
                                courier: "Tranzo",
                                orderRefNumber: order.reference_number || "",
                                invoicePayment: amount,
                                customerName: order.customer_name || "N/A",
                                customerPhone: order.customer_phone || "",
                                deliveryAddress: order.delivery_address || "",
                                cityName: order.destination_city_name || order.city_name || null,
                                transactionDate: order.created_at || new Date().toISOString(),
                                orderDetail: order.order_details || "",
                                orderType: "COD",
                                orderDate: order.created_at || new Date().toISOString(),
                                orderAmount: amount,
                                orderStatus: order.order_status || "Unknown",
                                transactionStatus: order.order_status || "Unknown",
                                actualWeight: parseFloat(order.actual_weight || "0"),

                                // Financials
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
                                transactionDate: order.created_at || new Date().toISOString(),
                                orderDetail: order.order_details || "",
                                orderType: "COD",
                                orderDate: order.created_at || new Date().toISOString(),
                                orderAmount: amount,
                                orderStatus: order.order_status || "Unknown",
                                transactionStatus: order.order_status || "Unknown",
                                actualWeight: parseFloat(order.actual_weight || "0"),

                                // Financials
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

        // Return standardized LIVE response
        return NextResponse.json({
            source: "live",
            count: results.length,
            results: results
        });

    } catch (error: any) {
        console.warn("Tranzo API Offline/Error. Falling back to Local DB...", error.message);

        try {
            // Fallback: Fetch from Local DB
            // FIX: Must filter by brandId to avoid showing other brand's data
            const localOrders = await prisma.order.findMany({
                where: {
                    courier: "Tranzo",
                    brandId: brandId
                },
                orderBy: { transactionDate: 'desc' }
            });

            console.log(`Fetched ${localOrders.length} orders from Local DB for brand ${brandId}.`);

            return NextResponse.json({
                source: "local",
                count: localOrders.length,
                results: localOrders,
                error: error.message
            });

        } catch (dbError: any) {
            console.error("Local DB Access Failed:", dbError);
        }
    }
}

