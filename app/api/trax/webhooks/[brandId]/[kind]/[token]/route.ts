import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isTraxWebhookKind,
  isValidTraxWebhookToken,
  type TraxWebhookKind,
} from "@/lib/trax-webhook-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 3;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseEventDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function classifyStatus(status: string) {
  const lower = status.toLowerCase();
  if (/\bundeliver(?:ed|able)?\b|\bnot[\s-]+delivered\b/.test(lower)) return "other";
  return lower.includes("deliver") || lower.includes("completed")
    ? "delivered"
    : lower.includes("return") || lower === "rto"
      ? "returned"
      : lower.includes("cancel") || lower.includes("void")
        ? "cancelled"
        : lower.includes("book") || lower.includes("transit") || lower.includes("dispatch")
          ? "in_process"
          : "other";
}

function activityHistoryWithEvent(previousValue: unknown, event: JsonRecord) {
  const items = Array.isArray(previousValue) ? previousValue : [];
  const unique = new Map<string, unknown>();
  for (const item of [...items, event]) {
    const row = asRecord(item);
    const key = row
      ? `${text(row.status)}\0${text(row.date ?? row.date_time)}\0${text(row.details)}\0${text(row.payment_id ?? row.paymentId)}`
      : JSON.stringify(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const row = asRecord(value);
  if (row) {
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function webhookPaymentEvents(raw: JsonRecord, currentPayload: unknown) {
  const events = Array.isArray(raw.webhookStatusEvents)
    ? raw.webhookStatusEvents.filter((item): item is JsonRecord => Boolean(asRecord(item)))
    : [];
  const previousWebhook = asRecord(raw.webhook);
  if (previousWebhook?.status !== undefined && !events.some((item) => stableJson(item) === stableJson(previousWebhook))) {
    events.push(previousWebhook);
  }
  const current = asRecord(currentPayload);
  if (current && !events.some((item) => stableJson(item) === stableJson(current))) events.push(current);
  const unique = new Map<string, JsonRecord>();
  for (const event of events) unique.set(stableJson(event), event);
  return [...unique.values()];
}

const chargeFields = [
  "cod_amount",
  "actual_weight",
  "chargeable_weight",
  "weight_charges",
  "cash_handling_charges",
  "insurance_charges",
  "fuel_surcharges",
  "packaging_charges",
  "return_charges",
  "replacement_charges",
  "try_buy_charges",
  "intercept_charges",
  "nsa_charges",
  "gst",
  "total_charges",
  "net_payable",
] as const;

type NormalizedWebhook = {
  tracking?: JsonRecord;
  payment?: JsonRecord;
  order?: {
    lastStatus?: string;
    orderStatus?: string;
    transactionStatus?: string;
    lastStatusTime?: Date;
    transactionFee?: number;
    transactionTax?: number;
    netAmount?: number;
    actualWeight?: number;
  };
};

function normalizePayload(kind: TraxWebhookKind, payload: unknown, trackingNumber: string): NormalizedWebhook | null {
  const record = asRecord(payload);
  if (!record || text(record.tracking_number) !== trackingNumber) return null;

  if (kind === "status" || kind === "payment-status") {
    const status = text(record.status);
    if (!status || status.length > 200) return null;
    const dateTime = record.date_time;
    if (dateTime !== undefined && (typeof dateTime !== "string" || dateTime.length > 100)) return null;
    const eventDate = parseEventDate(dateTime);
    if (dateTime && !eventDate) return null;
    if (kind === "payment-status") {
      const paymentId = text(record.payment_id);
      if (paymentId.length > 200) return null;
      return {
        payment: {
          trackingNumber,
          paymentStatus: status,
          currentPaymentStatus: status,
          ...(paymentId ? { paymentId } : {}),
          statusHistory: [{
            status,
            date: text(dateTime),
            details: "",
            ...(paymentId ? { payment_id: paymentId } : {}),
          }],
          raw: { webhook: record, webhookEventTime: text(dateTime) || null },
        },
      };
    }
    return {
      tracking: {
        trackingNumber,
        currentStatus: status,
        statusCategory: classifyStatus(status),
        lastStatusTime: eventDate?.toISOString() || null,
        activityHistory: [{ status, date: text(dateTime), details: "" }],
        raw: { webhook: record },
      },
      order: {
        lastStatus: status,
        orderStatus: status,
        transactionStatus: status,
        ...(eventDate ? { lastStatusTime: eventDate } : {}),
      },
    };
  }

  const origin = record.origin;
  const destination = record.destination;
  if ((origin !== undefined && typeof origin !== "string") ||
      (destination !== undefined && typeof destination !== "string")) return null;
  const amounts: JsonRecord = {};
  for (const key of chargeFields) {
    if (record[key] === undefined) continue;
    const amount = numeric(record[key]);
    if (amount === null) return null;
    amounts[key] = amount;
  }
  if (!Object.keys(amounts).length) return null;

  return {
    tracking: {
      trackingNumber,
      chargeKind: kind,
      origin: text(origin),
      destination: text(destination),
      charges: amounts,
      raw: { webhook: record },
    },
    order: {
      ...(amounts.total_charges !== undefined ? { transactionFee: amounts.total_charges as number } : {}),
      ...(amounts.gst !== undefined ? { transactionTax: amounts.gst as number } : {}),
      ...(amounts.net_payable !== undefined ? { netAmount: amounts.net_payable as number } : {}),
      ...(amounts.actual_weight !== undefined ? { actualWeight: amounts.actual_weight as number } : {}),
    },
  };
}

async function readExistingJson(data: string | undefined) {
  if (!data) return {};
  try {
    const parsed: unknown = JSON.parse(data);
    return asRecord(parsed) || {};
  } catch {
    return {};
  }
}

function persistedDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return parseEventDate(typeof value === "string" ? value : "");
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ brandId: string; kind: string; token: string }> },
) {
  const { brandId, kind: kindParam, token } = await context.params;
  if (!isTraxWebhookKind(kindParam)) {
    return NextResponse.json({ error: "Unknown TRAX webhook kind" }, { status: 404 });
  }
  if (!isValidTraxWebhookToken(brandId, kindParam, token)) {
    return NextResponse.json({ error: "Invalid webhook URL" }, { status: 404 });
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 16_384) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ error: "A JSON object payload is required" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > 16_384) {
      await reader.cancel();
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const raw = new TextDecoder().decode(bytes);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "A JSON object payload is required" }, { status: 400 });
  }

  const record = asRecord(payload);
  const trackingNumber = text(record?.tracking_number);
  if (!/^\d{3,40}$/.test(trackingNumber)) {
    return NextResponse.json({ error: "A numeric tracking_number is required" }, { status: 400 });
  }
  const normalized = normalizePayload(kindParam, payload, trackingNumber);
  if (!normalized) return NextResponse.json({ error: "Payload fields are invalid for this webhook kind" }, { status: 400 });

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { brandId, courier: "TRAX", trackingNumber },
        select: { trackingNumber: true, lastStatus: true, lastStatusTime: true },
      });
      if (!order) return { found: false };
      let shouldUpdateOrder = true;

      if (normalized.tracking && kindParam === "status") {
        const existing = await tx.trackingStatus.findUnique({
          where: { trackingNumber },
          select: { data: true },
        });
        const previous = await readExistingJson(existing?.data);
        const rawPrevious = asRecord(previous.raw) || {};
        const event = (normalized.tracking.activityHistory as JsonRecord[])[0];
        const activityHistory = activityHistoryWithEvent(previous.activityHistory, event);
        const orderStatusDate = persistedDate(order.lastStatusTime);
        const trackingStatusDate = persistedDate(previous.lastStatusTime);
        const trackingIsNewer = Boolean(
          trackingStatusDate && (!orderStatusDate || trackingStatusDate.getTime() > orderStatusDate.getTime()),
        );
        const existingStatusDate = trackingIsNewer ? trackingStatusDate : orderStatusDate || trackingStatusDate;
        const previousStatus = (trackingIsNewer ? text(previous.currentStatus) : text(order.lastStatus)) ||
          text(previous.currentStatus) || text(event.status);
        const eventDate = parseEventDate(text(event.date));
        const hasExistingCurrentStatus = Boolean(
          text(order.lastStatus) || text(previous.currentStatus) || existingStatusDate,
        );
        const preserveCurrentStatus = Boolean(
          hasExistingCurrentStatus &&
          (!eventDate || (existingStatusDate && eventDate.getTime() < existingStatusDate.getTime())),
        );
        const currentStatus = preserveCurrentStatus ? previousStatus : text(event.status);
        const currentStatusDate = preserveCurrentStatus
          ? existingStatusDate
          : eventDate || existingStatusDate;
        const raw: JsonRecord = { ...rawPrevious, webhook: payload };
        const savedTracking = {
          ...normalized.tracking,
          currentStatus,
          statusCategory: classifyStatus(currentStatus),
          lastStatusTime: currentStatusDate?.toISOString() || null,
          activityHistory,
          raw,
        };
        await tx.trackingStatus.upsert({
          where: { trackingNumber },
          update: {
            data: JSON.stringify({ ...previous, ...savedTracking }),
            updatedAt: new Date(),
          },
          create: { trackingNumber, data: JSON.stringify(savedTracking) },
        });

        if (!preserveCurrentStatus) {
          await tx.order.updateMany({
            where: { brandId, courier: "TRAX", trackingNumber },
            data: { ...normalized.order, lastFetchedAt: new Date() },
          });
        } else {
          await tx.order.updateMany({
            where: { brandId, courier: "TRAX", trackingNumber },
            data: { lastFetchedAt: new Date() },
          });
        }
      }

      if (normalized.tracking && kindParam !== "status") {
        const existing = await tx.trackingStatus.findUnique({
          where: { trackingNumber },
          select: { data: true },
        });
        const previous = await readExistingJson(existing?.data);
        const rawPrevious = asRecord(previous.raw) || {};
        const priorSnapshots = asRecord(rawPrevious.chargeSnapshots) || {};
        const finalSnapshotAlreadyReceived = priorSnapshots.final !== undefined;
        const isDelayedInitial = kindParam === "initial-charges" && finalSnapshotAlreadyReceived;
        const raw = {
          ...rawPrevious,
          webhook: payload,
          chargeSnapshots: {
            ...priorSnapshots,
            [kindParam === "initial-charges" ? "initial" : "final"]: payload,
          },
        };
        const updated = isDelayedInitial
          ? { ...previous, raw }
          : {
            ...previous,
            ...normalized.tracking,
            charges: {
              ...(asRecord(previous.charges) || {}),
              ...(asRecord(normalized.tracking.charges) || {}),
            },
            raw,
          };
        if (isDelayedInitial) shouldUpdateOrder = false;
        await tx.trackingStatus.upsert({
          where: { trackingNumber },
          update: { data: JSON.stringify(updated), updatedAt: new Date() },
          create: { trackingNumber, data: JSON.stringify(updated) },
        });
      }

      if (normalized.payment) {
        const existing = await tx.paymentStatus.findUnique({
          where: { trackingNumber },
          select: { data: true },
        });
        const previous = await readExistingJson(existing?.data);
        const rawPrevious = asRecord(previous.raw) || {};
        const statusEvent = (normalized.payment.statusHistory as JsonRecord[])[0];
        const statusHistory = activityHistoryWithEvent(previous.statusHistory, statusEvent);
        const incomingEventDate = parseEventDate(text(statusEvent.date));
        const previousEvents = Array.isArray(rawPrevious.webhookStatusEvents)
          ? rawPrevious.webhookStatusEvents
          : [];
        const knownEventDates = [
          persistedDate(rawPrevious.latestAcceptedWebhookStatusEventTime),
          ...previousEvents.map((event) => parseEventDate(text(asRecord(event)?.date_time))),
          ...(Array.isArray(previous.statusHistory)
            ? previous.statusHistory.map((event: unknown) => parseEventDate(text(asRecord(event)?.date ?? asRecord(event)?.date_time)))
            : []),
        ].filter((date): date is Date => Boolean(date));
        const latestAcceptedEventDate = knownEventDates.reduce<Date | null>(
          (latest, date) => !latest || date.getTime() > latest.getTime() ? date : latest,
          null,
        );
        const hasCurrentStatus = Boolean(text(previous.paymentStatus) || text(previous.currentPaymentStatus));
        const applyAsCurrent = incomingEventDate
          ? !latestAcceptedEventDate || incomingEventDate.getTime() > latestAcceptedEventDate.getTime()
          : !hasCurrentStatus && !latestAcceptedEventDate;
        const rawEvents = webhookPaymentEvents(rawPrevious, payload);
        const raw: JsonRecord = {
          ...rawPrevious,
          webhook: applyAsCurrent ? payload : rawPrevious.webhook ?? payload,
          webhookStatusEvents: rawEvents,
          ...(applyAsCurrent && incomingEventDate
            ? { latestAcceptedWebhookStatusEventTime: incomingEventDate.toISOString() }
            : {}),
        };
        const paymentUpdate: JsonRecord = {
          ...previous,
          trackingNumber,
          paymentDate: previous.paymentDate ?? null,
          statusHistory,
          raw,
        };
        if (applyAsCurrent) {
          paymentUpdate.paymentStatus = normalized.payment.paymentStatus;
          paymentUpdate.currentPaymentStatus = normalized.payment.currentPaymentStatus;
          if (normalized.payment.paymentId !== undefined) {
            paymentUpdate.paymentId = normalized.payment.paymentId;
          }
        }
        await tx.paymentStatus.upsert({
          where: { trackingNumber },
          update: {
            data: JSON.stringify(paymentUpdate),
            updatedAt: new Date(),
          },
          create: { trackingNumber, data: JSON.stringify(paymentUpdate) },
        });
      }

      if (kindParam !== "status") {
        if (shouldUpdateOrder) {
          await tx.order.updateMany({
            where: { brandId, courier: "TRAX", trackingNumber },
            data: { ...(normalized.order || {}), lastFetchedAt: new Date() },
          });
        } else {
          await tx.order.updateMany({
            where: { brandId, courier: "TRAX", trackingNumber },
            data: { lastFetchedAt: new Date() },
          });
        }
      }
      return { found: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!saved.found) return NextResponse.json({ error: "TRAX order not found for this brand" }, { status: 404 });

    return NextResponse.json({ ok: true, tracking_number: trackingNumber, kind: kindParam });
  } catch {
    return NextResponse.json({ error: "Unable to save TRAX webhook update" }, { status: 503 });
  }
}