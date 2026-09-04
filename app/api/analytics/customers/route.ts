import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return "92" + digits.slice(1);
  return digits;
}

export async function GET(req: NextRequest) {
  try {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
      return NextResponse.json({ error: "Missing brand-id header" }, { status: 400 });
    }

    const shopifyOrders = await prisma.shopifyOrder.findMany({
      where: { brandId },
      select: {
        shopifyOrderId: true,
        customerName: true,
        phone: true,
        email: true,
        shippingCity: true,
        createdAt: true,
        totalPrice: true,
        fulfillmentStatus: true,
        financialStatus: true,
        lineItems: true,
        courierPartner: true,
        fulfillments: true,
      },
    });

    const customerMap: Record<string, {
      name: string;
      phone: string;
      city: string;
      totalOrders: number;
      totalRevenue: number;
      firstOrder: string;
      lastOrder: string;
      deliveredCount: number;
      returnedCount: number;
      cancelledCount: number;
      products: Set<string>;
      couriers: Set<string>;
    }> = {};

    for (const order of shopifyOrders) {
      const phone = normalizePhone(order.phone || "");
      if (!phone || phone.length < 5) continue;

      if (!customerMap[phone]) {
        customerMap[phone] = {
          name: order.customerName || "Unknown",
          phone: order.phone || "",
          city: titleCase((order.shippingCity || "Unknown").trim().toLowerCase()),
          totalOrders: 0,
          totalRevenue: 0,
          firstOrder: order.createdAt,
          lastOrder: order.createdAt,
          deliveredCount: 0,
          returnedCount: 0,
          cancelledCount: 0,
          products: new Set(),
          couriers: new Set(),
        };
      }

      const c = customerMap[phone];
      c.totalOrders++;
      c.totalRevenue += order.totalPrice || 0;

      if (order.createdAt < c.firstOrder) c.firstOrder = order.createdAt;
      if (order.createdAt > c.lastOrder) c.lastOrder = order.createdAt;

      const fulfillment = (order.fulfillmentStatus || "").toLowerCase();
      const financial = (order.financialStatus || "").toLowerCase();

      if (fulfillment === "fulfilled") {
        c.deliveredCount++;
      }
      if (financial === "refunded" || financial === "voided" || fulfillment === "restocked" || fulfillment.includes("return")) {
        c.returnedCount++;
      }
      if (financial === "voided") {
        c.cancelledCount++;
      }

      const partner = (order.courierPartner || "").toLowerCase();
      if (partner.includes("postex") || partner.includes("post ex")) c.couriers.add("PostEx");
      else if (partner.includes("tranzo")) c.couriers.add("Tranzo");
      else if (partner.includes("zoom")) c.couriers.add("Zoom");
      else {
        try {
          const fulfillments = JSON.parse(order.fulfillments || "[]");
          if (Array.isArray(fulfillments)) {
            for (const f of fulfillments) {
              const tc = (f.tracking_company || "").toLowerCase();
              if (tc.includes("postex") || tc.includes("post ex")) c.couriers.add("PostEx");
              else if (tc.includes("tranzo")) c.couriers.add("Tranzo");
              else if (tc.includes("zoom")) c.couriers.add("Zoom");
            }
          }
        } catch {}
      }

      if (order.customerName && c.name === "Unknown") c.name = order.customerName;

      try {
        const items = JSON.parse(order.lineItems || "[]");
        for (const item of items) {
          if (item.title || item.name) c.products.add((item.title || item.name).trim());
        }
      } catch {}
    }

    const allCustomers = Object.entries(customerMap).map(([phone, c]) => ({
      phone: c.phone,
      name: c.name,
      city: c.city,
      totalOrders: c.totalOrders,
      totalRevenue: Math.round(c.totalRevenue),
      firstOrder: c.firstOrder.slice(0, 10),
      lastOrder: c.lastOrder.slice(0, 10),
      deliveredCount: c.deliveredCount,
      returnedCount: c.returnedCount,
      cancelledCount: c.cancelledCount,
      productCount: c.products.size,
      couriers: Array.from(c.couriers),
      returnRate: c.totalOrders > 0 ? Math.round((c.returnedCount / c.totalOrders) * 100) : 0,
      cancelRate: c.totalOrders > 0 ? Math.round((c.cancelledCount / c.totalOrders) * 100) : 0,
    }));

    const repeatCustomers = allCustomers
      .filter((c) => c.totalOrders >= 2)
      .sort((a, b) => b.totalOrders - a.totalOrders);

    const topByLTV = [...allCustomers]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 20);

    const problemCustomers = allCustomers
      .filter((c) => c.returnedCount + c.cancelledCount >= 2 || (c.totalOrders >= 3 && c.returnRate + c.cancelRate >= 50))
      .sort((a, b) => (b.returnedCount + b.cancelledCount) - (a.returnedCount + a.cancelledCount));

    const summary = {
      totalCustomers: allCustomers.length,
      repeatCustomerCount: repeatCustomers.length,
      repeatCustomerPercent: allCustomers.length > 0 ? Math.round((repeatCustomers.length / allCustomers.length) * 100 * 10) / 10 : 0,
      avgOrdersPerCustomer: allCustomers.length > 0 ? Math.round(allCustomers.reduce((s, c) => s + c.totalOrders, 0) / allCustomers.length * 10) / 10 : 0,
      avgLTV: allCustomers.length > 0 ? Math.round(allCustomers.reduce((s, c) => s + c.totalRevenue, 0) / allCustomers.length) : 0,
      problemCustomerCount: problemCustomers.length,
      topCustomerRevenue: topByLTV.length > 0 ? topByLTV[0].totalRevenue : 0,
    };

    return NextResponse.json({
      summary,
      repeatCustomers: repeatCustomers.slice(0, 30),
      topByLTV,
      problemCustomers: problemCustomers.slice(0, 20),
    });
  } catch (error: any) {
    console.error("Customer Insights API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
