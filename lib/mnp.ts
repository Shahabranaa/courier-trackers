import { prisma } from "@/lib/prisma";

const BASE_URL = "https://mnpcourier.com/mycodapi/api/";
const TRACKING_URL = "https://tracking.mulphilog.com.pk/api/CNTracking";
const TIMEOUT_MS = 30_000;
type JsonRecord = Record<string, unknown>;

export interface MnpCredentials {
  username?: string;
  password?: string;
  accountNo?: string;
}

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const key = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
const valueOf = (row: JsonRecord, ...keys: string[]) => {
  const entries = new Map(Object.entries(row).map(([name, value]) => [key(name), value]));
  for (const name of keys) {
    const value = row[name] ?? entries.get(key(name));
    if (value !== undefined && value !== null) return value;
  }
  return "";
};

export function mnpRows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap((item) => mnpRows(item));
  const body = asRecord(value);
  for (const name of ["details", "detail", "tracking_Details", "trackingDetails", "locationList", "City", "data", "result", "response"]) {
    const child = body[name] ?? body[Object.keys(body).find((candidate) => key(candidate) === key(name)) || ""];
    if (Array.isArray(child)) return child.filter((item): item is JsonRecord => Boolean(item && typeof item === "object"));
  }
  return [];
}

export function mnpString(row: JsonRecord, ...keys: string[]) {
  return String(valueOf(row, ...keys)).trim();
}

export function mnpNumber(row: JsonRecord, ...keys: string[]) {
  const result = Number(mnpString(row, ...keys).replace(/,/g, ""));
  return Number.isFinite(result) ? result : null;
}

function credentials(input: MnpCredentials = {}) {
  const username = input.username?.trim() || process.env.MNP_USERNAME?.trim();
  const password = input.password?.trim() || process.env.MNP_PASSWORD?.trim();
  const accountNo = input.accountNo?.trim() || process.env.MNP_ACCOUNT_NO?.trim();
  if (!username || !password || !accountNo) throw new Error("M&P credentials are not configured");
  return { username, password, accountNo };
}

export async function getMnpBrandConfig(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { mnpUsername: true, mnpPassword: true, mnpAccountNo: true, mnpEnabled: true },
  });
  return brand
    ? { enabled: brand.mnpEnabled, credentials: { username: brand.mnpUsername, password: brand.mnpPassword, accountNo: brand.mnpAccountNo } satisfies MnpCredentials }
    : null;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : {}; } catch { /* retain text for useful errors */ }
  const record = asRecord(body);
  const first = Array.isArray(body) ? asRecord(body[0]) : {};
  const result = Object.keys(record).length ? record : first;
  const success = result.isSuccess ?? result.isSucces;
  if (!response.ok) {
    throw new Error(String(result.message || result.error || text || `M&P API returned ${response.status}`));
  }
  if (success === false || String(success).toLowerCase() === "false" || String(result.status || "").toLowerCase() === "error") {
    throw new Error(String(result.message || result.error || "M&P API request failed"));
  }
  return body;
}

async function request(endpoint: string, payload: JsonRecord, input: MnpCredentials, method: "GET" | "POST" = "POST", includeAccountAuth = true) {
  const auth = credentials(input);
  const url = new URL(endpoint, BASE_URL);
  const body = { ...payload };
  if (method === "GET") {
    url.searchParams.set("username", auth.username);
    url.searchParams.set("password", auth.password);
    url.searchParams.set("AccountNo", auth.accountNo);
    for (const [name, value] of Object.entries(payload)) url.searchParams.set(name, String(value));
  } else if (includeAccountAuth) {
    Object.assign(body, { Username: auth.username, Password: auth.password, AccountNo: auth.accountNo });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: controller.signal,
    });
    return await parseResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("M&P request timed out after 30 seconds");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const getMnpCities = (input: MnpCredentials = {}) => request("Branches/Get_Cities", {}, input, "GET");
export const getMnpCitiesAll = (input: MnpCredentials = {}) => request("Branches/Get_Cities_All", {}, input, "GET");
export const getMnpLocations = (input: MnpCredentials = {}) => request("Locations/Get_locations", {}, input, "GET");
export const getCities = getMnpCities;
export const getCitiesAll = getMnpCitiesAll;
export const getLocations = getMnpLocations;

