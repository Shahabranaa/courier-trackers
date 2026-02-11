import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
      return NextResponse.json({ error: "Missing brand-id header" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const courierFilter = searchParams.get("courier") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const courierWhere: any = { brandId };

    if (courierFilter !== "all") {
      courierWhere.courier = courierFilter;
    }

    courierWhere.transactionStatus = { not: null };

    if (startDate || endDate) {
      courierWhere.orderDate = {};
      if (startDate) courierWhere.orderDate.gte = new Date(startDate).toISOString();
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        courierWhere.orderDate.lt = end.toISOString();
      }
    }

    const returnedOrders = await prisma.order.findMany({
      where: {
        ...courierWhere,
        transactionStatus: {
          contains: "return",
          mode: "insensitive",
        },
      },
      select: {
        trackingNumber: true,
        courier: true,
        orderRefNumber: true,
        customerName: true,
        customerPhone: true,
        cityName: true,
        invoicePayment: true,
        orderAmount: true,
        orderDate: true,
        transactionDate: true,
        transactionStatus: true,
        orderStatus: true,
        orderDetail: true,
      },
    });

    if (returnedOrders.length === 0) {
      return NextResponse.json({
        discrepancies: [],
        summary: { total: 0, postex: 0, tranzo: 0, totalAmount: 0 },
      });
    }

    const refNumbers = returnedOrders
      .map((o) => o.orderRefNumber)
      .filter(Boolean);

    const trackingNumbers = returnedOrders
      .map((o) => o.trackingNumber)
      .filter(Boolean);

    const shopifyByRef = refNumbers.length > 0 ? await prisma.shopifyOrder.findMany({
      where: {
        brandId,
        OR: [
          { orderNumber: { in: refNumbers } },
          { orderName: { in: refNumbers } },
          { orderName: { in: refNumbers.map((r) => `#${r}`) } },
        ],
      },
      select: {
        shopifyOrderId: true,
        orderNumber: true,
        orderName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        totalPrice: true,
        customerName: true,
        trackingNumbers: true,
        fulfillments: true,
      },
    }) : [];

    const allShopifyOrders = await prisma.shopifyOrder.findMany({
      where: { brandId },
      select: {
        shopifyOrderId: true,
        orderNumber: true,
        orderName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        totalPrice: true,
        customerName: true,
        trackingNumbers: true,
        fulfillments: true,
      },
    });

    const shopifyMap = new Map<string, typeof allShopifyOrders[0]>();
    for (const so of shopifyByRef) {
      shopifyMap.set(so.orderNumber, so);
      shopifyMap.set(so.orderName, so);
      const cleanName = so.orderName.replace(/^#/, "");
      shopifyMap.set(cleanName, so);
    }

    const trackingToShopify = new Map<string, typeof allShopifyOrders[0]>();
    for (const so of allShopifyOrders) {
      try {
        const tns = JSON.parse(so.trackingNumbers || "[]");
        if (Array.isArray(tns)) {
          for (const tn of tns) {
            if (tn) trackingToShopify.set(String(tn), so);
          }
        }
      } catch {}
      try {
        const fulfs = JSON.parse(so.fulfillments || "[]");
        if (Array.isArray(fulfs)) {
          for (const f of fulfs) {
            if (f.tracking_number) trackingToShopify.set(String(f.tracking_number), so);
            if (Array.isArray(f.tracking_numbers)) {
              for (const tn of f.tracking_numbers) {
                if (tn) trackingToShopify.set(String(tn), so);
              }
            }
          }
        }
      } catch {}
    }

    const cancelledStatuses = ["refunded", "voided", "partially_refunded"];

    const discrepancies: Array<{
      trackingNumber: string;
      courier: string;
      orderRef: string;
      customerName: string;
      customerPhone: string;
      city: string;
      courierAmount: number;
      courierStatus: string;
      shopifyStatus: string;
      shopifyFulfillment: string;
      orderDate: string;
      orderDetail: string;
      hasShopifyMatch: boolean;
    }> = [];

    for (const order of returnedOrders) {
      const ref = order.orderRefNumber;
      let shopify = shopifyMap.get(ref);

      if (!shopify) {
        shopify = trackingToShopify.get(order.trackingNumber);
      }

      if (!shopify) {
        discrepancies.push({
          trackingNumber: order.trackingNumber,
          courier: order.courier,
          orderRef: ref,
          customerName: order.customerName,
          customerPhone: order.customerPhone || "",
          city: order.cityName || "",
          courierAmount: order.invoicePayment || order.orderAmount,
          courierStatus: order.transactionStatus || order.orderStatus,
          shopifyStatus: "No Match Found",
          shopifyFulfillment: "N/A",
          orderDate: order.orderDate,
          orderDetail: order.orderDetail || "",
          hasShopifyMatch: false,
        });
        continue;
      }

      const financialStatus = (shopify.financialStatus || "").toLowerCase();
      const isShopifyCancelled = cancelledStatuses.includes(financialStatus);

      if (!isShopifyCancelled) {
        discrepancies.push({
          trackingNumber: order.trackingNumber,
          courier: order.courier,
          orderRef: ref,
          customerName: order.customerName,
          customerPhone: order.customerPhone || "",
          city: order.cityName || "",
          courierAmount: order.invoicePayment || order.orderAmount,
          courierStatus: order.transactionStatus || order.orderStatus,
          shopifyStatus: shopify.financialStatus || "Unknown",
          shopifyFulfillment: shopify.fulfillmentStatus || "unfulfilled",
          orderDate: order.orderDate,
          orderDetail: order.orderDetail || "",
          hasShopifyMatch: true,
        });
      }
    }

    const postexCount = discrepancies.filter((d) => d.courier === "PostEx").length;
    const tranzoCount = discrepancies.filter((d) => d.courier === "Tranzo").length;
    const totalAmount = discrepancies.reduce((sum, d) => sum + d.courierAmount, 0);

    return NextResponse.json({
      discrepancies,
      summary: {
        total: discrepancies.length,
        postex: postexCount,
        tranzo: tranzoCount,
        totalAmount,
      },
    });
  } catch (error: any) {
    console.error("Discrepancies API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
