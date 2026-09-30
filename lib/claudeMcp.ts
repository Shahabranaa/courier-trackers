import { prisma } from "@/lib/prisma";
import { userCanAccessBrand } from "@/lib/brandAccess";

type Args = Record<string, unknown>;
type Tool = { name: string; description: string; inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] } };

const brandId = { type: "string", description: "Brand ID from list_brands." };
const date = { type: "string", description: "Calendar date in YYYY-MM-DD format (inclusive)." };

export const claudeTools: Tool[] = [
  {
    name: "list_brands",
    description: "List brands this account can access. Use a brand ID from this list for other tools.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "search_shipments",
    description: "Search locally saved courier shipments by order/booking date. This does not query a courier's full account or trigger a live sync. Customer names, phone numbers and addresses are omitted.",
    inputSchema: {
      type: "object",
      properties: {
        brandId, startDate: date, endDate: date,
        courier: { type: "string", description: "Optional courier name, for example TRAX." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum rows, default 25." },
        offset: { type: "integer", minimum: 0, maximum: 10000, description: "Offset for pagination, default 0." },
      },
      required: ["brandId", "startDate", "endDate"],
    },
  },
  {
    name: "get_shipment",
    description: "Get one locally saved shipment by tracking number and brand. Does not call the live courier API. Omits customer personal information.",
    inputSchema: {
      type: "object",
      properties: {
        brandId,
        trackingNumber: { type: "string", description: "Exact shipment tracking number." },
      },
      required: ["brandId", "trackingNumber"],
    },
  },
  {
    name: "search_shopify_orders",
    description: "Search locally synced Shopify orders by Shopify order date and see their recorded tracking numbers. Orders not yet synced to this app are not included. Customer personal information is omitted.",
    inputSchema: {
      type: "object",
      properties: {
        brandId, startDate: date, endDate: date,
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum rows, default 25." },
        offset: { type: "integer", minimum: 0, maximum: 10000, description: "Offset for pagination, default 0." },
      },
      required: ["brandId", "startDate", "endDate"],
    },
  },
];

function requiredString(args: Args, key: string, maxLength = 120) {
  const value = args[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${key} is required and must be at most ${maxLength} characters`);
  return value.trim();
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateRange(args: Args) {
  const startDate = requiredString(args, "startDate", 10);
  const endDate = requiredString(args, "endDate", 10);
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    throw new Error("Provide a valid startDate and endDate in YYYY-MM-DD format, with startDate <= endDate");
  }
  return { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` };
}

function pagination(args: Args) {
  const limit = args.limit === undefined ? 25 : args.limit;
  const offset = args.offset === undefined ? 0 : args.offset;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50 ||
      typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new Error("limit must be 1–50 and offset must be 0–10000");
  }
  return { take: limit, skip: offset };
}

async function accessibleBrand(userId: string, id: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true } });
  if (!user?.isActive || !(await userCanAccessBrand(user, id))) throw new Error("Brand access denied");
}

function shipment(row: {
  trackingNumber: string; brandId: string; courier: string; orderRefNumber: string;
  orderDate: string; orderAmount: number; orderStatus: string; transactionStatus: string;
  lastStatus: string | null; lastStatusTime: Date | null; cityName: string | null;
  netAmount: number | null; transactionFee: number | null; source: string; lastFetchedAt: Date;
}) {
  return {
    brandId: row.brandId,
    courier: row.courier,
    trackingNumber: row.trackingNumber,
    orderReference: row.orderRefNumber,
    orderDate: row.orderDate,
    orderAmount: row.orderAmount,
    orderStatus: row.orderStatus,
    transactionStatus: row.transactionStatus,
    lastStatus: row.lastStatus,
    lastStatusTime: row.lastStatusTime,
    destinationCity: row.cityName,
    netAmount: row.netAmount,
    transactionFee: row.transactionFee,
    source: row.source,
    lastFetchedAt: row.lastFetchedAt,
  };
}

function trackingNumbers(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

export async function callClaudeTool(userId: string, name: string, args: Args): Promise<unknown> {
  if (name === "list_brands") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (!user?.isActive) throw new Error("Account inactive");
    const brands = await prisma.brand.findMany({
      where: user.role === "ADMIN" ? {} : {
        isActive: true,
        OR: [{ userId }, { userAccess: { some: { userId } } }],
      },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
      take: 200,
    });
    return { brands };
  }

  const id = requiredString(args, "brandId");
  await accessibleBrand(userId, id);

  if (name === "get_shipment") {
    const trackingNumber = requiredString(args, "trackingNumber");
    const row = await prisma.order.findFirst({ where: { trackingNumber, brandId: id } });
    return { shipment: row ? shipment(row) : null };
  }

  if (name === "search_shipments") {
    const range = dateRange(args);
    const page = pagination(args);
    const courier = args.courier === undefined ? undefined : requiredString(args, "courier", 40);
    const where = { brandId: id, orderDate: range, ...(courier ? { courier } : {}) };
    const [rows, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: [{ orderDate: "desc" }, { trackingNumber: "asc" }], ...page }),
      prisma.order.count({ where }),
    ]);
    return { source: "local", total, offset: page.skip, count: rows.length, shipments: rows.map(shipment) };
  }

  if (name === "search_shopify_orders") {
    const range = dateRange(args);
    const page = pagination(args);
    const where = { brandId: id, createdAt: range };
    const [rows, total] = await Promise.all([
      prisma.shopifyOrder.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { shopifyOrderId: "asc" }],
        select: {
          shopifyOrderId: true, brandId: true, orderName: true, orderNumber: true,
          createdAt: true, financialStatus: true, fulfillmentStatus: true,
          totalPrice: true, currency: true, trackingNumbers: true, courierPartner: true,
          lastFetchedAt: true,
        },
        ...page,
      }),
      prisma.shopifyOrder.count({ where }),
    ]);
    return {
      source: "local", total, offset: page.skip, count: rows.length,
      orders: rows.map(({ trackingNumbers: numbers, ...row }) => ({ ...row, trackingNumbers: trackingNumbers(numbers) })),
    };
  }

  throw new Error("Unknown tool");
}