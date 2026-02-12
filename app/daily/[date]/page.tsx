"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import OrdersTable from "@/components/OrdersTable";
import { useBrand } from "@/components/providers/BrandContext";
import { Order, TrackingStatus } from "@/lib/types";
import { ArrowLeft, DollarSign, Package, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function DailyDetailPage() {
    const params = useParams(); // { date: string }
    const router = useRouter();
    const { selectedBrand } = useBrand();

    // Date from URL
    const dateStr = params.date as string;

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, postexCount: 0, tranzoCount: 0 });

    useEffect(() => {
        if (selectedBrand && dateStr) {
            fetchDailyData();
        }
    }, [selectedBrand, dateStr]);

    const fetchDailyData = async () => {
        setLoading(true);
        setOrders([]);

        try {
            if (!selectedBrand) return;

            // Build Promises for PostEx and Tranzo
            const promises = [];

            // 1. PostEx Fetch
            if (selectedBrand.apiToken) {
                // Fetch wider range to ensure we catch everything, then filter in memory if needed
                // Or just trust the date if API supports day filtering? 
                // PostEx API usually month based, so we stick to month fetch for safety or modify API?
                // Let's use the existing API which handles month range.
                // We will fetch the whole month belonging to this date to be safe.
                // PostEx API: Fetch ONLY the specific date to eliminate client-side filtering errors.
                const startDate = dateStr;
                const endDate = dateStr;

                console.log(`fetching Daily View for ${startDate} to ${endDate}`);

                promises.push(
                    fetch(`/api/postex/orders?startDate=${startDate}&endDate=${endDate}`, {
                        headers: { token: selectedBrand.apiToken, "brand-id": selectedBrand.id }
                    }).then(async r => r.ok ? (await r.json()).dist || [] : [])
                );
            } else {
                promises.push(Promise.resolve([]));
            }

            // 2. Tranzo Fetch
            if (selectedBrand.tranzoApiToken) {
                promises.push(
                    fetch("/api/tranzo/orders", {
                        headers: {
                            "api-token": selectedBrand.tranzoApiToken,
                            "brand-id": selectedBrand.id
                        }
                    }).then(async r => {
                        if (r.ok) {
                            const data = await r.json();
                            return Array.isArray(data) ? data : (data.results || data.orders || []);
                        }
                        return [];
                    })
                );
            } else {
                promises.push(Promise.resolve([]));
            }

            const [postexRaw, tranzoRaw] = await Promise.all(promises);

            // Normalized PostEx
            const postexOrders = postexRaw.map((o: any) => ({
                ...o,
                courier: "PostEx"
            }));

            // Normalize Tranzo (Reuse logic from tranzo page basically)
            const tranzoOrders = tranzoRaw.map((o: any) => {
                const amount = parseFloat(o.cod_amount || o.invoicePayment || "0");
                const status = (o.order_status || o.transactionStatus || o.orderStatus || "Unknown");
                let date = o.created_at || o.booking_date || o.transactionDate || o.orderDate || new Date().toISOString();

                // Fee Logic
                const cityVal = (o.destination_city_name || o.city_name || o.cityName || "Unknown").toLowerCase();
                const statusVal = status.toLowerCase();
                let fee = 0, tax = 0, other = 0;

                if (o.transactionFee !== undefined) {
                    fee = parseFloat(o.transactionFee);
                    tax = parseFloat(o.transactionTax || "0");
                } else {
                    if (!statusVal.includes("cancel")) {
                        if (cityVal.includes("lahore")) { fee = 90; tax = 13.44; other = 4; }
                        else if (cityVal.includes("karachi")) { fee = 140; tax = 21.84; other = 6.5; }
                        else { fee = 130; tax = 20.16; }
                    }
                    fee += other;
                }

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
                    netAmount: amount - (fee + tax),
                    transactionStatus: status,
                    orderStatus: status,
                    courier: "Tranzo",
                    orderType: "COD",
                    actualWeight: parseFloat(o.actual_weight || o.actualWeight || "0.5"),
                    orderDetail: o.order_details || o.orderDetail || "Items",
                    transactionTax: tax,
                    transactionFee: fee,
                } as Order;
            });

            // Filter
            // PostEx is now exact from API so we don't strict filter it (dates might differ slightly in T timezone)
            // Tranzo needs filter.
            const filteredTranzo = tranzoOrders.filter((o: any) => {
                const d = o.orderDate || o.transactionDate || "";
                return d.startsWith(dateStr);
            });

            // Combine PostEx (already filtered by API) + Transport (filtered locally)
            const allOrders = [...postexOrders, ...filteredTranzo];

            // Keep filtered for legacy ref if needed but allOrders uses mixed strategy now
            const filtered = allOrders;

            // FIX: Deduplicate by Tracking Number
            // API or specialized fetch might return duplicates or overlaps
            const uniqueMap = new Map();
            filtered.forEach(o => {
                if (!uniqueMap.has(o.trackingNumber)) {
                    uniqueMap.set(o.trackingNumber, o);
                }
            });
            const uniqueOrders = Array.from(uniqueMap.values());

            console.log(`Daily Fetch Debug: Date=${dateStr}, TotalRaw=${allOrders.length}, Filtered=${filtered.length}, Unique=${uniqueOrders.length}`);
            if (filtered.length !== uniqueOrders.length) {
                console.warn("Duplicate orders detected and removed:", filtered.length - uniqueOrders.length);
            }

            // Calculate Stats
            let rev = 0;
            let pCount = 0;
            let tCount = 0;

            uniqueOrders.forEach((o: any) => {
                const net = parseFloat(o.netAmount || "0");
                const status = (o.orderStatus || "").toLowerCase();

                if (o.courier === "PostEx") pCount++;
                else tCount++;

                if (!status.includes("cancel") && !status.includes("return")) {
                    rev += net;
                }
            });

            setOrders(uniqueOrders as Order[]);
            setStats({
                totalOrders: uniqueOrders.length,
                totalRevenue: rev,
                postexCount: pCount,
                tranzoCount: tCount
            });

        } catch (e) {
            console.error("Daily Fetch Failed", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="p-6 lg:p-10 space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </h1>
                        <p className="text-gray-500">Detailed performance report</p>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Total Income</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {loading ? "..." : `Rs. ${stats.totalRevenue.toLocaleString()}`}
                            </p>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                            <DollarSign className="w-6 h-6" />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Total Orders</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {loading ? "..." : stats.totalOrders}
                            </p>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                            <Package className="w-6 h-6" />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Courier Split</p>
                            <div className="flex gap-3 mt-2">
                                <span className="text-xs font-bold px-2 py-1 bg-orange-100 text-orange-700 rounded-md">PostEx: {stats.postexCount}</span>
                                <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-700 rounded-md">Tranzo: {stats.tranzoCount}</span>
                            </div>
                        </div>
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </div>
                </div>

                {/* Unified Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h3 className="font-bold text-gray-800">Order Manifest</h3>
                    </div>
                    <OrdersTable
                        orders={orders}
                        loading={loading}
                        trackingStatuses={{}}
                        paymentStatuses={{}}
                        refreshTracking={() => { }}
                    />
                </div>
            </div>
        </DashboardLayout>
    );
}
