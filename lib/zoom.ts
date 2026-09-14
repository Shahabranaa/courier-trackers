import { prisma } from "@/lib/prisma";

const BASE_URL = "https://portal.zoomcod.com/API";
const TIMEOUT_MS = 45_000;

export type ZoomApiOrder = {
  tracking_no?: string;
  order_id?: string | number;
  origin?: string;
  destination?: string;
  payment_status?: string;
  sender_name?: string;
  sender_company?: string;
  sender_phone?: string;
  sender_email?: string;
  sender_address?: string;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  collection_amount?: string | number;
  delivery_charges?: string | number;
  order_date?: string;
  barcode_image?: string;
  quantity?: string | number;
  weight?: string | number;
  product_descriptiption?: string;
  product_description?: string;
  special_instruction?: string;
  status?: string;
  status_date?: string;
};

export type ZoomOrder = {
  trackingNumber: string;
  orderId: string;
  origin: string;
  destination: string;
  paymentStatus: string;
  senderName: string;
  senderCompany: string;
  senderPhone: string;
  senderEmail: string;
  senderAddress: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  collectionAmount: number;
  deliveryCharges: number;
  orderDate: string;
  barcodeImage: string;
  quantity: number;
  weight: number;
  productDescription: string;
  specialInstruction: string;
  status: string;
  statusDate: string;
};

export type ZoomTrackingEvent = {
  trackingNumber: string;
  apiTrackingNumber: string;
  status: string;
  title: string;
  created: string;
};

async function authKey(brandId?: string) {
  const brandKey = brandId
    ? (await prisma.brand.findUnique({
      where: { id: brandId },
      select: { zoomAuthKey: true },
    }))?.zoomAuthKey?.trim()
    : "";
  const key = brandKey || process.env.ZOOM_AUTH_KEY?.trim();
  if (!key) throw new Error("Zoom API authentication is not configured");
  return key;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value).trim();
}

