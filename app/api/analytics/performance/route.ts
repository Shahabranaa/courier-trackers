import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
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
      return NextResponse.json({ error: "Missing startDate or endDate" }, { status: 400 });
    }

    const startQuery = startDate + "T00:00:00.000Z";
    const endQuery = endDate + "T23:59:59.999Z";

    const orders = await prisma.order.findMany({
      where: {
        brandId,
        AND: [
          { orderDate: { gte: startQuery } },
          { orderDate: { lte: endQuery } },
        ],
      },
      select: {
        trackingNumber: true,
        courier: true,
        orderDate: true,
        orderStatus: true,
        transactionStatus: true,
        lastStatus: true,
        lastStatusTime: true,
        lastFetchedAt: true,
        cityName: true,
        invoicePayment: true,
        orderDetail: true,
      },
    });

    const deliveryTimeByCityCourier: Record<string, { totalDays: number; count: number; courier: string; city: string }> = {};

    const courierStats: Record<string, { total: number; delivered: number; returned: number; inTransit: number; cancelled: number }> = {
      PostEx: { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 },
      Tranzo: { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 },
    };

    const returnByCity: Record<string, { total: number; returned: number; city: string }> = {};
    const returnByProduct: Record<string, { total: number; returned: number }> = {};

    for (const order of orders) {
      const courier = order.courier || "PostEx";
      const status = (order.transactionStatus || order.orderStatus || "").toLowerCase();
      const city = (order.cityName || "Unknown").trim().toLowerCase();
      const cityDisplay = titleCase(city);

      if (!courierStats[courier]) {
        courierStats[courier] = { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 };
      }
      courierStats[courier].total++;

      const isDelivered = status.includes("deliver");
      const isReturned = status.includes("return");
      const isCancelled = status.includes("cancel");

      if (isDelivered) {
        courierStats[courier].delivered++;
      } else if (isReturned) {
        courierStats[courier].returned++;
      } else if (isCancelled) {
        courierStats[courier].cancelled++;
      } else {
        courierStats[courier].inTransit++;
      }

      if (isDelivered && order.orderDate) {
        const deliverTimestamp = order.lastStatusTime
          ? new Date(order.lastStatusTime).getTime()
          : order.lastFetchedAt
            ? new Date(order.lastFetchedAt).getTime()
            : null;
        if (deliverTimestamp) {
          const orderTime = new Date(order.orderDate).getTime();
          if (deliverTimestamp > orderTime) {
            const daysDiff = Math.round((deliverTimestamp - orderTime) / (1000 * 60 * 60 * 24) * 10) / 10;
            if (daysDiff > 0 && daysDiff < 60) {
              const key = `${city}__${courier}`;
              if (!deliveryTimeByCityCourier[key]) {
                deliveryTimeByCityCourier[key] = { totalDays: 0, count: 0, courier, city: cityDisplay };
              }
              deliveryTimeByCityCourier[key].totalDays += daysDiff;
              deliveryTimeByCityCourier[key].count++;
            }
          }
        }
      }

      if (!returnByCity[city]) {
        returnByCity[city] = { total: 0, returned: 0, city: cityDisplay };
      }
      returnByCity[city].total++;
      if (isReturned) returnByCity[city].returned++;

      const productName = (order.orderDetail || "Unknown Product").trim();
      const productKey = productName.length > 50 ? productName.slice(0, 50) + "..." : productName;
      if (!returnByProduct[productKey]) {
        returnByProduct[productKey] = { total: 0, returned: 0 };
      }
      returnByProduct[productKey].total++;
      if (isReturned) returnByProduct[productKey].returned++;
    }

    const avgDeliveryTime = Object.values(deliveryTimeByCityCourier)
      .map((d) => ({
        city: d.city,
        courier: d.courier,
        avgDays: Math.round((d.totalDays / d.count) * 10) / 10,
        deliveredCount: d.count,
      }))
      .sort((a, b) => a.avgDays - b.avgDays);

    const avgDeliveryByCity: Record<string, { totalDays: number; count: number; postexDays: number; postexCount: number; tranzoDays: number; tranzoCount: number }> = {};
    for (const d of Object.values(deliveryTimeByCityCourier)) {
      const c = d.city.toLowerCase();
      if (!avgDeliveryByCity[c]) avgDeliveryByCity[c] = { totalDays: 0, count: 0, postexDays: 0, postexCount: 0, tranzoDays: 0, tranzoCount: 0 };
      avgDeliveryByCity[c].totalDays += d.totalDays;
      avgDeliveryByCity[c].count += d.count;
      if (d.courier === "PostEx") {
        avgDeliveryByCity[c].postexDays += d.totalDays;
        avgDeliveryByCity[c].postexCount += d.count;
      } else if (d.courier === "Tranzo") {
        avgDeliveryByCity[c].tranzoDays += d.totalDays;
        avgDeliveryByCity[c].tranzoCount += d.count;
      }
    }
    const deliveryByCity = Object.entries(avgDeliveryByCity)
      .map(([city, d]) => ({
        city: titleCase(city),
        avgDays: Math.round((d.totalDays / d.count) * 10) / 10,
        deliveredCount: d.count,
        postexAvg: d.postexCount > 0 ? Math.round((d.postexDays / d.postexCount) * 10) / 10 : null,
        postexCount: d.postexCount,
        tranzoAvg: d.tranzoCount > 0 ? Math.round((d.tranzoDays / d.tranzoCount) * 10) / 10 : null,
        tranzoCount: d.tranzoCount,
      }))
      .sort((a, b) => a.avgDays - b.avgDays);

    const avgDeliveryByCourier: Record<string, { totalDays: number; count: number }> = {};
    for (const d of Object.values(deliveryTimeByCityCourier)) {
      if (!avgDeliveryByCourier[d.courier]) avgDeliveryByCourier[d.courier] = { totalDays: 0, count: 0 };
      avgDeliveryByCourier[d.courier].totalDays += d.totalDays;
      avgDeliveryByCourier[d.courier].count += d.count;
    }
    const deliveryByCourier = Object.entries(avgDeliveryByCourier)
      .map(([courier, d]) => ({
        courier,
        avgDays: Math.round((d.totalDays / d.count) * 10) / 10,
        deliveredCount: d.count,
      }));

    const cityReturnRates = Object.values(returnByCity)
      .filter((d) => d.total >= 3)
      .map((d) => ({
        city: d.city,
        total: d.total,
        returned: d.returned,
        rate: Math.round((d.returned / d.total) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 20);

    const productReturnRates = Object.entries(returnByProduct)
      .filter(([, d]) => d.total >= 2 && d.returned > 0)
      .map(([product, d]) => ({
        product,
        total: d.total,
        returned: d.returned,
        rate: Math.round((d.returned / d.total) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 15);

    const courierComparison = Object.entries(courierStats)
      .filter(([, d]) => d.total > 0)
      .map(([courier, d]) => ({
        courier,
        total: d.total,
        delivered: d.delivered,
        returned: d.returned,
        inTransit: d.inTransit,
        cancelled: d.cancelled,
        deliveryRate: Math.round((d.delivered / d.total) * 100 * 10) / 10,
        returnRate: Math.round((d.returned / d.total) * 100 * 10) / 10,
      }));

    const overallStats = {
      totalOrders: orders.length,
      totalDelivered: Object.values(courierStats).reduce((s, d) => s + d.delivered, 0),
      totalReturned: Object.values(courierStats).reduce((s, d) => s + d.returned, 0),
      avgDeliveryDays: (() => {
        const totalCount = deliveryByCourier.reduce((s, d) => s + d.deliveredCount, 0);
        if (totalCount === 0) return 0;
        return Math.round(deliveryByCourier.reduce((s, d) => s + d.avgDays * d.deliveredCount, 0) / totalCount * 10) / 10;
      })(),
    };

    return NextResponse.json({
      overallStats,
      avgDeliveryTime,
      deliveryByCity,
      deliveryByCourier,
      cityReturnRates,
      productReturnRates,
      courierComparison,
    });
  } catch (error: any) {
    console.error("Performance API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
