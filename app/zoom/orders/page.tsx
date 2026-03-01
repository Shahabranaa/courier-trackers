"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import CityStats from "@/components/CityStats";
import OrderCharts from "@/components/OrderCharts";
import { Zap, RefreshCw, Calendar, Download, Filter, AlertCircle, Package, Search, X, MapPin, User, Truck } from "lucide-react";
import { useBrand } from "@/components/providers/BrandContext";
import { Order, TrackingStatus } from "@/lib/types";

interface TrackingDetail {
    trackingNumber: string;
    shipper: string;
    origin: string;
    consigneeName: string;
    destination: string;
    currentStatus: string;
    lastUpdate: string;
    trackingHistory: { date: string; status: string }[];
}

export default function ZoomOrdersDashboard() {
    const { selectedBrand } = useBrand();

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncResult, setSyncResult] = useState<any>(null);

    const [selectedMonth, setSelectedMonth] = useState<string>("");
    const [selectedCity, setSelectedCity] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState<string>("");

    const [trackingModal, setTrackingModal] = useState<TrackingDetail | null>(null);
    const [trackingLoading, setTrackingLoading] = useState<string | null>(null);
    const [trackingError, setTrackingError] = useState<string | null>(null);

    const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

    const getDateRange = () => {
        if (!selectedMonth) return null;
        const [year, month] = selectedMonth.split("-").map(Number);
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        return { startDate, endDate };
    };

    useEffect(() => {
        if (selectedBrand) {
            loadOrdersFromDB();
        } else {
            setOrders([]);
        }
    }, [selectedBrand, selectedMonth]);

    const loadOrdersFromDB = async () => {
        if (!selectedBrand) return;
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            const dateRange = getDateRange();
            if (dateRange) {
                params.set("startDate", dateRange.startDate);
                params.set("endDate", dateRange.endDate);
            }

            const res = await fetch(`/api/zoom/db-orders?${params.toString()}`, {
                headers: { "brand-id": sanitizeHeader(selectedBrand.id) },
            });

            if (!res.ok) throw new Error("Failed to load Zoom orders");

            const data = await res.json();
            setOrders(data.orders || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const syncFromPortal = async () => {
        if (!selectedBrand) return;
        setSyncing(true);
        setError(null);
        setSyncResult(null);

        try {
            const res = await fetch("/api/zoom/sync", {
                method: "POST",
                headers: { "brand-id": sanitizeHeader(selectedBrand.id) },
            });

            if (!res.ok) throw new Error("Failed to sync Zoom orders");

            const data = await res.json();
            setSyncResult(data);
            await loadOrdersFromDB();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSyncing(false);
        }
    };

    const fetchTracking = async (trackingNumber: string) => {
        setTrackingLoading(trackingNumber);
        setTrackingError(null);
        setTrackingModal({ trackingNumber, shipper: "", origin: "", consigneeName: "", destination: "", currentStatus: "Loading...", lastUpdate: "", trackingHistory: [] });
        try {
            const res = await fetch(`/api/zoom/track?trackingNumber=${encodeURIComponent(trackingNumber)}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to fetch tracking");
            }
            const data: TrackingDetail = await res.json();
            setTrackingModal(data);
        } catch (err: any) {
            setTrackingError(err.message);
        } finally {
            setTrackingLoading(null);
        }
    };

    const { cityCounts, uniqueCities } = useMemo(() => {
        const counts = orders.reduce((acc, order) => {
            const city = order.cityName || "Unknown";
            acc[city] = (acc[city] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return { cityCounts: counts, uniqueCities: Object.keys(counts).sort() };
    }, [orders]);

    const allStatuses = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => {
            if (o.transactionStatus) set.add(o.transactionStatus);
        });
        return Array.from(set).sort();
    }, [orders]);

    const filteredOrders = orders.filter((o) => {
        if (selectedCity && (o.cityName || "Unknown") !== selectedCity) return false;
        if (statusFilter && o.transactionStatus !== statusFilter) return false;
        return true;
    });

    const trackingStatuses = useMemo(() => {
        const statuses: Record<string, TrackingStatus | null> = {};
        orders.forEach(o => {
            if (o.trackingNumber) {
                statuses[o.trackingNumber] = {
                    currentStatus: o.transactionStatus || "Unknown",
                    trackingNumber: o.trackingNumber,
                    dateTime: o.transactionDate,
                    dist: { currentStatus: o.transactionStatus, transactionStatus: o.transactionStatus },
                } as any;
            }
        });
        return statuses;
    }, [orders]);

    const stats = useMemo(() => {
        const s = { count: 0, revenue: 0, net: 0, deliveryCharges: 0, commission: 0, delivered: 0, returned: 0, inTransit: 0 };
        orders.forEach(o => {
            s.count++;
            s.revenue += (o.orderAmount || o.invoicePayment || 0);
            s.deliveryCharges += (o.transactionFee || 0);
            s.commission += (o.transactionTax || 0);

            const status = (o.transactionStatus || "").toLowerCase();
            if (status === "delivered") {
                s.delivered++;
                s.net += (o.netAmount || 0);
            } else if (status.includes("return")) {
                s.returned++;
                s.net -= (o.transactionFee || 0);
            } else if (status.includes("transit") || status.includes("assigned")) {
                s.inTransit++;
            }
        });
        return s;
    }, [orders]);

    const downloadCSV = () => {
        if (filteredOrders.length === 0) return;
        const headers = ["Date", "Ref", "Tracking", "Customer", "Phone", "City", "Address", "Order Amount", "Delivery Fee", "Commission (4%)", "Net Amount", "Status"];
        const rows = filteredOrders.map(o => [
            o.orderDate?.split("T")[0], o.orderRefNumber, o.trackingNumber, o.customerName, o.customerPhone,
            o.cityName, o.deliveryAddress, o.orderAmount, o.transactionFee, o.transactionTax,
            o.netAmount, o.transactionStatus,
        ]);
        const csvContent = [headers.join(","), ...rows.map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `zoom_orders_${selectedMonth || "all_time"}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getStatusBadge = (status: string) => {
        const s = status.toLowerCase();
        if (s === "delivered") return "bg-emerald-50 text-emerald-700";
        if (s.includes("return")) return "bg-red-50 text-red-700";
        if (s.includes("transit")) return "bg-blue-50 text-blue-700";
        if (s.includes("assigned")) return "bg-indigo-50 text-indigo-700";
        if (s.includes("arrived")) return "bg-purple-50 text-purple-700";
        return "bg-gray-100 text-gray-600";
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 p-6 lg:p-10">

                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <Zap className="w-8 h-8 text-blue-600" />
                            Zoom Orders
                        </h1>
                        <p className="text-gray-500 mt-2">All Zoom courier orders with tracking & financial details</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <button
                            onClick={syncFromPortal}
                            disabled={syncing || !selectedBrand}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2 ml-auto lg:ml-0"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                            {syncing ? "Syncing..." : "Sync from Zoom Portal"}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                    </div>
                )}

                {syncResult && (
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl flex items-center gap-3">
                        <Zap className="w-5 h-5 text-blue-600" />
                        <div className="text-sm">
                            <span className="font-semibold">Sync Complete:</span>{" "}
                            {syncResult.synced} orders synced, {syncResult.failed} failed out of {syncResult.totalTrackingNumbers} tracking numbers
                        </div>
                        <button onClick={() => setSyncResult(null)} className="ml-auto text-blue-400 hover:text-blue-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Filter className="w-4 h-4 text-gray-400" /> Filters
                            </h3>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Month</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <select
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
                                    >
                                        <option value="">All Time</option>
                                        {Array.from({ length: 24 }, (_, i) => {
                                            const d = new Date();
                                            d.setMonth(d.getMonth() - i);
                                            const val = d.toISOString().slice(0, 7);
                                            const label = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
                                            return <option key={val} value={val}>{label}</option>;
                                        })}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">City</label>
                                <select
                                    value={selectedCity}
                                    onChange={(e) => setSelectedCity(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                >
                                    <option value="">All Cities ({orders.length})</option>
                                    {uniqueCities.map(c => (
                                        <option key={c} value={c}>{c} ({cityCounts[c]})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Status</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                >
                                    <option value="">All Statuses</option>
                                    {allStatuses.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={downloadCSV}
                                disabled={filteredOrders.length === 0}
                                className="w-full mt-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Download className="w-4 h-4" /> Export CSV
                            </button>
                        </div>

                        {filteredOrders.length > 0 && (
                            <CityStats orders={filteredOrders} trackingStatuses={trackingStatuses} />
                        )}
                    </div>

                    <div className="lg:col-span-3 space-y-6">

                        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-2xl shadow-lg relative overflow-hidden text-white">
                            <div className="relative z-10">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-blue-200" />
                                    {selectedMonth
                                        ? `Monthly Snapshot: ${new Date(selectedMonth + "-01").toLocaleString("default", { month: "long", year: "numeric" })}`
                                        : "All Time Overview"}
                                </h3>
                                <div className="mt-4 flex gap-6 text-blue-100 flex-wrap">
                                    <div>
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-70">Orders</p>
                                        <p className="text-2xl font-bold bg-white/20 px-3 py-1 rounded-lg mt-1 inline-block backdrop-blur-sm">{stats.count}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-70">Gross Revenue</p>
                                        <p className="text-2xl font-bold mt-1">Rs. {Math.round(stats.revenue).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-70">Delivery Charges</p>
                                        <p className="text-lg font-bold text-red-200 mt-1">- Rs. {Math.round(stats.deliveryCharges).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-70">Commission (4%)</p>
                                        <p className="text-lg font-bold text-red-200 mt-1">- Rs. {Math.round(stats.commission).toLocaleString()}</p>
                                    </div>
                                    <div className="pl-6 border-l border-white/20">
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-70">Net Amount</p>
                                        <p className="text-2xl font-bold text-emerald-200 mt-1">Rs. {Math.round(stats.net).toLocaleString()}</p>
                                    </div>
                                    <div className="pl-6 border-l border-white/20">
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-70">Delivered</p>
                                        <p className="text-2xl font-bold text-emerald-200 mt-1">{stats.delivered}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-70">In Transit</p>
                                        <p className="text-2xl font-bold text-yellow-200 mt-1">{stats.inTransit}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-70">Returned</p>
                                        <p className="text-2xl font-bold text-red-200 mt-1">{stats.returned}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                            <div className="absolute bottom-0 right-20 w-20 h-20 bg-blue-400/20 rounded-full blur-xl"></div>
                        </div>

                        {filteredOrders.length > 0 ? (
                            <>
                            <OrderCharts orders={filteredOrders} trackingStatuses={trackingStatuses} />
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                    <h3 className="font-bold text-gray-900">Zoom Orders ({filteredOrders.length})</h3>
                                    <div className="text-xs text-gray-400">
                                        Delivery: Rs. 150 fixed | Commission: 4%
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50/80 text-gray-500 text-xs uppercase">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold">Date</th>
                                                <th className="px-4 py-3 text-left font-semibold">Ref</th>
                                                <th className="px-4 py-3 text-left font-semibold">Tracking</th>
                                                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                                                <th className="px-4 py-3 text-left font-semibold">City</th>
                                                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                                                <th className="px-4 py-3 text-right font-semibold">Fee</th>
                                                <th className="px-4 py-3 text-right font-semibold">Net</th>
                                                <th className="px-4 py-3 text-center font-semibold">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredOrders.map(order => (
                                                <tr key={order.trackingNumber} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                                                        {order.orderDate ? new Date(order.orderDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-"}
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-gray-900 text-xs">{order.orderRefNumber || "-"}</td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            onClick={() => fetchTracking(order.trackingNumber)}
                                                            disabled={trackingLoading === order.trackingNumber}
                                                            className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-mono font-medium whitespace-nowrap inline-flex items-center gap-1 hover:bg-blue-100 hover:text-blue-900 transition-colors cursor-pointer disabled:opacity-50"
                                                        >
                                                            {trackingLoading === order.trackingNumber ? (
                                                                <RefreshCw className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <Search className="w-3 h-3" />
                                                            )}
                                                            {order.trackingNumber}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 text-xs">{order.customerName || "-"}</td>
                                                    <td className="px-4 py-3 text-gray-600 text-xs">{order.cityName || "-"}</td>
                                                    <td className="px-4 py-3 text-right font-mono text-gray-900 text-xs">
                                                        Rs. {Math.round(order.orderAmount || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-red-500 text-xs">
                                                        -{Math.round((order.transactionFee || 0) + (order.transactionTax || 0)).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700 text-xs">
                                                        Rs. {Math.round(order.netAmount || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${getStatusBadge(order.transactionStatus || "Unknown")}`}>
                                                            {order.transactionStatus || "Unknown"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            </>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
                                <Package className="w-12 h-12 text-gray-200 mb-3" />
                                <p>No Zoom orders found in database.</p>
                                <p className="text-sm text-gray-400 mt-1">Click "Sync from Zoom Portal" to fetch tracking data.</p>
                                <p className="text-xs text-gray-300 mt-1">Make sure Shopify orders are synced first.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {trackingModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setTrackingModal(null); setTrackingError(null); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-lg">Tracking Details</h3>
                                <p className="text-blue-200 text-sm font-mono">{trackingModal.trackingNumber}</p>
                            </div>
                            <button onClick={() => { setTrackingModal(null); setTrackingError(null); }} className="text-white/70 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {trackingLoading ? (
                            <div className="p-12 flex flex-col items-center justify-center">
                                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                                <p className="text-sm text-gray-500">Fetching tracking details...</p>
                            </div>
                        ) : trackingError ? (
                            <div className="p-6">
                                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5" />
                                    <span className="text-sm">{trackingError}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-y-auto max-h-[calc(85vh-80px)]">
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                                        <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                                            trackingModal.currentStatus.toLowerCase() === "delivered"
                                                ? "bg-emerald-50 text-emerald-700"
                                                : trackingModal.currentStatus.toLowerCase().includes("return")
                                                    ? "bg-red-50 text-red-700"
                                                    : "bg-blue-50 text-blue-700"
                                        }`}>
                                            {trackingModal.currentStatus}
                                        </div>
                                        {trackingModal.lastUpdate && (
                                            <span className="text-xs text-gray-400">Last update: {trackingModal.lastUpdate}</span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 rounded-xl p-4">
                                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                                <Truck className="w-3.5 h-3.5" /> Shipping Info
                                            </h4>
                                            {trackingModal.shipper && <p className="text-sm text-gray-900 font-medium">{trackingModal.shipper}</p>}
                                            {trackingModal.origin && (
                                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                                    <MapPin className="w-3 h-3" /> {trackingModal.origin}
                                                </p>
                                            )}
                                        </div>
                                        <div className="bg-gray-50 rounded-xl p-4">
                                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                                <User className="w-3.5 h-3.5" /> Consignee
                                            </h4>
                                            {trackingModal.consigneeName && <p className="text-sm text-gray-900 font-medium">{trackingModal.consigneeName}</p>}
                                            {trackingModal.destination && (
                                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                                    <MapPin className="w-3 h-3" /> {trackingModal.destination}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {trackingModal.trackingHistory.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Tracking History</h4>
                                            <div className="space-y-0">
                                                {trackingModal.trackingHistory.map((entry, i) => {
                                                    const isLast = i === trackingModal.trackingHistory.length - 1;
                                                    const isDelivered = entry.status.toLowerCase() === "delivered";
                                                    return (
                                                        <div key={i} className="flex gap-3 relative">
                                                            <div className="flex flex-col items-center">
                                                                <div className={`w-3 h-3 rounded-full border-2 mt-1 ${
                                                                    isDelivered ? "bg-emerald-500 border-emerald-500" :
                                                                    isLast ? "bg-blue-500 border-blue-500" :
                                                                    "bg-white border-gray-300"
                                                                }`} />
                                                                {i < trackingModal.trackingHistory.length - 1 && (
                                                                    <div className="w-0.5 h-full bg-gray-200 min-h-[32px]" />
                                                                )}
                                                            </div>
                                                            <div className="pb-4 flex-1">
                                                                <p className={`text-sm font-medium ${isDelivered ? "text-emerald-700" : "text-gray-900"}`}>
                                                                    {entry.status}
                                                                </p>
                                                                <p className="text-xs text-gray-400 mt-0.5">{entry.date}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
