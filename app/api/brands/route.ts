import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const brands = await prisma.brand.findMany({
            orderBy: { createdAt: 'asc' }
        });
        return NextResponse.json(brands);
    } catch (error: any) {
        console.error("Failed to fetch brands:", error.message);
        return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, apiToken, tranzoToken, proxyUrl } = body;

        if (!name) {
            return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
        }

        const brand = await prisma.brand.create({
            data: {
                name,
                apiToken: apiToken || "",
                tranzoToken: tranzoToken || "",
                proxyUrl: proxyUrl || ""
            }
        });

        return NextResponse.json(brand, { status: 201 });
    } catch (error: any) {
        console.error("Failed to create brand:", error.message);
        return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
    }
}
