import { prisma } from "@/lib/prisma";

const TCS_BASE_URL = process.env.TCS_API_BASE_URL || "https://ociconnect.tcscourier.com";

type JsonRecord = Record<string, unknown>;

export interface TcsCredentials {
  bearerToken?: string;
  apiUsername?: string;
  apiPassword?: string;
}

export interface TcsBookingRequest {
  consignmentno?: string;
  shipperinfo: {
    tcsaccount: string;
    shippername: string;
    address1: string;
    address2?: string;
    address3?: string;
    zip?: string;
    countrycode: string;
    countryname: string;
    citycode?: string;
    cityname: string;
    mobile: string;
  };
  consigneeinfo: {
    firstname: string;
    middlename?: string;
    lastname?: string;
    address1: string;
    address2?: string;
    address3?: string;
    zip?: string;
    countrycode?: string;
    countryname?: string;
    citycode?: string;
    cityname?: string;
    email?: string;
    mobile: string;
  };
  shipmentinfo: {
    costcentercode?: string;
    referenceno?: string;
    contentdesc?: string;
    servicecode: string;
    shipmentdate?: string;
    currency?: string;
    codamount: number;
    declaredvalue?: number;
    insuredvalue?: number;
    weightinkg: number;
    pieces: number;
    fragile: boolean;
    remarks?: string;
  };
}

const cachedAccessTokens = new Map<string, { value: string; expiresAt: number }>();
const cachedBearerTokens = new Map<string, { value: string; expiresAt: number }>();
let cachedCityMap: { key: string; value: Map<string, string>; expiresAt: number } | null = null;
let cityMapRequest: { key: string; promise: Promise<Map<string, string>> } | null = null;
const TCS_REQUEST_TIMEOUT_MS = 30_000;

