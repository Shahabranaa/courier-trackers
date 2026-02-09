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
    const transitThresholdDays = parseInt(searchParams.get("transitDays") || "5", 10);
    const returnRateThreshold = parseFloat(searchParams.get("returnRate") || "15");
    const performanceThreshold = parseFloat(searchParams.get("performanceThreshold") || "80");

    const orders = await prisma.order.findMany({
      where: { brandId },
      select: {
        trackingNumber: true,
        courier: true,
        orderDate: true,
        orderStatus: true,
        transactionStatus: true,
        lastStatus: true,
        lastStatusTime: true,
        cityName: true,
        customerName: true,
        customerPhone: true,
        invoicePayment: true,
        orderDetail: true,
      },
    });

    const now = new Date();
    const alerts: Array<{
      id: string;
      type: "stuck_transit" | "return_spike" | "performance_drop";
      severity: "critical" | "warning" | "info";
      title: string;
      description: string;
      details: any;
      createdAt: string;
    }> = [];

    const stuckOrders: Array<any> = [];
    const cityStats: Record<string, { total: number; returned: number; delivered: number; inTransit: number; city: string }> = {};
    const courierStats: Record<string, { total: number; delivered: number; returned: number; inTransit: number; cancelled: number }> = {};
    const courierCityStats: Record<string, Record<string, { total: number; delivered: number; returned: number }>> = {};

    for (const order of orders) {
      const courier = order.courier || "PostEx";
      const status = (order.transactionStatus || order.orderStatus || "").toLowerCase();
      const city = (order.cityName || "Unknown").trim().toLowerCase();
      const cityDisplay = titleCase(city);

      const isDelivered = status.includes("deliver");
      const isReturned = status.includes("return");
      const isCancelled = status.includes("cancel");
      const isInTransit = !isDelivered && !isReturned && !isCancelled;

      if (!courierStats[courier]) {
        courierStats[courier] = { total: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 };
      }
      courierStats[courier].total++;
      if (isDelivered) courierStats[courier].delivered++;
      else if (isReturned) courierStats[courier].returned++;
      else if (isCancelled) courierStats[courier].cancelled++;
      else courierStats[courier].inTransit++;

      if (!cityStats[city]) {
        cityStats[city] = { total: 0, returned: 0, delivered: 0, inTransit: 0, city: cityDisplay };
      }
      cityStats[city].total++;
      if (isDelivered) cityStats[city].delivered++;
      if (isReturned) cityStats[city].returned++;
      if (isInTransit) cityStats[city].inTransit++;

      if (!courierCityStats[courier]) courierCityStats[courier] = {};
      if (!courierCityStats[courier][city]) {
        courierCityStats[courier][city] = { total: 0, delivered: 0, returned: 0 };
      }
      courierCityStats[courier][city].total++;
      if (isDelivered) courierCityStats[courier][city].delivered++;
      if (isReturned) courierCityStats[courier][city].returned++;

      if (isInTransit && order.orderDate) {
        const orderTime = new Date(order.orderDate).getTime();
        if (!isNaN(orderTime)) {
          const daysInTransit = Math.round((now.getTime() - orderTime) / (1000 * 60 * 60 * 24));
          if (daysInTransit >= transitThresholdDays) {
            stuckOrders.push({
              trackingNumber: order.trackingNumber,
              courier,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              city: cityDisplay,
              orderDate: order.orderDate,
              daysInTransit,
              amount: order.invoicePayment,
              lastStatus: order.lastStatus || order.transactionStatus || order.orderStatus,
              product: order.orderDetail,
            });
          }
        }
      }
    }

    const stuckBySeverity = stuckOrders.sort((a, b) => b.daysInTransit - a.daysInTransit);
    const criticalStuck = stuckBySeverity.filter((o) => o.daysInTransit >= transitThresholdDays * 2);
    const warningStuck = stuckBySeverity.filter(
      (o) => o.daysInTransit >= transitThresholdDays && o.daysInTransit < transitThresholdDays * 2
    );

    if (criticalStuck.length > 0) {
      alerts.push({
        id: "stuck_critical",
        type: "stuck_transit",
        severity: "critical",
        title: `${criticalStuck.length} orders stuck for ${transitThresholdDays * 2}+ days`,
        description: `These orders have been in transit for over ${transitThresholdDays * 2} days and need immediate attention.`,
        details: { orders: criticalStuck.slice(0, 50), totalCount: criticalStuck.length },
        createdAt: now.toISOString(),
      });
    }

    if (warningStuck.length > 0) {
      alerts.push({
        id: "stuck_warning",
        type: "stuck_transit",
        severity: "warning",
        title: `${warningStuck.length} orders stuck for ${transitThresholdDays}+ days`,
        description: `These orders have exceeded the expected ${transitThresholdDays}-day delivery window.`,
        details: { orders: warningStuck.slice(0, 50), totalCount: warningStuck.length },
        createdAt: now.toISOString(),
      });
    }

    const cityReturnAlerts: Array<any> = [];
    for (const [, stats] of Object.entries(cityStats)) {
      if (stats.total >= 5) {
        const returnRate = (stats.returned / stats.total) * 100;
        if (returnRate >= returnRateThreshold) {
          cityReturnAlerts.push({
            city: stats.city,
            total: stats.total,
            returned: stats.returned,
            returnRate: Math.round(returnRate * 10) / 10,
            inTransit: stats.inTransit,
          });
        }
      }
    }

    if (cityReturnAlerts.length > 0) {
      const sorted = cityReturnAlerts.sort((a, b) => b.returnRate - a.returnRate);
      const highReturnCities = sorted.filter((c) => c.returnRate >= returnRateThreshold * 1.5);
      const moderateReturnCities = sorted.filter((c) => c.returnRate >= returnRateThreshold && c.returnRate < returnRateThreshold * 1.5);

      if (highReturnCities.length > 0) {
        alerts.push({
          id: "return_spike_critical",
          type: "return_spike",
          severity: "critical",
          title: `Return rates critically high in ${highReturnCities.length} ${highReturnCities.length === 1 ? "city" : "cities"}`,
          description: `Return rates exceed ${Math.round(returnRateThreshold * 1.5)}% in these cities. Investigate product quality or courier issues.`,
          details: { cities: highReturnCities },
          createdAt: now.toISOString(),
        });
      }

      if (moderateReturnCities.length > 0) {
        alerts.push({
          id: "return_spike_warning",
          type: "return_spike",
          severity: "warning",
          title: `Return rates elevated in ${moderateReturnCities.length} ${moderateReturnCities.length === 1 ? "city" : "cities"}`,
          description: `Return rates exceed ${returnRateThreshold}% in these cities. Monitor closely.`,
          details: { cities: moderateReturnCities },
          createdAt: now.toISOString(),
        });
      }
    }

    for (const [courier, stats] of Object.entries(courierStats)) {
      if (stats.total >= 10) {
        const deliveryRate = (stats.delivered / stats.total) * 100;
        if (deliveryRate < performanceThreshold) {
          const severity = deliveryRate < performanceThreshold - 20 ? "critical" : "warning";

          const problemCities: Array<any> = [];
          if (courierCityStats[courier]) {
            for (const [cityKey, cs] of Object.entries(courierCityStats[courier])) {
              if (cs.total >= 3) {
                const cityDelivRate = (cs.delivered / cs.total) * 100;
                if (cityDelivRate < performanceThreshold) {
                  problemCities.push({
                    city: titleCase(cityKey),
                    total: cs.total,
                    delivered: cs.delivered,
                    deliveryRate: Math.round(cityDelivRate * 10) / 10,
                  });
                }
              }
            }
          }
          problemCities.sort((a, b) => a.deliveryRate - b.deliveryRate);

          alerts.push({
            id: `perf_${courier.toLowerCase()}`,
            type: "performance_drop",
            severity,
            title: `${courier} delivery rate at ${Math.round(deliveryRate * 10) / 10}%`,
            description: `${courier}'s delivery rate is below the ${performanceThreshold}% threshold. ${stats.returned} returns and ${stats.inTransit} still in transit out of ${stats.total} orders.`,
            details: {
              courier,
              total: stats.total,
              delivered: stats.delivered,
              returned: stats.returned,
              inTransit: stats.inTransit,
              cancelled: stats.cancelled,
              deliveryRate: Math.round(deliveryRate * 10) / 10,
              returnRate: Math.round((stats.returned / stats.total) * 100 * 10) / 10,
              problemCities: problemCities.slice(0, 10),
            },
            createdAt: now.toISOString(),
          });
        }
      }
    }

    alerts.sort((a, b) => {
      const sevOrder = { critical: 0, warning: 1, info: 2 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    });

    const summary = {
      totalAlerts: alerts.length,
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      info: alerts.filter((a) => a.severity === "info").length,
      stuckInTransit: stuckOrders.length,
      citiesWithHighReturns: cityReturnAlerts.length,
      couriersUnderperforming: alerts.filter((a) => a.type === "performance_drop").length,
    };

    return NextResponse.json({ alerts, summary, thresholds: { transitThresholdDays, returnRateThreshold, performanceThreshold } });
  } catch (error: any) {
    console.error("Alerts API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
