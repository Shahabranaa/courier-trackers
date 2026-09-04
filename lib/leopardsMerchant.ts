import { prisma } from "@/lib/prisma";

const BASE_URL = "https://merchantapi.leopardscourier.com/api/";
const TIMEOUT_MS = 30_000;
type JsonRecord = Record<string, unknown>;

export interface LeopardsCredentials { apiKey?: string; apiPassword?: string }

const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const valueOf = (row: JsonRecord, ...keys: string[]) => {
  const lowered = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[_\s-]/g, ""), value]));
  for (const key of keys) {
    const value = row[key] ?? lowered.get(key.toLowerCase().replace(/[_\s-]/g, ""));
    if (value !== undefined && value !== null) return value;
  }
  return "";
};
const arrayFrom = (value: unknown): JsonRecord[] => {
  if (Array.isArray(value)) return value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object"));
  const body = record(value);
  for (const key of ["data", "details", "detail", "result", "response", "shipments", "packets", "packet_list", "payment_list", "city_list", "Tracking Detail"]) {
    if (Array.isArray(body[key])) return arrayFrom(body[key]);
  }
  for (const key of ["data", "result", "response"]) if (body[key] && typeof body[key] === "object") return [body[key] as JsonRecord];
  return [];
};

function credentials(input: LeopardsCredentials = {}) {
  const apiKey = input.apiKey?.trim() || process.env.LEOPARDS_API_KEY?.trim();
  const apiPassword = input.apiPassword?.trim() || process.env.LEOPARDS_API_PASSWORD?.trim();
  if (!apiKey || !apiPassword) throw new Error("Leopards API credentials are not configured");
  return { apiKey, apiPassword };
}

async function request(endpoint: string, payload: JsonRecord, input?: LeopardsCredentials, method: "GET" | "POST" = "POST"): Promise<unknown> {
  const auth = credentials(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = new URL(`${endpoint}/format/json/`, BASE_URL);
    const authPayload = { api_key: auth.apiKey, api_password: auth.apiPassword, ...payload };
    if (method === "GET") {
      for (const [key, value] of Object.entries(authPayload)) {
        url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
      }
    }
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(authPayload) } : {}),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
    if (!response.ok) {
      const data = record(body);
      throw new Error(String(data.message || data.error || data.status_message || `Leopards API returned ${response.status}`));
    }
    const data = record(body);
    if (data.success === false || data.status === 0 || String(data.status || "").toLowerCase() === "error") {
      throw new Error(String(data.message || data.error || "Leopards API request failed"));
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Leopards request timed out after 30 seconds");
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function getLeopardsBrandConfig(brandId: string) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { leopardsApiKey: true, leopardsApiPassword: true, leopardsEnabled: true } });
  return brand ? { enabled: brand.leopardsEnabled, credentials: { apiKey: brand.leopardsApiKey, apiPassword: brand.leopardsApiPassword } } : null;
}

export const getAllCities = (input?: LeopardsCredentials) => request("getAllCities", {}, input);
export const getBookedPacketLastStatus = (startDate: string, endDate: string, input?: LeopardsCredentials) =>
  request("getBookedPacketLastStatus", { from_date: startDate, to_date: endDate }, input, "GET");
export const trackBookedPacket = (cn: string, input?: LeopardsCredentials) =>
  request("trackBookedPacket", { track_numbers: cn }, input);
export const getShipmentDetailsByOrderID = (orderId: string, input?: LeopardsCredentials) =>
  request("getShipmentDetailsByOrderID", { shipment_order_id: [orderId] }, input);

async function chunked(endpoint: "getPaymentDetails" | "getShippingCharges", cns: string[], input?: LeopardsCredentials) {
  const unique = [...new Set(cns.map((cn) => cn.trim()).filter(Boolean))];
  const requests: Promise<unknown>[] = [];
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50);
    requests.push(request(endpoint, { cn_numbers: chunk.join(",") }, input, "GET"));
  }
  return Promise.all(requests);
}
export const getPaymentDetails = (cns: string[], input?: LeopardsCredentials) => chunked("getPaymentDetails", cns, input);
export const getShippingCharges = (cns: string[], input?: LeopardsCredentials) => chunked("getShippingCharges", cns, input);

export function leopardsRows(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.flatMap(arrayFrom) : arrayFrom(value);
}
export function leopardsString(row: JsonRecord, ...keys: string[]) { return String(valueOf(row, ...keys)).trim(); }
export function leopardsNumber(row: JsonRecord, ...keys: string[]) {
  const value = Number(leopardsString(row, ...keys).replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}
export function normalizeLeopardsTracking(trackingNumber: string, raw: unknown) {
  const root = record(raw);
  const rows = leopardsRows(raw);
  const shipment = rows[0] || root;
  const historyValue = valueOf(shipment, "Tracking Detail", "tracking_history", "history", "details", "status_history");
  const history = Array.isArray(historyValue) ? historyValue.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : rows;
  const events = history.map((item) => ({
    status: leopardsString(item, "Staus", "status", "status_name", "activity", "status_reamrks", "remarks", "current_status"),
    date: leopardsString(item, "Activity_datetime", "Activity Date", "activity_date", "date", "datetime", "date_time", "created_at", "status_date"),
    details: leopardsString(item, "Reason", "location", "city", "station", "status_reamrks", "remarks"),
  })).filter((item) => item.status || item.date);
  const latest = events.at(-1) || { status: "", date: leopardsString(shipment, "activity_date", "last_status_time", "status_date", "updated_at"), details: leopardsString(shipment, "destination_city_name", "city", "destination") };
  const status = leopardsString(shipment, "booked_packet_status", "status", "current_status", "packet_status") || latest.status || "No update";
  const lower = status.toLowerCase();
  return { trackingNumber, currentStatus: status, statusCategory: lower.includes("deliver") ? "delivered" : lower.includes("return") ? "returned" : lower.includes("cancel") ? "cancelled" : lower.includes("book") || lower.includes("transit") || lower.includes("dispatch") ? "in_process" : "other", currentCity: leopardsString(shipment, "destination_city_name", "destination_city", "city", "destination", "last_location") || latest.details, lastStatusTime: latest.date || null, activityHistory: events, raw };
}

export async function saveLeopardsTrackingResult(trackingNumber: string, raw: unknown) {
  const normalized = normalizeLeopardsTracking(trackingNumber, raw);
  const parsedTime = normalized.lastStatusTime ? new Date(normalized.lastStatusTime) : null;
  await prisma.trackingStatus.upsert({
    where: { trackingNumber },
    update: { data: JSON.stringify(normalized), updatedAt: new Date() },
    create: { trackingNumber, data: JSON.stringify(normalized) },
  });
  await prisma.order.updateMany({
    where: { trackingNumber, courier: "Leopards" },
    data: {
      ...(normalized.currentStatus !== "No update" ? { lastStatus: normalized.currentStatus, orderStatus: normalized.currentStatus, transactionStatus: normalized.currentStatus } : {}),
      ...(normalized.currentCity ? { cityName: normalized.currentCity } : {}),
      ...(parsedTime && !Number.isNaN(parsedTime.getTime()) ? { lastStatusTime: parsedTime } : {}),
      lastFetchedAt: new Date(),
    },
  });
  return normalized;
}