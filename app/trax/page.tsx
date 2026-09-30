"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import OrdersTable from "@/components/OrdersTable";
import OrderCharts from "@/components/OrderCharts";
import CityStats from "@/components/CityStats";
import TraxBookingDialog from "@/components/TraxBookingDialog";
import { AlertCircle, Calendar, CheckCircle2, Clock3, Package, Plus, RefreshCw, Search, Truck, Wallet, Wrench } from "lucide-react";
import type { Order, PaymentStatus, TrackingStatus } from "@/lib/types";

type SavedRelation = { data?: string | Record<string, unknown> } | null;
type TraxOrder = Order & { trackingStatus?: SavedRelation; paymentStatus?: SavedRelation };
type TraxPayment = PaymentStatus & { trackingNumber: string };

const currency = (value: number) => `Rs. ${Math.round(value || 0).toLocaleString("en-PK")}`;
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const localMonth = () => localDate().slice(0, 7);
const statusOf = (order: Order, live?: TrackingStatus) => String(live?.currentStatus || order.lastStatus || order.transactionStatus || order.orderStatus || "").toLowerCase();
const isDelivered = (order: Order, live?: TrackingStatus) => {
  const status = statusOf(order, live);
  return (status.includes("deliver") || status.includes("completed")) && !status.includes("undelivered") && !status.includes("not delivered");
};
const isReturned = (order: Order, live?: TrackingStatus) => {
  const status = statusOf(order, live);
  return status.includes("return") || status === "rto";
};
const isCancelled = (order: Order, live?: TrackingStatus) => /cancel|void/.test(statusOf(order, live));