async function zoomRequest<T>(endpoint: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Zoom API returned invalid JSON for ${endpoint}`);
    }
    if (!response.ok) throw new Error(`Zoom API request failed (${response.status})`);
    if (typeof data === "string") throw new Error(data);
    return data as T;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("Zoom API request timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeZoomOrder(order: ZoomApiOrder): ZoomOrder {
  return {
    trackingNumber: stringValue(order.tracking_no),
    orderId: stringValue(order.order_id),
    origin: stringValue(order.origin),
    destination: stringValue(order.destination),
    paymentStatus: stringValue(order.payment_status),
    senderName: stringValue(order.sender_name),
    senderCompany: stringValue(order.sender_company),
    senderPhone: stringValue(order.sender_phone),
    senderEmail: stringValue(order.sender_email),
    senderAddress: stringValue(order.sender_address),
    receiverName: stringValue(order.receiver_name),
    receiverPhone: stringValue(order.receiver_phone),
    receiverAddress: stringValue(order.receiver_address),
    collectionAmount: numberValue(order.collection_amount),
    deliveryCharges: numberValue(order.delivery_charges),
    orderDate: stringValue(order.order_date),
    barcodeImage: stringValue(order.barcode_image),
    quantity: numberValue(order.quantity),
    weight: numberValue(order.weight),
    productDescription: stringValue(order.product_description || order.product_descriptiption),
    specialInstruction: stringValue(order.special_instruction),
    status: stringValue(order.status),
    statusDate: stringValue(order.status_date),
  };
}

export async function fetchZoomOrders(brandId?: string) {
  const data = await zoomRequest<ZoomApiOrder[]>("GetOrderList.php", {
    method: "POST",
    body: JSON.stringify({ auth_key: await authKey(brandId) }),
  });
  if (!Array.isArray(data)) throw new Error("Zoom order list response was not an array");
  return data.map(normalizeZoomOrder).filter(order => order.trackingNumber);
}

export async function fetchZoomTracking(trackingNumber: string, brandId?: string) {
  const tracking = trackingNumber.trim();
  if (!tracking) throw new Error("Tracking number is required");
  const body = JSON.stringify({
    tracking_no: tracking,
    auth_key: await authKey(brandId),
  });
  const [current, history] = await Promise.all([
    zoomRequest<{ response?: number; status?: string }>("currentStatus.php", {
      method: "POST",
      body,
    }),
    zoomRequest<Array<Record<string, unknown>>>("TrackOrder.php", {
      method: "POST",
      body,
    }),
  ]);

  const events = Array.isArray(history)
    ? history.map(event => ({
      trackingNumber: stringValue(event.tracking_no || tracking),
      apiTrackingNumber: stringValue(event.api_tracking_no),
      status: stringValue(event.status),
      title: stringValue(event.title),
      created: stringValue(event.created),
    })).filter(event => event.status || event.created)
    : [];

  return {
    trackingNumber: tracking,
    currentStatus: stringValue(current?.status) || events.at(-1)?.status || "Unknown",
    trackingHistory: events,
  };
}

export async function fetchZoomCatalog(brandId?: string) {
  const key = await authKey(brandId);
  const [products, statuses, cities] = await Promise.all([
    zoomRequest<Record<string, unknown>>("ProductAndService.php", {
      method: "POST",
      body: JSON.stringify({ auth_key: key }),
    }),
    zoomRequest<{ response?: number; data?: unknown[] }>("GetStatusList.php"),
    zoomRequest<{ response?: number; data?: unknown[] }>("GetCitiesList.php"),
  ]);
  return {
    products,
    statuses: Array.isArray(statuses?.data) ? statuses.data : [],
    cities: Array.isArray(cities?.data) ? cities.data : [],
  };
}

function isDelivered(status: string) {
  const value = status.toLowerCase();
  return value.includes("delivered")
    && !value.includes("undelivered")
    && !value.includes("un delivered")
    && !value.includes("not delivered");
}

function isReturned(status: string) {
  const value = status.toLowerCase();
  return value.includes("return") || value.includes("cancel") || value.includes("refused");
}

export async function persistZoomOrders(brandId: string, orders: ZoomOrder[]) {
  let saved = 0;
  for (const order of orders) {
    const status = order.status || "Unknown";
    const orderDate = order.orderDate || new Date().toISOString();
    const netAmount = isDelivered(status)
      ? order.collectionAmount - order.deliveryCharges
      : isReturned(status) ? -order.deliveryCharges : 0;

    await prisma.order.upsert({
      where: { trackingNumber: order.trackingNumber },
      update: {
        brandId,
        courier: "Zoom",
        orderRefNumber: order.orderId || order.trackingNumber,
        invoicePayment: order.collectionAmount,
        customerName: order.receiverName || "N/A",
        customerPhone: order.receiverPhone,
        deliveryAddress: order.receiverAddress,
        transactionDate: orderDate,
        orderDetail: order.productDescription || "Zoom shipment",
        orderType: "COD",
        orderDate,
        orderAmount: order.collectionAmount,
        orderStatus: status,
        transactionStatus: status,
        cityName: order.destination || "Unknown",
        transactionFee: order.deliveryCharges,
        netAmount,
        lastStatus: status,
        lastStatusTime: order.statusDate ? new Date(order.statusDate) : null,
        lastFetchedAt: new Date(),
      },
      create: {
        trackingNumber: order.trackingNumber,
        brandId,
        courier: "Zoom",
        orderRefNumber: order.orderId || order.trackingNumber,
        invoicePayment: order.collectionAmount,
        customerName: order.receiverName || "N/A",
        customerPhone: order.receiverPhone,
        deliveryAddress: order.receiverAddress,
        transactionDate: orderDate,
        orderDetail: order.productDescription || "Zoom shipment",
        orderType: "COD",
        orderDate,
        orderAmount: order.collectionAmount,
        orderStatus: status,
        transactionStatus: status,
        cityName: order.destination || "Unknown",
        transactionFee: order.deliveryCharges,
        netAmount,
        lastStatus: status,
        lastStatusTime: order.statusDate ? new Date(order.statusDate) : null,
        lastFetchedAt: new Date(),
      },
    });
    saved++;
  }
  return saved;
}