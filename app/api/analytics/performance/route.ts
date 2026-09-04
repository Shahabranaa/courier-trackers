import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function isDeliveredStatus(status: string): boolean {
  return (/\bdeliver(?:ed|y)?\b|\bcompleted\b|\bok\b/.test(status)) && !/\bundelivered\b|\bnot delivered\b/.test(status);
}

function classifyOrderStatus(order: {
  courier: string | null;
  transactionStatus: string | null;
  orderStatus: string | null;
  lastStatus: string | null;
}): "delivered" | "returned" | "cancelled" | "inTransit" {
  const transactionStatus = (order.transactionStatus || order.orderStatus || "").trim().toLowerCase();
  const latestStatus = (order.lastStatus || "").trim().toLowerCase();

  if (order.courier === "TCS") {
    if (["rs", "ro"].includes(transactionStatus) || transactionStatus.includes("return")) return "returned";
    if (transactionStatus === "ok" || isDeliveredStatus(latestStatus)) return "delivered";
    if (latestStatus.includes("return")) return "returned";
    if (latestStatus.includes("cancel")) return "cancelled";
    return "inTransit";
  }

  const status = transactionStatus || latestStatus;
  if (status.includes("cancel") || status.includes("void")) return "cancelled";
  if (status.includes("return") || ["rs", "ro", "rto"].includes(status)) return "returned";
  if (isDeliveredStatus(status)) return "delivered";
  return "inTransit";
}

