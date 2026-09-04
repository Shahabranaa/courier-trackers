import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchTcsCityMap, fetchTcsCnBulkInquiry, getTcsBrandConfig } from "@/lib/tcs";

const pick = (row: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return "";
};

const numericValue = (row: Record<string, unknown>, ...keys: string[]) => {
  const raw = String(pick(row, ...keys)).replace(/,/g, "").trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const parseTcsDate = (value: string, fallback: string) => {
  const raw = value.trim();
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = dmy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? `${fallback}T00:00:00.000Z` : parsed.toISOString();
};

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const brandId = params.get("brandId")?.trim();
  const startDate = params.get("startDate") || new Date().toISOString().slice(0, 10);
  const endDate = params.get("endDate") || startDate;
  const force = params.get("force") === "true";
  if (!brandId) return NextResponse.json({ error: "Brand is required" }, { status: 400 });
  const brandConfig = await getTcsBrandConfig(brandId);
  if (!brandConfig) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const customerNumber = brandConfig.customerNumber || params.get("customerNumber")?.trim() || "";

  const where = { brandId, courier: "TCS", orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` } };
  if (force) {
    if (!customerNumber) return NextResponse.json({ error: "TCS customer number is required for live sync" }, { status: 400 });
    try {
      const raw = await fetchTcsCnBulkInquiry(customerNumber, startDate, endDate, brandConfig.credentials);
      const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const rows = (Array.isArray(record.detail) ? record.detail : Array.isArray(raw) ? raw : []) as Record<string, unknown>[];
      const cityMap = await fetchTcsCityMap("PK", brandConfig.credentials);
      let saved = 0;
      let newDelivered = 0;
      let newReturned = 0;
      for (const row of rows) {
        const trackingNumber = String(pick(row, "cn by courier", "consignmentno", "consignment no", "cnno")).trim();
        if (!trackingNumber) continue;
        const amount = numericValue(row, "cod amount", "codamount", "amount", "invoice amount", "amount paid") || 0;
        const status = String(pick(row, "cn status", "cnstatus", "status", "delivery status") || "Booked");
        const dateValue = String(pick(row, "booking date", "bookingdate", "date") || startDate);
        const orderDate = parseTcsDate(dateValue, startDate);
        const cityValue = String(pick(row, "city", "destinationcity", "destination") || "").trim();
        const cityName = cityMap.get(cityValue.toUpperCase()) || cityValue;
        const transactionFee = numericValue(row, "servicecharges", "service charges", "delivery charges");
        const actualWeight = numericValue(row, "parcel weight", "weight");
        if (status.toLowerCase().includes("deliver") || status.toUpperCase() === "OK") newDelivered++;
        if (status.toLowerCase().includes("return") || ["RO", "RS"].includes(status.toUpperCase())) newReturned++;
        await prisma.order.upsert({
          where: { trackingNumber },
          update: {
            brandId,
            courier: "TCS",
            orderRefNumber: String(pick(row, "order no", "referenceno", "reference no", "customerrefno") || trackingNumber),
            invoicePayment: amount,
            orderAmount: amount,
            transactionDate: orderDate,
            orderDate,
            orderStatus: status,
            transactionStatus: status,
            ...(cityName ? { cityName } : {}),
            transactionFee,
            actualWeight,
            lastFetchedAt: new Date(),
          },
          create: {
            trackingNumber, brandId, courier: "TCS",
            orderRefNumber: String(pick(row, "order no", "referenceno", "reference no", "customerrefno") || trackingNumber),
            invoicePayment: amount, orderAmount: amount,
            customerName: String(pick(row, "consignee", "customer name") || "TCS Customer"),
            customerPhone: String(pick(row, "mobile", "phone") || ""),
            deliveryAddress: String(pick(row, "address", "delivery address") || ""),
            cityName,
            transactionDate: orderDate, orderDate,
            orderDetail: String(pick(row, "content", "description") || "TCS shipment"),
            orderType: "COD", orderStatus: status, transactionStatus: status,
            transactionFee,
            actualWeight,
          },
        });
        saved++;
      }
      const orders = await prisma.order.findMany({ where, orderBy: { orderDate: "desc" } });
      return NextResponse.json({ dist: orders, source: "live", syncSummary: { totalFetched: rows.length, newOrders: saved, statusChanged: 0, newDelivered, newReturned } });
    } catch (error) {
      const orders = await prisma.order.findMany({ where, orderBy: { orderDate: "desc" } });
      return NextResponse.json({ dist: orders, source: "local_fallback", error: error instanceof Error ? error.message : "TCS sync failed" });
    }
  }
  const orders = await prisma.order.findMany({ where, include: { trackingStatus: true, paymentStatus: true }, orderBy: { orderDate: "desc" } });
  return NextResponse.json({ dist: orders, source: "local", count: orders.length });
}