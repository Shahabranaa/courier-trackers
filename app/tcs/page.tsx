"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import OrdersTable from "@/components/OrdersTable";
import OrderCharts from "@/components/OrderCharts";
import CityStats from "@/components/CityStats";
import SyncToast from "@/components/SyncToast";
import { AlertCircle, Calendar, Download, Filter, RefreshCw, Search, Truck } from "lucide-react";
import { useBrand } from "@/components/providers/BrandContext";
import { Order, PaymentStatus, TrackingStatus } from "@/lib/types";

interface SyncSummary {
  totalFetched: number;
  newOrders: number;
  newDelivered: number;
  newReturned: number;
  statusChanged: number;
}

const isDeliveredStatus = (status: string) => {
  const normalized = status.toLowerCase();
  return normalized === "delivered" || normalized.startsWith("delivered ") || normalized === "ok";
};

const isReturnStatus = (status: string) => {
  const normalized = status.toLowerCase();
  return normalized.includes("return") || ["ro", "rs"].includes(normalized);
};

export default function TcsDashboard() {
  const { selectedBrand } = useBrand();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [trackingProgress, setTrackingProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCity, setSelectedCity] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [trackingStatuses, setTrackingStatuses] = useState<Record<string, TrackingStatus | null>>({});
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus | null>>({});
  const customerNumber = selectedBrand?.tcsCustomerNumber?.trim() || "";

  const dateRange = useCallback(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return { startDate: `${selectedMonth}-01`, endDate: `${selectedMonth}-${String(lastDay).padStart(2, "0")}` };
  }, [selectedMonth]);

  const loadOrders = useCallback(async (force = false) => {
    if (!selectedBrand) return;
    setLoading(true); setError(null);
    try {
      const range = dateRange();
      const params = new URLSearchParams({ brandId: selectedBrand.id, ...range });
      if (force) {
        params.set("force", "true");
      }
      const response = await fetch(`/api/tcs/orders?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load TCS orders");
      const nextOrders = data.dist || [];
      setOrders(nextOrders);
      const savedStatuses: Record<string, TrackingStatus> = {};
      nextOrders.forEach((order: Order & { trackingStatus?: { data?: string | TrackingStatus } }) => {
        const saved = order.trackingStatus?.data;
        if (!saved) return;
        try {
          const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
          if (parsed?.trackingNumber) savedStatuses[parsed.trackingNumber] = parsed;
        } catch {
          // Legacy tracking rows may not contain valid JSON.
        }
      });
      setTrackingStatuses((previous) => ({ ...previous, ...savedStatuses }));
      if (data.error) setError(`Warning: ${data.error}`);
      if (data.syncSummary) setSyncSummary(data.syncSummary);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load orders"); }
    finally { setLoading(false); }
  }, [selectedBrand, dateRange]);

  useEffect(() => { loadOrders(false); }, [selectedBrand, selectedMonth, loadOrders]);

  const refreshTracking = async (singleTracking?: string) => {
    const trackingNumbers = singleTracking ? [singleTracking] : orders.map((order) => order.trackingNumber);
    if (!trackingNumbers.length) return;
    setStatusLoading(true);
    setTrackingProgress({ completed: 0, total: trackingNumbers.length });
    setError(null);
    try {
      const batchSize = 50;
      for (let index = 0; index < trackingNumbers.length; index += batchSize) {
        const batch = trackingNumbers.slice(index, index + batchSize);
        const response = await fetch("/api/tcs/track/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackingNumbers: batch, brandId: selectedBrand?.id }),
        });
        const statuses = await response.json();
        if (!response.ok) throw new Error(statuses.error || "Status refresh failed");
        setTrackingStatuses((previous) => {
          const next = { ...previous };
          statuses.forEach((status: TrackingStatus) => { next[status.trackingNumber] = status; });
          return next;
        });
        if (customerNumber) {
          const payments = await Promise.all(batch.map(async (trackingNumber) => {
            const result = await fetch(`/api/tcs/payment-status?trackingNumber=${encodeURIComponent(trackingNumber)}&brandId=${encodeURIComponent(selectedBrand?.id || "")}`);
            return result.ok ? result.json() : null;
          }));
          setPaymentStatuses((previous) => {
            const next = { ...previous };
            payments.forEach((payment) => { if (payment?.trackingNumber) next[payment.trackingNumber] = payment; });
            return next;
          });
        }
        setTrackingProgress({ completed: Math.min(index + batch.length, trackingNumbers.length), total: trackingNumbers.length });
      }
      await loadOrders(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Status refresh failed"); }
    finally { setStatusLoading(false); }
  };

  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (selectedCity && (order.cityName || "Unknown") !== selectedCity) return false;
    const q = searchQuery.toLowerCase().trim();
    return !q || [order.customerName, order.trackingNumber, order.orderRefNumber, order.customerPhone, order.cityName].join(" ").toLowerCase().includes(q);
  }), [orders, selectedCity, searchQuery]);
  const cityCounts = useMemo(() => orders.reduce((acc, order) => {
    const city = order.cityName || "Unknown"; acc[city] = (acc[city] || 0) + 1; return acc;
  }, {} as Record<string, number>), [orders]);
  const uniqueCities = Object.keys(cityCounts).sort();
  const stats = useMemo(() => ({
    count: orders.length,
    revenue: orders.reduce((sum, order) => sum + (order.orderAmount || order.invoicePayment || 0), 0),
    net: orders.reduce((sum, order) => sum + (order.netAmount || 0), 0),
    delivered: orders.filter((order) => isDeliveredStatus(order.transactionStatus || "")).length,
    returned: orders.filter((order) => isReturnStatus(order.transactionStatus || "")).length,
  }), [orders]);

  const downloadCSV = () => {
    const rows = filteredOrders.map((o) => [o.orderDate, o.orderRefNumber, o.trackingNumber, o.customerName, o.customerPhone, o.cityName, o.orderAmount, o.transactionStatus]);
    const csv = [["Date", "Ref", "Tracking", "Customer", "Phone", "City", "Amount", "Status"], ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `tcs_orders_${selectedMonth}.csv`; link.click();
  };

  return (
    <DashboardLayout>
      <SyncToast summary={syncSummary} onClose={() => setSyncSummary(null)} courier="TCS" />
      <div className="flex flex-col gap-6 p-6 lg:p-10">
        <div className="flex flex-col justify-between gap-6 border-b border-gray-200 pb-6 lg:flex-row lg:items-center">
          <div><h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900"><Truck className="h-8 w-8 text-red-600" />TCS Portal</h1><p className="mt-2 text-gray-500">Management dashboard for TCS shipments</p></div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => refreshTracking()} disabled={statusLoading || !orders.length} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />{statusLoading ? `Tracking ${trackingProgress.completed}/${trackingProgress.total}` : "Update Status"}</button>
            <button onClick={() => loadOrders(true)} disabled={loading || !selectedBrand || !customerNumber} className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-red-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Syncing..." : "Sync Live Data"}</button>
          </div>
        </div>
        {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <aside className="space-y-6 lg:col-span-1">
            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-bold text-gray-900"><Filter className="h-4 w-4 text-gray-400" />Filters</h3>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"><span className="block text-xs font-semibold uppercase text-gray-500">TCS Customer Number</span><p className="mt-1 font-mono text-sm text-gray-800">{customerNumber || "Not configured"}</p><a href="/settings" className="mt-1 inline-block text-xs font-medium text-red-600 hover:underline">{customerNumber ? "Update in Settings" : "Configure in Settings"}</a></div>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Search</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Name, tracking, ref…" className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-red-400" /></div></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Month</span><div className="relative"><Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-red-400" /></div></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">City</span><select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"><option value="">All Cities ({orders.length})</option>{uniqueCities.map((city) => <option key={city} value={city}>{city} ({cityCounts[city]})</option>)}</select></label>
              <button onClick={downloadCSV} disabled={!filteredOrders.length} className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button>
            </div>
            {!!filteredOrders.length && <CityStats orders={filteredOrders} trackingStatuses={trackingStatuses} />}
          </aside>
          <main className="space-y-6 lg:col-span-3">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 to-red-700 p-6 text-white shadow-lg">
              <h3 className="flex items-center gap-2 text-lg font-bold"><Calendar className="h-5 w-5 text-red-200" />Monthly Snapshot: {new Date(`${selectedMonth}-01`).toLocaleString("default", { month: "long", year: "numeric" })}</h3>
              <div className="mt-4 flex flex-wrap gap-8 text-red-100"><div><p className="text-xs font-bold uppercase opacity-70">Total Orders</p><p className="mt-1 text-2xl font-bold">{stats.count}</p></div><div><p className="text-xs font-bold uppercase opacity-70">Revenue</p><p className="mt-1 text-2xl font-bold">Rs. {stats.revenue.toLocaleString()}</p></div><div><p className="text-xs font-bold uppercase opacity-70">Delivered</p><p className="mt-1 text-2xl font-bold text-emerald-100">{stats.delivered}</p></div><div><p className="text-xs font-bold uppercase opacity-70">Returned</p><p className="mt-1 text-2xl font-bold text-amber-100">{stats.returned}</p></div></div>
            </div>
            {orders.length ? <><OrderCharts orders={filteredOrders} trackingStatuses={trackingStatuses} courier="TCS" /><OrdersTable orders={filteredOrders} trackingStatuses={trackingStatuses} paymentStatuses={paymentStatuses} loading={loading} refreshTracking={refreshTracking} courier="TCS" /></> : <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-gray-400"><Truck className="mb-3 h-12 w-12 text-gray-200" /><p>No TCS orders found.</p><p className="mt-1 text-sm">Configure TCS in Settings, then sync live data.</p></div>}
          </main>
        </div>
      </div>
    </DashboardLayout>
  );
}