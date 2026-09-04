import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function normalizeStoreDomain(store: string): string {
    let domain = store.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, "");
    domain = domain.replace(/\/+$/, "");
    if (!domain.includes(".myshopify.com")) {
        domain = `${domain}.myshopify.com`;
    }
    return domain;
}

async function fetchClientCredentialsToken(storeDomain: string, clientId: string, clientSecret: string): Promise<string> {
    const tokenUrl = `https://${storeDomain}/admin/oauth/access_token`;
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json"
        },
        body: params.toString()
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Token request failed (${response.status}): ${text.slice(0, 250) || "no body"}`);
    }

    const data = await response.json();
    if (!data.access_token) throw new Error("Shopify did not return an access token.");
    return data.access_token as string;
}

export async function POST(req: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: any = {};
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const MASKED = "••••••••";
    let { brandId, shopifyStore, shopifyAccessToken, shopifyClientId, shopifyClientSecret } = body || {};

    if (brandId) {
        const brand = await prisma.brand.findUnique({
            where: { id: brandId },
            select: {
                id: true,
                userId: true,
                shopifyStore: true,
                shopifyAccessToken: true,
                shopifyClientId: true,
                shopifyClientSecret: true,
                name: true
            }
        });
        if (!brand) {
            return NextResponse.json({ ok: false, error: "Brand not found" }, { status: 404 });
        }
        if (user.role !== "ADMIN") {
            const ownsBrand = brand.userId === user.id;
            const hasAccess = await prisma.userBrand.findUnique({
                where: { userId_brandId: { userId: user.id, brandId } }
            });
            if (!ownsBrand && !hasAccess) {
                return NextResponse.json({ ok: false, error: "You do not have access to this brand" }, { status: 403 });
            }
        }
        shopifyStore = brand.shopifyStore || shopifyStore || "";
        shopifyAccessToken = shopifyAccessToken && shopifyAccessToken !== MASKED ? shopifyAccessToken : brand.shopifyAccessToken || "";
        shopifyClientId = shopifyClientId || brand.shopifyClientId || "";
        shopifyClientSecret = shopifyClientSecret && shopifyClientSecret !== MASKED ? shopifyClientSecret : brand.shopifyClientSecret || "";
    } else {
        if (shopifyAccessToken === MASKED) shopifyAccessToken = "";
        if (shopifyClientSecret === MASKED) shopifyClientSecret = "";
    }

    if (!shopifyStore) {
        return NextResponse.json({ ok: false, error: "Store domain is required." }, { status: 400 });
    }

    const hasDirectToken = !!shopifyAccessToken;
    const hasClientCreds = !!shopifyClientId && !!shopifyClientSecret;

    if (!hasDirectToken && !hasClientCreds) {
        return NextResponse.json({ ok: false, error: "Provide either an Admin API access token, or Client ID + Client Secret." }, { status: 400 });
    }

    try {
        const storeDomain = normalizeStoreDomain(shopifyStore);
        let accessToken: string;
        let authMethod: string;

        if (hasDirectToken) {
            accessToken = shopifyAccessToken;
            authMethod = "Admin API Token";
        } else {
            accessToken = await fetchClientCredentialsToken(storeDomain, shopifyClientId, shopifyClientSecret);
            authMethod = "Client Credentials";
        }

        const shopRes = await fetch(`https://${storeDomain}/admin/api/2024-10/shop.json`, {
            headers: {
                "X-Shopify-Access-Token": accessToken,
                "Content-Type": "application/json"
            }
        });

        if (shopRes.status === 401 || shopRes.status === 403) {
            const text = await shopRes.text().catch(() => "");
            return NextResponse.json({ ok: false, error: `Authentication failed (${shopRes.status}). Token is invalid or lacks read_products scope. ${text.slice(0, 200)}` });
        }

        if (!shopRes.ok) {
            const text = await shopRes.text().catch(() => "");
            return NextResponse.json({ ok: false, error: `Shopify error (${shopRes.status}): ${text.slice(0, 200) || "no body"}` });
        }

        const shopData = await shopRes.json();
        const shop = shopData.shop || {};

        let productCount: number | null = null;
        try {
            const countRes = await fetch(`https://${storeDomain}/admin/api/2024-10/products/count.json`, {
                headers: {
                    "X-Shopify-Access-Token": accessToken,
                    "Content-Type": "application/json"
                }
            });
            if (countRes.ok) {
                const countData = await countRes.json();
                productCount = typeof countData.count === "number" ? countData.count : null;
            }
        } catch {}

        return NextResponse.json({
            ok: true,
            authMethod,
            shop: {
                name: shop.name || null,
                domain: shop.domain || storeDomain,
                myshopifyDomain: shop.myshopify_domain || storeDomain,
                email: shop.email || null,
                currency: shop.currency || null,
                country: shop.country_name || null,
                planName: shop.plan_display_name || shop.plan_name || null
            },
            productCount
        });
    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error?.message || "Connection failed" });
    }
}
