"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Zap, RefreshCw, Calendar, Download, Filter, AlertCircle, Package, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { useBrand } from "@/components/providers/BrandContext";

interface ZoomOrder {
    shopifyOrderId: string;
    brandId: string;
    orderNumber: string;
    orderName: string;
    customerName: string;
    email: string;
    createdAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    totalPrice: number;
    currency: string;
    lineItems: string;
    trackingNumbers: string;
    courierPartner: string;
    phone: string;
    shippingAddress: string;
    shippingCity: string;
    tags: string;
}

export default function ZoomPortal() {
    const { selectedBrand } = useBrand();

    const [orders, setOrders] = useState<ZoomOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedMonth, setSelectedMonth] = useState<string>(
        new Date().toISOString().slice(0, 7)
    );
    const [selectedCity, setSelectedCity] = useState<string>("");

    const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

    const getDateRange = () => {
        const [year, month] = selectedMonth.split("-").map(Number);
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        return { startDate, endDate };
    };

    useEffect(() => {
        if (selectedBrand) {
            loadOrders();
        } else {
            setOrders([]);
        }
    }, [selectedBrand, selectedMonth]);

    const loadOrders = async () => {
        if (!selectedBrand) return;
        setLoading(true);
        setError(null);

        try {
            const { startDate, endDate } = getDateRange();
            const url = `/api/zoom/orders?startDate=${startDate}&endDate=${endDate}`;
            const res = await fetch(url, {
                headers: { "brand-id": sanitizeHeader(selectedBrand.id) }
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

    const { cityCounts, uniqueCities } = useMemo(() => {
        const counts = orders.reduce((acc, order) => {
            const city = order.shippingCity || "Unknown";
            acc[city] = (acc[city] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return { cityCounts: counts, uniqueCities: Object.keys(counts).sort() };
    }, [orders]);

    const filteredOrders = orders.filter((o) => {
        if (selectedCity && (o.shippingCity || "Unknown") !== selectedCity) return false;
        return true;
    });

    const monthlyStats = useMemo(() => {
        const stats = { count: 0, revenue: 0, fulfilled: 0, unfulfilled: 0 };
        orders.forEach(o => {
            stats.count++;
            stats.revenue += o.totalPrice;
            const status = (o.fulfillmentStatus || "unfulfilled").toLowerCase();
            if (status === "fulfilled") stats.fulfilled++;
            else stats.unfulfilled++;
        });
        return stats;
    }, [orders]);

    const fulfillmentRate = monthlyStats.count > 0
        ? Math.round((monthlyStats.fulfilled / monthlyStats.count) * 100)
        : 0;

    const cityDeliveryStats = useMemo(() => {
        const cityData: Record<string, { total: number; delivered: number }> = {};
        filteredOrders.forEach(order => {
            const city = order.shippingCity || "Unknown";
            if (!cityData[city]) cityData[city] = { total: 0, delivered: 0 };
            cityData[city].total++;
            const status = (order.fulfillmentStatus || "unfulfilled").toLowerCase();
            if (status === "fulfilled") cityData[city].delivered++;
        });
        return Object.entries(cityData)
            .map(([city, data]) => ({
                city,
                rate: data.total > 0 ? (data.delivered / data.total) * 100 : 0,
                total: data.total,
                delivered: data.delivered
            }))
            .sort((a, b) => b.total - a.total);
    }, [filteredOrders]);

    const downloadCSV = () => {
        if (filteredOrders.length === 0) return;
        const headers = ["Date", "Order", "Customer", "City", "Address", "Phone", "Amount", "Status", "Tags"];
        const rows = filteredOrders.map(o => [
            o.createdAt?.split("T")[0], o.orderName, o.customerName, o.shippingCity,
            o.shippingAddress, o.phone, o.totalPrice, o.fulfillmentStatus, o.tags
        ]);
        const csvContent = [headers.join(","), ...rows.map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `zoom_orders_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                        <p className="text-gray-500 mt-2">Shopify orders fulfilled by Zoom Courier</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <button
                            onClick={loadOrders}
                            disabled={loading || !selectedBrand}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2 ml-auto lg:ml-0"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? "Loading..." : "Refresh Data"}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                    </div>
                )}

                {!selectedBrand && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <div className="flex-1">
                            <p className="font-semibold text-sm">No Brand Selected</p>
                            <p className="text-xs opacity-80 mt-1">Please select a brand from the sidebar to view Zoom orders.</p>
                        </div>
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
                                    <input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
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

                            <button
                                onClick={downloadCSV}
                                disabled={filteredOrders.length === 0}
                                className="w-full mt-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Download className="w-4 h-4" /> Export CSV
                            </button>
                        </div>

                        {filteredOrders.length > 0 && (
                            <ZoomCityStats stats={cityDeliveryStats} />
                        )}
                    </div>

                    <div className="lg:col-span-3 space-y-6">

                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-2xl shadow-lg relative overflow-hidden text-white">
                            <div className="relative z-10 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <Calendar className="w-5 h-5 text-blue-200" />
                                        Monthly Snapshot: {new Date(selectedMonth + "-01").toLocaleString('default', { month: 'long', year: 'numeric' })}
                                    </h3>
                                    <div className="mt-4 flex gap-6 text-blue-100 flex-wrap">
                                        <div>
                                            <p className="text-xs uppercase font-bold tracking-wider opacity-70">Total Orders</p>
                                            <p className="text-2xl font-bold bg-white/20 px-3 py-1 rounded-lg mt-1 inline-block backdrop-blur-sm">{monthlyStats.count}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase font-bold tracking-wider opacity-70">Total Revenue</p>
                                            <p className="text-2xl font-bold mt-1">Rs. {monthlyStats.revenue.toLocaleString()}</p>
                                        </div>
                                        <div className="pl-6 border-l border-white/20">
                                            <p className="text-xs uppercase font-bold tracking-wider opacity-70">Fulfilled</p>
                                            <p className="text-2xl font-bold text-emerald-100 mt-1">{monthlyStats.fulfilled}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase font-bold tracking-wider opacity-70">Pending</p>
                                            <p className="text-2xl font-bold text-amber-100 mt-1">{monthlyStats.unfulfilled}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase font-bold tracking-wider opacity-70">Fulfillment Rate</p>
                                            <p className="text-2xl font-bold mt-1">{fulfillmentRate}%</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                            <div className="absolute bottom-0 right-20 w-20 h-20 bg-blue-400/20 rounded-full blur-xl"></div>
                        </div>

                        {filteredOrders.length > 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                    <h3 className="font-bold text-gray-900">Zoom Orders ({filteredOrders.length})</h3>
                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                        <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> {monthlyStats.fulfilled} fulfilled</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-500" /> {monthlyStats.unfulfilled} pending</span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50/80 text-gray-500 text-xs uppercase">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold">Date</th>
                                                <th className="px-4 py-3 text-left font-semibold">Order</th>
                                                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                                                <th className="px-4 py-3 text-left font-semibold">City</th>
                                                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                                                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                                                <th className="px-4 py-3 text-center font-semibold">Status</th>
                                                <th className="px-4 py-3 text-left font-semibold">Tags</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredOrders.map(order => {
                                                const status = (order.fulfillmentStatus || "unfulfilled").toLowerCase();
                                                return (
                                                    <tr key={order.shopifyOrderId} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-"}
                                                        </td>
                                                        <td className="px-4 py-3 font-medium text-gray-900">{order.orderName}</td>
                                                        <td className="px-4 py-3 text-gray-600">{order.customerName || "-"}</td>
                                                        <td className="px-4 py-3 text-gray-600">{order.shippingCity || "-"}</td>
                                                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">{order.phone || "-"}</td>
                                                        <td className="px-4 py-3 text-right font-bold text-gray-900 font-mono">
                                                            Rs. {Math.round(order.totalPrice).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {status === "fulfilled" ? (
                                                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-bold">Fulfilled</span>
                                                            ) : status === "partial" ? (
                                                                <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-xs font-bold">Partial</span>
                                                            ) : (
                                                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-xs font-bold">Unfulfilled</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {order.tags ? (
                                                                <div className="flex flex-wrap gap-1 max-w-[180px]">
                                                                    {order.tags.split(",").map((tag, i) => (
                                                                        <span key={i} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap">
                                                                            {tag.trim()}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300">-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
                                <Package className="w-12 h-12 text-gray-200 mb-3" />
                                <p>No Zoom Courier orders found for this month.</p>
                                <p className="text-sm text-gray-400 mt-1">Orders fulfilled by Zoom Courier in Shopify will appear here.</p>
                                <p className="text-xs text-gray-300 mt-1">Make sure to sync Shopify data first from the Shopify Orders page.</p>
                            </div>
                        )}

                    </div>

                </div>

            </div>
        </DashboardLayout>
    );
}

function ZoomCityStats({ stats }: { stats: { city: string; rate: number; total: number; delivered: number }[] }) {
    const [citySearch, setCitySearch] = useState("");

    const filtered = useMemo(() => {
        if (!citySearch.trim()) return stats;
        const q = citySearch.toLowerCase().trim();
        return stats.filter(s => s.city.toLowerCase().includes(q));
    }, [stats, citySearch]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-fit sticky top-24">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-800">Fulfillment Rates</h3>
                <p className="text-xs text-gray-500">By City (Most Orders First)</p>
            </div>
            <div className="px-4 pt-3 pb-2">
                <input
                    type="text"
                    placeholder="Search city..."
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 placeholder-gray-400"
                />
                {citySearch.trim() && (
                    <p className="text-[10px] text-gray-400 mt-1">
                        {filtered.length} of {stats.length} cities
                    </p>
                )}
            </div>
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium text-xs sticky top-0">
                        <tr>
                            <th className="px-4 py-2">City</th>
                            <th className="px-4 py-2 text-right">%</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={2} className="px-4 py-6 text-center text-gray-400 text-sm">
                                    No cities match "{citySearch}"
                                </td>
                            </tr>
                        ) : (
                            filtered.map(stat => {
                                const colorClass =
                                    stat.rate < 50 ? "text-red-600 bg-red-50" :
                                        stat.rate < 80 ? "text-yellow-600 bg-yellow-50" :
                                            "text-green-600 bg-green-50";
                                return (
                                    <tr key={stat.city} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{stat.city}</div>
                                            <div className="text-[10px] text-gray-400">
                                                {stat.delivered}/{stat.total} Orders
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${colorClass}`}>
                                                {stat.rate.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