async function fetchTcs(input: URL | string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TCS_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("TCS request timed out after 30 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requiredCredential(value: string | undefined, envName: "TCS_BEARER_TOKEN" | "TCS_API_USERNAME" | "TCS_API_PASSWORD") {
  const resolved = value?.trim() || process.env[envName]?.trim();
  if (!resolved) throw new Error(`${envName} is not configured`);
  return resolved;
}

function credentialCacheKey(credentials: TcsCredentials = {}) {
  return [
    credentials.bearerToken?.trim() || process.env.TCS_BEARER_TOKEN?.trim() || "",
    credentials.apiUsername?.trim() || process.env.TCS_API_USERNAME?.trim() || "",
    credentials.apiPassword?.trim() || process.env.TCS_API_PASSWORD?.trim() || "",
  ].join("\u0000");
}

async function getTcsBearerToken(credentials: TcsCredentials = {}): Promise<string> {
  const configuredBearer = credentials.bearerToken?.trim() || process.env.TCS_BEARER_TOKEN?.trim();
  const clientId = process.env.TCS_CLIENT_ID?.trim();
  const clientSecret = process.env.TCS_CLIENT_SECRET?.trim();
  const cacheKey = configuredBearer || `${clientId || ""}\u0000${clientSecret || ""}`;
  const cached = cachedBearerTokens.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  if (configuredBearer && (!clientId || !clientSecret || credentials.bearerToken?.trim())) {
    cachedBearerTokens.set(cacheKey, { value: configuredBearer, expiresAt: Date.now() + 20 * 60_000 });
    return configuredBearer;
  }

  if (!clientId || !clientSecret) return requiredCredential(configuredBearer, "TCS_BEARER_TOKEN");

  const url = new URL("/auth/api/auth", TCS_BASE_URL);
  url.searchParams.set("ClientID", clientId);
  url.searchParams.set("ClientSecret", clientSecret);
  const response = await fetchTcs(url, { cache: "no-store" });
  const body = await parseResponse(response) as JsonRecord;
  const result = body.result && typeof body.result === "object" ? body.result as JsonRecord : {};
  const value = String(result.accessToken || body.accessToken || "");
  if (!value) throw new Error("TCS did not return a production authorization token");
  const parsedExpiry = result.expiry ? new Date(String(result.expiry)).getTime() : NaN;
  cachedBearerTokens.set(cacheKey, {
    value,
    expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 20 * 60_000,
  });
  return value;
}

export async function getTcsEcomAccessToken(force = false, credentials: TcsCredentials = {}): Promise<string> {
  const cacheKey = credentialCacheKey(credentials);
  const cached = cachedAccessTokens.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const url = new URL("/ecom/api/authentication/token", TCS_BASE_URL);
  url.searchParams.set("username", requiredCredential(credentials.apiUsername, "TCS_API_USERNAME"));
  url.searchParams.set("password", requiredCredential(credentials.apiPassword, "TCS_API_PASSWORD"));

  const response = await fetchTcs(url, {
    headers: { Authorization: `Bearer ${await getTcsBearerToken(credentials)}` },
    cache: "no-store",
  });
  const body = await parseResponse(response) as JsonRecord;
  const accessToken = String(body.accesstoken || "");
  if (!accessToken) throw new Error("TCS did not return an ECOM access token");

  const parsedExpiry = body.expiry ? new Date(String(body.expiry)).getTime() : NaN;
  cachedAccessTokens.set(cacheKey, {
    value: accessToken,
    expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 20 * 60_000,
  });
  return accessToken;
}

export async function getTcsBrandConfig(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { tcsBearerToken: true, tcsApiUsername: true, tcsApiPassword: true, tcsCustomerNumber: true },
  });
  if (!brand) return null;
  return {
    customerNumber: brand.tcsCustomerNumber.trim(),
    credentials: {
      bearerToken: brand.tcsBearerToken.trim(),
      apiUsername: brand.tcsApiUsername.trim(),
      apiPassword: brand.tcsApiPassword.trim(),
    } satisfies TcsCredentials,
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Keep non-JSON error responses as text.
  }

  if (!response.ok) {
    const record = body && typeof body === "object" ? body as JsonRecord : {};
    const message = String(record.message || record.error || text || `TCS API returned ${response.status}`);
    throw new Error(message);
  }
  return body;
}

export async function trackTcsConsignment(trackingNumber: string, credentials: TcsCredentials = {}): Promise<unknown> {
  const url = new URL("/tracking/api/Tracking/GetDynamicTrackDetail", TCS_BASE_URL);
  url.searchParams.set("consignee", trackingNumber);
  url.searchParams.set("timezone", "false");

  const response = await fetchTcs(url, {
    headers: { Authorization: `Bearer ${await getTcsBearerToken(credentials)}` },
    cache: "no-store",
  });
  return parseResponse(response);
}

export async function createTcsBooking(booking: TcsBookingRequest, credentials: TcsCredentials = {}): Promise<unknown> {
  const accessToken = await getTcsEcomAccessToken(false, credentials);
  const response = await fetchTcs(new URL("/ecom/api/booking/create", TCS_BASE_URL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getTcsBearerToken(credentials)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...booking, accesstoken: accessToken }),
    cache: "no-store",
  });
  return parseResponse(response);
}

export async function fetchTcsCnBulkInquiry(customerNumber: string, startDate: string, endDate: string, credentials: TcsCredentials = {}): Promise<unknown> {
  const accessToken = await getTcsEcomAccessToken(false, credentials);
  const url = new URL("/ecom/api/inquiry/cnbulkinquiry", TCS_BASE_URL);
  url.searchParams.set("accesstoken", accessToken);
  url.searchParams.set("customerno", customerNumber);
  url.searchParams.set("fromdate", startDate);
  url.searchParams.set("todate", endDate);
  const response = await fetchTcs(url, {
    headers: { Authorization: `Bearer ${await getTcsBearerToken(credentials)}` },
    cache: "no-store",
  });
  return parseResponse(response);
}

