import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const brands = await prisma.brand.findMany({
            orderBy: { createdAt: 'asc' }
        });
        const safeBrands = brands.map(b => ({
            ...b,
            shopifyAccessToken: b.shopifyAccessToken ? "••••••••" : "",
            shopifyClientSecret: b.shopifyClientSecret ? "••••••••" : ""
        }));
        return NextResponse.json(safeBrands);
    } catch (error: any) {
        console.error("Failed to fetch brands:", error.message);
        return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        const body = await req.json();
        const { name, apiToken, tranzoToken, proxyUrl, shopifyStore, shopifyAccessToken, shopifyClientId, shopifyClientSecret } = body;

        if (!name) {
            return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
        }

        const brand = await prisma.brand.create({
            data: {
                name,
                apiToken: apiToken || "",
                tranzoToken: tranzoToken || "",
                proxyUrl: proxyUrl || "",
                shopifyStore: shopifyStore || "",
                shopifyAccessToken: shopifyAccessToken || "",
                shopifyClientId: shopifyClientId || "",
                shopifyClientSecret: shopifyClientSecret || ""
            }
        });

        return NextResponse.json({
            ...brand,
            shopifyAccessToken: brand.shopifyAccessToken ? "••••••••" : "",
            shopifyClientSecret: brand.shopifyClientSecret ? "••••••••" : ""
        }, { status: 201 });
    } catch (error: any) {
        console.error("Failed to create brand:", error.message);
        return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
    }
}