function parseSaved<T>(relation?: SavedRelation): T | null {
  if (!relation?.data) return null;
  try {
    return (typeof relation.data === "string" ? JSON.parse(relation.data) : relation.data) as T;
  } catch {
    return null;
  }
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export default function TraxPage() {
  const { selectedBrand } = useBrand();
  const [month, setMonth] = useState(localMonth);
  const [orders, setOrders] = useState<TraxOrder[]>([]);
  const [trackingStatuses, setTrackingStatuses] = useState<Record<string, TrackingStatus>>({});
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, TraxPayment>>({});
  const [loading, setLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importTrackingNumber, setImportTrackingNumber] = useState("");
  const [importDate, setImportDate] = useState(localDate);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const range = useMemo(() => monthRange(month), [month]);

  const loadOrders = useCallback(async () => {
    if (!selectedBrand) {
      setOrders([]);
      setTrackingStatuses({});
      setPaymentStatuses({});
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ brandId: selectedBrand.id, ...range });
      const response = await fetch(`/api/trax/orders?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load TRAX shipments");
      const nextOrders = (Array.isArray(data.dist) ? data.dist : []) as TraxOrder[];
      setOrders(nextOrders);
      const nextTracking: Record<string, TrackingStatus> = {};
      const nextPayments: Record<string, TraxPayment> = {};
      nextOrders.forEach(order => {
        const tracking = parseSaved<TrackingStatus>(order.trackingStatus);
        if (tracking?.trackingNumber) nextTracking[tracking.trackingNumber] = tracking;
        const payment = parseSaved<TraxPayment>(order.paymentStatus);
        if (payment?.trackingNumber) nextPayments[payment.trackingNumber] = payment;
      });
      setTrackingStatuses(nextTracking);
      setPaymentStatuses(nextPayments);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load TRAX shipments");
    } finally {
      setLoading(false);
    }
  }, [range, selectedBrand]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const refreshTracking = async (one?: string) => {
    if (!selectedBrand) return;
    const trackingNumbers = (one ? [one] : orders.map(order => order.trackingNumber))
      .filter((value): value is string => Boolean(value));
    if (!trackingNumbers.length) return;
    setTrackingLoading(true);
    setError("");
    setNotice("");
    try {
      const nextTracking: Record<string, TrackingStatus> = {};
      const nextPayments: Record<string, TraxPayment> = {};
      const errors: string[] = [];
      for (let offset = 0; offset < trackingNumbers.length; offset += 25) {
        const response = await fetch("/api/trax/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: selectedBrand.id, trackingNumbers: trackingNumbers.slice(offset, offset + 25) }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "TRAX tracking update failed");
        (data.results || []).forEach((result: TrackingStatus & { payment?: TraxPayment; error?: string; warning?: string }) => {
          if (result.error) errors.push(`${result.trackingNumber}: ${result.error}`);
          else {
            if (result.trackingNumber) nextTracking[result.trackingNumber] = result;
            if (result.payment?.trackingNumber) nextPayments[result.payment.trackingNumber] = result.payment;
            if (result.warning) errors.push(`${result.trackingNumber}: ${result.warning}`);
          }
        });
      }
      setTrackingStatuses(current => ({ ...current, ...nextTracking }));
      setPaymentStatuses(current => ({ ...current, ...nextPayments }));
      await loadOrders();
      if (errors.length) setError(errors.slice(0, 3).join(" · "));
      else setNotice(`Updated tracking and available payment details for ${Object.keys(nextTracking).length} shipments.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "TRAX tracking update failed");
    } finally {
      setTrackingLoading(false);
    }
  };

  const importExisting = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBrand) return;
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/trax/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrand.id, trackingNumber: importTrackingNumber, orderDate: importDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to add existing TRAX shipment");
      setShowImport(false);
      setImportTrackingNumber("");
      setNotice(data.warnings?.length ? `Shipment saved with detail warnings: ${data.warnings.join("; ")}` : data.message);
      await loadOrders();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add existing TRAX shipment");
    } finally {
      setImporting(false);
    }
  };

  const cities = useMemo(() => Array.from(new Set(orders.map(order => order.cityName || "Unknown"))).sort(), [orders]);
  const filtered = useMemo(() => orders.filter(order => {
    const tracking = trackingStatuses[order.trackingNumber];
    const query = [order.trackingNumber, order.orderRefNumber, order.customerName, order.customerPhone, order.cityName].join(" ").toLowerCase();
    if (search && !query.includes(search.toLowerCase())) return false;
    if (statusFilter === "delivered") return isDelivered(order, tracking);
    if (statusFilter === "returned") return isReturned(order, tracking);
    if (statusFilter === "cancelled") return isCancelled(order, tracking);
    if (statusFilter === "transit") return !isDelivered(order, tracking) && !isReturned(order, tracking) && !isCancelled(order, tracking);
    return true;
  }), [orders, search, statusFilter, trackingStatuses]);
  const stats = useMemo(() => ({
    total: orders.length,
    gross: orders.reduce((sum, order) => sum + Number(order.orderAmount || order.invoicePayment || 0), 0),
    delivered: orders.filter(order => isDelivered(order, trackingStatuses[order.trackingNumber])).length,
    returned: orders.filter(order => isReturned(order, trackingStatuses[order.trackingNumber])).length,
  }), [orders, trackingStatuses]);

  return <DashboardLayout>
    <div className="flex min-h-full flex-col gap-6 bg-slate-50/60 p-5 sm:p-6 lg:p-10">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 xl:flex-row xl:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700"><span className="h-2 w-2 rounded-full bg-sky-500" />Carrier operations</div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-950"><Truck className="h-8 w-8 text-sky-600" />TRAX Portal</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Book shipments, refresh tracking and review saved payment details for this brand.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/trax/tools" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700"><Wrench className="h-4 w-4" />Operations tools</Link>
          <Link href="/trax/payments" className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"><Wallet className="h-4 w-4" />Payments</Link>
          <button onClick={() => setShowImport(value => !value)} disabled={!selectedBrand?.traxEnabled} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Add existing</button>
          <button onClick={() => void refreshTracking()} disabled={!orders.length || loading || trackingLoading || !selectedBrand?.traxEnabled} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${trackingLoading ? "animate-spin" : ""}`} />{trackingLoading ? "Refreshing…" : "Update tracking"}</button>
          <button onClick={() => setBookingOpen(true)} disabled={!selectedBrand?.traxEnabled} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"><Package className="h-4 w-4" />Book shipment</button>
        </div>
      </header>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
        The TRAX guide does not document shipment history by date. This view lists shipments booked here or added by a known tracking number; the date for an added shipment is entered by you.
      </div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
      {selectedBrand && (!selectedBrand.traxEnabled || !selectedBrand.courierCredentials?.trax) && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">TRAX is disabled or not configured for this brand. Add its key and enable it in <Link href="/settings" className="font-semibold underline">Settings</Link>.</div>}

      {showImport && <form onSubmit={importExisting} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Existing TRAX tracking number</span><input value={importTrackingNumber} onChange={event => setImportTrackingNumber(event.target.value)} inputMode="numeric" pattern="[0-9]{3,40}" required placeholder="Numeric tracking number" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Original booking date</span><input type="date" value={importDate} onChange={event => setImportDate(event.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400" /></label>
        <button type="submit" disabled={importing} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Lookup and save</button>
        <p className="text-xs text-slate-500 sm:col-span-3">TRAX can return live details for a known tracking number, but its guide does not provide a historical shipment-list endpoint.</p>
      </form>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["Shipments", stats.total, Package],
          ["Shipment value", currency(stats.gross), Wallet],
          ["Delivered", stats.delivered, CheckCircle2],
          ["Returned", stats.returned, Clock3],
        ] as const).map(([label, value, Icon]) => <section key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}<Icon className="h-4 w-4 text-sky-600" /></div><p className="mt-3 text-xl font-bold tabular-nums text-slate-950 sm:text-2xl">{value}</p></section>)}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <aside className="space-y-5 lg:col-span-1">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Search className="h-4 w-4 text-sky-600" />Shipment filters</h2>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Month</span><span className="relative block"><Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm outline-none focus:border-sky-400" /></span></label>
              <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tracking, order, customer" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400" /></label>
              <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400"><option value="all">All statuses</option><option value="delivered">Delivered</option><option value="transit">In transit / other</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option></select></label>
              <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">Showing {filtered.length} of {orders.length} saved shipments · local data</p>
            </div>
          </section>
          <CityStats orders={filtered} trackingStatuses={trackingStatuses} />
        </aside>
        <main className="min-w-0 space-y-6 lg:col-span-3">
          {orders.length > 0 ? <>
            <OrderCharts orders={filtered} trackingStatuses={trackingStatuses} courier="TRAX" earningsFallbackToOrderAmount />
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <OrdersTable courier="TRAX" orders={filtered} trackingStatuses={trackingStatuses} paymentStatuses={paymentStatuses}
                loading={loading} refreshTracking={(trackingNumber) => void refreshTracking(trackingNumber)} />
            </div>
          </> : <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <Package className="mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold text-slate-700">{loading ? "Loading saved shipments…" : "No TRAX shipments for this month"}</p>
            <p className="mt-1 max-w-lg text-sm text-slate-500">{loading ? "Reading this brand’s local TRAX records." : "Book a new shipment, add a known tracking number, or select another month."}</p>
            {!loading && <div className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={() => setBookingOpen(true)} disabled={!selectedBrand?.traxEnabled} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Book shipment</button><button onClick={() => setShowImport(true)} disabled={!selectedBrand?.traxEnabled} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Add existing</button></div>}
          </div>}
        </main>
      </div>
    </div>
    {bookingOpen && selectedBrand && <TraxBookingDialog brandId={selectedBrand.id} onClose={() => setBookingOpen(false)} onBooked={async (trackingNumber) => {
      setBookingOpen(false);
      setNotice(`TRAX booking saved. Tracking number: ${trackingNumber}`);
      await loadOrders();
    }} />}
  </DashboardLayout>;
}