export async function fetchTcsPaymentStatus(customerNumber: string, trackingNumber: string, credentials: TcsCredentials = {}): Promise<unknown> {
  const accessToken = await getTcsEcomAccessToken(false, credentials);
  const url = new URL("/ecom/api/Payment/status", TCS_BASE_URL);
  url.searchParams.set("accesstoken", accessToken);
  url.searchParams.set("customerno", customerNumber);
  url.searchParams.set("cnno", trackingNumber);
  const response = await fetchTcs(url, {
    headers: { Authorization: `Bearer ${await getTcsBearerToken(credentials)}` },
    cache: "no-store",
  });
  return parseResponse(response);
}

export async function fetchTcsPaymentDetail(customerNumber: string, startDate: string, endDate: string, credentials: TcsCredentials = {}): Promise<unknown> {
  const accessToken = await getTcsEcomAccessToken(false, credentials);
  const url = new URL("/ecom/api/Payment/detail", TCS_BASE_URL);
  url.searchParams.set("accesstoken", accessToken);
  url.searchParams.set("customerno", customerNumber);
  url.searchParams.set("fromdate", startDate);
  url.searchParams.set("todate", endDate);
  const response = await fetchTcs(url, {
    headers: { Authorization: `Bearer ${await getTcsBearerToken(credentials)}` },
    cache: "no-store",
  });
  return parseResponse(response);
}

export async function fetchTcsCityMap(countryCode = "PK", credentials: TcsCredentials = {}): Promise<Map<string, string>> {
  const key = `${countryCode}\u0000${credentialCacheKey(credentials)}`;
  if (cachedCityMap && cachedCityMap.key === key && cachedCityMap.expiresAt > Date.now()) return cachedCityMap.value;
  if (cityMapRequest?.key === key) return cityMapRequest.promise;

  const promise = (async () => {
    const accessToken = await getTcsEcomAccessToken(false, credentials);
    const url = new URL("/ecom/api/setup/citylistbycountry", TCS_BASE_URL);
    url.searchParams.set("countrycode", countryCode);
    url.searchParams.set("accesstoken", accessToken);
    const response = await fetchTcs(url, {
      headers: { Authorization: `Bearer ${await getTcsBearerToken(credentials)}` },
      cache: "no-store",
    });
    const body = await parseResponse(response) as JsonRecord;
    const rows = (Array.isArray(body.data) ? body.data : Array.isArray(body.detail) ? body.detail : []) as JsonRecord[];
    const cityMap = new Map<string, string>();
    for (const row of rows) {
      const code = String(row.citycode || row.cityCode || "").trim().toUpperCase();
      const name = String(row.cityname || row.cityName || "").trim();
      if (code && name) cityMap.set(code, name);
    }
    if (!cityMap.size) throw new Error("TCS city list did not return any city mappings");
    cachedCityMap = { key, value: cityMap, expiresAt: Date.now() + 24 * 60 * 60_000 };
    return cityMap;
  })();
  cityMapRequest = { key, promise };

  try {
    return await promise;
  } finally {
    if (cityMapRequest?.key === key) cityMapRequest = null;
  }
}