function findLocationId(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findLocationId(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [name, child] of Object.entries(value as JsonRecord)) {
    if (key(name) === "locationid" && (typeof child === "string" || typeof child === "number")) {
      const locationId = String(child).trim();
      if (locationId && locationId !== "0") return locationId;
    }
  }
  for (const child of Object.values(value as JsonRecord)) {
    const found = findLocationId(child);
    if (found) return found;
  }
  return null;
}

export async function getMnpLocationId(input: MnpCredentials = {}) {
  const locationId = findLocationId(await getMnpLocations(input));
  if (!locationId) {
    throw new Error("M&P location ID could not be discovered from Locations/Get_locations; provide a valid locationID query parameter");
  }
  return locationId;
}

export const getMnpQsrReport = (monthNumber: number, year: number, locationID: string, input: MnpCredentials = {}) =>
  request("Reports/QSR_Report", { UserName: credentials(input).username, Password: credentials(input).password, MonthNumber: monthNumber, year, locationID }, input, "POST", false);

export const getMnpPaymentReport = (dateFrom: string, dateTo: string, locationID: string, input: MnpCredentials = {}) =>
  request("Reports/Payment_Report", { UserName: credentials(input).username, Password: credentials(input).password, dateFrom, dateTo, locationID }, input, "POST", false);

export async function getMnpPaymentReports(startDate: string, endDate: string, locationID: string, input: MnpCredentials = {}) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new Error("Invalid M&P payment date range");
  const reports: unknown[] = [];
  for (let cursor = new Date(start); cursor <= end; ) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 30);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    reports.push(await getMnpPaymentReport(cursor.toISOString(), chunkEnd.toISOString(), locationID, input));
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return reports;
}

export const trackMnpConsignment = async (trackingNumber: string) => {
  const url = new URL(TRACKING_URL);
  url.searchParams.set("consignment", trackingNumber);
  url.searchParams.set("id", "4");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    return await parseResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("M&P tracking request timed out after 30 seconds");
    throw error;
  } finally { clearTimeout(timeout); }
};

export const trackMnpBulk = (trackingNumbers: string[], input: MnpCredentials = {}) =>
  request("Tracking/Bulk_Consignment_Tracking_New", { Consignments: [...new Set(trackingNumbers.map((item) => item.trim()).filter(Boolean))].slice(0, 200) }, input);

