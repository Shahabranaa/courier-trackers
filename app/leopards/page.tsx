"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import OrdersTable from "@/components/OrdersTable";
import OrderCharts from "@/components/OrderCharts";
import CityStats from "@/components/CityStats";
import { AlertCircle, Calendar, Download, Filter, Package, RefreshCw, Search, Truck, Wallet, type LucideIcon } from "lucide-react";
import type { Order, PaymentStatus, TrackingStatus } from "@/lib/types";

type LeopardsPayment = PaymentStatus & {
  trackingNumber: string;
  paymentStatus?: string;
};

const statusText = (o: Order) => String(o.lastStatus || o.transactionStatus || o.orderStatus || "").toLowerCase();
const delivered = (o: Order) => /\bdeliver(ed|y)?\b|\bok\b|\bcompleted\b/.test(statusText(o)) && !/not delivered|undelivered/.test(statusText(o));
const returned = (o: Order) => /\breturn|\brto\b|\bro\b|\brs\b/.test(statusText(o));
const cancelled = (o: Order) => /\bcancel|void/.test(statusText(o));
const money = (value: number) => `Rs. ${Math.round(value || 0).toLocaleString("en-PK")}`;

export default function LeopardsPage() {
  const { selectedBrand } = useBrand();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); });
  const [orders, setOrders] = useState<Order[]>([]);
  const [tracking, setTracking] = useState<Record<string, TrackingStatus>>({});
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, LeopardsPayment>>({});
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [source, setSource] = useState("local");
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const [year, m] = month.split("-").map(Number);
    return { startDate: `${month}-01`, endDate: `${month}-${String(new Date(year, m, 0).getDate()).padStart(2, "0")}` };
  }, [month]);
  const loadPayments = useCallback(async (force = false) => {
    if (!selectedBrand) return;
    const params = new URLSearchParams({ brandId: selectedBrand.id, ...range });
    if (force) params.set("force", "true");
    const response = await fetch(`/api/leopards/payments?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load Leopards payments");
    const next: Record<string, LeopardsPayment> = {};
    (data.payments || []).forEach((payment: LeopardsPayment) => {
      if (payment.trackingNumber) next[payment.trackingNumber] = payment;
    });
    setPaymentStatuses(next);
  }, [range, selectedBrand]);

  const loadOrders = useCallback(async (force = false) => {
    if (!selectedBrand) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ brandId: selectedBrand.id, ...range });
      if (force) params.set("force", "true");
      const response = await fetch(`/api/leopards/orders?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load Leopards orders");
      let nextOrders = data.dist || [];
      setOrders(nextOrders); setSource(data.source || "local");
      const saved: Record<string, TrackingStatus> = {};
      (data.dist || []).forEach((order: Order & { trackingStatus?: { data?: string | TrackingStatus } }) => {
        try { const parsed = typeof order.trackingStatus?.data === "string" ? JSON.parse(order.trackingStatus.data) : order.trackingStatus?.data; if (parsed?.trackingNumber) saved[parsed.trackingNumber] = parsed; } catch {}
      });
      setTracking(previous => ({ ...previous, ...saved }));
      await loadPayments(force);
      if (force) {
        const trackingNumbers = nextOrders.map((order: Order) => order.trackingNumber).filter(Boolean);
        if (trackingNumbers.length) {
          setTrackingLoading(true);
          const trackingResponse = await fetch("/api/leopards/track/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackingNumbers, brandId: selectedBrand.id }),
          });
          const trackingResults = await trackingResponse.json();
          if (!trackingResponse.ok) throw new Error(trackingResults.error || "Tracking update failed");
          const nextTracking: Record<string, TrackingStatus> = {};
          (trackingResults as TrackingStatus[]).forEach(item => {
            if (item?.trackingNumber) nextTracking[item.trackingNumber] = item;
          });
          setTracking(previous => ({ ...previous, ...nextTracking }));
        }
        const refreshed = await fetch(`/api/leopards/orders?${new URLSearchParams({ brandId: selectedBrand.id, ...range })}`);
        const refreshedData = await refreshed.json();
        if (refreshed.ok) {
          nextOrders = refreshedData.dist || nextOrders;
          setOrders(nextOrders);
        }
      }
      if (data.error) setError(data.error);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load Leopards orders"); }
    finally { setLoading(false); setTrackingLoading(false); }
  }, [loadPayments, range, selectedBrand]);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  const refreshTracking = async (one?: string) => {
    const trackingNumbers = one ? [one] : orders.map(o => o.trackingNumber).filter(Boolean);
    if (!trackingNumbers.length) return;
    setTrackingLoading(true); setError(null);
    try {
      const response = await fetch("/api/leopards/track/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackingNumbers, brandId: selectedBrand?.id }) });
      const results = await response.json();
      if (!response.ok) throw new Error(results.error || "Tracking update failed");
      const next: Record<string, TrackingStatus> = {};
      (results as TrackingStatus[]).forEach(item => { if (item?.trackingNumber) next[item.trackingNumber] = item; });
      setTracking(previous => ({ ...previous, ...next }));
      await loadOrders();
    } catch (err) { setError(err instanceof Error ? err.message : "Tracking update failed"); }
    finally { setTrackingLoading(false); }
  };

  const cities = useMemo(() => Array.from(new Set(orders.map(o => o.cityName || "Unknown"))).sort(), [orders]);
  const filtered = useMemo(() => orders.filter(o => {
    const text = [o.trackingNumber, o.orderRefNumber, o.customerName, o.customerPhone, o.cityName].join(" ").toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;
    if (city && (o.cityName || "Unknown") !== city) return false;
    if (status === "delivered") return delivered(o);
    if (status === "returned") return returned(o);
    if (status === "cancelled") return cancelled(o);
    if (status === "transit") return !delivered(o) && !returned(o) && !cancelled(o);
    return true;
  }), [orders, search, city, status]);
  const chartOrders = useMemo(() => filtered.map(order => {
    const payment = paymentStatuses[order.trackingNumber];
    const codAmount = typeof payment?.codAmount === "number" ? payment.codAmount : null;
    const grossCharges = typeof payment?.grossCharges === "number" ? payment.grossCharges : null;
    if (grossCharges === null) return { ...order, netAmount: 0 };
    return {
      ...order,
      netAmount: returned(order)
        ? -grossCharges
        : codAmount !== null ? codAmount - grossCharges : 0,
    };
  }), [filtered, paymentStatuses]);
  const stats = useMemo(() => ({ total: orders.length, cod: orders.reduce((s, o) => s + Number(o.orderAmount || o.invoicePayment || 0), 0), delivered: orders.filter(delivered).length, returned: orders.filter(returned).length }), [orders]);
  const exportCsv = () => {
    const rows = filtered.map(o => [o.orderDate, o.trackingNumber, o.orderRefNumber, o.customerName, o.customerPhone, o.cityName, o.deliveryAddress, o.orderAmount || o.invoicePayment, o.transactionFee, o.transactionTax, o.netAmount, o.lastStatus || o.transactionStatus || o.orderStatus]);
    const csv = [["Booking date", "Tracking", "Reference", "Customer", "Phone", "City", "Address", "COD", "Fee", "Tax", "Net", "Status"], ...rows].map(row => row.map(v => `"${String(v ?? "").replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = `leopards_orders_${month}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <DashboardLayout><div className="flex flex-col gap-6 bg-slate-50/60 p-6 lg:p-10">
    <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end">
      <div><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />Carrier operations</div><h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-950"><Truck className="h-8 w-8 text-rose-600" />Leopards Portal</h1><p className="mt-2 max-w-xl text-sm text-slate-500">Shipment performance, live movement, and COD settlement in one operating view.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/leopards/payments" data-testid="link-leopards-payments" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"><Wallet className="h-4 w-4" />Payments</Link><button data-testid="button-update-leopards-tracking" onClick={() => refreshTracking()} disabled={trackingLoading || loading || !orders.length} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:text-rose-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${trackingLoading ? "animate-spin" : ""}`} />Update tracking</button><button data-testid="button-sync-leopards" onClick={() => loadOrders(true)} disabled={loading || trackingLoading || !selectedBrand?.leopardsEnabled} className="flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 active:scale-[0.98] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Syncing orders, payments & tracking…" : "Sync live data"}</button></div>
    </header>
    {error && <div data-testid="status-leopards-error" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>}
    {!selectedBrand?.leopardsEnabled && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Leopards is not enabled for this brand. <Link href="/settings" className="font-semibold underline">Configure credentials in Settings</Link> to use live sync.</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([["Shipments", stats.total, Package], ["COD value", money(stats.cod), Wallet], ["Delivered", stats.delivered, Truck], ["Returns", stats.returned, RefreshCw]] as [string, string | number, LucideIcon][]).map(([label, value, Icon]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}<Icon className="h-4 w-4 text-rose-600" /></div><p className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{value}</p></div>)}</div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      <aside className="space-y-5 lg:col-span-1"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Filter className="h-4 w-4 text-rose-600" />Filters</h2><div className="mt-5 space-y-4"><label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Month</span><span className="relative block"><Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input data-testid="input-leopards-month" type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100" /></span></label><label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Search</span><span className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input data-testid="input-leopards-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tracking, ref, customer" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100" /></span></label><label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">City</span><select data-testid="select-leopards-city" value={city} onChange={e => setCity(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-rose-400"><option value="">All cities</option>{cities.map(c => <option key={c}>{c}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Shipment status</span><select data-testid="select-leopards-status" value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-rose-400"><option value="all">All statuses</option><option value="delivered">Delivered</option><option value="transit">In transit</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option></select></label><button data-testid="button-export-leopards-csv" onClick={exportCsv} disabled={!filtered.length} className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button></div><p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">Showing {filtered.length} of {orders.length} shipments<br />{source === "live" ? "Live sync data" : "Saved data"}</p></section><CityStats orders={filtered} trackingStatuses={tracking} /></aside>
      <main className="min-w-0 space-y-6 lg:col-span-3"><section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-rose-700 via-rose-600 to-orange-500 p-6 text-white shadow-lg"><div className="relative z-10"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-100">Monthly operations snapshot</p><h2 className="mt-1 text-xl font-bold">{new Date(`${month}-01`).toLocaleString("en", { month: "long", year: "numeric" })}</h2><div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4"><div><p className="text-[11px] uppercase tracking-wider text-rose-100">Gross COD</p><p className="mt-1 text-xl font-bold tabular-nums">{money(stats.cod)}</p></div><div><p className="text-[11px] uppercase tracking-wider text-rose-100">Delivered</p><p className="mt-1 text-xl font-bold tabular-nums">{stats.delivered}</p></div><div><p className="text-[11px] uppercase tracking-wider text-rose-100">Returns</p><p className="mt-1 text-xl font-bold tabular-nums">{stats.returned}</p></div><div><p className="text-[11px] uppercase tracking-wider text-rose-100">Delivery rate</p><p className="mt-1 text-xl font-bold tabular-nums">{stats.total ? `${((stats.delivered / stats.total) * 100).toFixed(1)}%` : "—"}</p></div></div></div><div className="absolute -right-10 -top-16 h-48 w-48 rounded-full border-[24px] border-white/10" /></section>{orders.length > 0 ? <><OrderCharts orders={chartOrders} trackingStatuses={tracking} /><div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><OrdersTable courier="Leopards" orders={filtered} trackingStatuses={tracking} paymentStatuses={paymentStatuses} loading={loading} refreshTracking={(number) => refreshTracking(number)} /></div></> : <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center"><Package className="mb-3 h-10 w-10 text-slate-300" /><p className="font-semibold text-slate-700">{loading ? "Loading shipment records" : "No shipments for this selection"}</p><p className="mt-1 text-sm text-slate-400">{loading ? "Retrieving saved Leopards data…" : "Choose another month or sync live data to continue."}</p></div>}</main>
    </div>
  </div></DashboardLayout>;
}