export function normalizeTcsTracking(trackingNumber: string, value: unknown) {
  const record = value && typeof value === "object" ? value as JsonRecord : {};
  const shipmentInfo = Array.isArray(record.shipmentinfo)
    ? record.shipmentinfo as JsonRecord[]
    : record.shipmentinfo && typeof record.shipmentinfo === "object"
      ? [record.shipmentinfo as JsonRecord]
      : [];
  const deliveryInfo = Array.isArray(record.deliveryinfo) ? record.deliveryinfo as JsonRecord[] : [];
  const checkpoints = Array.isArray(record.checkpoints) ? record.checkpoints as JsonRecord[] : [];
  const history = [...deliveryInfo, ...checkpoints]
    .map((item, index) => ({
      item,
      index,
      timestamp: item.datetime ? new Date(String(item.datetime)).getTime() : NaN,
    }))
    .filter(({ item }) => item.status || item.datetime || item.station)
    .sort((a, b) => {
      if (Number.isFinite(a.timestamp) && Number.isFinite(b.timestamp) && a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      return a.index - b.index;
    })
    .filter(({ item }, index, all) => {
      const key = [item.status, item.datetime, item.station, item.recievedby].map(String).join("|");
      return all.findIndex(({ item: candidate }) =>
        [candidate.status, candidate.datetime, candidate.station, candidate.recievedby].map(String).join("|") === key
      ) === index;
    })
    .map(({ item }) => item);
  const latest = history[0] || {};
  const currentStatus = String(latest.status || "No update");
  const statusText = currentStatus.toLowerCase();
  const statusCategory = statusText.includes("deliver")
    ? "delivered"
    : statusText.includes("return") || statusText.includes("rto")
      ? "returned"
      : statusText.includes("cancel")
        ? "cancelled"
        : statusText.includes("process") || statusText.includes("transit") || statusText.includes("book")
          ? "in_process"
          : "other";
  const shipment = shipmentInfo[0] || {};
  const currentCity = String(
    shipment.destination ||
    shipment.destinationcity ||
    shipment.city ||
    latest.station ||
    ""
  ).trim();
  const activityHistory = history.map((item) => ({
    status: String(item.status || ""),
    date: String(item.datetime || ""),
    details: [
      item.station,
      item.code ? `Code ${item.code}` : "",
      item.recievedby ? `Received by ${item.recievedby}` : "",
    ].filter(Boolean).join(" · "),
  }));

  return {
    trackingNumber,
    currentStatus,
    statusCategory,
    currentCity,
    lastStatusTime: latest.datetime ? String(latest.datetime) : null,
    activityHistory,
    shipmentinfo: record.shipmentinfo || [],
    deliveryinfo: deliveryInfo,
    checkpoints,
    shipmentsummary: record.shipmentsummary || "",
  };
}

export async function saveTcsTrackingResult(trackingNumber: string, value: unknown, credentials: TcsCredentials = {}) {
  const normalized = normalizeTcsTracking(trackingNumber, value);
  const cityMap = normalized.currentCity ? await fetchTcsCityMap("PK", credentials) : null;
  const currentCityName = normalized.currentCity
    ? cityMap?.get(normalized.currentCity.toUpperCase()) || normalized.currentCity
    : "";
  await prisma.trackingStatus.upsert({
    where: { trackingNumber },
    update: { data: JSON.stringify({ ...normalized, currentCity: currentCityName }), updatedAt: new Date() },
    create: { trackingNumber, data: JSON.stringify({ ...normalized, currentCity: currentCityName }) },
  });

  const parsedTime = normalized.lastStatusTime ? new Date(normalized.lastStatusTime) : null;
  await prisma.order.updateMany({
    where: { trackingNumber, courier: "TCS" },
    data: {
      ...(normalized.currentStatus !== "No update"
        ? {
          lastStatus: normalized.currentStatus,
          transactionStatus: normalized.currentStatus,
          orderStatus: normalized.currentStatus,
        }
        : {}),
      ...(currentCityName ? { cityName: currentCityName } : {}),
      ...(parsedTime && !Number.isNaN(parsedTime.getTime()) ? { lastStatusTime: parsedTime } : {}),
      lastFetchedAt: new Date(),
    },
  });
  return { ...normalized, currentCity: currentCityName };
}

export function findTcsConsignmentNumber(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as JsonRecord;
  const keys = ["consignmentno", "consignmentNo", "consignmentnumber", "consignmentNumber", "cn", "trackingNumber"];
  for (const key of keys) {
    if (record[key]) return String(record[key]);
  }
  for (const nested of Object.values(record)) {
    const found = findTcsConsignmentNumber(nested);
    if (found) return found;
  }
  return null;
}