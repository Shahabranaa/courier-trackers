import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeopardsBrandConfig, getPaymentDetails, getShippingCharges, leopardsNumber, leopardsRows, leopardsString } from "@/lib/leopardsMerchant";

type JsonRecord = Record<string, unknown>;
const cn = (row: JsonRecord) => leopardsString(row, "booked_packet_cn", "cn_number", "tracking_number", "consignment_number", "packet_no");

export async function GET(req: NextRequest) {
  if (!await getAuthUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const brandId = params.get("brandId")?.trim();
  const startDate = params.get("startDate")?.trim();
  const endDate = params.get("endDate")?.trim();
  const force = params.get("force") === "true";
  if (!brandId || !startDate || !endDate) return NextResponse.json({ error: "Brand and date range are required" }, { status: 400 });
  const where = { brandId, courier: "Leopards", orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` } };
  if (!force) {
    const orders = await prisma.order.findMany({ where, select: { trackingNumber: true } });
    const saved = orders.length ? await prisma.paymentStatus.findMany({ where: { trackingNumber: { in: orders.map((order) => order.trackingNumber) } } }) : [];
    const payments = saved.flatMap((item) => { try { return [JSON.parse(item.data)]; } catch { return []; } });
    return NextResponse.json({ payments, source: "local", count: payments.length });
  }
  try {
    const config = await getLeopardsBrandConfig(brandId);
    if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    if (!config.enabled) return NextResponse.json({ error: "Leopards is disabled for this brand" }, { status: 403 });
    const orders = await prisma.order.findMany({ where, select: { trackingNumber: true, orderAmount: true, invoicePayment: true, transactionStatus: true, orderStatus: true, lastStatus: true } });
    const trackingNumbers = orders.map((order) => order.trackingNumber);
    if (!trackingNumbers.length) return NextResponse.json({ payments: [], source: "live", count: 0 });
    const [paymentRaw, chargesRaw] = await Promise.all([getPaymentDetails(trackingNumbers, config.credentials), getShippingCharges(trackingNumbers, config.credentials)]);
    const paymentsByCn = new Map<string, JsonRecord>();
    const chargesByCn = new Map<string, JsonRecord>();
    for (const row of leopardsRows(paymentRaw)) { const key = cn(row); if (key) paymentsByCn.set(key, row); }
    for (const row of leopardsRows(chargesRaw)) { const key = cn(row); if (key) chargesByCn.set(key, row); }
    const results: Record<string, unknown>[] = [];
    for (const order of orders) {
      const payment = paymentsByCn.get(order.trackingNumber);
      const charge = chargesByCn.get(order.trackingNumber);
      if (!payment && !charge) continue;
      const source = { ...(charge || {}), ...(payment || {}) };
      const paymentStatus = leopardsString(source, "payment_status", "status", "paid_status");
      const fee = leopardsNumber(source, "net_charges");
      const tax = leopardsNumber(source, "gst_amount");
      const codAmount = leopardsNumber(source, "booked_packet_collect_amount") ?? order.orderAmount ?? order.invoicePayment;
      const grossCharges = leopardsNumber(source, "gross_charges");
      const orderStatus = String(order.lastStatus || order.transactionStatus || order.orderStatus || "").toLowerCase();
      const isReturned = orderStatus.includes("return") || orderStatus.includes("rto");
      const isCancelled = orderStatus.includes("cancel") || orderStatus.includes("void");
      const returnCharges = leopardsNumber(source, "return_charges");
      const normalized = {
        trackingNumber: order.trackingNumber,
        orderStatus: order.lastStatus || order.transactionStatus || order.orderStatus,
        paymentStatus,
        paymentDate: leopardsString(source, "invoice_cheque_date"),
        paymentMethod: leopardsString(source, "payment_method"),
        invoiceChequeNumber: leopardsString(source, "invoice_cheque_no"),
        paymentSlipUrl: leopardsString(source, "slip_link"),
        billingMethod: leopardsString(source, "billing_method"),
        codAmount,
        shippingCharges: leopardsNumber(source, "shipment_charges"),
        cashHandlingCharges: leopardsNumber(source, "cash_handling_charges"),
        insuranceCharges: leopardsNumber(source, "insurance_charges"),
        fuelSurcharge: leopardsNumber(source, "fuel_surcharge_amount"),
        fuelSurchargePercentage: leopardsNumber(source, "fuel_surcharge_percentage"),
        returnCharges,
        courierChargesBeforeTax: fee,
        transactionTax: tax,
        gstPercentage: leopardsNumber(source, "gst"),
        billedCharges: leopardsNumber(source, "billed_charges"),
        chargedWeight: leopardsNumber(source, "weight_charged"),
        grossCharges,
        netAmount: null,
        isReturned,
        isCancelled,
        raw: { payment, charges: charge },
      };
      results.push(normalized);
    }
    if (results.length) {
      const syncedAt = new Date();
      const rows = results.map((result) => ({
        trackingNumber: String(result.trackingNumber),
        data: JSON.stringify(result),
        transactionFee: result.courierChargesBeforeTax,
        transactionTax: result.transactionTax,
        netAmount: null,
        reversalFee: result.isReturned ? result.returnCharges : null,
        reversalTax: null,
      }));
      await prisma.$transaction([
        prisma.paymentStatus.createMany({
          data: rows.map((row) => ({ trackingNumber: row.trackingNumber, data: row.data })),
          skipDuplicates: true,
        }),
        prisma.$executeRawUnsafe(
          `UPDATE "PaymentStatus" AS target
           SET "data" = source."data", "updatedAt" = $2
           FROM jsonb_to_recordset($1::jsonb) AS source("trackingNumber" text, "data" text)
           WHERE target."trackingNumber" = source."trackingNumber"`,
          JSON.stringify(rows),
          syncedAt,
        ),
        prisma.$executeRawUnsafe(
          `UPDATE "Order" AS target
           SET "transactionFee" = source."transactionFee",
               "transactionTax" = source."transactionTax",
               "netAmount" = source."netAmount",
               "reversalFee" = source."reversalFee",
               "reversalTax" = source."reversalTax",
               "lastFetchedAt" = $2
           FROM jsonb_to_recordset($1::jsonb) AS source(
             "trackingNumber" text, "transactionFee" double precision,
             "transactionTax" double precision, "netAmount" double precision,
             "reversalFee" double precision, "reversalTax" double precision
           )
           WHERE target."trackingNumber" = source."trackingNumber"
             AND target."brandId" = $3 AND target."courier" = 'Leopards'`,
          JSON.stringify(rows),
          syncedAt,
          brandId,
        ),
      ]);
    }
    return NextResponse.json({ payments: results, source: "live", count: results.length });
  } catch (error) {
    const orders = await prisma.order.findMany({ where, select: { trackingNumber: true } });
    const saved = orders.length ? await prisma.paymentStatus.findMany({ where: { trackingNumber: { in: orders.map((order) => order.trackingNumber) } } }) : [];
    const payments = saved.flatMap((item) => { try { return [JSON.parse(item.data)]; } catch { return []; } });
    return NextResponse.json({ payments, source: "local_fallback", count: payments.length, error: error instanceof Error ? error.message : "Leopards payment sync failed" });
  }
}