function parseDate(value: string) {
  const dmy = value.match(/^(\d{2})[\/ -](\d{2})[\/ -](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = dmy;
    return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function normalizeMnpTracking(trackingNumber: string, raw: unknown) {
  const root = asRecord(raw);
  const shipments = mnpRows(raw);
  const shipment = shipments.find((item) => mnpString(item, "ConsignmentNumber", "consignmentNumber") === trackingNumber) || shipments[0] || root;
  const detailValue = valueOf(shipment, "CNTrackingDetail", "tracking_Details", "trackingDetails");
  const details = Array.isArray(detailValue) ? detailValue.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : [];
  const history = details.map((item, index) => ({
    status: mnpString(item, "TrackingStatus", "status") || "No update",
    date: mnpString(item, "TransactionTime", "date", "datetime"),
    details: [mnpString(item, "Location", "location"), mnpString(item, "TrackingNarration", "narration", "Event")].filter(Boolean).join(" · "),
    index,
  })).filter((item) => item.status || item.date).sort((a, b) => {
    const left = Date.parse(a.date);
    const right = Date.parse(b.date);
    return Number.isFinite(left) && Number.isFinite(right) && left !== right ? right - left : a.index - b.index;
  }).map(({ index: _index, ...item }) => item);
  const latest = history[0] || { status: "No update", date: "", details: "" };
  const status = latest.status;
  const lower = status.toLowerCase();
  return {
    trackingNumber,
    currentStatus: status,
    statusCategory: lower.includes("deliver") ? "delivered" : lower.includes("return") || lower.includes("rto") ? "returned" : lower.includes("cancel") ? "cancelled" : lower.includes("book") || lower.includes("transit") || lower.includes("dispatch") ? "in_process" : "other",
    currentCity: mnpString(shipment, "DestinationCity", "destinationCity", "Location"),
    lastStatusTime: latest.date ? parseDate(latest.date) : null,
    activityHistory: history,
    shipment: {
      customerName: mnpString(shipment, "ConsigneeName", "consignee"),
      customerPhone: mnpString(shipment, "ContactNo", "phone"),
      deliveryAddress: mnpString(shipment, "DeliveryAddress", "address"),
      orderRefNumber: mnpString(shipment, "OrderId", "orderRefNo"),
      amount: mnpNumber(shipment, "CODAmount", "codAmount"),
      weight: mnpNumber(shipment, "Weight", "weight"),
      bookingDate: mnpString(shipment, "BookingDate", "bookingDate"),
    },
    raw,
  };
}

export async function saveMnpTrackingResult(trackingNumber: string, raw: unknown) {
  const normalized = normalizeMnpTracking(trackingNumber, raw);
  const order = await prisma.order.findFirst({ where: { trackingNumber, courier: "M&P" }, select: { trackingNumber: true } });
  if (order) {
    await prisma.trackingStatus.upsert({
      where: { trackingNumber },
      update: { data: JSON.stringify(normalized), updatedAt: new Date() },
      create: { trackingNumber, data: JSON.stringify(normalized) },
    });
    const parsedTime = normalized.lastStatusTime ? new Date(normalized.lastStatusTime) : null;
    await prisma.order.updateMany({
      where: { trackingNumber, courier: "M&P" },
      data: {
        ...(normalized.currentStatus !== "No update" ? { lastStatus: normalized.currentStatus, orderStatus: normalized.currentStatus, transactionStatus: normalized.currentStatus } : {}),
        ...(normalized.currentCity ? { cityName: normalized.currentCity } : {}),
        ...(parsedTime && !Number.isNaN(parsedTime.getTime()) ? { lastStatusTime: parsedTime } : {}),
        lastFetchedAt: new Date(),
      },
    });
  }
  return normalized;
}

export function normalizeMnpOrder(row: JsonRecord, brandId: string, fallbackDate: string) {
  const trackingNumber = mnpString(row, "consignmentNumber", "ConsignmentNumber", "cn", "trackingNumber");
  const date = mnpString(row, "BookingDate", "bookingDate") || fallbackDate;
  const status = mnpString(row, "RRStatus", "status") || "Booked";
  const amount = mnpNumber(row, "CODAmount", "codAmount") ?? 0;
  return {
    trackingNumber, brandId, courier: "M&P" as const,
    orderRefNumber: mnpString(row, "orderRefNo", "orderRefNumber", "custRefNo") || trackingNumber,
    invoicePayment: amount, orderAmount: amount,
    customerName: mnpString(row, "consignee", "Consignee", "consigneeName") || "M&P Customer",
    customerPhone: mnpString(row, "ContactNo", "consigneeMobNo", "phone"),
    deliveryAddress: mnpString(row, "DeliveryAddress", "consigneeAddress", "address"),
    cityName: mnpString(row, "DESTINATION", "DestinationCity", "destinationCity") || null,
    transactionDate: parseDate(date), orderDate: parseDate(date),
    orderDetail: "M&P shipment", orderType: "COD", orderStatus: status, transactionStatus: status, lastStatus: status,
    actualWeight: mnpNumber(row, "WEIGHT", "Weight", "weight"),
  };
}

export function normalizeMnpPayment(row: JsonRecord, fallbackTrackingNumber = "") {
  return {
    trackingNumber: mnpString(row, "consignmentNumber", "ConsignmentNumber", "trackingNumber", "CN") || fallbackTrackingNumber,
    paymentId: mnpString(row, "PaymentID", "paymentId"),
    paymentDate: mnpString(row, "PaidOn", "PaymentDate", "paymentDate"),
    rrAmount: mnpNumber(row, "RRAmount", "rrAmount") ?? 0,
    invoiceAmount: mnpNumber(row, "InvoiceAmount", "invoiceAmount") ?? 0,
    netPayable: mnpNumber(row, "NetPayable", "netPayable") ?? 0,
    instrumentMode: mnpString(row, "InstrumentMode", "instrumentMode"),
    instrumentNumber: mnpString(row, "InstrumentNumber", "instrumentNumber"),
    raw: row,
  };
}

export async function saveMnpPaymentStatus(payment: ReturnType<typeof normalizeMnpPayment>) {
  if (!payment.trackingNumber) return false;
  const order = await prisma.order.findFirst({ where: { trackingNumber: payment.trackingNumber, courier: "M&P" }, select: { trackingNumber: true } });
  if (!order) return false;
  await prisma.paymentStatus.upsert({
    where: { trackingNumber: payment.trackingNumber },
    update: { data: JSON.stringify(payment), updatedAt: new Date() },
    create: { trackingNumber: payment.trackingNumber, data: JSON.stringify(payment) },
  });
  await prisma.order.updateMany({ where: { trackingNumber: payment.trackingNumber, courier: "M&P" }, data: { netAmount: payment.netPayable, lastFetchedAt: new Date() } });
  return true;
}