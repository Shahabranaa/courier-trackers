import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { prisma } from "@/lib/prisma";
import {
  calculateTraxCharges,
  cancelTraxShipment,
  createTraxReceivingSheet,
  getTraxAirWaybill,
  getTraxBrandConfig,
  getTraxInvoice,
  getTraxOrderIdStatus,
  getTraxOrderIdTrack,
  getTraxPaymentStatus,
  getTraxReceivingSheet,
  requestTraxShipmentStatus,
  submitTraxCrmRequest,
  type TraxOperationAction,
} from "@/lib/trax";

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const string = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validDigits = (value: unknown, min = 1, max = 40): value is string =>
  typeof value === "string" && new RegExp(`^\\d{${min},${max}}$`).test(value);
const int = (value: unknown) => typeof value === "number" && Number.isInteger(value);
const positiveInt = (value: unknown) => int(value) && Number(value) > 0;
const optionalText = (value: unknown) => value === undefined || typeof value === "string";

const complaintTypes = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 18, 19, 27, 28, 30, 31]);
const serviceTypes = new Set([11, 12, 13, 14, 17, 20, 32]);
const claimTypes = new Set([21, 22, 23, 24, 25, 26, 29]);
const claimImageFields = [
  "product_picture",
  "invoice_picture",
  "actual_product_picture",
  "product_packaging_picture",
  "damage_product_picture",
  "missing_product_picture",
] as const;
const MAX_CLAIM_IMAGE_BYTES = 8 * 1024 * 1024;

function imageFile(image: unknown, field: string) {
  if (!isRecord(image)) throw new Error(`${field} must be a base64 image object`);
  const contentType = image.contentType;
  const fileName = string(image.fileName);
  const base64 = string(image.base64);
  if ((contentType !== "image/jpeg" && contentType !== "image/png")
    || !fileName || fileName.length > 120 || /[/\\\0]/.test(fileName)
    || !base64 || base64.length > 5 * 1024 * 1024
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new Error(`${field} must be a valid JPEG/PNG image (base64, max 3.75 MB)`);
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) {
    throw new Error(`${field} exceeds the 3 MB image limit`);
  }
  return new Blob([bytes], { type: contentType });
}

async function requireOwnedShipment(brandId: string, trackingNumber: string) {
  const order = await prisma.order.findFirst({
    where: { brandId, courier: "TRAX", trackingNumber },
    select: { trackingNumber: true },
  });
  return Boolean(order);
}

async function requireOwnedOrderId(brandId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { brandId, courier: "TRAX", orderRefNumber: orderId },
    select: { trackingNumber: true },
  });
  return Boolean(order);
}

