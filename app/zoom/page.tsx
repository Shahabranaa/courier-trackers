"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
    AlertCircle,
    Calendar,
    CheckCircle,
    Clock,
    Download,
    Filter,
    Package,
    RefreshCw,
    Search,
    Truck,
    X,
    Zap,
} from "lucide-react";
import { useBrand } from "@/components/providers/BrandContext";
import type { ZoomOrder, ZoomTrackingEvent } from "@/lib/zoom";

type TrackingDetail = {
    trackingNumber: string;
    currentStatus: string;
    trackingHistory: ZoomTrackingEvent[];
};

type CatalogSummary = {
    cities: number;
    statuses: number;
    products: number;
    services: number;
};

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

function formatRs(value: number) {
    return `Rs. ${Math.round(value).toLocaleString()}`;
}

function orderDateValue(value: string) {
    return new Date(value.replace(" ", "T"));
}

export default function ZoomPortal() {
    const { selectedBrand } = useBrand();
    const [orders, setOrders] = useState<ZoomOrder[]>([]);
    const [apiCount, setApiCount] = useState(0);
    const [catalog, setCatalog] = useState<CatalogSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedCity, setSelectedCity] = useState("");
    const [search, setSearch] = useState("");
    const [trackingModal, setTrackingModal] = useState<TrackingDetail | null>(null);
    const [trackingLoading, setTrackingLoading] = useState<string | null>(null);
    const [trackingError, setTrackingError] = useState<string | null>(null);

    const getDateRange = () => {
        const [year, month] = selectedMonth.split("-").map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        return {
            startDate: `${year}-${String(month).padStart(2, "0")}-01`,
            endDate: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
        };
    };

    const loadCatalog = async () => {
        if (!selectedBrand) return;
        try {
            const response = await fetch("/api/zoom/catalog", {
                headers: { "brand-id": selectedBrand.id },
            });
            if (!response.ok) return;
            const data = await response.json();
            const productData = data.products?.products;
            const serviceData = data.products?.services;
            setCatalog({
                cities: data.cities?.length || 0,
                statuses: data.statuses?.length || 0,
                products: Array.isArray(productData) ? productData.length : 0,
                services: Array.isArray(serviceData) ? serviceData.length : 0,
            });
        } catch {
            setCatalog(null);
        }
    };

    const loadOrders = async () => {
        if (!selectedBrand) return;
        setLoading(true);
        setError(null);
        setNotice(null);
        try {
            const { startDate, endDate } = getDateRange();
            const response = await fetch(`/api/zoom/orders?startDate=${startDate}&endDate=${endDate}`, {
                headers: { "brand-id": selectedBrand.id },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Failed to load Zoom orders");
            setOrders(Array.isArray(data.orders) ? data.orders : []);
            setApiCount(Number(data.apiCount) || 0);
        } catch (err: any) {
            setError(err.message || "Failed to load Zoom orders");
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    const syncOrders = async () => {
        if (!selectedBrand) return;
        setSyncing(true);
        setError(null);
        setNotice(null);
        try {
            const response = await fetch("/api/zoom/sync", {
                method: "POST",
                headers: { "brand-id": selectedBrand.id },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Failed to sync Zoom orders");
            setNotice(`${data.synced || 0} Zoom orders saved to the dashboard.`);
            await loadOrders();
        } catch (err: any) {
            setError(err.message || "Failed to sync Zoom orders");
        } finally {
            setSyncing(false);
        }
    };

    const fetchTracking = async (trackingNumber: string) => {
        if (!selectedBrand) return;
        setTrackingLoading(trackingNumber);
        setTrackingError(null);
        setTrackingModal({ trackingNumber, currentStatus: "Loading...", trackingHistory: [] });
        try {
            const response = await fetch(`/api/zoom/track?trackingNumber=${encodeURIComponent(trackingNumber)}`, {
                headers: { "brand-id": selectedBrand.id },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Failed to fetch tracking");
            setTrackingModal(data);
        } catch (err: any) {
            setTrackingError(err.message || "Failed to fetch tracking");
        } finally {
            setTrackingLoading(null);
        }
    };

    useEffect(() => {
        if (!selectedBrand) {
            setOrders([]);
            setApiCount(0);
            return;
        }
        void loadOrders();
        void loadCatalog();
    }, [selectedBrand, selectedMonth]);

    const { cityCounts, uniqueCities } = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const order of orders) {
            const city = order.destination || "Unknown";
            counts[city] = (counts[city] || 0) + 1;
        }
        return { cityCounts: counts, uniqueCities: Object.keys(counts).sort() };
    }, [orders]);

    const filteredOrders = useMemo(() => {
        const query = search.trim().toLowerCase();
        return orders.filter(order => {
            if (selectedCity && (order.destination || "Unknown") !== selectedCity) return false;
            if (!query) return true;
            return [
                order.trackingNumber,
                order.orderId,
                order.receiverName,
                order.receiverPhone,
                order.destination,
                order.status,
            ].some(value => value.toLowerCase().includes(query));
        });
    }, [orders, search, selectedCity]);

    const monthlyStats = useMemo(() => {
        const stats = {
            count: orders.length,
            cod: 0,
            deliveryCharges: 0,
            delivered: 0,
            returned: 0,
            pending: 0,
            net: 0,
        };
        for (const order of orders) {
            stats.cod += order.collectionAmount;
            stats.deliveryCharges += order.deliveryCharges;
            if (isDelivered(order.status)) {
                stats.delivered++;
                stats.net += order.collectionAmount - order.deliveryCharges;
            } else if (isReturned(order.status)) {
                stats.returned++;
                stats.net -= order.deliveryCharges;
            } else {
                stats.pending++;
            }
        }
        return stats;
    }, [orders]);

    const cityDeliveryStats = useMemo(() => {
        const cityData: Record<string, { total: number; delivered: number }> = {};
        for (const order of filteredOrders) {
            const city = order.destination || "Unknown";
            cityData[city] ||= { total: 0, delivered: 0 };
            cityData[city].total++;
            if (isDelivered(order.status)) cityData[city].delivered++;
        }
        return Object.entries(cityData)
            .map(([city, data]) => ({
                city,
                total: data.total,
                delivered: data.delivered,
                rate: data.total ? (data.delivered / data.total) * 100 : 0,
            }))
            .sort((a, b) => b.total - a.total);
    }, [filteredOrders]);

    const downloadCSV = () => {
        if (!filteredOrders.length) return;
        const headers = [
            "Order date", "Order ID", "Tracking", "Origin", "Destination", "Receiver",
            "Receiver phone", "COD amount", "Delivery charges", "Weight", "Quantity",
            "Payment status", "Status", "Status date", "Product", "Instruction",
        ];
        const rows = filteredOrders.map(order => [
            order.orderDate, order.orderId, order.trackingNumber, order.origin, order.destination,
            order.receiverName, order.receiverPhone, order.collectionAmount, order.deliveryCharges,
            order.weight, order.quantity, order.paymentStatus, order.status, order.statusDate,
            order.productDescription, order.specialInstruction,
        ]);
        const csv = [headers, ...rows]
            .map(row => row.map(value => `"${String(value ?? "").replace(/"/g, "\"\"")}"`).join(","))
            .join("\n");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        link.download = `zoom_orders_${selectedMonth}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 p-6 lg:p-10">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <Zap className="w-8 h-8 text-blue-600" />
                            Zoom Courier Portal
                        </h1>
                        <p className="text-gray-500 mt-2">Live orders and tracking from the Zoom COD API</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button onClick={loadOrders} disabled={loading || !selectedBrand} className="border border-blue-200 text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            {loading ? "Loading..." : "Refresh API"}
                        </button>
                        <button onClick={syncOrders} disabled={syncing || !selectedBrand} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md flex items-center gap-2 disabled:opacity-50">
                            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                            {syncing ? "Syncing..." : "Sync to Dashboard"}
                        </button>
                    </div>
                </div>

                {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2"><AlertCircle className="w-5 h-5" /><span>{error}</span></div>}
                {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2"><CheckCircle className="w-5 h-5" /><span>{notice}</span></div>}
                {!selectedBrand && <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl">Please select a brand to view Zoom orders.</div>}

                <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                    <Metric label="This month" value={monthlyStats.count.toLocaleString()} icon={<Package className="w-4 h-4" />} />
                    <Metric label="COD amount" value={formatRs(monthlyStats.cod)} />
                    <Metric label="Delivery charges" value={formatRs(monthlyStats.deliveryCharges)} />
                    <Metric label="Delivered" value={monthlyStats.delivered.toLocaleString()} tone="green" />
                    <Metric label="Returned" value={monthlyStats.returned.toLocaleString()} tone="red" />
                    <Metric label="Pending" value={monthlyStats.pending.toLocaleString()} tone="amber" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Filter className="w-4 h-4 text-gray-400" /> Filters</h3>
                            <label className="block text-xs font-semibold text-gray-500 uppercase">
                                Month
                                <span className="relative block mt-1.5">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-normal text-gray-700" />
                                </span>
                            </label>
                            <label className="block text-xs font-semibold text-gray-500 uppercase">
                                City
                                <select value={selectedCity} onChange={e => setSelectedCity(e.target.value)} className="w-full mt-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-normal text-gray-700">
                                    <option value="">All Cities ({orders.length})</option>
                                    {uniqueCities.map(city => <option key={city} value={city}>{city} ({cityCounts[city]})</option>)}
                                </select>
                            </label>
                            <label className="block text-xs font-semibold text-gray-500 uppercase">
                                Search
                                <span className="relative block mt-1.5">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tracking, order, receiver..." className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-normal text-gray-700" />
                                </span>
                            </label>
                            <button onClick={downloadCSV} disabled={!filteredOrders.length} className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                                <Download className="w-4 h-4" /> Export API data
                            </button>
                        </div>
                        <ZoomCityStats stats={cityDeliveryStats} />
                    </div>

                    <div className="lg:col-span-3 space-y-6">
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-2xl shadow-lg text-white">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-bold flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-200" /> Zoom API snapshot</h3>
                                    <p className="text-blue-100 text-sm mt-1">Showing {orders.length} records for {new Date(`${selectedMonth}-01T00:00:00`).toLocaleString("default", { month: "long", year: "numeric" })}</p>
                                </div>
                                <div className="text-right text-sm text-blue-100">
                                    <div>{apiCount} records returned by Zoom</div>
                                    {catalog && <div className="text-xs mt-1 opacity-80">{catalog.cities} cities · {catalog.statuses} statuses</div>}
                                </div>
                            </div>
                            <div className="mt-5 flex flex-wrap gap-6 text-blue-100">
                                <div><p className="text-xs uppercase font-bold tracking-wider opacity-70">Net estimate</p><p className="text-2xl font-bold text-emerald-100 mt-1">{formatRs(monthlyStats.net)}</p></div>
                                <div><p className="text-xs uppercase font-bold tracking-wider opacity-70">Filtered records</p><p className="text-2xl font-bold mt-1">{filteredOrders.length}</p></div>
                            </div>
                        </div>

                        {filteredOrders.length > 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                    <h3 className="font-bold text-gray-900">Zoom API orders ({filteredOrders.length})</h3>
                                    <span className="text-xs text-gray-500">Click a tracking number for live history</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50/80 text-gray-500 text-xs uppercase">
                                            <tr>
                                                <th className="px-4 py-3 text-left">Date / Order</th>
                                                <th className="px-4 py-3 text-left">Receiver</th>
                                                <th className="px-4 py-3 text-left">Route</th>
                                                <th className="px-4 py-3 text-right">COD</th>
                                                <th className="px-4 py-3 text-right">Charges</th>
                                                <th className="px-4 py-3 text-center">Payment</th>
                                                <th className="px-4 py-3 text-center">Status</th>
                                                <th className="px-4 py-3 text-left">Tracking</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredOrders.map(order => (
                                                <tr key={order.trackingNumber} className="hover:bg-gray-50/50 align-top">
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <div className="text-gray-600">{order.orderDate || "-"}</div>
                                                        <div className="text-xs font-semibold text-gray-900 mt-1">{order.orderId || "-"}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">{order.receiverName || "-"}</div>
                                                        <div className="text-xs text-gray-500">{order.receiverPhone || "-"}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs">
                                                        <div className="text-gray-500">{order.origin || "-"}</div>
                                                        <div className="font-medium text-gray-800 mt-1">{order.destination || "-"}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatRs(order.collectionAmount)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-600">{formatRs(order.deliveryCharges)}</td>
                                                    <td className="px-4 py-3 text-center"><StatusPill value={order.paymentStatus || "Unknown"} kind="payment" /></td>
                                                    <td className="px-4 py-3 text-center">
                                                        <StatusPill value={order.status || "Unknown"} kind={isDelivered(order.status) ? "success" : isReturned(order.status) ? "danger" : "neutral"} />
                                                        {order.statusDate && <div className="text-[10px] text-gray-400 mt-1">{order.statusDate}</div>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <button onClick={() => fetchTracking(order.trackingNumber)} disabled={trackingLoading === order.trackingNumber} className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-mono font-medium whitespace-nowrap inline-flex items-center gap-1 hover:bg-blue-100 disabled:opacity-50">
                                                            {trackingLoading === order.trackingNumber ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                                                            {order.trackingNumber}
                                                        </button>
                                                        <div className="text-[10px] text-gray-400 mt-1">{order.weight} kg · {order.quantity} pcs</div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
                                <Package className="w-12 h-12 text-gray-200 mb-3" />
                                <p>{loading ? "Loading orders from Zoom..." : "No Zoom API orders found for this month."}</p>
                                <p className="text-sm mt-1">Use Refresh API to request the latest order list.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {trackingModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setTrackingModal(null); setTrackingError(null); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
                            <div><h3 className="font-bold text-lg">Zoom Tracking History</h3><p className="text-blue-200 text-sm font-mono">{trackingModal.trackingNumber}</p></div>
                            <button onClick={() => { setTrackingModal(null); setTrackingError(null); }}><X className="w-5 h-5" /></button>
                        </div>
                        {trackingLoading ? <div className="p-12 text-center"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" /><p className="text-sm text-gray-500">Fetching live Zoom tracking...</p></div> :
                            trackingError ? <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2"><AlertCircle className="w-5 h-5" />{trackingError}</div></div> :
                                <div className="p-6 max-h-[calc(85vh-80px)] overflow-y-auto">
                                    <div className="flex items-center gap-3 pb-4 border-b border-gray-100"><Truck className="w-5 h-5 text-blue-600" /><span className="font-bold text-gray-900">{trackingModal.currentStatus}</span></div>
                                    <div className="mt-5">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Tracking History</h4>
                                        {trackingModal.trackingHistory.length ? trackingModal.trackingHistory.map((event, index) => (
                                            <div key={`${event.created}-${index}`} className="flex gap-3 relative">
                                                <div className="flex flex-col items-center"><div className={`w-3 h-3 rounded-full border-2 mt-1 ${index === trackingModal.trackingHistory.length - 1 ? "bg-blue-500 border-blue-500" : "bg-white border-gray-300"}`} />{index < trackingModal.trackingHistory.length - 1 && <div className="w-0.5 h-full bg-gray-200 min-h-[32px]" />}</div>
                                                <div className="pb-4"><p className="text-sm font-medium text-gray-900">{event.title || event.status}</p><p className="text-xs text-gray-500">{event.status}</p><p className="text-xs text-gray-400 mt-0.5">{event.created || "-"}</p></div>
                                            </div>
                                        )) : <p className="text-sm text-gray-400">No tracking history was returned.</p>}
                                    </div>
                                </div>}
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}

function Metric({ label, value, icon, tone = "blue" }: { label: string; value: string; icon?: React.ReactNode; tone?: "blue" | "green" | "red" | "amber" }) {
    const colors = { blue: "text-blue-600 bg-blue-50", green: "text-emerald-600 bg-emerald-50", red: "text-red-600 bg-red-50", amber: "text-amber-600 bg-amber-50" };
    return <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm"><div className="flex items-center gap-2 text-xs text-gray-500 font-semibold">{icon || <Clock className="w-4 h-4" />} {label}</div><div className={`text-xl font-bold mt-2 ${colors[tone].split(" ")[0]}`}>{value}</div></div>;
}

function StatusPill({ value, kind }: { value: string; kind: "payment" | "success" | "danger" | "neutral" }) {
    const classes = { payment: "bg-amber-50 text-amber-700", success: "bg-emerald-50 text-emerald-700", danger: "bg-red-50 text-red-700", neutral: "bg-blue-50 text-blue-700" };
    return <span className={`inline-flex max-w-[150px] px-2 py-0.5 rounded-md text-[10px] font-bold ${classes[kind]}`}>{value}</span>;
}

function ZoomCityStats({ stats }: { stats: { city: string; rate: number; total: number; delivered: number }[] }) {
    const [citySearch, setCitySearch] = useState("");
    const filtered = useMemo(() => {
        const query = citySearch.trim().toLowerCase();
        return query ? stats.filter(stat => stat.city.toLowerCase().includes(query)) : stats;
    }, [stats, citySearch]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-fit sticky top-24">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50"><h3 className="font-semibold text-gray-800">Delivery by City</h3><p className="text-xs text-gray-500">Based on Zoom status values</p></div>
            <div className="px-4 pt-3 pb-2"><input type="text" placeholder="Search city..." value={citySearch} onChange={e => setCitySearch(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-600 text-xs sticky top-0"><tr><th className="px-4 py-2">City</th><th className="px-4 py-2 text-right">Rate</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">{filtered.map(stat => <tr key={stat.city}><td className="px-4 py-3"><div className="font-medium text-gray-900">{stat.city}</div><div className="text-[10px] text-gray-400">{stat.delivered}/{stat.total} delivered</div></td><td className="px-4 py-3 text-right"><span className={`px-2 py-0.5 rounded text-xs font-bold ${stat.rate < 50 ? "text-red-600 bg-red-50" : stat.rate < 80 ? "text-yellow-600 bg-yellow-50" : "text-green-600 bg-green-50"}`}>{stat.rate.toFixed(1)}%</span></td></tr>)}</tbody>
                </table>
            </div>
        </div>
    );
}