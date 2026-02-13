"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import OrdersTable from "@/components/OrdersTable";
import OrderCharts from "@/components/OrderCharts";
import CityStats from "@/components/CityStats";
import SyncToast from "@/components/SyncToast";
import { Package, RefreshCw, Calendar, Download, WifiOff, AlertCircle, Filter, Truck } from "lucide-react";
import { useBrand } from "@/components/providers/BrandContext";
import { Order, TrackingStatus } from "@/lib/types";

// Helper to normalize Tranzo API/DB data to strict Order interface
const normalizeTranzoOrder = (o: any): Order => {
    const amount = parseFloat(o.cod_amount || o.invoicePayment || o.netAmount || "0");
    const status = (o.order_status || o.transactionStatus || o.orderStatus || "Unknown");

    // Try to parse date
    let date = o.created_at || o.booking_date || o.transactionDate || o.orderDate || new Date().toISOString();

    // --- Fee Calculation Logic (Mirroring Backend) ---
    const cityVal = (o.destination_city_name || o.city_name || o.cityName || "Unknown").toLowerCase();
    const statusVal = status.toLowerCase();

    let fee = 0;
    let tax = 0;
    let other = 0;

    // Use DB values if available (Offline/Local Source)
    if (o.transactionFee !== undefined && o.transactionTax !== undefined) {
        fee = parseFloat(o.transactionFee || "0");
        tax = parseFloat(o.transactionTax || "0");
        // transactionFee in DB includes 'other', so we don't double add
    } else {
        // Calculate Live for API Source
        if (!statusVal.includes("cancel")) {
            if (cityVal.includes("lahore")) {
                fee = 90;
                tax = 13.44;
                other = 4;
            } else if (cityVal.includes("karachi")) {
                fee = 140;
                tax = 21.84;
                other = 6.5;
            } else {
                fee = 130;
                tax = 20.16;
                other = 0;
            }
        }
        fee += other; // Combine for display
    }

    const net = amount - (fee + tax);

    return {
        id: o.consignment_id || o.trackingNumber || o.id || Math.random().toString(),
        trackingNumber: o.consignment_id || o.trackingNumber || o.orderRefNumber || "",
        orderRefNumber: o.reference_number || o.orderRefNumber || "",
        customerName: o.consignee_name || o.customerName || "N/A",
        customerPhone: o.consignee_phone || o.customerPhone || "",
        deliveryAddress: o.delivery_address || o.deliveryAddress || "",
        cityName: o.destination_city_name || o.city_name || o.cityName || "Unknown",

        transactionDate: date,
        orderDate: date,

        invoicePayment: amount,
        orderAmount: amount,
        netAmount: net,

        transactionStatus: status,
        orderStatus: status,

        courier: "Tranzo",
        orderType: "COD",
        actualWeight: parseFloat(o.actual_weight || o.actualWeight || "0.5") as number | undefined,

        orderDetail: o.order_details || o.orderDetail || "Items",

        transactionTax: tax,
        transactionFee: fee,
    } as unknown as Order;
};