function parseStoredRecord(data: string) {
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function invoiceShipmentIds(value: unknown):
  | { kind: "documented"; numbers: string[] }
  | { kind: "missing" }
  | { kind: "invalid" } {
  if (!isRecord(value) || !isRecord(value.payments)) return { kind: "invalid" };
  const payments = value.payments;
  if (payments.shipments === undefined) return { kind: "missing" };
  if (!Array.isArray(payments.shipments) || payments.shipments.length === 0) return { kind: "invalid" };
  const numbers: string[] = [];
  for (const shipment of payments.shipments) {
    if (!isRecord(shipment)) return { kind: "invalid" };
    const keys = Object.keys(shipment);
    if (keys.length !== 1 || !/^\d{3,40}$/.test(keys[0]) || !isRecord(shipment[keys[0]])) {
      return { kind: "invalid" };
    }
    numbers.push(keys[0]);
  }
  return { kind: "documented", numbers: [...new Set(numbers)] };
}

async function shipmentsBelongToBrand(brandId: string, trackingNumbers: string[]) {
  const uniqueNumbers = [...new Set(trackingNumbers)];
  if (!uniqueNumbers.length) return false;
  const owned = await prisma.order.findMany({
    where: { brandId, courier: "TRAX", trackingNumber: { in: uniqueNumbers } },
    select: { trackingNumber: true },
  });
  return owned.length === uniqueNumbers.length;
}

function matchesPaymentId(data: string, paymentId: string) {
  const root = parseStoredRecord(data);
  if (!root) return false;
  const target = paymentId.replace(/^0+(?=\d)/, "");
  const matches = (value: unknown) => {
    const candidate = string(value);
    return /^\d+$/.test(candidate) && candidate.replace(/^0+(?=\d)/, "") === target;
  };
  if (matches(root.paymentId)) return true;
  for (const key of ["paymentRecords", "bulkPaymentRecords"]) {
    if (!Array.isArray(root[key])) continue;
    for (const item of root[key] as unknown[]) {
      if (isRecord(item) && (matches(item.id) || matches(item.payment_id))) return true;
    }
  }
  return false;
}

function withReceivingSheetRegistry(data: string | null, trackingNumber: string, sheetId: string, trackingNumbers: string[]) {
  let prior: RecordValue = {};
  if (data !== null) {
    const parsed = parseStoredRecord(data);
    if (!parsed) throw new Error(`Existing tracking record for ${trackingNumber} is not valid JSON object data.`);
    prior = parsed;
  }
  if (prior.raw !== undefined && !isRecord(prior.raw)) {
    throw new Error(`Existing tracking raw data for ${trackingNumber} cannot be safely merged.`);
  }
  const raw = isRecord(prior.raw) ? prior.raw : {};
  const registries = raw.receivingSheets === undefined ? [] : raw.receivingSheets;
  if (!Array.isArray(registries)) {
    throw new Error(`Existing receiving-sheet registry for ${trackingNumber} cannot be safely merged.`);
  }
  const registry = registries.filter((entry) => isRecord(entry) && String(entry.id) !== sheetId);
  registry.push({ id: sheetId, trackingNumbers });
  return JSON.stringify({
    ...prior,
    trackingNumber,
    raw: { ...raw, receivingSheets: registry },
  });
}

async function isReceivingSheetRegistered(brandId: string, trackingNumber: string, sheetId: string) {
  const order = await prisma.order.findFirst({
    where: { brandId, courier: "TRAX", trackingNumber },
    select: { trackingStatus: { select: { data: true } } },
  });
  if (!order?.trackingStatus?.data) return false;
  const stored = parseStoredRecord(order.trackingStatus.data);
  if (!stored || !isRecord(stored.raw) || !Array.isArray(stored.raw.receivingSheets)) return false;
  return stored.raw.receivingSheets.some((entry) =>
    isRecord(entry) && String(entry.id) === sheetId
    && Array.isArray(entry.trackingNumbers)
    && entry.trackingNumbers.includes(trackingNumber)
  );
}

function invalid(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (!isRecord(body)) return invalid("A JSON operation request is required.");
  const brandId = string(body.brandId);
  if (!brandId) return invalid("brandId is required.");
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }
  const config = await getTraxBrandConfig(brandId);
  if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!config.enabled) return NextResponse.json({ error: "TRAX is disabled for this brand" }, { status: 403 });
  if (!config.credentials.apiKey?.trim()) {
    return NextResponse.json({ error: "TRAX API key is not configured for this brand" }, { status: 403 });
  }

  const action = string(body.action) as TraxOperationAction["action"];
  const type = body.type;
  const trackingNumber = string(body.trackingNumber);
  const owned = async () => {
    if (!validDigits(trackingNumber, 3)) return false;
    return requireOwnedShipment(brandId, trackingNumber);
  };

  try {
    let result: unknown;
    switch (action) {
      case "paymentStatus":
        if (!validDigits(trackingNumber, 3)) return invalid("trackingNumber must contain only digits.");
        if (!(await owned())) return NextResponse.json({ error: "TRAX shipment not found in this brand" }, { status: 404 });
        result = await getTraxPaymentStatus(trackingNumber, config.credentials);
        break;
      case "invoice":
        if (!positiveInt(body.id) || (type !== 1 && type !== 2)) return invalid("invoice requires a positive id and type 1 (invoice) or 2 (payment).");
        result = await getTraxInvoice(Number(body.id), type, config.credentials);
        {
          const shipmentIds = invoiceShipmentIds(result);
          if (shipmentIds.kind === "invalid") {
            return NextResponse.json({ error: "TRAX returned an unsupported invoice shipment structure; the document was withheld." }, { status: 502 });
          }
          if (shipmentIds.kind === "documented") {
            if (!(await shipmentsBelongToBrand(brandId, shipmentIds.numbers))) {
              return NextResponse.json({ error: "Invoice contains shipments not owned by this brand's TRAX account." }, { status: 403 });
            }
          } else {
            if (type !== 2) {
              return NextResponse.json({ error: "TRAX invoice response did not include verifiable shipment IDs; the document was withheld." }, { status: 502 });
            }
            const anchorTrackingNumber = string(body.trackingNumber);
            if (!validDigits(anchorTrackingNumber, 3)) {
              return NextResponse.json({ error: "Payment documents without shipment IDs require an owned trackingNumber anchor." }, { status: 400 });
            }
            if (!(await requireOwnedShipment(brandId, anchorTrackingNumber))) {
              return NextResponse.json({ error: "Payment document anchor is not an owned TRAX shipment for this brand." }, { status: 404 });
            }
            const paymentStatus = await prisma.paymentStatus.findUnique({
              where: { trackingNumber: anchorTrackingNumber },
              select: { data: true },
            });
            if (!paymentStatus || !matchesPaymentId(paymentStatus.data, String(body.id))) {
              return NextResponse.json({ error: "The payment ID is not recorded in local payment status for the owned shipment." }, { status: 403 });
            }
          }
        }
        break;
      case "airWaybill":
        if (!validDigits(trackingNumber, 3) || (type !== 0 && type !== 1)) return invalid("airWaybill requires a numeric trackingNumber and type 0 (JPEG) or 1 (PDF).");
        if (!(await owned())) return NextResponse.json({ error: "TRAX shipment not found in this brand" }, { status: 404 });
        result = await getTraxAirWaybill(trackingNumber, type, config.credentials);
        break;
      case "cancel":
        if (!validDigits(trackingNumber, 3)) return invalid("trackingNumber must contain only digits.");
        if (!(await owned())) return NextResponse.json({ error: "TRAX shipment not found in this brand" }, { status: 404 });
        result = await cancelTraxShipment(trackingNumber, config.credentials);
        {
          const response = isRecord(result) ? result : {};
          const expectedMessage = `Shipment #${trackingNumber} is Cancelled`;
          if (String(response.status) !== "0" || response.message !== expectedMessage) {
            throw new Error("TRAX did not return the documented cancellation success response; local order status was not changed.");
          }
          try {
            await prisma.$transaction(async (tx) => {
              const ownedOrder = await tx.order.findFirst({
                where: { brandId, courier: "TRAX", trackingNumber },
                select: { trackingNumber: true },
              });
              if (!ownedOrder) throw new Error("The locally owned TRAX shipment no longer exists.");

              const stored = await tx.trackingStatus.findUnique({
                where: { trackingNumber },
                select: { data: true },
              });
              let prior: RecordValue = {};
              if (stored) {
                const parsed: unknown = JSON.parse(stored.data);
                if (!isRecord(parsed)) throw new Error("Existing tracking data is not a JSON object.");
                prior = parsed;
              }
              if (prior.activityHistory !== undefined && !Array.isArray(prior.activityHistory)) {
                throw new Error("Existing tracking history is not an array.");
              }
              if (prior.raw !== undefined && !isRecord(prior.raw)) {
                throw new Error("Existing tracking raw data is not an object.");
              }
              const now = new Date();
              const eventTime = now.toISOString();
              const activityHistory = [
                ...(Array.isArray(prior.activityHistory) ? prior.activityHistory : []),
                { status: "Cancelled", date: eventTime, details: "" },
              ];
              const trackingData = {
                ...prior,
                trackingNumber,
                currentStatus: "Cancelled",
                statusCategory: "cancelled",
                lastStatusTime: eventTime,
                activityHistory,
                raw: { ...(isRecord(prior.raw) ? prior.raw : {}), cancellation: result },
              };
              const orderUpdate = await tx.order.updateMany({
                where: { brandId, courier: "TRAX", trackingNumber },
                data: {
                  orderStatus: "Cancelled",
                  transactionStatus: "Cancelled",
                  lastStatus: "Cancelled",
                  lastStatusTime: now,
                  lastFetchedAt: now,
                },
              });
              if (orderUpdate.count !== 1) throw new Error("The locally owned TRAX shipment could not be updated.");
              await tx.trackingStatus.upsert({
                where: { trackingNumber },
                update: { data: JSON.stringify(trackingData), updatedAt: now },
                create: { trackingNumber, data: JSON.stringify(trackingData) },
              });
            });
          } catch (error) {
            throw new Error(`TRAX cancelled the shipment, but local cancellation status could not be saved: ${error instanceof Error ? error.message : "database update failed"}`);
          }
        }
        break;
      case "calculateRates": {
        const fields = ["service_type_id", "origin_city_id", "destination_city_id", "shipping_mode_id"];
        if (fields.some((field) => !positiveInt(body[field]))
          || ![1, 2, 3].includes(Number(body.service_type_id))
          || ![1, 2, 3, 4].includes(Number(body.shipping_mode_id))
          || !int(body.amount) || Number(body.amount) < 0
          || typeof body.estimated_weight !== "number" || !Number.isFinite(body.estimated_weight) || body.estimated_weight <= 0) {
          return invalid("calculateRates requires documented service/city/shipping IDs, a positive estimated_weight, and a non-negative integer amount.");
        }
        result = await calculateTraxCharges({
          service_type_id: body.service_type_id,
          origin_city_id: body.origin_city_id,
          destination_city_id: body.destination_city_id,
          estimated_weight: body.estimated_weight,
          shipping_mode_id: body.shipping_mode_id,
          amount: body.amount,
        }, config.credentials);
        break;
      }
      case "createReceivingSheet": {
        if (!Array.isArray(body.trackingNumbers) || !body.trackingNumbers.length || body.trackingNumbers.length > 100
          || !body.trackingNumbers.every((value) => validDigits(value, 3))) {
          return invalid("createReceivingSheet requires 1-100 numeric trackingNumbers.");
        }
        const numbers = [...new Set(body.trackingNumbers as string[])];
        const count = await prisma.order.count({ where: { brandId, courier: "TRAX", trackingNumber: { in: numbers } } });
        if (count !== numbers.length) return NextResponse.json({ error: "Every receiving-sheet shipment must belong to this brand's TRAX orders" }, { status: 404 });
        result = await createTraxReceivingSheet(numbers, config.credentials);
        {
          const response = isRecord(result) ? result : {};
          const sheetId = String(response.receiving_sheet_id ?? "");
          if (String(response.status) !== "0" || response.message !== "Receiving Sheet has been Created" || !/^\d+$/.test(sheetId)) {
            throw new Error("TRAX did not return the documented receiving-sheet creation success response; no local sheet registry was saved.");
          }
          try {
            await prisma.$transaction(async (tx) => {
              const existingOrders = await tx.order.findMany({
                where: { brandId, courier: "TRAX", trackingNumber: { in: numbers } },
                select: { trackingNumber: true },
              });
              if (existingOrders.length !== numbers.length) {
                throw new Error("One or more receiving-sheet shipments are no longer locally owned by this brand.");
              }
              for (const trackingNumber of numbers) {
                const prior = await tx.trackingStatus.findUnique({
                  where: { trackingNumber },
                  select: { data: true },
                });
                const data = withReceivingSheetRegistry(prior?.data ?? null, trackingNumber, sheetId, numbers);
                await tx.trackingStatus.upsert({
                  where: { trackingNumber },
                  update: { data, updatedAt: new Date() },
                  create: { trackingNumber, data },
                });
              }
            });
          } catch (error) {
            throw new Error(`TRAX created receiving sheet ${sheetId}, but its local ownership registry could not be saved: ${error instanceof Error ? error.message : "database update failed"}`);
          }
        }
        break;
      }
      case "viewReceivingSheet":
        if (!validDigits(body.receivingSheetId, 1) || !validDigits(trackingNumber, 3) || (type !== 0 && type !== 1)) {
          return invalid("viewReceivingSheet requires an owned trackingNumber, numeric receivingSheetId, and type 0 (JPEG) or 1 (PDF).");
        }
        if (!(await requireOwnedShipment(brandId, trackingNumber))) {
          return NextResponse.json({ error: "TRAX shipment not found in this brand" }, { status: 404 });
        }
        if (!(await isReceivingSheetRegistered(brandId, trackingNumber, String(body.receivingSheetId)))) {
          return NextResponse.json({ error: "Receiving sheet is not registered to this TRAX shipment and brand." }, { status: 404 });
        }
        result = await getTraxReceivingSheet(String(body.receivingSheetId), type, config.credentials);
        break;
      case "trackOrderId":
      case "statusOrderId": {
        const orderId = string(body.orderId);
        if (!validDigits(orderId, 1, 100) || (type !== 0 && type !== 1)) return invalid(`${action} requires a numeric orderId and type 0 (shipper) or 1 (general).`);
        if (!(await requireOwnedOrderId(brandId, orderId))) return NextResponse.json({ error: "TRAX order ID not found in this brand" }, { status: 404 });
        result = action === "trackOrderId"
          ? await getTraxOrderIdTrack(orderId, type, config.credentials)
          : await getTraxOrderIdStatus(orderId, type, config.credentials);
        break;
      }
      case "returnConfirmationPending":
      case "reattempt": {
        if (!validDigits(trackingNumber, 3) || !optionalText(body.remarks)) return invalid(`${action} requires a numeric trackingNumber and optional string remarks.`);
        if (!(await owned())) return NextResponse.json({ error: "TRAX shipment not found in this brand" }, { status: 404 });
        result = await requestTraxShipmentStatus({
          tracking_number: trackingNumber,
          type: action === "returnConfirmationPending" ? 1 : 2,
          ...(body.remarks ? { remarks: body.remarks } : {}),
        }, config.credentials);
        break;
      }
      case "interceptRebook": {
        const consigneeType = body.consigneeType;
        const rawPhone2 = string(body.consignee_phone_number_2);
        const phone1 = string(body.consignee_phone_number_1).replace(/\D/g, "");
        const phone2 = rawPhone2.replace(/\D/g, "");
        const commonValid = validDigits(trackingNumber, 3) && (consigneeType === 1 || consigneeType === 2)
          && string(body.consignee_address).length > 0
          && /^\d{7,20}$/.test(phone1) && optionalText(body.remarks);
        const type2Valid = consigneeType !== 2 || (
          string(body.consignee_city_id).length > 0
          && string(body.consignee_name).length > 0
          && int(body.amount) && Number(body.amount) >= 0
        );
        if (!commonValid || !type2Valid || (rawPhone2 && !/^\d{7,20}$/.test(phone2))) {
          return invalid("interceptRebook requires the documented consignee type fields and valid contact/address details.");
        }
        if (!(await owned())) return NextResponse.json({ error: "TRAX shipment not found in this brand" }, { status: 404 });
        result = await requestTraxShipmentStatus({
          tracking_number: trackingNumber,
          type: 3,
          consignee_address: body.consignee_address,
          consignee_phone_number_1: phone1,
          consignee_type: consigneeType,
          ...(body.remarks ? { remarks: body.remarks } : {}),
          ...(consigneeType === 2 ? {
            consignee_city_id: string(body.consignee_city_id),
            consignee_name: body.consignee_name,
            amount: body.amount,
            ...(phone2 ? { consignee_phone_number_2: phone2 } : {}),
          } : {}),
        }, config.credentials);
        break;
      }
      case "crmComplaint":
      case "crmServiceRequest": {
        const caseNatureTypeId = body.caseNatureTypeId;
        const validNature = action === "crmComplaint" ? complaintTypes.has(Number(caseNatureTypeId)) : serviceTypes.has(Number(caseNatureTypeId));
        if (!validDigits(trackingNumber, 3) || !int(caseNatureTypeId) || !validNature
          || !string(body.description)) {
          return invalid(`${action} requires a documented case type, numeric trackingNumber, and description.`);
        }
        if (!(await owned())) return NextResponse.json({ error: "TRAX shipment not found in this brand" }, { status: 404 });
        result = await submitTraxCrmRequest({
          case_nature_id: action === "crmComplaint" ? 1 : 2,
          tracking_number: trackingNumber,
          case_nature_type_id: caseNatureTypeId,
          description: body.description,
        }, config.credentials);
        break;
      }
      case "crmClaim": {
        const caseNatureTypeId = body.caseNatureTypeId;
        if (!validDigits(trackingNumber, 3) || !string(body.description)
          || !positiveInt(body.product_cost) || !int(body.damage_product_price) || Number(body.damage_product_price) < 0
          || !int(body.missing_product_price) || Number(body.missing_product_price) < 0
          || (caseNatureTypeId !== undefined && (!int(caseNatureTypeId) || !claimTypes.has(Number(caseNatureTypeId))))
          || (body.images !== undefined && !isRecord(body.images))) {
          return invalid("crmClaim requires a numeric trackingNumber, description, non-negative documented prices, and an optional documented claim type/images.");
        }
        if (!(await owned())) return NextResponse.json({ error: "TRAX shipment not found in this brand" }, { status: 404 });
        const form = new FormData();
        form.set("case_nature_id", "4");
        form.set("tracking_number", trackingNumber);
        form.set("description", string(body.description));
        form.set("product_cost", String(body.product_cost));
        form.set("damage_product_price", String(body.damage_product_price));
        form.set("missing_product_price", String(body.missing_product_price));
        if (caseNatureTypeId !== undefined) form.set("case_nature_type_id", String(caseNatureTypeId));
        const images = (body.images || {}) as Record<string, unknown>;
        let aggregateImageBytes = 0;
        for (const field of claimImageFields) {
          if (images[field] !== undefined) {
            const image = images[field];
            let file: Blob;
            try {
              file = imageFile(image, field);
            } catch (error) {
              return invalid(error instanceof Error ? error.message : `Invalid ${field}`);
            }
            aggregateImageBytes += file.size;
            if (aggregateImageBytes > MAX_CLAIM_IMAGE_BYTES) {
              return invalid("Combined CRM claim images exceed the 8 MB total upload limit.");
            }
            form.append(field, file, string((image as RecordValue).fileName));
          }
        }
        result = await submitTraxCrmRequest(form, config.credentials);
        break;
      }
      default:
        return invalid("Unknown TRAX operation. See the typed TraxOperationAction contract in lib/trax.ts.");
    }
    return NextResponse.json({ action, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "TRAX operation failed" }, { status: 502 });
  }
}