import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchTcsCityMap, fetchTcsCnBulkInquiry, fetchTcsPaymentDetail, getTcsBrandConfig } from "@/lib/tcs";

type JsonRecord = Record<string, unknown>;

const pick = (row: JsonRecord, ...keys: string[]) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return "";
};

const numberValue = (row: JsonRecord, ...keys: string[]) => {
  const value = Number(String(pick(row, ...keys)).replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : 0;
};

const normalizeDate = (value: unknown) => {
  const raw = String(value || "").trim();
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = dmy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
};

const calculateTotalPayable = (status: string, orderAmount: number, totalCharges: number, shippingFee: number) => {
  const normalizedStatus = status.toLowerCase();
  const isDelivered = normalizedStatus === "delivered"
    || normalizedStatus.startsWith("delivered ")
    || ["ok", "transferred", "payment transferred"].includes(normalizedStatus);
  const isReturned = normalizedStatus.includes("return") || ["ro", "rs"].includes(normalizedStatus);
  if (isDelivered) return orderAmount - totalCharges;
  if (isReturned) return -shippingFee;
  return 0;
};

const normalizePayment = (row: JsonRecord, orderAmount = 0, fallbackStatus = "") => {
  const trackingNumber = String(pick(row, "cn by courier", "cnno", "consignmentno", "consignment no")).trim();
  const rawStatus = String(pick(row, "payment status", "paymentstatus", "paid")).trim();
  const paid = ["Y", "YES", "PAID", "TRUE", "1"].includes(rawStatus.toUpperCase());
  const deliveryCharges = numberValue(row, "delivery charges", "deliverycharges");
  const osaCharges = numberValue(row, "osa charges", "osacharges");
  const fuelSurcharge = numberValue(row, "fuel surcharge", "fuelsurcharge");
  const salesTax = numberValue(row, "sales tax", "salestax");
  const whgst = numberValue(row, "whgst");
  const whit = numberValue(row, "whit");
  const additionalWithholding = numberValue(row, "addwhit");
  const withholdingTax = whgst + whit + additionalWithholding;
  const totalCharges = deliveryCharges + osaCharges + fuelSurcharge + salesTax + withholdingTax;
  const status = String(pick(row, "cn status", "cnstatus", "status") || fallbackStatus).trim();
  return {
    trackingNumber,
    paymentStatus: paid ? "PAID" : "UNPAID",
    paid,
    bookingDate: normalizeDate(pick(row, "booking date", "bookingdate")),
    deliveryDate: normalizeDate(pick(row, "delivery date", "deliverydate")),
    paymentDate: normalizeDate(pick(row, "payment date", "paymentdate")),
    amountPaid: numberValue(row, "amount paid", "amountpaid"),
    codAmount: numberValue(row, "cod amount", "codamount"),
    orderAmount,
    weight: numberValue(row, "parcel weight", "weight"),
    city: String(pick(row, "city", "destination", "destinationcity")).trim(),
    status,
    customerReference: String(pick(row, "order no", "customerrefno", "referenceno")).trim(),
    deliveryCharges,
    osaCharges,
    fuelSurcharge,
    salesTax,
    whgst,
    whit,
    additionalWithholding,
    withholdingTax,
    totalCharges,
    totalPayable: calculateTotalPayable(status, orderAmount, totalCharges, deliveryCharges),
    raw: row,
  };
};

const parseRows = (raw: unknown, orderAmounts = new Map<string, number>(), orderStatuses = new Map<string, string>()) => {
  const record = raw && typeof raw === "object" ? raw as JsonRecord : {};
  return (Array.isArray(record.detail) ? record.detail : Array.isArray(raw) ? raw : [])
    .filter((row): row is JsonRecord => Boolean(row && typeof row === "object"))
    .map((row) => {
      const trackingNumber = String(pick(row, "cn by courier", "cnno", "consignmentno", "consignment no")).trim();
      return normalizePayment(row, orderAmounts.get(trackingNumber) || 0, orderStatuses.get(trackingNumber) || "");
    })
    .filter((payment) => payment.trackingNumber);
};

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const brandId = params.get("brandId")?.trim();
  const startDate = params.get("startDate")?.trim();
  const endDate = params.get("endDate")?.trim();
  const force = params.get("force") === "true";
  if (!brandId || !startDate || !endDate) {
    return NextResponse.json({ error: "Brand and date range are required" }, { status: 400 });
  }

  try {
    const brandConfig = await getTcsBrandConfig(brandId);
    if (!brandConfig) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    const customerNumber = brandConfig.customerNumber || params.get("customerNumber")?.trim() || "";
    if (force) {
      if (!customerNumber) return NextResponse.json({ error: "TCS customer number is required for payment sync" }, { status: 400 });
      const [paymentDetail, inquiry, cityMap] = await Promise.all([
        fetchTcsPaymentDetail(customerNumber, startDate, endDate, brandConfig.credentials),
        fetchTcsCnBulkInquiry(customerNumber, startDate, endDate, brandConfig.credentials),
        fetchTcsCityMap("PK", brandConfig.credentials),
      ]);
      const inquiryRecord = inquiry && typeof inquiry === "object" ? inquiry as JsonRecord : {};
      const orderAmounts = new Map<string, number>();
      const orderStatuses = new Map<string, string>();
      const inquiryRows = (Array.isArray(inquiryRecord.detail) ? inquiryRecord.detail : Array.isArray(inquiry) ? inquiry : [])
        .filter((row): row is JsonRecord => Boolean(row && typeof row === "object"));
      inquiryRows.forEach((row) => {
        const trackingNumber = String(pick(row, "cn by courier", "cnno", "consignmentno", "consignment no")).trim();
        if (trackingNumber) {
          orderAmounts.set(trackingNumber, numberValue(row, "cod amount", "codamount", "amount", "invoice amount"));
          orderStatuses.set(trackingNumber, String(pick(row, "cn status", "cnstatus", "status", "delivery status")).trim());
        }
      });
      const payments = parseRows(paymentDetail, orderAmounts, orderStatuses).map((payment) => ({
        ...payment,
        city: cityMap.get(payment.city.toUpperCase()) || payment.city,
      }));
      const syncedAt = new Date();
      const paymentRows = payments.map((payment) => ({
        trackingNumber: payment.trackingNumber,
        data: JSON.stringify(payment),
      }));
      const orderRows = payments.map((payment) => ({
        trackingNumber: payment.trackingNumber,
        city: payment.city,
        weight: payment.weight,
        orderAmount: payment.orderAmount,
        transactionFee: payment.deliveryCharges + payment.osaCharges + payment.fuelSurcharge,
        transactionTax: payment.salesTax + payment.withholdingTax,
        salesWithholdingTax: payment.withholdingTax,
        netAmount: payment.totalPayable,
      }));
      if (payments.length) {
        await prisma.$transaction([
          prisma.paymentStatus.createMany({ data: paymentRows, skipDuplicates: true }),
          prisma.$executeRawUnsafe(
            `UPDATE "PaymentStatus" AS target
             SET "data" = source."data", "updatedAt" = $2
             FROM jsonb_to_recordset($1::jsonb) AS source("trackingNumber" text, "data" text)
             WHERE target."trackingNumber" = source."trackingNumber"`,
            JSON.stringify(paymentRows),
            syncedAt,
          ),
          prisma.$executeRawUnsafe(
            `UPDATE "Order" AS target
             SET "cityName" = CASE WHEN source."city" <> '' THEN source."city" ELSE target."cityName" END,
                 "actualWeight" = CASE WHEN source."weight" > 0 THEN source."weight" ELSE target."actualWeight" END,
                 "invoicePayment" = CASE WHEN source."orderAmount" > 0 THEN source."orderAmount" ELSE target."invoicePayment" END,
                 "orderAmount" = CASE WHEN source."orderAmount" > 0 THEN source."orderAmount" ELSE target."orderAmount" END,
                 "transactionFee" = source."transactionFee",
                 "transactionTax" = source."transactionTax",
                  "salesWithholdingTax" = source."salesWithholdingTax",
                 "netAmount" = source."netAmount",
                 "lastFetchedAt" = $3
             FROM jsonb_to_recordset($1::jsonb) AS source(
               "trackingNumber" text,
               "city" text,
               "weight" double precision,
               "orderAmount" double precision,
               "transactionFee" double precision,
               "transactionTax" double precision,
                "salesWithholdingTax" double precision,
               "netAmount" double precision
             )
             WHERE target."trackingNumber" = source."trackingNumber"
               AND target."brandId" = $2
               AND target."courier" = 'TCS'`,
            JSON.stringify(orderRows),
            brandId,
            syncedAt,
          ),
        ]);
      }
      return NextResponse.json({ payments, source: "live", count: payments.length });
    }

    const orders = await prisma.order.findMany({
      where: {
        brandId,
        courier: "TCS",
        orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` },
      },
      select: { trackingNumber: true, orderAmount: true, invoicePayment: true, transactionStatus: true },
    });
    const orderMap = new Map(orders.map((order) => [order.trackingNumber, order]));
    const trackingNumbers = orders.map((order) => order.trackingNumber);
    const saved = trackingNumbers.length
      ? await prisma.paymentStatus.findMany({ where: { trackingNumber: { in: trackingNumbers } } })
      : [];
    const payments = saved.flatMap((item) => {
      try {
        const parsed = JSON.parse(item.data) as JsonRecord;
        if (!parsed || typeof parsed !== "object") return [];
        const order = orderMap.get(item.trackingNumber);
        const orderAmount = Number(order?.orderAmount || order?.invoicePayment || parsed.orderAmount || parsed.codAmount || 0);
        const raw = parsed.raw && typeof parsed.raw === "object" ? parsed.raw as JsonRecord : {};
        const whgst = Number(parsed.whgst ?? numberValue(raw, "whgst"));
        const whit = Number(parsed.whit ?? numberValue(raw, "whit"));
        const additionalWithholding = Number(parsed.additionalWithholding ?? numberValue(raw, "addwhit"));
        const totalCharges = Number(parsed.totalCharges || 0);
        const status = String(parsed.status || order?.transactionStatus || "");
        const shippingFee = Number(parsed.deliveryCharges || 0);
        return [{ ...parsed, orderAmount, whgst, whit, additionalWithholding, withholdingTax: whgst + whit + additionalWithholding, totalPayable: calculateTotalPayable(status, orderAmount, totalCharges, shippingFee) }];
      } catch {
        return [];
      }
    });
    return NextResponse.json({ payments, source: "local", count: payments.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "TCS payment sync failed" }, { status: 502 });
  }
}