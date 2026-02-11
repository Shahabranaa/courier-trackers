import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const brandId = req.headers.get("brand-id");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!brandId) {
        return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
    }

    if (!startDate || !endDate) {
        return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }

    try {
        const allOrders = await prisma.shopifyOrder.findMany({
            where: {
                brandId,
                AND: [
                    { createdAt: { gte: startDate + "T00:00:00.000Z" } },
                    { createdAt: { lte: endDate + "T23:59:59.999Z" } }
                ]
            },
            orderBy: { createdAt: "desc" }
        });

        const orders = allOrders.filter(order => {
            if (order.courierPartner && order.courierPartner.toLowerCase().includes("zoom")) {
                return true;
            }
            try {
                const fulfillments = JSON.parse(order.fulfillments || "[]");
                if (Array.isArray(fulfillments)) {
                    return fulfillments.some((f: any) =>
                        f.tracking_company && f.tracking_company.toLowerCase().includes("zoom")
                    );
                }
            } catch {}
            return false;
        });

        const stats = {
            total: orders.length,
            totalRevenue: 0,
            fulfilled: 0,
            unfulfilled: 0,
            partial: 0,
        };

        const cityData: Record<string, { total: number; delivered: number }> = {};

        orders.forEach(order => {
            stats.totalRevenue += order.totalPrice;
            const status = (order.fulfillmentStatus || "unfulfilled").toLowerCase();
            if (status === "fulfilled") stats.fulfilled++;
            else if (status === "partial") stats.partial++;
            else stats.unfulfilled++;

            const city = order.shippingCity || "Unknown";
            if (!cityData[city]) cityData[city] = { total: 0, delivered: 0 };
            cityData[city].total++;
            if (status === "fulfilled") cityData[city].delivered++;
        });

        return NextResponse.json({
            source: "local",
            count: orders.length,
            orders,
            stats,
            cityStats: Object.entries(cityData)
                .map(([city, data]) => ({
                    city,
                    total: data.total,
                    delivered: data.delivered,
                    rate: data.total > 0 ? (data.delivered / data.total) * 100 : 0
                }))
                .sort((a, b) => b.total - a.total)
        });
    } catch (error: any) {
        console.error("Zoom orders fetch failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
