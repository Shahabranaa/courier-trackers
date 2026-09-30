import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { prisma } from "@/lib/prisma";
import { mergeTraxPaymentRefresh, mergeTraxTrackingRefresh } from "@/lib/trax-refresh-merge";
import {
  getTraxBrandConfig,
  getTraxShipmentCharges,
  getTraxShipmentPayments,
  getTraxShipmentStatus,
  getTraxShipmentTrack,
  normalizeTraxTracking,
} from "@/lib/trax";

const asJson = (value: unknown) => JSON.stringify(value);
const errorText = (value: PromiseSettledResult<unknown>) =>
  value.status === "rejected" ? value.reason instanceof Error ? value.reason.message : "TRAX request failed" : null;

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const rawTrackingNumbers: unknown[] = Array.isArray(body.trackingNumbers) ? body.trackingNumbers : [];
  const trackingNumbers = [...new Set(
    rawTrackingNumbers.map((value) => String(value).trim()).filter((value) => /^\d{3,40}$/.test(value)),
  )].slice(0, 25);
  if (!brandId || trackingNumbers.length === 0) {
    return NextResponse.json({ error: "A brand and valid numeric tracking numbers are required" }, { status: 400 });
  }
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }
  const orders = await prisma.order.findMany({
    where: { brandId, courier: "TRAX", trackingNumber: { in: trackingNumbers } },
    select: { trackingNumber: true },
  });
  if (orders.length !== trackingNumbers.length) {
    return NextResponse.json({ error: "One or more tracking numbers do not belong to this brand's TRAX shipments" }, { status: 404 });
  }
  const config = await getTraxBrandConfig(brandId);
  if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!config.enabled) return NextResponse.json({ error: "TRAX is disabled for this brand" }, { status: 403 });

  const results: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < orders.length; offset += 4) {
    const batch = orders.slice(offset, offset + 4);
    const batchResults = await Promise.all(batch.map(async ({ trackingNumber }) => {
      const responses = await Promise.allSettled([
        getTraxShipmentStatus(trackingNumber, config.credentials),
        getTraxShipmentTrack(trackingNumber, config.credentials),
        getTraxShipmentCharges(trackingNumber, config.credentials),
        getTraxShipmentPayments(trackingNumber, config.credentials),
      ]);
      const errors = responses.map(errorText).filter((value): value is string => Boolean(value));
      if (responses.every((value) => value.status === "rejected")) {
        return { trackingNumber, error: errors.join("; ") };
      }
      const [status, track, charges, payments] = responses.map((value) =>
        value.status === "fulfilled" ? value.value : null
      );
      const normalized = normalizeTraxTracking(trackingNumber, status, track, charges, payments);
      try {
        const savedTracking = await prisma.$transaction(async (tx) => {
          const [existingTracking, existingPayment, existingOrder] = await Promise.all([
            tx.trackingStatus.findUnique({ where: { trackingNumber }, select: { data: true } }),
            payments !== null
              ? tx.paymentStatus.findUnique({ where: { trackingNumber }, select: { data: true } })
              : Promise.resolve(null),
            tx.order.findFirst({
              where: { brandId, courier: "TRAX", trackingNumber },
              select: { lastStatus: true, lastStatusTime: true },
            }),
          ]);
          if (!existingOrder) throw new Error("TRAX order no longer exists for this brand.");
          const trackingMerge = mergeTraxTrackingRefresh(
            existingTracking?.data,
            normalized.tracking,
            existingOrder,
          );
          await tx.trackingStatus.upsert({
            where: { trackingNumber },
            update: { data: asJson(trackingMerge.tracking), updatedAt: new Date() },
            create: { trackingNumber, data: asJson(trackingMerge.tracking) },
          });
          if (payments !== null) {
            const payment = mergeTraxPaymentRefresh(existingPayment?.data, normalized.payment);
            await tx.paymentStatus.upsert({
              where: { trackingNumber },
              update: { data: asJson(payment), updatedAt: new Date() },
              create: { trackingNumber, data: asJson(payment) },
            });
          }
          const orderUpdates = { ...normalized.orderUpdates };
          Object.assign(orderUpdates, trackingMerge.orderChargeOverrides);
          if (trackingMerge.preserveCurrentStatus) {
            delete orderUpdates.lastStatus;
            delete orderUpdates.orderStatus;
            delete orderUpdates.transactionStatus;
            delete orderUpdates.lastStatusTime;
          }
          await tx.order.updateMany({
            where: { brandId, courier: "TRAX", trackingNumber },
            data: { ...orderUpdates, lastFetchedAt: new Date() },
          });
          return trackingMerge.tracking;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return {
          ...savedTracking,
          payment: normalized.payment,
          ...(errors.length ? { warning: errors.join("; ") } : {}),
        };
      } catch (error) {
        return { trackingNumber, error: error instanceof Error ? error.message : "Unable to save TRAX tracking data" };
      }
    }));
    results.push(...batchResults);
  }

  return NextResponse.json({
    results,
    count: results.length,
    updated: results.filter((result) => !result.error).length,
    failed: results.filter((result) => Boolean(result.error)).length,
  });
}