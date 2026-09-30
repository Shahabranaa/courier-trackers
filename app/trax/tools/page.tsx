"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import type { Order } from "@/lib/types";
import type { TraxOperationAction } from "@/lib/trax";
import {
  AlertCircle, ArrowLeft, ArrowUpRight, BadgeCheck, Ban, Calculator, Check, CheckCircle2,
  Clipboard, Clock3, Download, FileImage, FileText, Info, LoaderCircle,
  Package, RefreshCw, Search, Send, ShieldAlert, Ticket, Truck, Wallet, X,
} from "lucide-react";

type ActionName = TraxOperationAction["action"];
type ReceivingSheetViewAction = Omit<Extract<TraxOperationAction, { action: "viewReceivingSheet" }>, "trackingNumber"> & { trackingNumber: string };
type InvoiceActionWithPaymentAnchor =
  | { brandId: string; action: "invoice"; id: number; type: 1 }
  | { brandId: string; action: "invoice"; id: number; type: 2; trackingNumber: string };
type ToolOperationAction = TraxOperationAction | ReceivingSheetViewAction | InvoiceActionWithPaymentAnchor;
type Section = "shipment" | "finance" | "dispatch" | "customer";
type City = Record<string, unknown> & { id?: string | number; city_id?: string | number; name?: string; city_name?: string };
type Pickup = Record<string, unknown> & { id?: string | number; pickup_address_id?: string | number; name?: string; address?: string };
type FileResult = { contentType: string; base64: string; name: string };
type ClaimImageName = "product_picture" | "invoice_picture" | "actual_product_picture" | "product_packaging_picture" | "damage_product_picture" | "missing_product_picture";

const actions: { id: ActionName; label: string; description: string; section: Section; mutation?: boolean; icon: typeof Truck }[] = [
  { id: "paymentStatus", label: "Payment status", description: "Fetch the payment status attached to a saved shipment.", section: "finance", icon: Wallet },
  { id: "invoice", label: "Invoice / payment document", description: "Retrieve a document by its numeric TRAX record ID.", section: "finance", icon: FileText },
  { id: "airWaybill", label: "Air waybill", description: "Open or download the shipment consignment note.", section: "shipment", icon: FileImage },
  { id: "cancel", label: "Cancel shipment", description: "Submit a cancellation request for a booked shipment.", section: "shipment", mutation: true, icon: Ban },
  { id: "calculateRates", label: "Calculate rates", description: "Estimate charges for a route, service and shipping mode.", section: "finance", icon: Calculator },
  { id: "createReceivingSheet", label: "Create receiving sheet", description: "Create a sheet from saved TRAX shipments.", section: "dispatch", mutation: true, icon: Clipboard },
  { id: "viewReceivingSheet", label: "View receiving sheet", description: "Retrieve a sheet as JPEG or PDF. Supply a locally saved shipment included in that sheet.", section: "dispatch", icon: FileText },
  { id: "trackOrderId", label: "Track by order ID", description: "Read shipment tracking history for a TRAX order ID.", section: "shipment", icon: Search },
  { id: "statusOrderId", label: "Status by order ID", description: "Read current shipment status for a TRAX order ID.", section: "shipment", icon: BadgeCheck },
  { id: "returnConfirmationPending", label: "Return confirmation", description: "Request the return-confirmation status for a shipment.", section: "shipment", mutation: true, icon: ArrowUpRight },
  { id: "reattempt", label: "Re-attempt request", description: "Request another delivery attempt for a shipment.", section: "shipment", mutation: true, icon: RefreshCw },
  { id: "interceptRebook", label: "Intercept / rebook", description: "Submit an intercept or rebook request with consignee details.", section: "shipment", mutation: true, icon: Truck },
  { id: "crmComplaint", label: "CRM complaint", description: "Submit a documented complaint against a shipment.", section: "customer", mutation: true, icon: Ticket },
  { id: "crmServiceRequest", label: "CRM service request", description: "Submit a documented service request against a shipment.", section: "customer", mutation: true, icon: Send },
  { id: "crmClaim", label: "CRM claim", description: "Submit claim details with optional supporting images.", section: "customer", mutation: true, icon: ShieldAlert },
];
const sectionNames: Record<Section, string> = { shipment: "Shipment actions", finance: "Finance & rates", dispatch: "Dispatch", customer: "Customer care" };
const complaintTypes = [[1, "Payments"], [2, "Delay in delivery"], [3, "Delay in pickup"], [4, "Incorrect COD"], [5, "Return"], [6, "Courier misbehavior"], [7, "Wrong COD"], [8, "Booking portal issue"], [9, "Other"], [10, "Fake reason"], [15, "Flyers"], [16, "Product / quality issue"], [18, "Short contents"], [19, "Wrong delivery / misroute"], [27, "Open parcel"], [28, "Open parcel complaint"], [30, "Issue with salesperson"], [31, "Sales lead"]] as const;
const serviceTypes = [[11, "Address change"], [12, "COD change"], [13, "Alternate contact number"], [14, "Urgent delivery"], [17, "Intercept"], [20, "Hold for self-collection"], [32, "Allow to open shipment"]] as const;
const claimTypes = [[21, "Shipment damage"], [22, "Content short"], [23, "Lost"], [24, "Theft & snatching"], [25, "Tariff"], [26, "Weight disputes"], [29, "Open parcel claim"]] as const;
const claimImages: { key: ClaimImageName; label: string }[] = [
  { key: "product_picture", label: "Product picture" }, { key: "invoice_picture", label: "Invoice picture" },
  { key: "actual_product_picture", label: "Actual product picture" }, { key: "product_packaging_picture", label: "Product packaging picture" },
  { key: "damage_product_picture", label: "Damage product picture" }, { key: "missing_product_picture", label: "Missing product picture" },
];
const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const rangeForMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return { startDate: `${month}-01`, endDate: `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, "0")}` };
};
const digits = (value: string) => /^\d{3,40}$/.test(value.trim());
const asNumeric = (value: string) => Number(value);
const inputClass = "mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const labelClass = "block text-xs font-semibold text-slate-600";
const readId = (item: Record<string, unknown>) => item.id ?? item.city_id ?? item.pickup_address_id ?? item.cityId ?? item.address_id;
const readLabel = (item: Record<string, unknown>) => item.name ?? item.city_name ?? item.city ?? item.address ?? item.pickup_address ?? item.title ?? readId(item);

