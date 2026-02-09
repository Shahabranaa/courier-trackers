import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { name, apiToken, tranzoToken, proxyUrl, shopifyStore, shopifyClientId, shopifyClientSecret } = body;

        const shouldUpdateSecret = shopifyClientSecret !== undefined && shopifyClientSecret !== "••••••••";

        const brand = await prisma.brand.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(apiToken !== undefined && { apiToken }),
                ...(tranzoToken !== undefined && { tranzoToken }),
                ...(proxyUrl !== undefined && { proxyUrl }),
                ...(shopifyStore !== undefined && { shopifyStore }),
                ...(shopifyClientId !== undefined && { shopifyClientId }),
                ...(shouldUpdateSecret && { shopifyClientSecret })
            }
        });

        return NextResponse.json({
            ...brand,
            shopifyClientSecret: brand.shopifyClientSecret ? "••••••••" : ""
        });
    } catch (error: any) {
        console.error("Failed to update brand:", error.message);
        return NextResponse.json({ error: "Failed to update brand" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.brand.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to delete brand:", error.message);
        return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
    }
}
