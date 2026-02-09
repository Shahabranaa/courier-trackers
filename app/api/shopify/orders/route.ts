import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

function normalizeStoreDomain(store: string): string {
    let domain = store.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, "");
    domain = domain.replace(/\/+$/, "");
    if (!domain.includes(".myshopify.com")) {
        domain = `${domain}.myshopify.com`;
    }
    return domain;
}

async function getShopifyAccessToken(storeDomain: string, clientId: string, clientSecret: string, forceRefresh = false): Promise<string> {
    const cacheKey = `${storeDomain}:${clientId}`;

    if (!forceRefresh) {
        const cached = tokenCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.token;
        }
    }

    const tokenUrl = `https://${storeDomain}/admin/oauth/access_token`;
    console.log(`Requesting Shopify token from: ${tokenUrl}`);

    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);

    let response: Response;
    try {
        response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            },
            body: params.toString()
        });
    } catch (fetchError: any) {
        throw new Error(`Cannot connect to Shopify store "${storeDomain}". Check that your store domain is correct. (${fetchError.message})`);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 403) {
            throw new Error(`Shopify returned 403 Forbidden. The Client Credentials flow may not be supported for your app type. If you created a Custom App in Shopify Admin, use the Admin API Access Token instead. (${errorText.slice(0, 200)})`);
        }
        throw new Error(`Shopify token request failed (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;

    if (!accessToken) {
        throw new Error(`Shopify returned an empty access token. Response: ${JSON.stringify(data).slice(0, 200)}`);
    }

    const expiresIn = data.expires_in || 86399;

    tokenCache.set(cacheKey, {
        token: accessToken,
        expiresAt: Date.now() + (expiresIn - 300) * 1000
    });

    return accessToken;
}

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

    if (!brand) {
        return NextResponse.json({ error: `Brand not found. Make sure you have selected a brand.` }, { status: 404 });
    }

    const shopifyStore = brand.shopifyStore || "";
    const directToken = brand.shopifyAccessToken || "";
    const clientId = brand.shopifyClientId || "";
    const clientSecret = brand.shopifyClientSecret || "";

    const hasDirectToken = !!directToken;
    const hasClientCredentials = !!clientId && !!clientSecret;

    if (!shopifyStore) {
        return NextResponse.json({ error: "Shopify store domain not configured. Go to Settings and add your store domain (e.g. mystore.myshopify.com)." }, { status: 401 });
    }

    if (!hasDirectToken && !hasClientCredentials) {
        return NextResponse.json({ error: "No Shopify authentication configured. Go to Settings and add either an Admin API Access Token, or a Client ID + Client Secret." }, { status: 401 });
    }

    try {
        console.log(`Syncing Shopify orders from API for brand ${brandId} (${brand.name})...`);

        const storeDomain = normalizeStoreDomain(shopifyStore);
        console.log(`Store domain: ${storeDomain}, Auth method: ${hasDirectToken ? "Direct Token" : "Client Credentials"}`);

        let accessToken: string;

        if (hasDirectToken) {
            accessToken = directToken;
        } else {
            accessToken = await getShopifyAccessToken(storeDomain, clientId, clientSecret);
        }

        let allOrders: any[] = [];
        let pageInfo: string | null = null;
        let hasNextPage = true;
        let retriedAuth = false;

        const createdAtMin = `${startDate}T00:00:00Z`;
        const createdAtMax = `${endDate}T23:59:59Z`;

        while (hasNextPage) {
            let url: string;
            if (pageInfo) {
                url = `https://${storeDomain}/admin/api/2024-10/orders.json?limit=250&page_info=${pageInfo}`;
            } else {
                url = `https://${storeDomain}/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min=${createdAtMin}&created_at_max=${createdAtMax}`;
            }

            let response: Response;
            try {
                response = await fetch(url, {
                    headers: {
                        "X-Shopify-Access-Token": accessToken,
                        "Content-Type": "application/json"
                    }
                });
            } catch (fetchError: any) {
                throw new Error(`Cannot connect to Shopify API at ${storeDomain}. Network error: ${fetchError.message}`);
            }

            if (!response.ok) {
                if (response.status === 401 && !retriedAuth && hasClientCredentials) {
                    retriedAuth = true;
                    console.log("Shopify 401 - refreshing access token and retrying...");
                    accessToken = await getShopifyAccessToken(storeDomain, clientId, clientSecret, true);
                    continue;
                }
                const errorText = await response.text().catch(() => "");
                if (response.status === 401) {
                    throw new Error(`Shopify authentication failed (401). Your ${hasDirectToken ? "Admin API Access Token" : "Client ID/Secret"} may be invalid or expired.`);
                }
                if (response.status === 403) {
                    throw new Error(`Shopify access denied (403). Make sure your app has the "read_orders" scope and is installed on the store.`);
                }
                throw new Error(`Shopify API error (${response.status}): ${errorText.slice(0, 300)}`);
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

                        const addr = order.shipping_address || order.billing_address || {};
                        const phone = order.phone || addr.phone || order.customer?.phone || "";
                        const shippingAddress = [addr.address1, addr.address2].filter(Boolean).join(", ");
                        const shippingCity = addr.city || "";

                        return prisma.shopifyOrder.upsert({
                            where: { shopifyOrderId: String(order.id) },
                            update: {
                                brandId,
                                orderNumber: String(order.order_number || ""),
                                orderName: order.name || "",
                                email: order.email || "",
                                customerName,
                                phone,
                                shippingAddress,
                                shippingCity,
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
                                phone,
                                shippingAddress,
                                shippingCity,
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
        console.error("Shopify API Sync Failed:", error.message);
        console.error("Full error:", error.stack || error);

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
            return NextResponse.json({ error: error.message, source: "error" }, { status: 503 });
        }
    }
}