function safeDisplay(value: unknown): string {
  return JSON.stringify(value, (key, item) => key.toLowerCase() === "base64" ? "[file omitted]" : item, 2);
}

function extractFile(value: unknown): FileResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.base64 === "string" && typeof record.contentType === "string") {
    return { base64: record.base64, contentType: record.contentType, name: typeof record.fileName === "string" ? record.fileName : "trax-document" };
  }
  for (const child of Object.values(record)) {
    const found = extractFile(child);
    if (found) return found;
  }
  return null;
}
function toBlob(file: FileResult) {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: file.contentType });
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className={labelClass}>{label}{children}{hint && <span className="mt-1.5 block text-[11px] font-normal leading-4 text-slate-500">{hint}</span>}</label>;
}

export default function TraxToolsPage() {
  const { selectedBrand } = useBrand();
  const [action, setAction] = useState<ActionName>("paymentStatus");
  const [month, setMonth] = useState(currentMonth);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [webhooks, setWebhooks] = useState<Record<string, string>>({});
  const [webhookError, setWebhookError] = useState("");
  const [lookups, setLookups] = useState<{ cities: City[]; pickupAddresses: Pickup[] } | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [claimFiles, setClaimFiles] = useState<Partial<Record<ClaimImageName, { fileName: string; contentType: "image/jpeg" | "image/png"; base64: string }>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [recentSheet, setRecentSheet] = useState<{ brandId: string; id: string; trackingNumbers: string[] } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const range = useMemo(() => rangeForMonth(month), [month]);
  const selectedAction = actions.find(item => item.id === action)!;
  const selectedOrders = useMemo(() => orders.filter(order => Boolean(order.trackingNumber)), [orders]);
  const isReady = Boolean(selectedBrand?.traxEnabled && selectedBrand?.courierCredentials?.trax);
  const setValue = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const selectAction = (next: ActionName) => {
    setAction(next);
    setForm({
      ...(next === "invoice" ? { type: "1" } : {}),
      ...(next === "airWaybill" || next === "viewReceivingSheet" ? { type: "0" } : {}),
      ...(next === "trackOrderId" || next === "statusOrderId" ? { type: "0" } : {}),
      ...(next === "interceptRebook" ? { consigneeType: "1" } : {}),
    });
    setClaimFiles({});
    setError("");
    setResult(null);
  };

  const loadOrders = useCallback(async () => {
    if (!selectedBrand) { setOrders([]); return; }
    setOrdersBusy(true); setOrdersError("");
    try {
      const params = new URLSearchParams({ brandId: selectedBrand.id, ...range });
      const response = await fetch(`/api/trax/orders?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load saved TRAX shipments");
      setOrders(Array.isArray(data.dist) ? data.dist : []);
    } catch (reason) {
      setOrdersError(reason instanceof Error ? reason.message : "Unable to load saved TRAX shipments");
    } finally { setOrdersBusy(false); }
  }, [range, selectedBrand]);
  useEffect(() => { void loadOrders(); }, [loadOrders]);

  useEffect(() => {
    if (!selectedBrand) { setWebhooks({}); setWebhookError(""); return; }
    let cancelled = false;
    setWebhookError("");
    fetch(`/api/trax/webhooks?brandId=${encodeURIComponent(selectedBrand.id)}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load subscription URLs");
        if (!cancelled) setWebhooks(data.subscriptions || {});
      })
      .catch(reason => { if (!cancelled) setWebhookError(reason instanceof Error ? reason.message : "Unable to load subscription URLs"); });
    return () => { cancelled = true; };
  }, [selectedBrand]);

  const loadLookups = useCallback(async () => {
    if (!selectedBrand || lookups || lookupBusy) return;
    setLookupBusy(true); setLookupError("");
    try {
      const response = await fetch(`/api/trax/lookups?brandId=${encodeURIComponent(selectedBrand.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load TRAX cities and pickup addresses");
      setLookups({ cities: Array.isArray(data.cities) ? data.cities : [], pickupAddresses: Array.isArray(data.pickupAddresses) ? data.pickupAddresses : [] });
    } catch (reason) { setLookupError(reason instanceof Error ? reason.message : "Unable to load TRAX lookups"); }
    finally { setLookupBusy(false); }
  }, [lookupBusy, lookups, selectedBrand]);
  useEffect(() => {
    if (action === "calculateRates" || (action === "interceptRebook" && form.consigneeType === "2")) void loadLookups();
  }, [action, form.consigneeType, loadLookups]);

  const preparePayload = (): ToolOperationAction => {
    if (!selectedBrand) throw new Error("Select a brand first.");
    const brandId = selectedBrand.id;
    const trackingNumber = form.trackingNumber?.trim() || "";
    switch (action) {
      case "paymentStatus": case "cancel": case "returnConfirmationPending": case "reattempt":
        return { brandId, action, trackingNumber, ...(["returnConfirmationPending", "reattempt"].includes(action) && form.remarks ? { remarks: form.remarks } : {}) } as TraxOperationAction;
      case "airWaybill": return { brandId, action, trackingNumber, type: form.type === "1" ? 1 : 0 };
      case "invoice": return form.type === "2"
        ? { brandId, action, id: asNumeric(form.id), type: 2, trackingNumber }
        : { brandId, action, id: asNumeric(form.id), type: 1 };
      case "calculateRates": return {
        brandId, action, service_type_id: asNumeric(form.service_type_id), origin_city_id: asNumeric(form.origin_city_id),
        destination_city_id: asNumeric(form.destination_city_id), estimated_weight: Number(form.estimated_weight),
        shipping_mode_id: asNumeric(form.shipping_mode_id), amount: asNumeric(form.amount),
      };
      case "createReceivingSheet": return { brandId, action, trackingNumbers: (form.trackingNumbers || "").split(/[\s,;]+/).map(value => value.trim()).filter(Boolean) };
      case "viewReceivingSheet": return {
        brandId, action, receivingSheetId: form.receivingSheetId?.trim() || "",
        trackingNumber: form.trackingNumber?.trim() || "", type: form.type === "1" ? 1 : 0,
      };
      case "trackOrderId": case "statusOrderId": return { brandId, action, orderId: form.orderId?.trim() || "", type: form.type === "1" ? 1 : 0 };
      case "interceptRebook": return {
        brandId, action, trackingNumber, consigneeType: Number(form.consigneeType || "1") as 1 | 2,
        consignee_address: form.consignee_address?.trim() || "", consignee_phone_number_1: form.consignee_phone_number_1?.trim() || "",
        ...(form.remarks ? { remarks: form.remarks } : {}),
        ...(form.consigneeType === "2" ? {
          consignee_city_id: form.consignee_city_id?.trim() || "", consignee_name: form.consignee_name?.trim() || "",
          amount: asNumeric(form.amount), ...(form.consignee_phone_number_2 ? { consignee_phone_number_2: form.consignee_phone_number_2.trim() } : {}),
        } : {}),
      };
      case "crmComplaint": case "crmServiceRequest": return {
        brandId, action, trackingNumber, caseNatureTypeId: asNumeric(form.caseNatureTypeId), description: form.description?.trim() || "",
      };
      case "crmClaim": return {
        brandId, action, trackingNumber, ...(form.caseNatureTypeId ? { caseNatureTypeId: asNumeric(form.caseNatureTypeId) } : {}),
        description: form.description?.trim() || "", product_cost: asNumeric(form.product_cost),
        damage_product_price: asNumeric(form.damage_product_price), missing_product_price: asNumeric(form.missing_product_price),
        ...(Object.keys(claimFiles).length ? { images: claimFiles } : {}),
      };
    }
  };

  const performOperation = async () => {
    if (!selectedBrand) return;
    setBusy(true); setError(""); setResult(null); setConfirmOpen(false);
    try {
      const payload = preparePayload();
      const response = await fetch("/api/trax/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "TRAX operation failed");
      setResult(data);
      if (payload.action === "createReceivingSheet" && data.result && typeof data.result === "object") {
        const resultBody = data.result as Record<string, unknown>;
        const sheetId = resultBody.receiving_sheet_id;
        if (sheetId !== undefined && sheetId !== null && String(sheetId)) {
          setRecentSheet({ brandId: selectedBrand.id, id: String(sheetId), trackingNumbers: payload.trackingNumbers });
        }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "TRAX operation failed"); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setResult(null);
    if (action === "createReceivingSheet") {
      const numbers = (form.trackingNumbers || "").split(/[\s,;]+/).map(value => value.trim()).filter(Boolean);
      if (numbers.length < 1 || numbers.length > 100 || numbers.some(value => !digits(value))) {
        setError("Enter 1–100 tracking numbers, each containing 3–40 digits.");
        return;
      }
    }
    if (selectedAction.mutation) setConfirmOpen(true);
    else void performOperation();
  };
  const copyWebhook = async (kind: string, url: string) => {
    const hostname = window.location.hostname.toLowerCase();
    const temporaryHost = hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || hostname.endsWith(".replit.dev");
    if (temporaryHost || window.location.protocol !== "https:") {
      setCopied("");
      setWebhookError("Do not copy this preview callback. Open HubLogistic on its published HTTPS domain, then copy the subscription URL there so TRAX can reach an active public endpoint.");
      return;
    }
    try {
      const absolute = new URL(url, window.location.origin).toString();
      await navigator.clipboard.writeText(absolute);
      setCopied(kind);
      setWebhookError("");
      window.setTimeout(() => setCopied(""), 1800);
    } catch { setWebhookError("Clipboard access is unavailable. Copy the URL text directly."); }
  };
  const uploadImage = async (key: ClaimImageName, file?: File) => {
    if (!file) { setClaimFiles(current => { const next = { ...current }; delete next[key]; return next; }); return; }
    if (file.type !== "image/jpeg" && file.type !== "image/png") { setError("Claim images must be JPEG or PNG."); return; }
    if (file.size > 3 * 1024 * 1024) { setError("Each claim image must be no larger than 3 MB."); return; }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("Unable to read selected image"));
      reader.readAsDataURL(file);
    });
    setClaimFiles(current => ({ ...current, [key]: { fileName: file.name, contentType: file.type as "image/jpeg" | "image/png", base64 } }));
  };

  const orderSelect = (field = "trackingNumber", required = true, label = "Saved shipment", hint = "Options are locally saved shipments in the selected date range. You can also enter a tracking number below.") => <Field label={label} hint={hint}>
    <select value={form[field] || ""} onChange={event => setValue(field, event.target.value)} className={inputClass} required={false}>
      <option value="">Choose a saved shipment</option>
      {selectedOrders.map(order => <option key={`${order.trackingNumber}-${order.orderRefNumber}`} value={order.trackingNumber}>{order.trackingNumber} · {order.customerName || order.orderRefNumber || "Saved shipment"}</option>)}
    </select>
    {required && <input aria-label="Tracking number" value={form.trackingNumber || ""} onChange={event => setValue(field, event.target.value)} inputMode="numeric" pattern="[0-9]{3,40}" minLength={3} maxLength={40} required placeholder="Or enter numeric tracking number" className={inputClass} />}
  </Field>;

  const renderFields = () => {
    const trackingActions = ["paymentStatus", "airWaybill", "cancel", "viewReceivingSheet", "returnConfirmationPending", "reattempt", "interceptRebook", "crmComplaint", "crmServiceRequest", "crmClaim"];
    return <div className="grid gap-4 sm:grid-cols-2">
      {(trackingActions.includes(action) || (action === "invoice" && form.type === "2")) && <div className="sm:col-span-2">{action === "viewReceivingSheet"
        ? orderSelect("trackingNumber", true, "Shipment in this sheet", "Choose or enter a shipment saved under this brand and included in the receiving sheet. The backend checks local shipment ownership.")
        : action === "invoice"
          ? orderSelect("trackingNumber", true, "Payment document shipment", "A payment document request must be anchored to a locally owned TRAX tracking number.")
          : orderSelect()}</div>}
      {(action === "airWaybill" || action === "invoice" || action === "viewReceivingSheet" || action === "trackOrderId" || action === "statusOrderId") && <Field label={action === "invoice" ? "TRAX document ID" : action === "viewReceivingSheet" ? "Receiving sheet ID" : "Output format / audience"}>
        {action === "invoice" ? <input type="number" min="1" step="1" required value={form.id || ""} onChange={event => setValue("id", event.target.value)} placeholder="Positive numeric ID" className={inputClass} />
            : action === "viewReceivingSheet" ? <input inputMode="numeric" pattern="[0-9]+" required value={form.receivingSheetId || ""} onChange={event => setValue("receivingSheetId", event.target.value)} placeholder="Receiving sheet ID" className={inputClass} />
            : <select value={form.type ?? (action === "airWaybill" ? "0" : "0")} onChange={event => setValue("type", event.target.value)} className={inputClass}>
              {action === "airWaybill" ? <><option value="0">JPEG</option><option value="1">PDF</option></>
                : <><option value="0">Shipper-related</option><option value="1">General tracking</option></>}
            </select>}
      </Field>}
      {action === "viewReceivingSheet" && <Field label="Sheet image format"><select value={form.type || "0"} onChange={event => setValue("type", event.target.value)} className={inputClass}><option value="0">JPEG</option><option value="1">PDF</option></select></Field>}
      {action === "invoice" && <Field label="Document type"><select value={form.type || "1"} onChange={event => setValue("type", event.target.value)} className={inputClass}><option value="1">Invoice</option><option value="2">Payment</option></select></Field>}
      {(action === "trackOrderId" || action === "statusOrderId") && <Field label="Numeric TRAX order ID" hint="Order ID is distinct from the shipment tracking number."><input value={form.orderId || ""} onChange={event => setValue("orderId", event.target.value)} inputMode="numeric" pattern="[0-9]+" required className={inputClass} placeholder="Order ID" /></Field>}
      {action === "calculateRates" && <>
        <Field label="Service type"><select required value={form.service_type_id || "1"} onChange={event => setValue("service_type_id", event.target.value)} className={inputClass}><option value="1">Regular</option><option value="2">Replacement</option><option value="3">Try & Buy</option></select></Field>
        {lookupError && <div role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{lookupError}<button type="button" className="ml-2 font-bold underline" onClick={() => { setLookups(null); void loadLookups(); }}>Retry lookup</button></div>}
        <Field label="Origin city" hint={lookupBusy ? "Loading TRAX city list…" : "City IDs are sourced from the TRAX lookup."}><select required value={form.origin_city_id || ""} onChange={event => setValue("origin_city_id", event.target.value)} className={inputClass} disabled={!lookups}><option value="">Select city</option>{lookups?.cities.map((city, index) => <option key={`${readId(city)}-${index}`} value={String(readId(city) ?? "")}>{String(readLabel(city))} · {String(readId(city) ?? "")}</option>)}</select></Field>
        <Field label="Destination city"><select required value={form.destination_city_id || ""} onChange={event => setValue("destination_city_id", event.target.value)} className={inputClass} disabled={!lookups}><option value="">Select city</option>{lookups?.cities.map((city, index) => <option key={`${readId(city)}-${index}`} value={String(readId(city) ?? "")}>{String(readLabel(city))} · {String(readId(city) ?? "")}</option>)}</select></Field>
        {lookups && <p className="sm:col-span-2 -mt-2 text-[11px] text-slate-400">Lookup loaded: {lookups.cities.length} cities and {lookups.pickupAddresses.length} pickup addresses.</p>}
        <Field label="Shipping mode"><select required value={form.shipping_mode_id || "1"} onChange={event => setValue("shipping_mode_id", event.target.value)} className={inputClass}><option value="1">Rush</option><option value="2">Saver plus</option><option value="3">Swift</option><option value="4">Same day</option></select></Field>
        <Field label="Estimated weight (kg)" hint="Estimate only; not the final chargeable weight."><input type="number" min="0.01" step="any" required value={form.estimated_weight || ""} onChange={event => setValue("estimated_weight", event.target.value)} placeholder="e.g. 1.25" className={inputClass} /></Field>
        <Field label="Amount to collect (PKR)" hint="Whole number; enter no commas or decimals."><input type="number" min="0" step="1" required value={form.amount || ""} onChange={event => setValue("amount", event.target.value)} placeholder="0" className={inputClass} /></Field>
      </>}
      {action === "createReceivingSheet" && <div className="sm:col-span-2">
        <Field label="Shipment tracking numbers" hint="Select locally saved shipments or enter 1–100 numeric tracking numbers, separated by spaces, commas or new lines.">
          <textarea required rows={5} value={form.trackingNumbers || ""} onChange={event => setValue("trackingNumbers", event.target.value)} placeholder="Enter one numeric tracking number per line" className={inputClass} />
        </Field>
        {selectedOrders.length > 0 && <div className="mt-3 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Saved shipments · {month}</p><div className="grid gap-2 sm:grid-cols-2">{selectedOrders.map(order => {
          const checked = (form.trackingNumbers || "").split(/[\s,;]+/).includes(order.trackingNumber);
          return <label key={`sheet-${order.trackingNumber}`} className="flex min-w-0 items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={checked} onChange={event => {
            const current = (form.trackingNumbers || "").split(/[\s,;]+/).filter(Boolean);
            setValue("trackingNumbers", event.target.checked ? [...new Set([...current, order.trackingNumber])].join("\n") : current.filter(value => value !== order.trackingNumber).join("\n"));
          }} className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600" /><span className="truncate font-mono">{order.trackingNumber}</span><span className="truncate text-slate-400">{order.customerName || order.orderRefNumber || ""}</span></label>;
        })}</div></div>}
      </div>}
      {(action === "returnConfirmationPending" || action === "reattempt" || action === "interceptRebook") && <Field label="Remarks (optional)"><textarea rows={2} value={form.remarks || ""} onChange={event => setValue("remarks", event.target.value)} className={inputClass} placeholder="Add context for the request" /></Field>}
      {action === "interceptRebook" && <>
        <Field label="Consignee"><select value={form.consigneeType || "1"} onChange={event => setValue("consigneeType", event.target.value)} className={inputClass}><option value="1">Same consignee</option><option value="2">Different consignee</option></select></Field>
        <Field label="Consignee address"><input required value={form.consignee_address || ""} onChange={event => setValue("consignee_address", event.target.value)} className={inputClass} /></Field>
        <Field label="Primary phone number" hint="Digits only, 7–20 digits."><input required inputMode="numeric" pattern="[0-9]{7,20}" value={form.consignee_phone_number_1 || ""} onChange={event => setValue("consignee_phone_number_1", event.target.value)} className={inputClass} /></Field>
        {form.consigneeType === "2" && <>
          <Field label="Consignee name"><input required value={form.consignee_name || ""} onChange={event => setValue("consignee_name", event.target.value)} className={inputClass} /></Field>
          <Field label="City"><select required value={form.consignee_city_id || ""} onChange={event => setValue("consignee_city_id", event.target.value)} className={inputClass} disabled={!lookups}><option value="">Select city</option>{lookups?.cities.map((city, index) => <option key={`${readId(city)}-${index}`} value={String(readId(city) ?? "")}>{String(readLabel(city))}</option>)}</select></Field>
          <Field label="Amount to collect (PKR)"><input type="number" min="0" step="1" required value={form.amount || ""} onChange={event => setValue("amount", event.target.value)} className={inputClass} /></Field>
          <Field label="Secondary phone (optional)"><input inputMode="numeric" pattern="[0-9]{7,20}" value={form.consignee_phone_number_2 || ""} onChange={event => setValue("consignee_phone_number_2", event.target.value)} className={inputClass} /></Field>
        </>}
      </>}
      {(action === "crmComplaint" || action === "crmServiceRequest") && <>
        <Field label="Request category"><select required value={form.caseNatureTypeId || ""} onChange={event => setValue("caseNatureTypeId", event.target.value)} className={inputClass}><option value="">Choose documented category</option>{(action === "crmComplaint" ? complaintTypes : serviceTypes).map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}</select></Field>
        <Field label="Description"><textarea required rows={4} value={form.description || ""} onChange={event => setValue("description", event.target.value)} className={inputClass} placeholder="Describe the issue or requested service" /></Field>
      </>}
      {action === "crmClaim" && <>
        <Field label="Claim category (optional)"><select value={form.caseNatureTypeId || ""} onChange={event => setValue("caseNatureTypeId", event.target.value)} className={inputClass}><option value="">No category specified</option>{claimTypes.map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}</select></Field>
        <Field label="Product cost (PKR)"><input type="number" min="1" step="1" required value={form.product_cost || ""} onChange={event => setValue("product_cost", event.target.value)} className={inputClass} /></Field>
        <Field label="Damage product price (PKR)"><input type="number" min="0" step="1" required value={form.damage_product_price || "0"} onChange={event => setValue("damage_product_price", event.target.value)} className={inputClass} /></Field>
        <Field label="Missing product price (PKR)"><input type="number" min="0" step="1" required value={form.missing_product_price || "0"} onChange={event => setValue("missing_product_price", event.target.value)} className={inputClass} /></Field>
        <Field label="Claim description"><textarea required rows={3} value={form.description || ""} onChange={event => setValue("description", event.target.value)} className={inputClass} placeholder="Describe the claim" /></Field>
        <div className="sm:col-span-2"><p className="text-xs font-semibold text-slate-600">Supporting images <span className="font-normal text-slate-400">· optional JPEG or PNG, max 3 MB each</span></p><div className="mt-2 grid gap-3 sm:grid-cols-2">{claimImages.map(image => <label key={image.key} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-600"><span className="min-w-0 truncate">{claimFiles[image.key]?.fileName || image.label}</span><input type="file" accept="image/jpeg,image/png" className="max-w-40 text-[10px] file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1 file:font-semibold file:text-slate-600" onChange={event => void uploadImage(image.key, event.target.files?.[0])} /></label>)}</div></div>
      </>}
    </div>;
  };

  const file = useMemo(() => result ? extractFile((result as { result?: unknown }).result ?? result) : null, [result]);
  const fileUrl = useMemo(() => {
    if (!file) return "";
    try { return URL.createObjectURL(toBlob(file)); } catch { return ""; }
  }, [file]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  const fileName = file ? `${file.name}${file.name.includes(".") ? "" : file.contentType === "application/pdf" ? ".pdf" : file.contentType === "image/png" ? ".png" : ".jpg"}` : "";

  return <DashboardLayout>
    <div className="min-h-full bg-slate-50/70 p-4 sm:p-6 lg:p-9">
      <header className="mb-6 flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-end">
        <div>
          <Link href="/trax" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-sky-700"><ArrowLeft className="h-3.5 w-3.5" />TRAX workspace</Link>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700"><span className="h-2 w-2 rounded-full bg-sky-500" />Sonic operations</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Operations tools</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Run a specific TRAX operation for <span className="font-semibold text-slate-700">{selectedBrand?.name || "the selected brand"}</span>. Every submission is explicit; consequential requests pause for confirmation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><Clock3 className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-400" aria-label="Saved shipment date range month" /></label>
          <button onClick={() => void loadOrders()} disabled={ordersBusy || !selectedBrand} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-300 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${ordersBusy ? "animate-spin" : ""}`} />Reload options</button>
        </div>
      </header>

      {!selectedBrand && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Select a brand to load its TRAX workspace.</div>}
      {selectedBrand && !isReady && <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950"><Info className="mt-0.5 h-4 w-4 shrink-0" />TRAX is disabled or is not configured for this brand. Operations remain unavailable until the brand is enabled and connected.</div>}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Saved shipment options</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{ordersBusy ? "…" : orders.length}</p><p className="mt-1 text-xs text-slate-500">Local bookings · {month}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Action selected</p><p className="mt-2 text-lg font-bold text-slate-900">{selectedAction.label}</p><p className="mt-1 text-xs text-slate-500">{selectedAction.mutation ? "Confirmation required before submit" : "Manual submit only"}</p></div>
        <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">Execution boundary</p><p className="mt-2 text-sm font-semibold text-slate-900">No operation runs on page load.</p><p className="mt-1 text-xs leading-5 text-slate-600">Date range filters saved options only. Enter a numeric tracking number when needed.</p></div>
      </div>
      {(ordersError || lookupError) && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{ordersError || lookupError}{lookupError && <button type="button" onClick={() => { setLookups(null); void loadLookups(); }} className="ml-auto shrink-0 font-semibold underline">Retry lookup</button>}</div>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">01 / Configure</p><h2 className="mt-1 text-xl font-bold text-slate-950">Choose an operation</h2><p className="mt-1 text-sm text-slate-500">Inputs follow the documented TRAX operation fields.</p></div>
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 sm:flex"><selectedAction.icon className="h-5 w-5" /></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(Object.keys(sectionNames) as Section[]).map(section => <label key={section} className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{sectionNames[section]}</span><select value={actions.filter(item => item.section === section).some(item => item.id === action) ? action : ""} onChange={event => event.target.value && selectAction(event.target.value as ActionName)} className={inputClass.replace("mt-1.5", "mt-0")}><option value="" disabled>Select a tool</option>{actions.filter(item => item.section === section).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>)}
            </div>
          </div>
          <form onSubmit={submit} className="px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><selectedAction.icon className="h-4 w-4 text-sky-700" />{selectedAction.label}</p><p className="mt-1 pl-6 text-xs leading-5 text-slate-500">{selectedAction.description}</p>
              {selectedAction.mutation && <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"><ShieldAlert className="h-3.5 w-3.5 shrink-0" />This request changes shipment workflow or opens a courier case. Review it before confirming.</p>}
            </div>
            {renderFields()}
            {action === "createReceivingSheet" && <p className="mt-3 flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900"><Package className="mt-0.5 h-4 w-4 shrink-0" />Up to 100 shipment numbers belonging to this brand may be submitted. Receiving sheet creation is a courier-side action.</p>}
            <div className="mt-6 flex flex-col-reverse justify-between gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
              <p className="text-[11px] text-slate-400">Brand: <span className="font-semibold text-slate-600">{selectedBrand?.name || "Not selected"}</span></p>
              <button type="submit" disabled={!isReady || !selectedBrand || busy} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${selectedAction.mutation ? "bg-amber-700 text-white hover:bg-amber-800" : "bg-sky-700 text-white hover:bg-sky-800"}`}>
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : selectedAction.mutation ? <ShieldAlert className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {busy ? "Sending request…" : selectedAction.mutation ? "Review and submit" : "Run operation"}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">02 / Webhooks</p><h2 className="mt-1 text-lg font-bold text-slate-950">Subscription URLs</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Copy each URL into the matching subscription in the TRAX portal. Portal activation is a manual step; this dashboard does not register subscriptions.</p>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong>Publish before copying.</strong> Open this page on HubLogistic’s published HTTPS domain before adding callbacks in TRAX. Preview URLs are temporary; TRAX retries callbacks up to five times and may block a subscription after repeated failures.</span>
            </div>
            {webhookError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{webhookError}</p>}
            <div className="mt-4 space-y-2">
              {([["status", "Shipment status"], ["payment-status", "Payment status"], ["initial-charges", "Initial charges"], ["final-charges", "Final charges"]] as const).map(([key, title]) => <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-slate-800">{title}</p><button onClick={() => void copyWebhook(key, webhooks[key] || "")} disabled={!webhooks[key]} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 disabled:opacity-40">{copied === key ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}{copied === key ? "Copied" : "Copy"}</button></div>
                <p className="mt-2 break-all font-mono text-[10px] leading-4 text-slate-500">{!selectedBrand ? "Select a brand to load subscription URLs." : webhooks[key] || "Loading subscription URL…"}</p>
              </div>)}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">Keep these URLs private. Configure the callback in TRAX portal settings and confirm the subscription there.</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Handling the result</p>
            <ul className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span>Courier response and backend errors are shown below the form.</span></li>
              <li className="flex gap-2"><FileImage className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" /><span>Documents arrive as a file response; base64 content is kept out of the display.</span></li>
              <li className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>A submitted request is not confirmation of a final courier status.</span></li>
            </ul>
          </section>
        </aside>
      </div>

      {(error || result !== null) && <section className={`mt-5 overflow-hidden rounded-2xl border shadow-sm ${error ? "border-rose-200 bg-white" : "border-emerald-200 bg-white"}`}>
        <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${error ? "border-rose-100 bg-rose-50/70" : "border-emerald-100 bg-emerald-50/70"}`}>
          <div className="flex items-center gap-2">{error ? <AlertCircle className="h-4 w-4 text-rose-700" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}<div><h2 className="text-sm font-bold text-slate-900">{error ? "Operation error" : "Backend response"}</h2><p className="text-xs text-slate-500">{error ? "The request was not reported as successful." : `${selectedAction.label} · response returned by HubLogistic backend`}</p></div></div>
          <button onClick={() => { setError(""); setResult(null); }} className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Dismiss response"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          {error ? <p role="alert" className="text-sm leading-6 text-rose-800">{error}</p> : <>
            {result && (result as { action?: string }).action === "createReceivingSheet" && recentSheet && recentSheet.brandId === selectedBrand?.id && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
              <div className="mr-auto"><p className="text-sm font-semibold text-slate-800">Receiving sheet #{recentSheet.id} created</p><p className="text-xs leading-5 text-slate-500">Use a shipment from this sheet to open its document.</p></div>
              <button type="button" onClick={() => {
                if (!recentSheet) return;
                setAction("viewReceivingSheet");
                setForm({ receivingSheetId: recentSheet.id, trackingNumber: recentSheet.trackingNumbers[0] || "", type: "0" });
                setClaimFiles({});
                setError("");
              }} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Prepare sheet view</button>
            </div>}
            {file && fileUrl && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
              <div className="mr-auto flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-sky-700" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{fileName}</p><p className="text-[11px] text-slate-500">{file.contentType}</p></div></div>
              <a href={fileUrl} download={fileName} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-300"><Download className="h-3.5 w-3.5" />Download</a>
              <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Open file<ArrowUpRight className="h-3.5 w-3.5" /></a>
            </div>}
            {typeof result === "object" && result && "result" in result && typeof (result as { result?: unknown }).result === "string" && !(result as { result: string }).result.trim() && <p className="mb-2 text-xs text-slate-500">The operation completed with an empty response body.</p>}
            <pre className="max-h-[440px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{safeDisplay(result)}</pre>
            <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />For status-changing requests, this is the response to the submitted request; check tracking separately for the final courier state.</p>
          </>}
        </div>
      </section>}

      {confirmOpen && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><ShieldAlert className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Confirm courier action</p><h2 id="confirm-title" className="mt-1 text-lg font-bold text-slate-950">Submit {selectedAction.label.toLowerCase()}?</h2><p className="mt-2 text-sm leading-6 text-slate-600">This sends a request to TRAX for <strong>{selectedBrand?.name}</strong>. The request may not be reversible. A successful response indicates submission, not a completed courier status.</p></div></div>
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Go back</button><button type="button" onClick={() => void performOperation()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"><ShieldAlert className="h-4 w-4" />Confirm and submit</button></div>
        </section>
      </div>}
    </div>
  </DashboardLayout>;
}