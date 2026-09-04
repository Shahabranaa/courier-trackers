import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header required" }, { status: 400 });
    }

    const startDate = req.nextUrl.searchParams.get("startDate");
    const endDate = req.nextUrl.searchParams.get("endDate");
    if (!startDate || !endDate) {
        return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    const orders = await prisma.shopifyOrder.findMany({
        where: {
            brandId,
            createdBy: { not: "" },
            createdAt: {
                gte: startDate + "T00:00:00.000Z",
                lte: endDate + "T23:59:59.999Z",
            },
        },
        select: {
            createdBy: true,
            createdAt: true,
            fulfillmentStatus: true,
        },
        orderBy: { createdAt: "desc" },
    });

    const employeeMap: Record<string, { total: number; delivered: number; daily: Record<string, number> }> = {};

    orders.forEach(o => {
        const name = (o.createdBy || "").trim();
        if (!name) return;
        if (!employeeMap[name]) {
            employeeMap[name] = { total: 0, delivered: 0, daily: {} };
        }
        employeeMap[name].total++;
        const day = o.createdAt ? o.createdAt.split("T")[0] : "Unknown";
        employeeMap[name].daily[day] = (employeeMap[name].daily[day] || 0) + 1;
        if ((o.fulfillmentStatus || "").toLowerCase() === "fulfilled") {
            employeeMap[name].delivered++;
        }
    });

    const employees = Object.entries(employeeMap)
        .map(([name, data]) => ({
            name,
            total: data.total,
            delivered: data.delivered,
            daily: data.daily,
        }))
        .sort((a, b) => b.total - a.total);

    const allDates = new Set<string>();
    employees.forEach(e => Object.keys(e.daily).forEach(d => allDates.add(d)));
    const dates = Array.from(allDates).sort();

    return NextResponse.json({ employees, dates });
}
