import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { prisma } from "@/lib/prisma";
import { mergeTraxPaymentRefresh } from "@/lib/trax-refresh-merge";
import {
  getTraxBrandConfig,
  getTraxBulkPayments,
  getTraxPaymentRows,
  getTraxShipmentPayments,
} from "@/lib/trax";

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function paymentRowsFromOrders(orders: Array<{ trackingNumber: string; orderRefNumber: string; customerName: string; orderDate: string; paymentStatus: { data: string } | null }>) {
  return orders.flatMap((order) => {
    if (!order.paymentStatus?.data) return [];
    try {
      const saved = JSON.parse(order.paymentStatus.data);
      const records = Array.isArray(saved.paymentRecords) ? saved.paymentRecords : [];
      const bulkRecords = Array.isArray(saved.bulkPaymentRecords) ? saved.bulkPaymentRecords : [];
      const source = records.length ? records : bulkRecords.length ? bulkRecords : [saved];
      return source.map((record: Record<string, unknown>) => ({
        trackingNumber: order.trackingNumber,
        orderRefNumber: order.orderRefNumber,
        customerName: order.customerName,
        orderDate: order.orderDate,
        paymentStatus: String(saved.paymentStatus || saved.currentPaymentStatus || ""),
        paymentId: String(saved.paymentId || bulkRecords[0]?.payment_id || ""),
        paymentDate: String(saved.paymentDate || bulkRecords[0]?.payment_date || ""),
        paymentMethod: String(saved.paymentMethod || bulkRecords[0]?.payment_method || ""),
        paymentType: String(saved.paymentType || bulkRecords[0]?.payment_type || ""),
        billingMethod: String(saved.billingMethod || bulkRecords[0]?.billing_method || ""),
        ...record,
      }));
    } catch {
      return [];
    }
  });
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const brandId = params.get("brandId")?.trim() || "";
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  if (!brandId || !validDate(startDate) || !validDate(endDate) || startDate! > endDate!) {
    return NextResponse.json({ error: "A brand and valid date range are required" }, { status: 400 });
  }
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }
  const orders = await prisma.order.findMany({
    where: {
      brandId,
      courier: "TRAX",
      orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` },
    },
    select: {
      trackingNumber: true,
      orderRefNumber: true,
      customerName: true,
      orderDate: true,
      paymentStatus: { select: { data: true } },
    },
    orderBy: { orderDate: "desc" },
  });
  const payments = paymentRowsFromOrders(orders);
  return NextResponse.json({ payments, source: "local", count: payments.length });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const startDate = typeof body.startDate === "string" ? body.startDate : null;
  const endDate = typeof body.endDate === "string" ? body.endDate : null;
  if (!brandId || !validDate(startDate) || !validDate(endDate) || startDate! > endDate!) {
    return NextResponse.json({ error: "A brand and valid date range are required" }, { status: 400 });
  }
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }
  const config = await getTraxBrandConfig(brandId);
  if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!config.enabled) return NextResponse.json({ error: "TRAX is disabled for this brand" }, { status: 403 });

  try {
    const orders = await prisma.order.findMany({
      where: {
        brandId,
        courier: "TRAX",
        orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` },
      },
      select: { trackingNumber: true },
      orderBy: { orderDate: "desc" },
    });
    let fetched = 0;
    let successfulRequests = 0;
    const warnings: string[] = [];
    for (let offset = 0; offset < orders.length; offset += 25) {
      const batch = orders.slice(offset, offset + 25);
      const bulkPromise = Promise.allSettled([getTraxBulkPayments(batch.map((order) => order.trackingNumber), config.credentials)]);
      const shipmentResults: PromiseSettledResult<unknown>[] = [];
      for (let shipmentOffset = 0; shipmentOffset < batch.length; shipmentOffset += 5) {
        const shipmentBatch = batch.slice(shipmentOffset, shipmentOffset + 5);
        shipmentResults.push(...await Promise.allSettled(shipmentBatch.map((order) =>
          getTraxShipmentPayments(order.trackingNumber, config.credentials))));
      }
      const [bulkSettled] = await Promise.all([bulkPromise]);
      const bulkResult = bulkSettled[0].status === "fulfilled" ? bulkSettled[0].value : null;
      if (bulkResult) successfulRequests++;
      if (bulkSettled[0].status === "rejected") {
        warnings.push(bulkSettled[0].reason instanceof Error ? bulkSettled[0].reason.message : "Bulk payment details were unavailable");
      }
      for (const [index, order] of batch.entries()) {
        const bulkPaymentRecords = bulkResult ? getTraxPaymentRows(bulkResult, order.trackingNumber) : [];
        const shipmentResult = shipmentResults[index];
        const shipmentRaw = shipmentResult.status === "fulfilled" ? shipmentResult.value : null;
        if (shipmentRaw) successfulRequests++;
        if (shipmentResult.status === "rejected") {
          warnings.push(`${order.trackingNumber}: ${shipmentResult.reason instanceof Error ? shipmentResult.reason.message : "Shipment payment details were unavailable"}`);
        }
        const shipmentRoot = shipmentRaw && typeof shipmentRaw === "object" ? shipmentRaw as Record<string, unknown> : {};
        const paymentRecords = Array.isArray(shipmentRoot.payments)
          ? shipmentRoot.payments.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          : [];
        if (!bulkPaymentRecords.length && !shipmentRaw) continue;
        const latestBulk = bulkPaymentRecords[0] || {};
        const latestShipment = paymentRecords[0] || {};
        const payableValues = paymentRecords.map((item) => {
          if (item.payable === null || item.payable === undefined || String(item.payable).trim() === "") return null;
          const payable = Number(String(item.payable).replace(/,/g, ""));
          return Number.isFinite(payable) ? payable : null;
        });
        const hasRecordedPayable = payableValues.some((value) => value !== null);
        const payableTotal = payableValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
        const payment = {
          trackingNumber: order.trackingNumber,
          paymentStatus: String(shipmentRoot.current_payment_status || latestBulk.payment_status || ""),
          currentPaymentStatus: String(shipmentRoot.current_payment_status || latestBulk.payment_status || ""),
          paymentId: String(latestBulk.payment_id || latestShipment.id || ""),
          paymentDate: String(latestBulk.payment_date || latestShipment.datetime || ""),
          paymentMethod: String(latestBulk.payment_method || ""),
          paymentType: String(latestBulk.payment_type || latestShipment.type || ""),
          billingMethod: String(latestBulk.billing_method || ""),
          paymentRecords,
          bulkPaymentRecords,
          charges: shipmentRoot.charges ?? null,
          recordedPayable: hasRecordedPayable ? payableTotal : null,
          raw: { shipment: shipmentRaw, bulk: bulkPaymentRecords },
        };
        await prisma.$transaction(async (tx) => {
          const existing = await tx.paymentStatus.findUnique({
            where: { trackingNumber: order.trackingNumber },
            select: { data: true },
          });
          const mergedPayment = mergeTraxPaymentRefresh(existing?.data, payment);
          await tx.paymentStatus.upsert({
            where: { trackingNumber: order.trackingNumber },
            update: { data: JSON.stringify(mergedPayment), updatedAt: new Date() },
            create: { trackingNumber: order.trackingNumber, data: JSON.stringify(mergedPayment) },
          });
          if (hasRecordedPayable) {
            await tx.order.updateMany({
              where: { brandId, courier: "TRAX", trackingNumber: order.trackingNumber },
              data: { netAmount: payableTotal, lastFetchedAt: new Date() },
            });
          }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        fetched += paymentRecords.length;
      }
    }
    if (successfulRequests === 0 && warnings.length) {
      return NextResponse.json({ error: `TRAX payment sync failed: ${warnings.slice(0, 3).join("; ")}` }, { status: 502 });
    }
    const refreshed = await prisma.order.findMany({
      where: {
        brandId,
        courier: "TRAX",
        orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` },
      },
      select: {
        trackingNumber: true,
        orderRefNumber: true,
        customerName: true,
        orderDate: true,
        paymentStatus: { select: { data: true } },
      },
      orderBy: { orderDate: "desc" },
    });
    const payments = paymentRowsFromOrders(refreshed);
    return NextResponse.json({
      payments,
      source: "live",
      count: payments.length,
      fetched,
      warnings: warnings.slice(0, 10),
      emptyReason: payments.length ? null : "TRAX returned no payment records for the saved shipments in this date range.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "TRAX payment sync failed" }, { status: 502 });
  }
}