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
        if (cached && cached.expiresAt > Date.now()) return cached.token;
    }
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: params.toString()
    });
    if (!response.ok) throw new Error(`Shopify token failed (${response.status})`);
    const data = await response.json();
    if (!data.access_token) throw new Error("Empty access token");
    tokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + ((data.expires_in || 86399) - 300) * 1000 });
    return data.access_token;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const order = await prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: id } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.source !== "app") return NextResponse.json({ error: "Only app-created orders can be edited" }, { status: 403 });

    return NextResponse.json({ order });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const existingOrder = await prisma.shopifyOrder.findUnique({ where: { shopifyOrderId: id } });
    if (!existingOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (existingOrder.source !== "app") return NextResponse.json({ error: "Only app-created orders can be edited" }, { status: 403 });

    const brandId = existingOrder.brandId;
    if (user.role !== "ADMIN") {
        const brandAccess = await prisma.userBrand.findUnique({ where: { userId_brandId: { userId: user.id, brandId } } });
        const brandOwner = await prisma.brand.findUnique({ where: { id: brandId }, select: { userId: true } });
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

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const shopifyStore = brand.shopifyStore || "";
    const directToken = brand.shopifyAccessToken || "";
    const clientId = brand.shopifyClientId || "";
    const clientSecret = brand.shopifyClientSecret || "";
    const hasDirectToken = !!directToken;
    const hasClientCredentials = !!clientId && !!clientSecret;

    if (!shopifyStore || (!hasDirectToken && !hasClientCredentials)) {
        return NextResponse.json({ error: "Shopify not configured" }, { status: 400 });
    }

    try {
        const storeDomain = normalizeStoreDomain(shopifyStore);
        let accessToken = hasDirectToken ? directToken : await getShopifyAccessToken(storeDomain, clientId, clientSecret);

        const cancelUrl = `https://${storeDomain}/admin/api/2024-10/orders/${id}/cancel.json`;
        const cancelRes = await fetch(cancelUrl, {
            method: "POST",
            headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "other", email: false })
        });

        if (cancelRes.status === 401 && hasClientCredentials) {
            accessToken = await getShopifyAccessToken(storeDomain, clientId, clientSecret, true);
            const retryCancel = await fetch(cancelUrl, {
                method: "POST",
                headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "other", email: false })
            });
            if (!retryCancel.ok) {
                const errText = await retryCancel.text().catch(() => "");
                return NextResponse.json({ error: `Failed to cancel old order (${retryCancel.status}): ${errText.slice(0, 300)}` }, { status: retryCancel.status });
            }
        } else if (!cancelRes.ok && cancelRes.status !== 401) {
            const errText = await cancelRes.text().catch(() => "");
            return NextResponse.json({ error: `Failed to cancel old order (${cancelRes.status}): ${errText.slice(0, 300)}` }, { status: cancelRes.status });
        }

        const nameParts = customerName.trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ".";
        const parsedDeliveryFee = parseFloat(deliveryFee) || 0;

        async function searchCustomerByPhone(token: string, rawPhone: string): Promise<number | null> {
            const phoneVariants: string[] = [rawPhone];
            const digits = rawPhone.replace(/[\s\-\+]/g, "");
            if (digits.startsWith("0")) phoneVariants.push("+92" + digits.slice(1));
            else if (digits.startsWith("92")) { phoneVariants.push("+" + digits); phoneVariants.push("0" + digits.slice(2)); }
            for (const ph of [...new Set(phoneVariants)]) {
                try {
                    const res = await fetch(`https://${storeDomain}/admin/api/2024-10/customers/search.json?query=phone:${encodeURIComponent(ph)}`, {
                        headers: { "X-Shopify-Access-Token": token },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.customers?.length > 0) return data.customers[0].id;
                    }
                } catch (_) {}
            }
            return null;
        }

        const existingCustomerId = await searchCustomerByPhone(accessToken, phone);
        const customerPayload: any = existingCustomerId
            ? { id: existingCustomerId }
            : { first_name: firstName, last_name: lastName, phone };

        const newOrder: any = {
            line_items: lineItems.map((item: any) => ({
                title: item.title,
                quantity: parseInt(item.quantity),
                price: parseFloat(item.price).toFixed(2),
            })),
            customer: customerPayload,
            shipping_address: { first_name: firstName, last_name: lastName, address1: shippingAddress, city: shippingCity, country: "Pakistan", phone },
            billing_address: { first_name: firstName, last_name: lastName, address1: shippingAddress, city: shippingCity, country: "Pakistan", phone },
            tags: "hublogistic-app, whatsapp-order",
            note: notes || "",
            financial_status: "pending",
            send_receipt: false,
            send_fulfillment_receipt: false,
        };
        if (parsedDeliveryFee > 0) {
            newOrder.shipping_lines = [{ title: "Delivery", price: parsedDeliveryFee.toFixed(2) }];
        }

        const createUrl = `https://${storeDomain}/admin/api/2024-10/orders.json`;
        let createRes = await fetch(createUrl, {
            method: "POST",
            headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ order: newOrder })
        });

        if (createRes.status === 422) {
            const errText = await createRes.text().catch(() => "");
            if (errText.includes("phone_number") && errText.includes("has already been taken")) {
                const retryId = await searchCustomerByPhone(accessToken, phone);
                const retryPayload = retryId ? { id: retryId } : { phone };
                newOrder.customer = retryPayload;
                createRes = await fetch(createUrl, {
                    method: "POST",
                    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
                    body: JSON.stringify({ order: newOrder })
                });
            }
        }

        if (!createRes.ok) {
            const errorText = await createRes.text().catch(() => "");
            console.error("Shopify create (edit) error:", errorText);
            return NextResponse.json({ error: `Shopify API error (${createRes.status}): ${errorText.slice(0, 500)}` }, { status: createRes.status });
        }

        const data = await createRes.json();
        const createdOrder = data.order;
        if (!createdOrder) return NextResponse.json({ error: "Shopify did not return the new order" }, { status: 500 });

        const totalPrice = parseFloat(createdOrder.total_price || "0");
        const lineItemsStr = JSON.stringify(
            (createdOrder.line_items || []).map((li: any) => ({
                title: li.title, quantity: li.quantity, price: li.price, sku: li.sku || "",
            }))
        );

        await prisma.shopifyOrder.update({
            where: { shopifyOrderId: id },
            data: {
                shopifyOrderId: String(createdOrder.id),
                orderNumber: String(createdOrder.order_number || ""),
                orderName: createdOrder.name || "",
                customerName,
                phone,
                shippingAddress,
                shippingCity,
                totalPrice,
                lineItems: lineItemsStr,
                tags: createdOrder.tags || "hublogistic-app, whatsapp-order",
                financialStatus: createdOrder.financial_status || "pending",
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
        console.error("Edit order error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
