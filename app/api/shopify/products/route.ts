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

export async function GET(req: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
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
        return NextResponse.json({ error: "Shopify store domain not configured." }, { status: 400 });
    }

    if (!hasDirectToken && !hasClientCredentials) {
        return NextResponse.json({ error: "No Shopify authentication configured." }, { status: 400 });
    }

    try {
        const storeDomain = normalizeStoreDomain(shopifyStore);
        let accessToken: string;

        if (hasDirectToken) {
            accessToken = directToken;
        } else {
            accessToken = await getShopifyAccessToken(storeDomain, clientId, clientSecret);
        }

        let allProducts: any[] = [];
        let pageInfo: string | null = null;
        let hasNextPage = true;
        let retriedAuth = false;

        while (hasNextPage) {
            let url: string;
            if (pageInfo) {
                url = `https://${storeDomain}/admin/api/2024-10/products.json?limit=250&page_info=${pageInfo}`;
            } else {
                url = `https://${storeDomain}/admin/api/2024-10/products.json?limit=250&status=active&fields=id,title,variants,images,product_type`;
            }

            let response = await fetch(url, {
                headers: {
                    "X-Shopify-Access-Token": accessToken,
                    "Content-Type": "application/json"
                }
            });

            if (response.status === 401 && !retriedAuth && hasClientCredentials) {
                retriedAuth = true;
                accessToken = await getShopifyAccessToken(storeDomain, clientId, clientSecret, true);
                response = await fetch(url, {
                    headers: {
                        "X-Shopify-Access-Token": accessToken,
                        "Content-Type": "application/json"
                    }
                });
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(`Shopify API error (${response.status}): ${errorText.slice(0, 300)}`);
            }

            const data = await response.json();
            const products = data.products || [];
            allProducts.push(...products);

            const linkHeader = response.headers.get("Link") || "";
            const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
            if (nextMatch) {
                pageInfo = nextMatch[1];
            } else {
                hasNextPage = false;
            }
        }

        const formattedProducts = allProducts.map((p: any) => {
            const image = p.images && p.images.length > 0 ? p.images[0].src : null;
            const variants = (p.variants || []).map((v: any) => ({
                id: v.id,
                title: v.title,
                price: v.price,
                sku: v.sku || "",
                inventoryQuantity: v.inventory_quantity,
            }));

            return {
                id: p.id,
                title: p.title,
                productType: p.product_type || "",
                image,
                variants,
            };
        });

        return NextResponse.json({
            success: true,
            count: formattedProducts.length,
            products: formattedProducts,
        });
    } catch (error: any) {
        console.error("Shopify products fetch error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
