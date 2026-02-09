import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const brands = await prisma.brand.findMany({
            orderBy: { createdAt: 'asc' }
        });
        const safeBrands = brands.map(b => ({
            ...b,
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
        const body = await req.json();
        const { name, apiToken, tranzoToken, proxyUrl, shopifyStore, shopifyClientId, shopifyClientSecret } = body;

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
                shopifyClientId: shopifyClientId || "",
                shopifyClientSecret: shopifyClientSecret || ""
            }
        });

        return NextResponse.json({
            ...brand,
            shopifyClientSecret: brand.shopifyClientSecret ? "••••••••" : ""
        }, { status: 201 });
    } catch (error: any) {
        console.error("Failed to create brand:", error.message);
        return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
    }
}
