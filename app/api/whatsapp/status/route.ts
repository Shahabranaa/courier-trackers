import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ configured: false, status: "no_brand" });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.wetarseelAccountId || !brand.wetarseelUserId) {
        return NextResponse.json({ configured: false, status: "not_configured" });
    }

    return NextResponse.json({
        configured: true,
        status: "connected",
        accountId: brand.wetarseelAccountId,
    });
}
