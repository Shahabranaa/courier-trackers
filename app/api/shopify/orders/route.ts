import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const brandId = req.headers.get("brand-id") || "default";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const forceSync = searchParams.get("sync") === "true";

    if (!startDate || !endDate) {
        return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }

    if (!forceSync) {
        try {
            const orders = await prisma.shopifyOrder.findMany({
                where: {
                    brandId,
                    AND: [
                        { createdAt: { gte: startDate + "T00:00:00.000Z" } },
                        { createdAt: { lte: endDate + "T23:59:59.999Z" } }
                    ]
                },
                orderBy: { createdAt: "desc" }
            });

            console.log(`Served ${orders.length} Shopify orders from DB for brand ${brandId}`);
            return NextResponse.json({
                source: "local",
                count: orders.length,
                orders
            });
        } catch (dbError: any) {
            console.error("DB read failed:", dbError.message);
        }
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    const shopifyStore = brand?.shopifyStore || "";
    const shopifyToken = brand?.shopifyAccessToken || "";

    if (!shopifyStore || !shopifyToken) {
        return NextResponse.json({ error: "Shopify credentials not configured for this brand" }, { status: 401 });
    }

    try {
        console.log(`Syncing Shopify orders from API for brand ${brandId}...`);

        const storeDomain = shopifyStore.includes(".myshopify.com")
            ? shopifyStore
            : `${shopifyStore}.myshopify.com`;

        let allOrders: any[] = [];
        let pageInfo: string | null = null;
        let hasNextPage = true;

        const createdAtMin = `${startDate}T00:00:00Z`;
        const createdAtMax = `${endDate}T23:59:59Z`;

        while (hasNextPage) {
            let url: string;
            if (pageInfo) {
                url = `https://${storeDomain}/admin/api/2024-01/orders.json?limit=250&page_info=${pageInfo}`;
            } else {
                url = `https://${storeDomain}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${createdAtMin}&created_at_max=${createdAtMax}`;
            }

            const response = await fetch(url, {
                headers: {
                    "X-Shopify-Access-Token": shopifyToken,
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Shopify API Error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            const orders = data.orders || [];
            allOrders = allOrders.concat(orders);

            const linkHeader = response.headers.get("link") || "";
            const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
            if (nextMatch) {
                pageInfo = nextMatch[1];
            } else {
                hasNextPage = false;
            }
        }

        console.log(`Fetched ${allOrders.length} Shopify orders. Storing to DB...`);

        if (allOrders.length > 0) {
            const chunkSize = 50;
            for (let i = 0; i < allOrders.length; i += chunkSize) {
                const chunk = allOrders.slice(i, i + chunkSize);
                await prisma.$transaction(
                    chunk.map((order: any) => {
                        const trackingNumbers: string[] = [];
                        let courierPartner = "";

                        if (order.fulfillments && Array.isArray(order.fulfillments)) {
                            for (const f of order.fulfillments) {
                                if (f.tracking_numbers && Array.isArray(f.tracking_numbers)) {
                                    trackingNumbers.push(...f.tracking_numbers);
                                } else if (f.tracking_number) {
                                    trackingNumbers.push(f.tracking_number);
                                }
                                if (f.tracking_company && !courierPartner) {
                                    courierPartner = f.tracking_company;
                                }
                            }
                        }

                        const customerName = order.customer
                            ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
                            : (order.billing_address?.name || "");

                        return prisma.shopifyOrder.upsert({
                            where: { shopifyOrderId: String(order.id) },
                            update: {
                                brandId,
                                orderNumber: String(order.order_number || ""),
                                orderName: order.name || "",
                                email: order.email || "",
                                customerName,
                                createdAt: order.created_at || new Date().toISOString(),
                                financialStatus: order.financial_status || "",
                                fulfillmentStatus: order.fulfillment_status || "unfulfilled",
                                totalPrice: parseFloat(order.total_price || "0"),
                                currency: order.currency || "PKR",
                                lineItems: JSON.stringify(
                                    (order.line_items || []).map((li: any) => ({
                                        title: li.title,
                                        quantity: li.quantity,
                                        price: li.price,
                                        sku: li.sku
                                    }))
                                ),
                                fulfillments: JSON.stringify(
                                    (order.fulfillments || []).map((f: any) => ({
                                        id: f.id,
                                        status: f.status,
                                        tracking_company: f.tracking_company,
                                        tracking_numbers: f.tracking_numbers || [f.tracking_number].filter(Boolean),
                                        created_at: f.created_at
                                    }))
                                ),
                                trackingNumbers: JSON.stringify(trackingNumbers),
                                courierPartner,
                                lastFetchedAt: new Date()
                            },
                            create: {
                                shopifyOrderId: String(order.id),
                                brandId,
                                orderNumber: String(order.order_number || ""),
                                orderName: order.name || "",
                                email: order.email || "",
                                customerName,
                                createdAt: order.created_at || new Date().toISOString(),
                                financialStatus: order.financial_status || "",
                                fulfillmentStatus: order.fulfillment_status || "unfulfilled",
                                totalPrice: parseFloat(order.total_price || "0"),
                                currency: order.currency || "PKR",
                                lineItems: JSON.stringify(
                                    (order.line_items || []).map((li: any) => ({
                                        title: li.title,
                                        quantity: li.quantity,
                                        price: li.price,
                                        sku: li.sku
                                    }))
                                ),
                                fulfillments: JSON.stringify(
                                    (order.fulfillments || []).map((f: any) => ({
                                        id: f.id,
                                        status: f.status,
                                        tracking_company: f.tracking_company,
                                        tracking_numbers: f.tracking_numbers || [f.tracking_number].filter(Boolean),
                                        created_at: f.created_at
                                    }))
                                ),
                                trackingNumbers: JSON.stringify(trackingNumbers),
                                courierPartner
                            }
                        });
                    })
                );
            }
        }

        const freshOrders = await prisma.shopifyOrder.findMany({
            where: {
                brandId,
                AND: [
                    { createdAt: { gte: startDate + "T00:00:00.000Z" } },
                    { createdAt: { lte: endDate + "T23:59:59.999Z" } }
                ]
            },
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json({
            source: "live",
            count: freshOrders.length,
            orders: freshOrders
        });

    } catch (error: any) {
        console.warn("Shopify API Sync Failed:", error.message);

        try {
            const localOrders = await prisma.shopifyOrder.findMany({
                where: {
                    brandId,
                    AND: [
                        { createdAt: { gte: startDate + "T00:00:00.000Z" } },
                        { createdAt: { lte: endDate + "T23:59:59.999Z" } }
                    ]
                },
                orderBy: { createdAt: "desc" }
            });

            return NextResponse.json({
                source: "local_fallback",
                count: localOrders.length,
                orders: localOrders,
                error: error.message
            });
        } catch (dbError: any) {
            return NextResponse.json({ error: "Service unavailable", source: "error" }, { status: 503 });
        }
    }
}