export default function TranzoDashboard() {
    const { selectedBrand } = useBrand();

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncSummary, setSyncSummary] = useState<any>(null);

    // Filters
    const [selectedMonth, setSelectedMonth] = useState<string>(
        new Date().toISOString().slice(0, 7)
    );
    const [selectedCity, setSelectedCity] = useState<string>("");

    // Derived Statuses for Components
    const [trackingStatuses, setTrackingStatuses] = useState<Record<string, TrackingStatus | null>>({});
    const [paymentStatuses, setPaymentStatuses] = useState<Record<string, any>>({});

    const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

    useEffect(() => {
        if (selectedBrand && selectedBrand.tranzoApiToken) {
            loadOrdersFromDB();
        } else {
            setOrders([]);
        }
    }, [selectedBrand, selectedMonth]);

    const loadOrdersFromDB = async () => {
        if (!selectedBrand?.tranzoApiToken) return;

        setLoading(true);
        setError(null);

        try {
            const cleanToken = sanitizeHeader(selectedBrand.tranzoApiToken || "");

            const [year, month] = selectedMonth.split("-").map(Number);
            const lastDay = new Date(year, month, 0).getDate();
            const startDate = `${selectedMonth}-01`;
            const endDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

            const res = await fetch(`/api/tranzo/orders?startDate=${startDate}&endDate=${endDate}`, {
                headers: {
                    "api-token": cleanToken,
                    "brand-id": sanitizeHeader(selectedBrand.id)
                }
            });

            if (!res.ok) {
                throw new Error("Failed to load orders");
            }

            const data = await res.json();
            processOrderResponse(data);
        } catch (err: any) {
            setError(err.message);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    const syncOrdersFromAPI = async () => {
        if (!selectedBrand?.tranzoApiToken) return;

        setLoading(true);
        setError(null);
        setSyncSummary(null);

        try {
            const cleanToken = sanitizeHeader(selectedBrand.tranzoApiToken || "");

            const res = await fetch("/api/tranzo/orders?sync=true", {
                headers: {
                    "api-token": cleanToken,
                    "brand-id": sanitizeHeader(selectedBrand.id)
                }
            });

            if (!res.ok) {
                throw new Error("Failed to sync Tranzo orders");
            }

            const data = await res.json();
            processOrderResponse(data);

            if (data.syncSummary) {
                setSyncSummary(data.syncSummary);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const processOrderResponse = (data: any) => {
        console.log("Tranzo Response:", data);

        if (data.source === "local" && data.error) {
            setError(`Sync Failed: ${data.error} (Showing saved data)`);
        }

        const list = Array.isArray(data) ? data : (data.results || data.orders || []);

        const normalized = (list as any[]).map(normalizeTranzoOrder);

        const filteredByMonth = normalized.filter((o: Order) =>
            (o.orderDate || "").startsWith(selectedMonth)
        );

        setOrders(filteredByMonth);

        const statuses: Record<string, TrackingStatus | null> = {};
        const payments: Record<string, any> = {};

        filteredByMonth.forEach(o => {
            if (o.trackingNumber) {
                const st = (o.transactionStatus || "").toLowerCase();
                statuses[o.trackingNumber] = {
                    currentStatus: o.transactionStatus || "Unknown",
                    trackingNumber: o.trackingNumber,
                    dateTime: o.transactionDate,
                    dist: {
                        currentStatus: o.transactionStatus,
                        transactionStatus: o.transactionStatus
                    }
                } as any;

                if (st === "delivered" || st === "payment transferred") {
                    payments[o.trackingNumber] = { dist: { settle: true } };
                } else {
                    payments[o.trackingNumber] = { dist: { settle: false } };
                }
            }
        });
        setTrackingStatuses(statuses);
        setPaymentStatuses(payments);
    };

    // --- Derived State for UI ---
    const cityCounts = orders.reduce((acc, order) => {
        const city = order.cityName || "Unknown";
        acc[city] = (acc[city] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const uniqueCities = Object.keys(cityCounts).sort();

    const filteredOrders = orders.filter(o => {
        if (selectedCity && (o.cityName || "Unknown") !== selectedCity) return false;
        return true;
    });

    // Monthly Stats
    const monthlyStats = useMemo(() => {
        const stats = { count: 0, revenue: 0, net: 0, delivered: 0, returned: 0 };
        orders.forEach(o => {
            // STRICT: Order Date (Dispatch Date) - already loaded for selected month
            stats.count++;
            stats.revenue += (o.orderAmount || o.invoicePayment || 0);
            stats.net += (o.netAmount || 0);

            const status = (o.transactionStatus || "").toLowerCase();
            if (status === "delivered" || status === "payment transferred" || status === "transferred") stats.delivered++;
            if (status.includes("return")) stats.returned++;
        });
        return stats;
    }, [orders]);

    const downloadCSV = () => {
        if (filteredOrders.length === 0) return;
        const headers = ["Date", "Ref", "Tracking", "Customer", "City", "Amount", "Status"];
        const rows = filteredOrders.map(o => [
            o.orderDate, o.orderRefNumber, o.trackingNumber, o.customerName, o.cityName, o.netAmount, o.transactionStatus
        ]);
        const csvContent = [headers.join(","), ...rows.map(row => row.map(c => `"${c}"`).join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `tranzo_orders_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    return (
        <DashboardLayout>
            <SyncToast summary={syncSummary} onClose={() => setSyncSummary(null)} courier="Tranzo" />
            <div className="flex flex-col gap-6 p-6 lg:p-10">

                {/* Page Header */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <Package className="w-8 h-8 text-purple-600" />
                            Tranzo Portal
                        </h1>
                        <p className="text-gray-500 mt-2">Management dashboard for Tranzo shipments</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <button
                            onClick={syncOrdersFromAPI}
                            disabled={loading || !selectedBrand?.tranzoApiToken}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2 ml-auto lg:ml-0"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? "Syncing..." : "Sync Live Data"}
                        </button>
                    </div>
                </div>

                {/* Error / Warning Area */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                    </div>
                )}

                {selectedBrand && !selectedBrand.tranzoApiToken && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <div className="flex-1">
                            <p className="font-semibold text-sm">Tranzo API Token Missing</p>
                            <p className="text-xs opacity-80 mt-1">Please configure keys in settings.</p>
                        </div>
                    </div>
                )}


                {/* Filters & Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                    {/* Sidebar Stats & Filters */}
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
                                        className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">City</label>
                                <select
                                    value={selectedCity}
                                    onChange={(e) => setSelectedCity(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
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

                        {/* City Stats Widget (Reused) */}
                        {filteredOrders.length > 0 &&
                            <CityStats orders={filteredOrders} trackingStatuses={trackingStatuses} />
                        }
                    </div>

                    {/* Main Data Area */}
                    <div className="lg:col-span-3 space-y-6">

                        {/* Feature Widget: Monthly Snapshot */}
                        {monthlyStats.count > 0 && (
                            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-6 rounded-2xl shadow-lg relative overflow-hidden text-white">
                                <div className="relative z-10 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold flex items-center gap-2">
                                            <Calendar className="w-5 h-5 text-purple-200" />
                                            Monthly Snapshot: {new Date(selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                                        </h3>
                                        <div className="mt-4 flex gap-6 text-purple-100 flex-wrap">
                                            <div>
                                                <p className="text-xs uppercase font-bold tracking-wider opacity-70">Orders</p>
                                                <p className="text-2xl font-bold bg-white/20 px-3 py-1 rounded-lg mt-1 inline-block backdrop-blur-sm">{monthlyStats.count}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs uppercase font-bold tracking-wider opacity-70">Revenue</p>
                                                <p className="text-2xl font-bold mt-1">Rs. {monthlyStats.revenue.toLocaleString()}</p>
                                            </div>
                                            {monthlyStats.net > 0 && (
                                                <div>
                                                    <p className="text-xs uppercase font-bold tracking-wider opacity-70">Net Amount</p>
                                                    <p className="text-2xl font-bold text-emerald-100 mt-1">Rs. {monthlyStats.net.toLocaleString()}</p>
                                                </div>
                                            )}
                                            <div className="pl-6 border-l border-white/20">
                                                <p className="text-xs uppercase font-bold tracking-wider opacity-70">Delivered</p>
                                                <p className="text-2xl font-bold text-emerald-300 mt-1">{monthlyStats.delivered}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                            </div>
                        )}

                        {orders.length > 0 ? (
                            <>
                                {/* Visual Arts */}
                                <OrderCharts orders={filteredOrders} trackingStatuses={trackingStatuses} />

                                {/* Advanced Table */}
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1">
                                    <OrdersTable
                                        orders={filteredOrders}
                                        trackingStatuses={trackingStatuses}
                                        paymentStatuses={paymentStatuses}
                                        loading={loading}
                                        refreshTracking={() => syncOrdersFromAPI()}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
                                <Package className="w-12 h-12 text-gray-200 mb-3" />
                                <p>No orders found for this selection.</p>
                                <p className="text-sm text-gray-400 mt-1">Try syncing live data.</p>
                            </div>
                        )}

                    </div>

                </div>

            </div>
        </DashboardLayout>
    );
}
