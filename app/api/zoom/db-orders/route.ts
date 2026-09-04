import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brandId = req.headers.get("brand-id");
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!brandId) {
        return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
    }

    try {
        const where: any = { courier: "Zoom", brandId };
        if (startDate || endDate) {
            where.AND = [];
            if (startDate) where.AND.push({ orderDate: { gte: startDate + "T00:00:00.000Z" } });
            if (endDate) where.AND.push({ orderDate: { lte: endDate + "T23:59:59.999Z" } });
        }

        const orders = await prisma.order.findMany({
            where,
            orderBy: { orderDate: "desc" },
        });

        return NextResponse.json({
            source: "local",
            count: orders.length,
            orders,
        });
    } catch (error: any) {
        console.error("Zoom DB orders fetch error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
