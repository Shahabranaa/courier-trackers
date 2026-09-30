type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function strictExistingRecord(data: string | null | undefined, kind: string): JsonRecord {
  if (data == null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error(`Existing TRAX ${kind} data is not valid JSON.`);
  }
  if (!isRecord(parsed)) throw new Error(`Existing TRAX ${kind} data is not a JSON object.`);
  if (parsed.raw !== undefined && !isRecord(parsed.raw)) {
    throw new Error(`Existing TRAX ${kind} raw data cannot be safely merged.`);
  }
  return parsed;
}

function mergeHistory(previous: unknown, fresh: unknown, kind: string) {
  if (previous !== undefined && !Array.isArray(previous)) {
    throw new Error(`Existing TRAX ${kind} history cannot be safely merged.`);
  }
  if (fresh !== undefined && !Array.isArray(fresh)) {
    throw new Error(`Fresh TRAX ${kind} history is not an array.`);
  }
  const unique = new Map<string, unknown>();
  for (const item of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(fresh) ? fresh : [])]) {
    const row = isRecord(item) ? item : null;
    const key = row
      ? `${String(row.status ?? "")}\0${String(row.date ?? row.date_time ?? "")}\0${String(row.details ?? "")}`
      : JSON.stringify(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function statusCategory(status: string) {
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

function statusText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasIncomingValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function mergeNonemptyFields(previous: JsonRecord, fresh: JsonRecord): JsonRecord {
  const merged = { ...previous, ...fresh };
  for (const [key, value] of Object.entries(fresh)) {
    if (!hasIncomingValue(value) && hasIncomingValue(previous[key])) {
      merged[key] = previous[key];
    }
  }
  return merged;
}

function mergeRawNamespaces(previous: JsonRecord, fresh: JsonRecord): JsonRecord {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(fresh)) {
    if (hasIncomingValue(value) || !hasIncomingValue(previous[key])) merged[key] = value;
  }
  return merged;
}

function finiteCharge(value: unknown, field: string): number {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`Final TRAX charge snapshot field ${field} is not numeric.`);
  }
  const text = typeof value === "string" ? value.trim().replace(/,/g, "") : value;
  if (text === "") throw new Error(`Final TRAX charge snapshot field ${field} is not numeric.`);
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error(`Final TRAX charge snapshot field ${field} is not finite.`);
  return parsed;
}

/**
 * Keeps the API's current response while preserving accumulated webhook/operation
 * data. The caller must perform the read and write in one serializable transaction.
 */