function getFeeTaxTotal(order: {
  courier: string | null;
  transactionFee: number | null;
  transactionTax: number | null;
  salesWithholdingTax: number | null;
  paymentStatus?: { data: string } | null;
}): number | null {
  if (order.courier === "TCS" && order.paymentStatus?.data) {
    try {
      const payment = JSON.parse(order.paymentStatus.data);
      return Number(payment.deliveryCharges || 0)
        + Number(payment.salesTax || 0)
        + Number(payment.fuelSurcharge || 0);
    } catch {
      // Fall through to the persisted order fields when payment detail is malformed.
    }
  }

  if (order.transactionFee === null && order.transactionTax === null) return null;
  const withholding = order.courier === "TCS" ? Number(order.salesWithholdingTax || 0) : 0;
  return Number(order.transactionFee || 0) + Number(order.transactionTax || 0) - withholding;
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
        transactionDate: true,
        cityName: true,
        invoicePayment: true,
        transactionFee: true,
        transactionTax: true,
        salesWithholdingTax: true,
        paymentStatus: { select: { data: true } },
        orderDetail: true,
      },
    });

    const deliveryTimeByCityCourier: Record<string, { totalDays: number; count: number; courier: string; city: string }> = {};

    const courierStats: Record<string, { total: number; delivered: number; returned: number; inTransit: number; cancelled: number }> = {
      PostEx: { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 },
      Tranzo: { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 },
      TCS: { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 },
      Leopards: { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 },
    };

    const returnByCity: Record<string, {
      total: number;
      delivered: number;
      returned: number;
      city: string;
      feeTaxTotal: number;
      feeTaxCount: number;
      courierBreakdown: Record<string, {
        total: number;
        delivered: number;
        returned: number;
        feeTaxTotal: number;
        feeTaxCount: number;
      }>;
    }> = {};
    const returnByProduct: Record<string, { total: number; returned: number }> = {};

    for (const order of orders) {
      const courier = order.courier || "PostEx";
      const city = (order.cityName || "Unknown").trim().toLowerCase();
      const cityDisplay = titleCase(city);

      if (!courierStats[courier]) {
        courierStats[courier] = { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 };
      }
      courierStats[courier].total++;

      const statusCategory = classifyOrderStatus(order);
      const isDelivered = statusCategory === "delivered";
      const isReturned = statusCategory === "returned";
      const isCancelled = statusCategory === "cancelled";

      if (isDelivered) {
        courierStats[courier].delivered++;
      } else if (isReturned) {
        courierStats[courier].returned++;
      } else if (isCancelled) {
        courierStats[courier].cancelled++;
      } else {
        courierStats[courier].inTransit++;
      }

      if (isDelivered && order.orderDate && order.lastStatusTime) {
        const orderTime = new Date(order.orderDate).getTime();
        const deliverTime = new Date(order.lastStatusTime).getTime();
        if (!isNaN(orderTime) && !isNaN(deliverTime) && deliverTime > orderTime) {
          const daysDiff = Math.round((deliverTime - orderTime) / (1000 * 60 * 60 * 24) * 10) / 10;
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

      if (!returnByCity[city]) {
        returnByCity[city] = { total: 0, delivered: 0, returned: 0, city: cityDisplay, feeTaxTotal: 0, feeTaxCount: 0, courierBreakdown: {} };
      }
      returnByCity[city].total++;
      if (isDelivered) returnByCity[city].delivered++;
      if (isReturned) returnByCity[city].returned++;

      // Use shipping/delivery fee + sales tax + fuel for TCS. For other
      // couriers use their persisted fee and tax fields.
      const feeTaxTotal = getFeeTaxTotal(order);
      if (feeTaxTotal !== null) {
        returnByCity[city].feeTaxTotal += feeTaxTotal;
        returnByCity[city].feeTaxCount++;
      }
      if (!returnByCity[city].courierBreakdown[courier]) {
        returnByCity[city].courierBreakdown[courier] = { total: 0, delivered: 0, returned: 0, feeTaxTotal: 0, feeTaxCount: 0 };
      }
      returnByCity[city].courierBreakdown[courier].total++;
      if (isDelivered) returnByCity[city].courierBreakdown[courier].delivered++;
      if (isReturned) returnByCity[city].courierBreakdown[courier].returned++;
      const courierFeeTaxTotal = getFeeTaxTotal(order);
      if (courierFeeTaxTotal !== null) {
        returnByCity[city].courierBreakdown[courier].feeTaxTotal += courierFeeTaxTotal;
        returnByCity[city].courierBreakdown[courier].feeTaxCount++;
      }

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

    const avgDeliveryByCity: Record<string, { totalDays: number; count: number; courierBreakdown: Record<string, { totalDays: number; count: number }> }> = {};
    for (const d of Object.values(deliveryTimeByCityCourier)) {
      const c = d.city.toLowerCase();
      if (!avgDeliveryByCity[c]) avgDeliveryByCity[c] = { totalDays: 0, count: 0, courierBreakdown: {} };
      avgDeliveryByCity[c].totalDays += d.totalDays;
      avgDeliveryByCity[c].count += d.count;
      if (!avgDeliveryByCity[c].courierBreakdown[d.courier]) {
        avgDeliveryByCity[c].courierBreakdown[d.courier] = { totalDays: 0, count: 0 };
      }
      avgDeliveryByCity[c].courierBreakdown[d.courier].totalDays += d.totalDays;
      avgDeliveryByCity[c].courierBreakdown[d.courier].count += d.count;
    }
    const deliveryByCity = Object.entries(avgDeliveryByCity)
      .map(([city, d]) => {
        const couriers: Record<string, { avgDays: number; count: number }> = {};
        for (const [courier, cd] of Object.entries(d.courierBreakdown)) {
          couriers[courier] = { avgDays: Math.round((cd.totalDays / cd.count) * 10) / 10, count: cd.count };
        }
        return {
          city: titleCase(city),
          avgDays: Math.round((d.totalDays / d.count) * 10) / 10,
          deliveredCount: d.count,
          couriers,
        };
      })
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

    const cityDeliveryRates = Object.values(returnByCity)
      .filter((d) => d.total >= 3)
      .map((d) => {
        const couriers: Record<string, { total: number; delivered: number; deliveryRate: number; avgFeeTax: number | null }> = {};
        for (const [courier, cd] of Object.entries(d.courierBreakdown)) {
          couriers[courier] = {
            total: cd.total,
            delivered: cd.delivered,
            deliveryRate: cd.total > 0 ? Math.round((cd.delivered / cd.total) * 100 * 10) / 10 : 0,
            avgFeeTax: cd.feeTaxCount > 0 ? Math.round((cd.feeTaxTotal / cd.feeTaxCount) * 100) / 100 : null,
          };
        }
        return {
          city: d.city,
          total: d.total,
          delivered: d.delivered,
          returned: d.returned,
          deliveryRate: Math.round((d.delivered / d.total) * 100 * 10) / 10,
          returnRate: Math.round((d.returned / d.total) * 100 * 10) / 10,
          avgFeeTax: d.feeTaxCount > 0 ? Math.round((d.feeTaxTotal / d.feeTaxCount) * 100) / 100 : null,
          couriers,
        };
      })
      .sort((a, b) => b.total - a.total);

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
      cityDeliveryRates,
    });
  } catch (error: any) {
    console.error("Performance API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
