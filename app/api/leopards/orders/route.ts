import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBookedPacketLastStatus, getLeopardsBrandConfig, leopardsNumber, leopardsRows, leopardsString } from "@/lib/leopardsMerchant";

const asDate = (value: string, fallback: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? `${fallback}T00:00:00.000Z` : parsed.toISOString();
};

export async function GET(req: NextRequest) {
  if (!await getAuthUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const brandId = params.get("brandId")?.trim();
  const startDate = params.get("startDate")?.trim() || new Date().toISOString().slice(0, 10);
  const endDate = params.get("endDate")?.trim() || startDate;
  const force = params.get("force") === "true";
  if (!brandId) return NextResponse.json({ error: "Brand is required" }, { status: 400 });
  const where = { brandId, courier: "Leopards", orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` } };
  if (!force) {
    const dist = await prisma.order.findMany({ where, include: { trackingStatus: true, paymentStatus: true }, orderBy: { orderDate: "desc" } });
    return NextResponse.json({ dist, source: "local", count: dist.length });
  }
  try {
    const config = await getLeopardsBrandConfig(brandId);
    if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    if (!config.enabled) return NextResponse.json({ error: "Leopards is disabled for this brand" }, { status: 403 });
    const rows = leopardsRows(await getBookedPacketLastStatus(startDate, endDate, config.credentials));
    const incoming = rows.flatMap((row) => {
      const trackingNumber = leopardsString(row, "tracking_number", "track_number", "cn", "cn_number", "consignment_number", "packet_no");
      if (!trackingNumber) return [];
      const status = leopardsString(row, "booked_packet_status", "status", "current_status", "packet_status") || "Booked";
      const date = asDate(leopardsString(row, "booking_date", "booked_date", "created_at", "date") || startDate, startDate);
      const amount = leopardsNumber(row, "cod_value", "booked_packet_collect_amount", "cod_amount", "cod", "amount", "invoice_amount") ?? 0;
      const orderRef = leopardsString(row, "booked_packet_order_id", "order_id", "order_ref", "reference_no", "customer_reference") || trackingNumber;
      return [{
        trackingNumber, brandId, courier: "Leopards", orderRefNumber: orderRef,
        invoicePayment: amount, orderAmount: amount,
        actualWeight: leopardsNumber(row, "booked_packet_weight"),
        customerName: leopardsString(row, "consignment_name_eng", "customer_name", "consignee_name", "consignee") || "Leopards Customer",
        customerPhone: leopardsString(row, "consignment_phone", "customer_phone", "phone", "mobile"),
        deliveryAddress: leopardsString(row, "consignment_address", "address", "delivery_address"),
        cityName: leopardsString(row, "destination_city", "city", "destination") || null,
        transactionDate: date, orderDate: date, orderDetail: "Leopards shipment", orderType: "COD",
        orderStatus: status, transactionStatus: status, lastStatus: status,
      }];
    });
    if (incoming.length) {
      const syncedAt = new Date();
      await prisma.$transaction([
        prisma.order.createMany({ data: incoming, skipDuplicates: true }),
        prisma.$executeRawUnsafe(
          `UPDATE "Order" AS target
           SET "brandId" = source."brandId", "courier" = 'Leopards',
               "orderRefNumber" = source."orderRefNumber",
               "invoicePayment" = source."amount", "orderAmount" = source."amount",
               "actualWeight" = source."actualWeight",
               "customerName" = source."customerName", "customerPhone" = source."customerPhone",
               "deliveryAddress" = source."deliveryAddress",
               "cityName" = NULLIF(source."cityName", ''),
               "transactionDate" = source."orderDate", "orderDate" = source."orderDate",
               "orderStatus" = source."status", "transactionStatus" = source."status",
               "lastStatus" = source."status", "lastFetchedAt" = $2
           FROM jsonb_to_recordset($1::jsonb) AS source(
             "trackingNumber" text, "brandId" text, "orderRefNumber" text,
             "amount" double precision, "actualWeight" double precision, "customerName" text, "customerPhone" text,
             "deliveryAddress" text, "cityName" text, "orderDate" timestamptz, "status" text
           )
           WHERE target."trackingNumber" = source."trackingNumber"`,
          JSON.stringify(incoming.map((order) => ({
            trackingNumber: order.trackingNumber, brandId: order.brandId,
            orderRefNumber: order.orderRefNumber, amount: order.orderAmount, actualWeight: order.actualWeight,
            customerName: order.customerName, customerPhone: order.customerPhone,
            deliveryAddress: order.deliveryAddress, cityName: order.cityName || "",
            orderDate: order.orderDate, status: order.orderStatus,
          }))),
          syncedAt,
        ),
      ]);
    }
    const dist = await prisma.order.findMany({ where, orderBy: { orderDate: "desc" } });
    return NextResponse.json({ dist, source: "live", count: dist.length });
  } catch (error) {
    const dist = await prisma.order.findMany({ where, include: { trackingStatus: true, paymentStatus: true }, orderBy: { orderDate: "desc" } });
    return NextResponse.json({ dist, source: "local_fallback", count: dist.length, error: error instanceof Error ? error.message : "Leopards sync failed" });
  }
}