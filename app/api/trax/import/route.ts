import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { prisma } from "@/lib/prisma";
import {
  getTraxBrandConfig,
  getTraxShipmentCharges,
  getTraxShipmentPayments,
  getTraxShipmentStatus,
  getTraxShipmentTrack,
  normalizeTraxTracking,
} from "@/lib/trax";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asText = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";
  const orderDate = typeof body.orderDate === "string" ? body.orderDate : "";
  if (!brandId || !/^\d{3,40}$/.test(trackingNumber)
    || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)
    || Number.isNaN(new Date(`${orderDate}T00:00:00.000Z`).getTime())) {
    return NextResponse.json({ error: "Enter a numeric tracking number and the shipment's original booking date." }, { status: 400 });
  }
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }
  const config = await getTraxBrandConfig(brandId);
  if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!config.enabled) return NextResponse.json({ error: "TRAX is disabled for this brand" }, { status: 403 });

  const existing = await prisma.order.findUnique({ where: { trackingNumber }, select: { brandId: true, courier: true } });
  if (existing) {
    if (existing.brandId === brandId && existing.courier === "TRAX") {
      return NextResponse.json({ error: "This TRAX shipment is already saved. Use Update tracking to refresh it." }, { status: 409 });
    }
    return NextResponse.json({ error: "This tracking number is already used by another dashboard shipment and cannot be imported." }, { status: 409 });
  }

  const [trackResult, statusResult, chargesResult, paymentsResult] = await Promise.allSettled([
    getTraxShipmentTrack(trackingNumber, config.credentials),
    getTraxShipmentStatus(trackingNumber, config.credentials),
    getTraxShipmentCharges(trackingNumber, config.credentials),
    getTraxShipmentPayments(trackingNumber, config.credentials),
  ]);
  if (trackResult.status === "rejected") {
    return NextResponse.json({
      error: trackResult.reason instanceof Error ? trackResult.reason.message : "Unable to retrieve shipment details from TRAX",
    }, { status: 502 });
  }

  const trackRaw = trackResult.value;
  const statusRaw = statusResult.status === "fulfilled" ? statusResult.value : null;
  const chargesRaw = chargesResult.status === "fulfilled" ? chargesResult.value : null;
  const paymentsRaw = paymentsResult.status === "fulfilled" ? paymentsResult.value : null;
  const warnings = [statusResult, chargesResult, paymentsResult]
    .filter((result) => result.status === "rejected")
    .map((result) => result.status === "rejected" ? (result.reason instanceof Error ? result.reason.message : "Optional TRAX detail unavailable") : "");
  const normalized = normalizeTraxTracking(trackingNumber, statusRaw, trackRaw, chargesRaw, paymentsRaw);
  const detail = asRecord(asRecord(trackRaw).details);
  const consignee = asRecord(detail.consignee);
  const orderInformation = asRecord(detail.order_information);
  const items = Array.isArray(orderInformation.items) ? orderInformation.items.map(asRecord) : [];
  const itemDescriptions = items.map((item) => asText(item.description)).filter(Boolean);
  const amount = Number(orderInformation.amount);
  const orderAmount = Number.isFinite(amount) ? amount : 0;
  const reference = asText(detail.order_id) || trackingNumber;
  const currentStatus = normalized.tracking.currentStatus;
  const orderData = {
    trackingNumber,
    brandId,
    courier: "TRAX",
    orderRefNumber: reference,
    invoicePayment: orderAmount,
    customerName: asText(consignee.name) || "TRAX shipment",
    customerPhone: asText(consignee.phone_number_1),
    deliveryAddress: asText(consignee.address),
    cityName: asText(consignee.destination) || null,
    transactionDate: `${orderDate}T00:00:00.000Z`,
    orderDetail: itemDescriptions.join(", ") || "TRAX shipment",
    orderType: "TRAX",
    orderDate: `${orderDate}T00:00:00.000Z`,
    orderAmount,
    orderStatus: currentStatus,
    transactionStatus: currentStatus,
    lastStatus: currentStatus === "No update" ? null : currentStatus,
    lastStatusTime: normalized.tracking.lastStatusTime ? new Date(normalized.tracking.lastStatusTime) : null,
    transactionFee: normalized.orderUpdates.transactionFee ?? null,
    transactionTax: normalized.orderUpdates.transactionTax ?? null,
    netAmount: normalized.orderUpdates.netAmount ?? null,
    actualWeight: Number.isFinite(Number(orderInformation.weight)) ? Number(orderInformation.weight) : null,
    source: "trax-import",
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.order.create({ data: orderData });
      await tx.trackingStatus.create({
        data: { trackingNumber, data: JSON.stringify(normalized.tracking) },
      });
      if (paymentsRaw !== null) {
        await tx.paymentStatus.create({
          data: { trackingNumber, data: JSON.stringify(normalized.payment) },
        });
      }
    });
  } catch (error) {
    console.error("Failed to save imported TRAX shipment:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "TRAX tracking was retrieved, but this shipment could not be saved locally." }, { status: 500 });
  }

  return NextResponse.json({
    trackingNumber,
    orderDate,
    warnings,
    message: "Existing TRAX shipment added using its live tracking details.",
  }, { status: 201 });
}