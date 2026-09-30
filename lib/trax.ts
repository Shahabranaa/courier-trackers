import { prisma } from "@/lib/prisma";

type JsonRecord = Record<string, unknown>;
export type TraxCredentials = { apiKey?: string | null };
export type TraxClaimImage = {
  fileName: string;
  contentType: "image/jpeg" | "image/png";
  base64: string;
};
export type TraxOperationAction =
  | { brandId: string; action: "paymentStatus" | "cancel"; trackingNumber: string }
  | { brandId: string; action: "airWaybill"; trackingNumber: string; type: 0 | 1 }
  | { brandId: string; action: "invoice"; id: number; type: 1; trackingNumber?: never }
  | { brandId: string; action: "invoice"; id: number; type: 2; trackingNumber?: string }
  | { brandId: string; action: "calculateRates"; service_type_id: number; origin_city_id: number; destination_city_id: number; estimated_weight: number; shipping_mode_id: number; amount: number }
  | { brandId: string; action: "createReceivingSheet"; trackingNumbers: string[] }
  | { brandId: string; action: "viewReceivingSheet"; trackingNumber: string; receivingSheetId: string; type: 0 | 1 }
  | { brandId: string; action: "trackOrderId" | "statusOrderId"; orderId: string; type: 0 | 1 }
  | { brandId: string; action: "returnConfirmationPending" | "reattempt"; trackingNumber: string; remarks?: string }
  | { brandId: string; action: "interceptRebook"; trackingNumber: string; consigneeType: 1 | 2; remarks?: string; consignee_address: string; consignee_phone_number_1: string; consignee_city_id?: string; consignee_name?: string; amount?: number; consignee_phone_number_2?: string }
  | { brandId: string; action: "crmComplaint" | "crmServiceRequest"; trackingNumber: string; caseNatureTypeId: number; description: string }
  | { brandId: string; action: "crmClaim"; trackingNumber: string; caseNatureTypeId?: number; description: string; product_cost: number; damage_product_price: number; missing_product_price: number; images?: Partial<Record<"product_picture" | "invoice_picture" | "actual_product_picture" | "product_packaging_picture" | "damage_product_picture" | "missing_product_picture", TraxClaimImage>> };

const API_BASE = "https://sonic.pk/api/";
const TIMEOUT_MS = 30_000;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const numeric = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function configuredKey(input: TraxCredentials = {}) {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) throw new Error("TRAX API key is not configured for this brand");
  return apiKey;
}

export async function getTraxBrandConfig(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { traxApiKey: true, traxEnabled: true },
  });
  return brand
    ? { enabled: brand.traxEnabled, credentials: { apiKey: brand.traxApiKey } satisfies TraxCredentials }
    : null;
}

