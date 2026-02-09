import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toDateString(isoString: string): string {
  return isoString.slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
      return NextResponse.json({ error: "Missing brand-id header" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Missing startDate or endDate query params" }, { status: 400 });
    }

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const rangeDays = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;

    const prevEndDate = new Date(startMs - 1000 * 60 * 60 * 24);
    const prevStartDate = new Date(prevEndDate.getTime() - (rangeDays - 1) * 1000 * 60 * 60 * 24);
    const prevStartStr = prevStartDate.toISOString().slice(0, 10);
    const prevEndStr = prevEndDate.toISOString().slice(0, 10);

    const startQuery = startDate + "T00:00:00.000Z";
    const endQuery = endDate + "T23:59:59.999Z";
    const prevStartQuery = prevStartStr + "T00:00:00.000Z";
    const prevEndQuery = prevEndStr + "T23:59:59.999Z";

    const [currentOrders, currentShopifyOrders, prevOrders, prevShopifyOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          brandId,
          AND: [
            { orderDate: { gte: startQuery } },
            { orderDate: { lte: endQuery } },
          ],
        },
        select: {
          courier: true,
          orderDate: true,
          invoicePayment: true,
          cityName: true,
        },
      }),
      prisma.shopifyOrder.findMany({
        where: {
          brandId,
          AND: [
            { createdAt: { gte: startQuery } },
            { createdAt: { lte: endQuery } },
          ],
        },
        select: {
          createdAt: true,
          totalPrice: true,
          shippingCity: true,
        },
      }),
      prisma.order.findMany({
        where: {
          brandId,
          AND: [
            { orderDate: { gte: prevStartQuery } },
            { orderDate: { lte: prevEndQuery } },
          ],
        },
        select: {
          invoicePayment: true,
        },
      }),
      prisma.shopifyOrder.findMany({
        where: {
          brandId,
          AND: [
            { createdAt: { gte: prevStartQuery } },
            { createdAt: { lte: prevEndQuery } },
          ],
        },
        select: {
          totalPrice: true,
        },
      }),
    ]);

    const dailyMap: Record<string, { total: number; postex: number; tranzo: number; shopify: number; revenue: number }> = {};
    const dayOfWeekCounts: Record<string, number> = {};
    const cityMap: Record<string, { count: number; revenue: number }> = {};

    let currentOrderCount = 0;
    let currentRevenue = 0;

    for (const order of currentOrders) {
      const date = toDateString(order.orderDate);
      if (!dailyMap[date]) {
        dailyMap[date] = { total: 0, postex: 0, tranzo: 0, shopify: 0, revenue: 0 };
      }
      dailyMap[date].total++;
      dailyMap[date].revenue += order.invoicePayment || 0;

      if (order.courier === "PostEx") {
        dailyMap[date].postex++;
      } else if (order.courier === "Tranzo") {
        dailyMap[date].tranzo++;
      }

      const dayName = DAY_NAMES[new Date(date).getUTCDay()];
      dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + 1;

      const city = (order.cityName || "Unknown").trim().toLowerCase();
      if (!cityMap[city]) cityMap[city] = { count: 0, revenue: 0 };
      cityMap[city].count++;
      cityMap[city].revenue += order.invoicePayment || 0;

      currentOrderCount++;
      currentRevenue += order.invoicePayment || 0;
    }

    for (const order of currentShopifyOrders) {
      const date = toDateString(order.createdAt);
      if (!dailyMap[date]) {
        dailyMap[date] = { total: 0, postex: 0, tranzo: 0, shopify: 0, revenue: 0 };
      }
      dailyMap[date].total++;
      dailyMap[date].shopify++;
      dailyMap[date].revenue += order.totalPrice || 0;

      const dayName = DAY_NAMES[new Date(date).getUTCDay()];
      dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + 1;

      const city = (order.shippingCity || "Unknown").trim().toLowerCase();
      if (!cityMap[city]) cityMap[city] = { count: 0, revenue: 0 };
      cityMap[city].count++;
      cityMap[city].revenue += order.totalPrice || 0;

      currentOrderCount++;
      currentRevenue += order.totalPrice || 0;
    }

    const dailyTrends = Object.entries(dailyMap)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let prevOrderCount = prevOrders.length + prevShopifyOrders.length;
    let prevRevenue = 0;
    for (const o of prevOrders) prevRevenue += o.invoicePayment || 0;
    for (const o of prevShopifyOrders) prevRevenue += o.totalPrice || 0;

    const orderGrowthPct = prevOrderCount > 0
      ? Math.round(((currentOrderCount - prevOrderCount) / prevOrderCount) * 100)
      : currentOrderCount > 0 ? 100 : 0;

    const revenueGrowthPct = prevRevenue > 0
      ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100)
      : currentRevenue > 0 ? 100 : 0;

    const growth = {
      orders: { current: currentOrderCount, previous: prevOrderCount, percentage: orderGrowthPct },
      revenue: { current: Math.round(currentRevenue), previous: Math.round(prevRevenue), percentage: revenueGrowthPct },
    };

    const byDayOfWeek = DAY_NAMES.slice(1).concat(DAY_NAMES[0]).map((day) => ({
      day,
      count: dayOfWeekCounts[day] || 0,
    }));

    const topDates = Object.entries(dailyMap)
      .map(([date, data]) => ({ date, count: data.total }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const peakDays = { byDayOfWeek, topDates };

    const totalCityOrders = Object.values(cityMap).reduce((sum, c) => sum + c.count, 0);
    const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
    const cityBreakdown = Object.entries(cityMap)
      .map(([city, data]) => ({
        city: titleCase(city),
        count: data.count,
        revenue: Math.round(data.revenue),
        percentage: totalCityOrders > 0 ? Math.round((data.count / totalCityOrders) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ dailyTrends, growth, peakDays, cityBreakdown });
  } catch (error: any) {
    console.error("Analytics API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
