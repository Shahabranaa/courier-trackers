import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header required" }, { status: 400 });
    }

    const startDate = req.nextUrl.searchParams.get("startDate");
    const endDate = req.nextUrl.searchParams.get("endDate");
    const filter = req.nextUrl.searchParams.get("filter") || "all";

    const where: any = { brandId };

    if (startDate && endDate) {
        where.timestamp = {
            gte: new Date(startDate + "T00:00:00.000Z"),
            lte: new Date(endDate + "T23:59:59.999Z"),
        };
    }

    if (filter === "orders") {
        where.isOrderDetected = true;
    } else if (filter === "unconverted") {
        where.isOrderDetected = true;
        where.orderCreated = false;
    }

    const messages = await prisma.whatsAppMessage.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: 500,
    });

    const stats = {
        total: await prisma.whatsAppMessage.count({ where: { brandId } }),
        orderDetected: await prisma.whatsAppMessage.count({ where: { brandId, isOrderDetected: true } }),
        orderCreated: await prisma.whatsAppMessage.count({ where: { brandId, orderCreated: true } }),
    };

    return NextResponse.json({ messages, stats });
}
