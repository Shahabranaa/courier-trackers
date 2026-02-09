"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import OrdersTable from "@/components/OrdersTable";
import CityStats from "@/components/CityStats";
import { Truck, RefreshCw, Filter, AlertTriangle, Download, AlertCircle } from "lucide-react";
import { useBrand } from "@/components/providers/BrandContext";
import { Order, TrackingStatus, PaymentStatus } from "@/lib/types";

export default function CriticalOrdersPage() {
    const { selectedBrand } = useBrand();

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [selectedCity, setSelectedCity] = useState<string>("");

    // Tracking and Payment Statuses
    const [trackingStatuses, setTrackingStatuses] = useState<Record<string, TrackingStatus | null>>({});
    const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus | null>>({});
    const [statusLoading, setStatusLoading] = useState(false);

    useEffect(() => {
        if (selectedBrand) {
            fetchCriticalOrders();
        }
    }, [selectedBrand]);

    const fetchCriticalOrders = async () => {
        if (!selectedBrand) return;

        setLoading(true);
        setError(null);
        setOrders([]);
        setTrackingStatuses({});
        setPaymentStatuses({});

        try {
            // Helper to remove non-ASCII characters from headers (reusing logic)
            const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

            const res = await fetch("/api/postex/critical", {
                headers: {
                    "brand-id": sanitizeHeader(selectedBrand.id)
                }
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Failed to fetch critical orders: ${txt}`);
            }

            const data = await res.json();

            if (data.error) {
                setError(data.error);
            }

            const list = data.orders || [];
            setOrders(list);

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

        // Fetch in batches of 10
        const batchSize = 10;
        for (let i = 0; i < orders.length; i += batchSize) {
            const batch = orders.slice(i, i + batchSize);
            await Promise.all(
                batch.map(async (order) => {
                    const trackingNo = order.trackingNumber;
                    if (!trackingNo) return;

                    try {
                        const [trackRes, payRes] = await Promise.all([
                            fetch(`/api/postex/tracking?trackingNumber=${trackingNo}`, {
                                headers: { token: selectedBrand.apiToken }
                            }),
                            fetch(`/api/postex/payment?trackingNumber=${trackingNo}`, {
                                headers: { token: selectedBrand.apiToken }
                            })
                        ]);

                        if (trackRes.ok) {
                            newStatuses[trackingNo] = await trackRes.json();
                        }
                        if (payRes.ok) {
                            newPayments[trackingNo] = await payRes.json();
                        }
                    } catch (e) {
                        // Ignore individual failures
                    }
                })
            );
        }

        setTrackingStatuses(newStatuses);
        setPaymentStatuses(newPayments);
        setStatusLoading(false);
    };

    // City Counts and Filtering
    const cityCounts = orders.reduce((acc, order) => {
        const city = order.cityName || "Unknown";
        acc[city] = (acc[city] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const uniqueCities = Object.keys(cityCounts).sort();

    const filteredOrders = orders.filter((o) => {
        if (selectedCity && (o.cityName || "Unknown") !== selectedCity) return false;
        return true;
    });

    // CSV Export
    const downloadCSV = () => {
        if (filteredOrders.length === 0) return;
        const headers = ["Date", "Ref", "Tracking", "Customer", "City", "Address", "Amount", "Status", "Days Pending"];
        const rows = filteredOrders.map(o => {
            const daysPending = Math.floor((new Date().getTime() - new Date(o.orderDate).getTime()) / (1000 * 3600 * 24));
            return [
                o.orderDate, o.orderRefNumber, o.trackingNumber, o.customerName, o.cityName, o.deliveryAddress, o.invoicePayment, o.transactionStatus, daysPending
            ];
        });
        const csvContent = [headers.join(","), ...rows.map(row => row.map(c => `"${c}"`).join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `critical_orders_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 p-6 lg:p-10">

                {/* Page Header */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200">
                    <div>
                        <h1 className="text-3xl font-bold text-red-700 tracking-tight flex items-center gap-3">
                            <AlertTriangle className="w-8 h-8" />
                            Critical Orders
                        </h1>
                        <p className="text-gray-500 mt-2">
                            Undelivered orders older than 5 days ({orders.length} found)
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={refreshTracking}
                            disabled={statusLoading || orders.length === 0}
                            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
                            Update Status (Live)
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

                {/* Filters & Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                    {/* Sidebar Filters */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Filter className="w-4 h-4 text-gray-400" /> Filters
                            </h3>

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
                                className="w-full mt-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Download className="w-4 h-4" /> Export Critical CSV
                            </button>
                        </div>

                        {/* City Stats Widget (Filtered) */}
                        {filteredOrders.length > 0 &&
                            <CityStats orders={filteredOrders} trackingStatuses={trackingStatuses} />
                        }
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-3">
                        {loading ? (
                            <div className="h-64 flex items-center justify-center text-gray-400">
                                <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                                <span className="ml-2">Loading critical orders...</span>
                            </div>
                        ) : orders.length > 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1">
                                <OrdersTable
                                    orders={filteredOrders}
                                    trackingStatuses={trackingStatuses}
                                    paymentStatuses={paymentStatuses}
                                    loading={loading}
                                    refreshTracking={refreshTracking}
                                />
                            </div>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
                                <Truck className="w-12 h-12 text-emerald-200 mb-3" />
                                <p className="text-gray-900 font-medium">No Critical Orders Found</p>
                                <p className="text-sm text-gray-400 mt-1">Great job! All older orders are delivered or returned.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