async function request(endpoint: string, options: {
  method?: "GET" | "POST";
  params?: Record<string, string | number>;
  body?: JsonRecord | FormData;
  credentials: TraxCredentials;
  document?: boolean;
}): Promise<unknown> {
  const apiKey = configuredKey(options.credentials);
  const url = new URL(endpoint, API_BASE);
  for (const [name, value] of Object.entries(options.params || {})) {
    url.searchParams.set(name, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const isForm = options.body instanceof FormData;
    let requestBody: BodyInit | undefined;
    if (options.body instanceof FormData) requestBody = options.body;
    else if (options.body) requestBody = JSON.stringify(options.body);
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: options.document ? "application/pdf, image/jpeg, image/png, application/json" : "application/json",
        Authorization: apiKey,
        ...(options.body && !isForm ? { "Content-Type": "application/json" } : {}),
      },
      ...(requestBody ? { body: requestBody } : {}),
      cache: "no-store",
      ...(options.document ? { redirect: "manual" as RequestRedirect } : {}),
      signal: controller.signal,
    });

    if (options.document && response.ok) {
      const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (contentType === "application/json") {
        const responseBody = asRecord(await response.json());
        throw new Error(text(responseBody.message || responseBody.error) || "TRAX did not return a printable document");
      }
      if (!["application/pdf", "image/jpeg", "image/png"].includes(contentType)) {
        throw new Error(`TRAX returned an unsupported document content type: ${contentType || "unknown"}`);
      }
      const maxDocumentBytes = 10 * 1024 * 1024;
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxDocumentBytes) {
        throw new Error("TRAX document is empty or exceeds the 10 MB download limit");
      }
      if (!response.body) throw new Error("TRAX returned an empty document");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let byteCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteCount += value.byteLength;
        if (byteCount > maxDocumentBytes) {
          await reader.cancel();
          throw new Error("TRAX document is empty or exceeds the 10 MB download limit");
        }
        chunks.push(value);
      }
      if (!byteCount) throw new Error("TRAX returned an empty document");
      const bytes = new Uint8Array(byteCount);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return {
        contentType,
        base64: Buffer.from(bytes).toString("base64"),
      };
    }
    const rawText = await response.text();
    let body: unknown = rawText;
    try { body = rawText ? JSON.parse(rawText) : {}; } catch { /* keep the upstream text for errors */ }
    const root = asRecord(body);
    if (!response.ok) {
      throw new Error(text(root.message || root.error) || `TRAX API returned HTTP ${response.status}`);
    }
    if (root.status !== undefined && String(root.status) !== "0") {
      throw new Error(text(root.message || root.error) || `TRAX API returned status ${String(root.status)}`);
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("TRAX request timed out after 30 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type TraxOperationDocument = { contentType: string; base64: string };

export const getTraxPaymentStatus = (trackingNumber: string, credentials: TraxCredentials) =>
  request("shipment/payment_status", { params: { Tracking_number: trackingNumber }, credentials });

export const getTraxAirWaybill = (trackingNumber: string, type: 0 | 1, credentials: TraxCredentials) =>
  request("shipment/air_waybill", { params: { tracking_number: trackingNumber, type }, credentials, document: true });

export const cancelTraxShipment = (trackingNumber: string, credentials: TraxCredentials) =>
  request("shipment/cancel", { method: "POST", body: { tracking_number: trackingNumber }, credentials });

export const calculateTraxCharges = (body: JsonRecord, credentials: TraxCredentials) =>
  request("charges_calculate", { method: "POST", body, credentials });

export const createTraxReceivingSheet = (trackingNumbers: string[], credentials: TraxCredentials) => {
  const body = new FormData();
  for (const trackingNumber of trackingNumbers) body.append("tracking_numbers[]", trackingNumber);
  return request("receiving_sheet/create", { method: "POST", body, credentials });
};

export const getTraxReceivingSheet = (id: string, type: 0 | 1, credentials: TraxCredentials) =>
  request("receiving_sheet/view", { params: { receiving_sheet_id: id, type }, credentials, document: true });

export const getTraxOrderIdTrack = (orderId: string, type: 0 | 1, credentials: TraxCredentials) =>
  request("shipment/track/order_id", { params: { order_id: orderId, type }, credentials });

export const getTraxOrderIdStatus = (orderId: string, type: 0 | 1, credentials: TraxCredentials) =>
  request("shipment/status/order_id", { params: { order_id: orderId, type }, credentials });

export const requestTraxShipmentStatus = (body: JsonRecord, credentials: TraxCredentials) =>
  request("request/rcp", { method: "POST", body, credentials });

export const submitTraxCrmRequest = (body: JsonRecord | FormData, credentials: TraxCredentials) =>
  request("request/crm", { method: "POST", body, credentials });

export const getTraxCities = (credentials: TraxCredentials) =>
  request("cities", { credentials });

export const getTraxPickupAddresses = (credentials: TraxCredentials) =>
  request("pickup_addresses", { credentials });

export const addTraxPickupAddress = (body: JsonRecord, credentials: TraxCredentials) =>
  request("pickup_address/add", { method: "POST", body, credentials });

export const bookTraxShipment = (body: JsonRecord, credentials: TraxCredentials) =>
  request("shipment/book", { method: "POST", body, credentials });

export const getTraxShipmentStatus = (trackingNumber: string, credentials: TraxCredentials) =>
  request("shipment/status", { params: { tracking_number: trackingNumber, type: 0 }, credentials });

export const getTraxShipmentTrack = (trackingNumber: string, credentials: TraxCredentials) =>
  request("shipment/track", { params: { tracking_number: trackingNumber, type: 0 }, credentials });

export const getTraxShipmentCharges = (trackingNumber: string, credentials: TraxCredentials) =>
  request("shipment/charges", { params: { tracking_number: trackingNumber }, credentials });

export const getTraxShipmentPayments = (trackingNumber: string, credentials: TraxCredentials) =>
  request("shipment/payments", { params: { tracking_number: trackingNumber }, credentials });

export async function getTraxBulkPayments(trackingNumbers: string[], credentials: TraxCredentials) {
  const apiKey = configuredKey(credentials);
  const url = new URL("payments", API_BASE);
  for (const trackingNumber of trackingNumbers) {
    url.searchParams.append("tracking_number[]", trackingNumber);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: apiKey },
      cache: "no-store",
      signal: controller.signal,
    });
    const rawText = await response.text();
    let body: unknown = rawText;
    try { body = rawText ? JSON.parse(rawText) : {}; } catch { /* keep upstream text for errors */ }
    const root = asRecord(body);
    if (!response.ok) throw new Error(text(root.message || root.error) || `TRAX API returned HTTP ${response.status}`);
    if (root.status !== undefined && String(root.status) !== "0") {
      throw new Error(text(root.message || root.error) || `TRAX API returned status ${String(root.status)}`);
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("TRAX request timed out after 30 seconds");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const getTraxInvoice = (id: number, type: 1 | 2, credentials: TraxCredentials) =>
  request("invoice", { params: { id, type }, credentials });

export function traxRows(value: unknown, keys: string[]) {
  const root = asRecord(value);
  const child = root[keys.find((key) => root[key] !== undefined) || ""];
  return Array.isArray(child) ? child.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : [];
}

export function getTraxPaymentRows(raw: unknown, trackingNumber: string) {
  const root = asRecord(raw);
  const payments = asRecord(root.payments);
  const rows = payments[trackingNumber];
  return Array.isArray(rows) ? rows.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : [];
}

function parseDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function trackingDetails(raw: unknown) {
  const root = asRecord(raw);
  return asRecord(root.details);
}

export function normalizeTraxTracking(
  trackingNumber: string,
  statusRaw: unknown,
  trackRaw: unknown,
  chargesRaw: unknown,
  shipmentPaymentsRaw: unknown,
  bulkPaymentsRaw?: unknown,
) {
  const statusRoot = asRecord(statusRaw);
  const detail = trackingDetails(trackRaw);
  const historyValue = detail.tracking_history;
  const historyRows = Array.isArray(historyValue)
    ? historyValue
    : historyValue && typeof historyValue === "object"
      ? [historyValue]
      : [];
  const activityHistory = historyRows.map((item) => {
    const row = asRecord(item);
    return {
      status: text(row.status),
      date: text(row.date_time || row.timestamp),
      details: text(row.status_reason),
    };
  }).filter((item) => item.status || item.date || item.details);
  const latestHistory = [...activityHistory].sort((left, right) => {
    const leftTime = Date.parse(left.date);
    const rightTime = Date.parse(right.date);
    return Number.isFinite(rightTime) && Number.isFinite(leftTime) ? rightTime - leftTime : 0;
  })[0];
  const currentStatus = text(statusRoot.current_status) || latestHistory?.status || "No update";
  const lowerStatus = currentStatus.toLowerCase();
  const negativeDelivery = /\bundelivered\b|\bnot[\s-]+delivered\b|delivery unsuccessful/.test(lowerStatus);
  const category = (!negativeDelivery && (lowerStatus.includes("deliver") || lowerStatus.includes("completed")))
    ? "delivered"
    : lowerStatus.includes("return") || lowerStatus === "rto"
      ? "returned"
      : lowerStatus.includes("cancel") || lowerStatus.includes("void")
        ? "cancelled"
        : lowerStatus.includes("book") || lowerStatus.includes("transit") || lowerStatus.includes("dispatch")
          ? "in_process"
          : "other";

  const chargeRoot = asRecord(chargesRaw);
  const charges = asRecord(chargeRoot.charges);
  const paymentRoot = asRecord(shipmentPaymentsRaw);
  const paymentRows = traxRows(shipmentPaymentsRaw, ["payments"]);
  const bulkRows = getTraxPaymentRows(bulkPaymentsRaw, trackingNumber);
  const bulkPayment = bulkRows[0] || {};
  const paymentStatus = text(paymentRoot.current_payment_status || bulkPayment.payment_status);
  const hasPayableAmount = paymentRows.some((item) => numeric(item.payable) !== null);
  const payableTotal = paymentRows.reduce((sum, item) => sum + (numeric(item.payable) ?? 0), 0);
  const consignee = asRecord(detail.consignee);
  const orderInformation = asRecord(detail.order_information);

  return {
    tracking: {
      trackingNumber,
      currentStatus,
      statusCategory: category,
      currentCity: text(consignee.destination),
      lastStatusTime: latestHistory ? parseDate(latestHistory.date)?.toISOString() || null : null,
      activityHistory,
      raw: {
        status: statusRaw ?? null,
        track: trackRaw ?? null,
        charges: chargesRaw ?? null,
        payments: shipmentPaymentsRaw ?? null,
        bulkPayment: bulkPaymentsRaw ? bulkPayment : null,
      },
    },
    payment: {
      trackingNumber,
      paymentStatus,
      paymentRecords: paymentRows,
      bulkPaymentRecords: bulkRows,
      currentPaymentStatus: text(paymentRoot.current_payment_status || bulkPayment.payment_status),
      paymentId: text(bulkPayment.payment_id),
      paymentDate: text(bulkPayment.payment_date),
      paymentMethod: text(bulkPayment.payment_method),
      paymentType: text(bulkPayment.payment_type),
      billingMethod: text(bulkPayment.billing_method),
      raw: {
        shipmentPayments: shipmentPaymentsRaw ?? null,
        bulkPayment: bulkRows,
      },
    },
    orderUpdates: {
      lastStatus: currentStatus === "No update" ? undefined : currentStatus,
      orderStatus: currentStatus === "No update" ? undefined : currentStatus,
      transactionStatus: currentStatus === "No update" ? undefined : currentStatus,
      cityName: text(consignee.destination) || undefined,
      lastStatusTime: latestHistory ? parseDate(latestHistory.date) || undefined : undefined,
      transactionFee: numeric(charges.total_charges) ?? undefined,
      transactionTax: numeric(charges.gst) ?? undefined,
      netAmount: hasPayableAmount ? payableTotal : undefined,
      actualWeight: numeric(orderInformation.weight) ?? undefined,
    },
  };
}

export function traxOrderBookingValues(payload: JsonRecord, trackingNumber: string) {
  const now = new Date().toISOString();
  const amount = numeric(payload.amount) ?? 0;
  return {
    trackingNumber,
    brandId: text(payload.brandId),
    courier: "TRAX",
    orderRefNumber: text(payload.order_id) || trackingNumber,
    invoicePayment: amount,
    customerName: text(payload.consignee_name),
    customerPhone: text(payload.consignee_phone_number_1),
    deliveryAddress: text(payload.consignee_address),
    cityName: text(payload.consignee_city_name) || null,
    transactionDate: now,
    orderDetail: text(payload.item_description),
    orderType: Number(payload.payment_mode_id) === 1 ? "COD" : Number(payload.payment_mode_id) === 2 ? "CCD" : "Prepaid",
    orderDate: now,
    orderAmount: amount,
    orderStatus: "Booked",
    transactionStatus: "Booked",
    lastStatus: "Booked",
    source: "trax-booking",
  };
}