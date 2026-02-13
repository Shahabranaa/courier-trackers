import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("auth_token")?.value;
        let userRole = "admin";
        let userBrandId: string | null = null;

        if (token) {
            const payload = verifyToken(token);
            if (payload) {
                userRole = payload.role;
                if (payload.role !== "admin") {
                    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
                    userBrandId = user?.brandId || null;
                }
            }
        }

        const where = userRole !== "admin" && userBrandId ? { id: userBrandId } : {};

        const brands = await prisma.brand.findMany({
            where,
            orderBy: { createdAt: 'asc' }
        });
        const safeBrands = brands.map(b => ({
            ...b,
            shopifyAccessToken: b.shopifyAccessToken ? "••••••••" : "",
            shopifyClientSecret: b.shopifyClientSecret ? "••••••••" : "",
            postexMerchantToken: b.postexMerchantToken ? "••••••••" : "",
            tranzoMerchantToken: b.tranzoMerchantToken ? "••••••••" : ""
        }));
        return NextResponse.json(safeBrands);
    } catch (error: any) {
        console.error("Failed to fetch brands:", error.message);
        return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, apiToken, tranzoToken, tranzoApiToken, proxyUrl, shopifyStore, shopifyAccessToken, shopifyClientId, shopifyClientSecret, postexMerchantId, postexMerchantToken, tranzoMerchantToken } = body;

        if (!name) {
            return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
        }

        const brand = await prisma.brand.create({
            data: {
                name,
                apiToken: apiToken || "",
                tranzoToken: tranzoToken || "",
                tranzoApiToken: tranzoApiToken || "",
                proxyUrl: proxyUrl || "",
                shopifyStore: shopifyStore || "",
                shopifyAccessToken: shopifyAccessToken || "",
                shopifyClientId: shopifyClientId || "",
                shopifyClientSecret: shopifyClientSecret || "",
                postexMerchantId: postexMerchantId || "",
                postexMerchantToken: postexMerchantToken || "",
                tranzoMerchantToken: tranzoMerchantToken || ""
            }
        });

        return NextResponse.json({
            ...brand,
            shopifyAccessToken: brand.shopifyAccessToken ? "••••••••" : "",
            shopifyClientSecret: brand.shopifyClientSecret ? "••••••••" : "",
            postexMerchantToken: brand.postexMerchantToken ? "••••••••" : "",
            tranzoMerchantToken: brand.tranzoMerchantToken ? "••••••••" : ""
        }, { status: 201 });
    } catch (error: any) {
        console.error("Failed to create brand:", error.message);
        return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
    }
}