export function mergeTraxTrackingRefresh(
  existingData: string | null | undefined,
  freshTracking: JsonRecord,
  orderState: { lastStatus?: string | null; lastStatusTime?: Date | string | null },
) {
  const previous = strictExistingRecord(existingData, "tracking");
  const previousRaw = (previous.raw || {}) as JsonRecord;
  const freshRaw = isRecord(freshTracking.raw) ? freshTracking.raw : {};
  const activityHistory = mergeHistory(previous.activityHistory, freshTracking.activityHistory, "tracking activity");

  const storedDate = parseDate(previous.lastStatusTime);
  const orderDate = parseDate(orderState.lastStatusTime);
  const existingDate = storedDate && orderDate
    ? (storedDate.getTime() >= orderDate.getTime() ? storedDate : orderDate)
    : storedDate || orderDate;
  const storedStatus = statusText(previous.currentStatus);
  const orderStatus = statusText(orderState.lastStatus);
  const existingStatus = storedDate && orderDate
    ? (storedDate.getTime() >= orderDate.getTime() ? storedStatus : orderStatus) || storedStatus || orderStatus
    : storedStatus || orderStatus;

  const freshStatus = statusText(freshTracking.currentStatus);
  const freshDate = parseDate(freshTracking.lastStatusTime);
  const cancellationRecorded = Boolean(
    /cancel|void/i.test(existingStatus) || previousRaw.cancellation !== undefined,
  );
  const preserveCurrentStatus = Boolean(existingStatus && (
    cancellationRecorded
      ? !existingDate || !freshDate || freshDate.getTime() <= existingDate.getTime()
      : Boolean(existingDate && (!freshDate || freshDate.getTime() < existingDate.getTime()))
  ));

  const raw: JsonRecord = { ...previousRaw, ...freshRaw };
  const snapshots = isRecord(previousRaw.chargeSnapshots) ? previousRaw.chargeSnapshots : null;
  if (previousRaw.chargeSnapshots !== undefined && !snapshots) {
    throw new Error("Existing TRAX charge snapshots cannot be safely merged.");
  }
  if (snapshots && ["initial", "final"].some((key) =>
    snapshots[key] !== undefined && !isRecord(snapshots[key]))) {
    throw new Error("Existing TRAX charge snapshot payload cannot be safely merged.");
  }

  const merged: JsonRecord = {
    ...previous,
    ...freshTracking,
    activityHistory,
    raw: {
      ...raw,
      ...(snapshots ? { chargeSnapshots: snapshots } : {}),
    },
  };
  const orderChargeOverrides: JsonRecord = {};

  // A final webhook snapshot is authoritative for fields it explicitly contains;
  // this prevents an API response reflecting only initial charges from regressing totals.
  if (snapshots && isRecord(snapshots.final)) {
    const finalFields = snapshots.final;
    const chargeFields = [
      "cod_amount", "actual_weight", "chargeable_weight", "weight_charges",
      "cash_handling_charges", "insurance_charges", "fuel_surcharges",
      "packaging_charges", "return_charges", "replacement_charges",
      "try_buy_charges", "intercept_charges", "nsa_charges", "gst",
      "total_charges", "net_payable",
    ];
    const finalCharges: JsonRecord = {};
    for (const field of chargeFields) {
      if (finalFields[field] !== undefined) finalCharges[field] = finiteCharge(finalFields[field], field);
    }
    if (Object.keys(finalCharges).length) {
      merged.charges = {
        ...(isRecord(merged.charges) ? merged.charges : {}),
        ...finalCharges,
      };
      if (finalCharges.total_charges !== undefined) orderChargeOverrides.transactionFee = finalCharges.total_charges;
      if (finalCharges.gst !== undefined) orderChargeOverrides.transactionTax = finalCharges.gst;
      if (finalCharges.net_payable !== undefined) orderChargeOverrides.netAmount = finalCharges.net_payable;
      if (finalCharges.actual_weight !== undefined) orderChargeOverrides.actualWeight = finalCharges.actual_weight;
    }
  }

  if (preserveCurrentStatus) {
    merged.currentStatus = existingStatus;
    merged.statusCategory = statusCategory(existingStatus);
    merged.lastStatusTime = existingDate?.toISOString() || null;
  } else if (freshStatus) {
    merged.currentStatus = freshStatus;
    merged.statusCategory = statusText(freshTracking.statusCategory) || statusCategory(freshStatus);
  }

  return {
    tracking: merged,
    preserveCurrentStatus,
    effectiveStatus: statusText(merged.currentStatus),
    effectiveStatusTime: parseDate(merged.lastStatusTime),
    orderChargeOverrides,
  };
}

export function mergeTraxPaymentRefresh(
  existingData: string | null | undefined,
  freshPayment: JsonRecord,
) {
  const previous = strictExistingRecord(existingData, "payment");
  const previousRaw = (previous.raw || {}) as JsonRecord;
  const freshRaw = isRecord(freshPayment.raw) ? freshPayment.raw : {};
  if (previous.charges !== undefined && previous.charges !== null && !isRecord(previous.charges)) {
    throw new Error("Existing TRAX payment charges cannot be safely merged.");
  }
  if (freshPayment.charges !== undefined && freshPayment.charges !== null && !isRecord(freshPayment.charges)) {
    throw new Error("Fresh TRAX payment charges are not an object.");
  }
  const statusHistory = mergeHistory(previous.statusHistory, freshPayment.statusHistory, "payment status");
  const merged = mergeNonemptyFields(previous, freshPayment);
  if (isRecord(previous.charges) || isRecord(freshPayment.charges)) {
    merged.charges = mergeNonemptyFields(
      isRecord(previous.charges) ? previous.charges : {},
      isRecord(freshPayment.charges) ? freshPayment.charges : {},
    );
  }
  return {
    ...merged,
    statusHistory,
    raw: mergeRawNamespaces(previousRaw, freshRaw),
  };
}