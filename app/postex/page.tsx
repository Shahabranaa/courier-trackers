"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import OrdersTable from "@/components/OrdersTable";
import OrderCharts from "@/components/OrderCharts";
import CityStats from "@/components/CityStats";
import SyncToast from "@/components/SyncToast";
import { Truck, RefreshCw, Calendar, Download, Filter, AlertCircle } from "lucide-react";
import { useBrand } from "@/components/providers/BrandContext";
import { Order, TrackingStatus, PaymentStatus } from "@/lib/types";

export default function PostExDashboard() {
    const { selectedBrand } = useBrand();

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<string>("unknown");
    const [syncSummary, setSyncSummary] = useState<any>(null);

    // Filters
    const [selectedMonth, setSelectedMonth] = useState<string>(
        new Date().toISOString().slice(0, 7)
    );
    const [selectedCity, setSelectedCity] = useState<string>("");

    // Tracking and Payment Statuses
    const [trackingStatuses, setTrackingStatuses] = useState<Record<string, TrackingStatus | null>>({});
    const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus | null>>({});
    const [statusLoading, setStatusLoading] = useState(false);

    const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

    useEffect(() => {
        if (selectedBrand && selectedBrand.apiToken) {
            loadOrdersFromDB();
        } else {
            setOrders([]);
        }
    }, [selectedBrand, selectedMonth]);

    const buildHeaders = () => {
        const headers: Record<string, string> = {
            token: sanitizeHeader(selectedBrand!.apiToken),
            "brand-id": sanitizeHeader(selectedBrand!.id),
        };
        if (selectedBrand!.proxyUrl) {
            headers["proxy-url"] = sanitizeHeader(selectedBrand!.proxyUrl);
        }
        return headers;
    };

    const getDateRange = (): { startDate: string; endDate: string } | null => {
        if (!selectedMonth || !selectedMonth.includes("-")) return null;
        const [year, month] = selectedMonth.split("-").map(Number);
        if (!year || !month) return null;
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        return { startDate, endDate };
    };

    const loadOrdersFromDB = async () => {
        if (!selectedBrand?.apiToken) return;

        setLoading(true);
        setError(null);

        try {
            const dateRange = getDateRange();
            const params = new URLSearchParams();
            if (dateRange) {
                params.set("startDate", dateRange.startDate);
                params.set("endDate", dateRange.endDate);
            }
            const url = `/api/postex/orders?${params.toString()}`;
            const res = await fetch(url, { headers: buildHeaders() });

            if (!res.ok) throw new Error("Failed to load orders");

            const data = await res.json();
            setDataSource(data.source || "local");
            setOrders(data.dist || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const syncOrdersFromAPI = async () => {
        if (!selectedBrand?.apiToken) return;

        setLoading(true);
        setError(null);
        setSyncSummary(null);

        try {
            const dateRange = getDateRange();
            const params = new URLSearchParams();
            if (dateRange) {
                params.set("startDate", dateRange.startDate);
                params.set("endDate", dateRange.endDate);
            }
            params.set("force", "true");
            const url = `/api/postex/orders?${params.toString()}`;
            const res = await fetch(url, { headers: buildHeaders() });

            if (!res.ok) throw new Error("Failed to sync orders");

            const data = await res.json();
            setDataSource(data.source || "live");

            if (data.error) {
                setError(`Warning: ${data.error}`);
            }

            setOrders(data.dist || []);

            if (data.syncSummary) {
                setSyncSummary(data.syncSummary);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const refreshTracking = async () => {
        if (!selectedBrand?.apiToken || orders.length === 0) return;
        setStatusLoading(true);

        const newStatuses: Record<string, TrackingStatus | null> = {};
        const newPayments: Record<string, PaymentStatus | null> = {};

        const batchSize = 50;
        for (let i = 0; i < orders.length; i += batchSize) {
            const batch = orders.slice(i, i + batchSize);
            const batchTrackingNumbers = batch.map(o => o.trackingNumber).filter(Boolean);

            if (batchTrackingNumbers.length === 0) continue;

            try {
                const trackRes = await fetch("/api/postex/track/bulk", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "token": selectedBrand.apiToken
                    },
                    body: JSON.stringify({ trackingNumbers: batchTrackingNumbers })
                });

                if (trackRes.ok) {
                    const statuses = await trackRes.json();
                    if (Array.isArray(statuses)) {
                        statuses.forEach((st: any) => {
                            if (st?.trackingNumber) {
                                newStatuses[st.trackingNumber] = st;
                            }
                        });
                    }
                }

                await Promise.all(
                    batch.map(async (order) => {
                        const trackingNo = order.trackingNumber;
                        if (!trackingNo) return;
                        try {
                            const payRes = await fetch(`/api/postex/payment-status?trackingNumber=${trackingNo}`, {
                                headers: { token: selectedBrand.apiToken }
                            });
                            if (payRes.ok) {
                                newPayments[trackingNo] = await payRes.json();
                            }
                        } catch (e) { /* ignore */ }
                    })
                );
            } catch (e) {
                console.error("Batch tracking failed", e);
            }
        }

        setTrackingStatuses(newStatuses);
        setPaymentStatuses(newPayments);
        setStatusLoading(false);
    };

    const { cityCounts, uniqueCities } = useMemo(() => {
        const counts = orders.reduce((acc, order) => {
            const city = order.cityName || "Unknown";
            acc[city] = (acc[city] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return { cityCounts: counts, uniqueCities: Object.keys(counts).sort() };
    }, [orders]);

    const filteredOrders = orders.filter((o) => {
        if (selectedCity && (o.cityName || "Unknown") !== selectedCity) return false;
        return true;
    });

    // Monthly Snapshot Stats
    const monthlyStats = useMemo(() => {
        const stats = { count: 0, revenue: 0, net: 0, delivered: 0, returned: 0, upfront: 0 };
        orders.forEach(o => {
            stats.count++;
            stats.revenue += (o.orderAmount || o.invoicePayment || 0);
            stats.net += (o.netAmount || 0);
            stats.upfront += (o.upfrontPayment || 0);

            const status = (o.transactionStatus || "").toLowerCase();
            if (status === "delivered" || status === "transferred" || status === "payment transferred") stats.delivered++;
            if (status.includes("return")) stats.returned++;
        });
        return stats;
    }, [orders]);

    // CSV Export
    const downloadCSV = () => {
        if (filteredOrders.length === 0) return;
        const headers = ["Date", "Ref", "Tracking", "Customer", "City", "Address", "Amount", "Net", "Status"];
        const rows = filteredOrders.map(o => [
            o.orderDate, o.orderRefNumber, o.trackingNumber, o.customerName, o.cityName, o.deliveryAddress, o.invoicePayment, o.netAmount, o.transactionStatus
        ]);
        const csvContent = [headers.join(","), ...rows.map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `postex_orders_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    return (
        <DashboardLayout>
            <SyncToast summary={syncSummary} onClose={() => setSyncSummary(null)} courier="PostEx" />
            <div className="flex flex-col gap-6 p-6 lg:p-10">

                {/* Page Header */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <Truck className="w-8 h-8 text-orange-600" />
                            PostEx Portal
                        </h1>
                        <p className="text-gray-500 mt-2">Management dashboard for PostEx shipments</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <button
                            onClick={refreshTracking}
                            disabled={statusLoading || orders.length === 0}
                            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
                            Update Status
                        </button>
                        <button
                            onClick={syncOrdersFromAPI}
                            disabled={loading || !selectedBrand?.apiToken}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2 ml-auto lg:ml-0"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? "Syncing..." : "Sync Live Data"}
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                    </div>
                )}

                {selectedBrand && !selectedBrand.apiToken && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <div className="flex-1">
                            <p className="font-semibold text-sm">PostEx API Token Missing</p>
                            <p className="text-xs opacity-80 mt-1">Please configure keys in settings.</p>
                        </div>
                    </div>
                )}

                {/* Filters & Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                    {/* Sidebar Filters */}
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
                                        className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">City</label>
                                <select
                                    value={selectedCity}
                                    onChange={(e) => setSelectedCity(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
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

                        {/* City Stats Widget */}
                        {filteredOrders.length > 0 &&
                            <CityStats orders={filteredOrders} trackingStatuses={trackingStatuses} />
                        }
                    </div>

                    {/* Main Data Area */}
                    <div className="lg:col-span-3 space-y-6">

                        {/* Monthly Snapshot Widget */}
                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 rounded-2xl shadow-lg relative overflow-hidden text-white">
                            <div className="relative z-10 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <Calendar className="w-5 h-5 text-orange-200" />
                                        Monthly Snapshot: {new Date(selectedMonth + "-01").toLocaleString('default', { month: 'long', year: 'numeric' })}
                                    </h3>
                                    <div className="mt-4 flex gap-6 text-orange-100 flex-wrap">
                                        <div>
                                            <p className="text-xs uppercase font-bold tracking-wider opacity-70">Total Orders</p>
                                            <p className="text-2xl font-bold bg-white/20 px-3 py-1 rounded-lg mt-1 inline-block backdrop-blur-sm">{monthlyStats.count}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase font-bold tracking-wider opacity-70">Total Revenue</p>
                                            <p className="text-2xl font-bold mt-1">Rs. {monthlyStats.revenue.toLocaleString()}</p>
                                        </div>
                                        {monthlyStats.net > 0 && (
                                            <div>
                                                <p className="text-xs uppercase font-bold tracking-wider opacity-70">Net Amount</p>
                                                <p className="text-2xl font-bold text-emerald-100 mt-1">Rs. {monthlyStats.net.toLocaleString()}</p>
                                            </div>
                                        )}
                                        {monthlyStats.upfront > 0 && (
                                            <div>
                                                <p className="text-xs uppercase font-bold tracking-wider opacity-70">Upfront Payment</p>
                                                <p className="text-2xl font-bold text-yellow-100 mt-1">Rs. {monthlyStats.upfront.toLocaleString()}</p>
                                            </div>
                                        )}
                                        <div className="pl-6 border-l border-white/20">
                                            <p className="text-xs uppercase font-bold tracking-wider opacity-70">Delivered</p>
                                            <p className="text-2xl font-bold text-emerald-100 mt-1">{monthlyStats.delivered}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                            <div className="absolute bottom-0 right-20 w-20 h-20 bg-orange-400/20 rounded-full blur-xl"></div>
                        </div>

                        {orders.length > 0 ? (
                            <>
                                {/* Charts */}
                                <OrderCharts orders={filteredOrders} trackingStatuses={trackingStatuses} />

                                {/* Orders Table */}
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1">
                                    <OrdersTable
                                        orders={filteredOrders}
                                        trackingStatuses={trackingStatuses}
                                        paymentStatuses={paymentStatuses}
                                        loading={loading}
                                        refreshTracking={refreshTracking}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
                                <Truck className="w-12 h-12 text-gray-200 mb-3" />
                                <p>No orders found for this selection.</p>
                                <p className="text-sm text-gray-400 mt-1">Select a month and click "Sync Live Data".</p>
                            </div>
                        )}

                    </div>

                </div>

            </div>
        </DashboardLayout>
    );
}
