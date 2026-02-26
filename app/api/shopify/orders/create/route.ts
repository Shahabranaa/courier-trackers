import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

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
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        },
        body: params.toString()
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Shopify token request failed (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;

    if (!accessToken) {
        throw new Error(`Shopify returned an empty access token.`);
    }

    const expiresIn = data.expires_in || 86399;
    tokenCache.set(cacheKey, {
        token: accessToken,
        expiresAt: Date.now() + (expiresIn - 300) * 1000
    });

    return accessToken;
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

    if (user.role !== "ADMIN") {
        const brandAccess = await prisma.userBrand.findUnique({
            where: { userId_brandId: { userId: user.id, brandId } }
        });
        const brandOwner = await prisma.brand.findUnique({
            where: { id: brandId },
            select: { userId: true }
        });
        if (!brandAccess && brandOwner?.userId !== user.id) {
            return NextResponse.json({ error: "You do not have access to this brand" }, { status: 403 });
        }
    }

    const body = await req.json();
    const { customerName, phone, shippingAddress, shippingCity, lineItems, notes, deliveryFee } = body;

    if (!customerName || !phone || !shippingAddress || !shippingCity) {
        return NextResponse.json({ error: "Customer name, phone, shipping address, and city are required" }, { status: 400 });
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
    }

    for (const item of lineItems) {
        const qty = parseInt(item.quantity);
        const price = parseFloat(item.price);
        if (!item.title || isNaN(qty) || qty < 1 || isNaN(price) || price < 0) {
            return NextResponse.json({ error: "Each line item must have a title, quantity (>0), and valid price" }, { status: 400 });
        }
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const shopifyStore = brand.shopifyStore || "";
    const directToken = brand.shopifyAccessToken || "";
    const clientId = brand.shopifyClientId || "";
    const clientSecret = brand.shopifyClientSecret || "";

    const hasDirectToken = !!directToken;
    const hasClientCredentials = !!clientId && !!clientSecret;

    if (!shopifyStore) {
        return NextResponse.json({ error: "Shopify store domain not configured. Go to Settings and add your store domain." }, { status: 400 });
    }

    if (!hasDirectToken && !hasClientCredentials) {
        return NextResponse.json({ error: "No Shopify authentication configured. Go to Settings and add your Client ID + Client Secret." }, { status: 400 });
    }

    try {
        const storeDomain = normalizeStoreDomain(shopifyStore);
        let accessToken: string;

        if (hasDirectToken) {
            accessToken = directToken;
        } else {
            accessToken = await getShopifyAccessToken(storeDomain, clientId, clientSecret);
        }

        const nameParts = customerName.trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ".";

        async function searchCustomerByPhone(token: string, rawPhone: string): Promise<number | null> {
            const phoneVariants: string[] = [rawPhone];
            const digits = rawPhone.replace(/[\s\-\+]/g, "");
            if (digits.startsWith("0")) {
                phoneVariants.push("+92" + digits.slice(1));
            } else if (digits.startsWith("92")) {
                phoneVariants.push("+" + digits);
                phoneVariants.push("0" + digits.slice(2));
            } else if (digits.startsWith("+92")) {
                phoneVariants.push("0" + digits.slice(3));
            }
            const unique = [...new Set(phoneVariants)];

            for (const ph of unique) {
                try {
                    const searchUrl = `https://${storeDomain}/admin/api/2024-10/customers/search.json?query=phone:${encodeURIComponent(ph)}`;
                    const searchRes = await fetch(searchUrl, {
                        headers: { "X-Shopify-Access-Token": token },
                    });
                    if (searchRes.ok) {
                        const searchData = await searchRes.json();
                        if (searchData.customers && searchData.customers.length > 0) {
                            console.log(`Customer found for phone ${ph}: ID ${searchData.customers[0].id}`);
                            return searchData.customers[0].id;
                        }
                    }
                } catch (_) {}
            }
            console.log(`No existing customer found for phone: ${rawPhone}`);
            return null;
        }

        const existingCustomerId = await searchCustomerByPhone(accessToken, phone);

        const customerPayload: any = existingCustomerId
            ? { id: existingCustomerId }
            : { first_name: firstName, last_name: lastName, phone: phone };

        const parsedDeliveryFee = parseFloat(deliveryFee) || 0;

        function buildOrderPayload(custPayload: any) {
            const order: any = {
                line_items: lineItems.map((item: any) => ({
                    title: item.title,
                    quantity: parseInt(item.quantity),
                    price: parseFloat(item.price).toFixed(2),
                })),
                customer: custPayload,
                shipping_address: {
                    first_name: firstName,
                    last_name: lastName,
                    address1: shippingAddress,
                    city: shippingCity,
                    country: "Pakistan",
                    phone: phone,
                },
                billing_address: {
                    first_name: firstName,
                    last_name: lastName,
                    address1: shippingAddress,
                    city: shippingCity,
                    country: "Pakistan",
                    phone: phone,
                },
                tags: "hublogistic-app, whatsapp-order",
                note: notes || "",
                financial_status: "pending",
                send_receipt: false,
                send_fulfillment_receipt: false,
            };
            if (parsedDeliveryFee > 0) {
                order.shipping_lines = [{ title: "Delivery", price: parsedDeliveryFee.toFixed(2) }];
            }
            return { order };
        }

        const createUrl = `https://${storeDomain}/admin/api/2024-10/orders.json`;
        let response = await fetch(createUrl, {
            method: "POST",
            headers: {
                "X-Shopify-Access-Token": accessToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(buildOrderPayload(customerPayload))
        });

        if (response.status === 401 && hasClientCredentials) {
            accessToken = await getShopifyAccessToken(storeDomain, clientId, clientSecret, true);
            response = await fetch(createUrl, {
                method: "POST",
                headers: {
                    "X-Shopify-Access-Token": accessToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(buildOrderPayload(customerPayload))
            });
        }

        if (response.status === 422) {
            const errorText = await response.text().catch(() => "");
            if (errorText.includes("phone_number") && errorText.includes("has already been taken")) {
                console.log("Phone duplicate error, retrying with customer ID lookup...");
                const retryCustomerId = await searchCustomerByPhone(accessToken, phone);
                const retryPayload = retryCustomerId
                    ? { id: retryCustomerId }
                    : { phone: phone };

                response = await fetch(createUrl, {
                    method: "POST",
                    headers: {
                        "X-Shopify-Access-Token": accessToken,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(buildOrderPayload(retryPayload))
                });
            }
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.error("Shopify create order error:", errorText);
            return NextResponse.json({
                error: `Shopify API error (${response.status}): ${errorText.slice(0, 500)}`
            }, { status: response.status });
        }

        const data = await response.json();
        const createdOrder = data.order;

        if (!createdOrder) {
            return NextResponse.json({ error: "Shopify did not return the created order" }, { status: 500 });
        }

        const totalPrice = parseFloat(createdOrder.total_price || "0");
        const lineItemsStr = JSON.stringify(
            (createdOrder.line_items || []).map((li: any) => ({
                title: li.title,
                quantity: li.quantity,
                price: li.price,
                sku: li.sku || "",
            }))
        );

        await prisma.shopifyOrder.upsert({
            where: { shopifyOrderId: String(createdOrder.id) },
            update: {
                brandId,
                orderNumber: String(createdOrder.order_number || ""),
                orderName: createdOrder.name || "",
                customerName: customerName,
                email: createdOrder.email || "",
                createdAt: createdOrder.created_at || new Date().toISOString(),
                financialStatus: createdOrder.financial_status || "pending",
                fulfillmentStatus: createdOrder.fulfillment_status || "",
                totalPrice,
                currency: createdOrder.currency || "PKR",
                lineItems: lineItemsStr,
                fulfillments: "[]",
                trackingNumbers: "[]",
                courierPartner: "",
                phone: phone,
                shippingAddress: shippingAddress,
                shippingCity: shippingCity,
                tags: createdOrder.tags || "hublogistic-app, whatsapp-order",
                source: "app",
                lastFetchedAt: new Date(),
            },
            create: {
                shopifyOrderId: String(createdOrder.id),
                brandId,
                orderNumber: String(createdOrder.order_number || ""),
                orderName: createdOrder.name || "",
                customerName: customerName,
                email: createdOrder.email || "",
                createdAt: createdOrder.created_at || new Date().toISOString(),
                financialStatus: createdOrder.financial_status || "pending",
                fulfillmentStatus: createdOrder.fulfillment_status || "",
                totalPrice,
                currency: createdOrder.currency || "PKR",
                lineItems: lineItemsStr,
                fulfillments: "[]",
                trackingNumbers: "[]",
                courierPartner: "",
                phone: phone,
                shippingAddress: shippingAddress,
                shippingCity: shippingCity,
                tags: createdOrder.tags || "hublogistic-app, whatsapp-order",
                source: "app",
                lastFetchedAt: new Date(),
            },
        });

        return NextResponse.json({
            success: true,
            order: {
                id: createdOrder.id,
                orderNumber: createdOrder.order_number,
                orderName: createdOrder.name,
                totalPrice,
                customerName,
                status: createdOrder.financial_status,
            }
        });
    } catch (error: any) {
        console.error("Create order error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
