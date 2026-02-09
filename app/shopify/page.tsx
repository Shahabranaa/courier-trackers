"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
    ShoppingBag, RefreshCw, Calendar, TrendingUp, Package,
    Truck, ArrowRight, CheckCircle, Clock, XCircle, AlertTriangle
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface ShopifyOrderData {
    shopifyOrderId: string;
    brandId: string;
    orderNumber: string;
    orderName: string;
    customerName: string;
    createdAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    totalPrice: number;
    currency: string;
    lineItems: string;
    fulfillments: string;
    trackingNumbers: string;
    courierPartner: string;
}

interface DailyComparison {
    date: string;
    shopifyOrders: number;
    dispatchedOrders: number;
    postexDispatched: number;
    tranzoDispatched: number;
    unfulfilled: number;
    shopifyRevenue: number;
}

export default function ShopifyOrdersPage() {
    const { selectedBrand } = useBrand();
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [shopifyOrders, setShopifyOrders] = useState<ShopifyOrderData[]>([]);
    const [courierOrders, setCourierOrders] = useState<any[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [error, setError] = useState<string | null>(null);

    const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

    const getDateRange = () => {
        const [year, month] = selectedMonth.split("-").map(Number);
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        return { startDate, endDate };
    };

    const fetchData = async (forceSync = false) => {
        if (!selectedBrand) {
            setLoading(false);
            return;
        }

        if (forceSync) {
            setSyncing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const { startDate, endDate } = getDateRange();
            const promises: Promise<any>[] = [];

            const shopifyUrl = `/api/shopify/orders?startDate=${startDate}&endDate=${endDate}${forceSync ? "&sync=true" : ""}`;
            promises.push(
                fetch(shopifyUrl, { headers: { "brand-id": sanitizeHeader(selectedBrand.id) } })
                    .then(async r => {
                        if (r.ok) return r.json();
                        const err = await r.json().catch(() => ({}));
                        throw new Error(err.error || "Failed to fetch Shopify orders");
                    })
            );

            const courierPromises: Promise<any>[] = [];
            if (selectedBrand.apiToken) {
                const postexUrl = `/api/postex/orders?startDate=${startDate}&endDate=${endDate}`;
                courierPromises.push(
                    fetch(postexUrl, {
                        headers: {
                            token: sanitizeHeader(selectedBrand.apiToken),
                            "brand-id": sanitizeHeader(selectedBrand.id)
                        }
                    }).then(async r => r.ok ? r.json() : { dist: [] })
                );
            }
            if (selectedBrand.tranzoToken) {
                const tranzoUrl = `/api/tranzo/orders?startDate=${startDate}&endDate=${endDate}`;
                courierPromises.push(
                    fetch(tranzoUrl, {
                        headers: {
                            "Authorization": `Bearer ${sanitizeHeader(selectedBrand.tranzoToken)}`,
                            "brand-id": sanitizeHeader(selectedBrand.id)
                        }
                    }).then(async r => r.ok ? r.json() : { results: [] })
                );
            }
            promises.push(Promise.all(courierPromises));

            const [shopifyData, courierResults] = await Promise.all(promises);
            setShopifyOrders(shopifyData.orders || []);

            const allCourier: any[] = [];
            if (courierResults) {
                for (const cr of courierResults) {
                    if (cr.dist) allCourier.push(...cr.dist.map((o: any) => ({ ...o, courier: "PostEx" })));
                    if (cr.results) allCourier.push(...cr.results.map((o: any) => ({ ...o, courier: o.courier || "Tranzo" })));
                }
            }
            setCourierOrders(allCourier);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
            setSyncing(false);
        }
    };

    useEffect(() => {
        fetchData(false);
    }, [selectedMonth, selectedBrand]);

    const { dailyData, totalShopify, totalDispatched, totalUnfulfilled, totalRevenue, fulfillmentRate } = useMemo(() => {
        const dailyMap: Record<string, DailyComparison> = {};
        let totShopify = 0;
        let totDispatched = 0;
        let totUnfulfilled = 0;
        let totRevenue = 0;

        const getDay = (d: string) => d ? d.split("T")[0] : "Unknown";

        shopifyOrders.forEach(o => {
            const day = getDay(o.createdAt);
            if (!dailyMap[day]) {
                dailyMap[day] = { date: day, shopifyOrders: 0, dispatchedOrders: 0, postexDispatched: 0, tranzoDispatched: 0, unfulfilled: 0, shopifyRevenue: 0 };
            }
            dailyMap[day].shopifyOrders += 1;
            dailyMap[day].shopifyRevenue += o.totalPrice;
            totShopify++;
            totRevenue += o.totalPrice;

            const status = (o.fulfillmentStatus || "unfulfilled").toLowerCase();
            if (status === "fulfilled") {
                dailyMap[day].dispatchedOrders += 1;
                totDispatched++;

                const trackingNums: string[] = JSON.parse(o.trackingNumbers || "[]");
                const partner = o.courierPartner?.toLowerCase() || "";

                if (partner.includes("postex") || partner.includes("post ex")) {
                    dailyMap[day].postexDispatched += 1;
                } else if (partner.includes("tranzo")) {
                    dailyMap[day].tranzoDispatched += 1;
                } else if (trackingNums.length > 0) {
                    const matched = courierOrders.find(co =>
                        trackingNums.includes(co.trackingNumber)
                    );
                    if (matched) {
                        if (matched.courier === "PostEx") {
                            dailyMap[day].postexDispatched += 1;
                        } else {
                            dailyMap[day].tranzoDispatched += 1;
                        }
                    } else {
                        dailyMap[day].postexDispatched += 1;
                    }
                } else {
                    dailyMap[day].dispatchedOrders -= 1;
                    totDispatched--;
                    dailyMap[day].unfulfilled += 1;
                    totUnfulfilled++;
                }
            } else if (status === "partial") {
                dailyMap[day].unfulfilled += 1;
                totUnfulfilled++;
            } else {
                dailyMap[day].unfulfilled += 1;
                totUnfulfilled++;
            }
        });

        const sorted = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
        const rate = totShopify > 0 ? Math.round((totDispatched / totShopify) * 100) : 0;

        return {
            dailyData: sorted,
            totalShopify: totShopify,
            totalDispatched: totDispatched,
            totalUnfulfilled: totUnfulfilled,
            totalRevenue: totRevenue,
            fulfillmentRate: rate
        };
    }, [shopifyOrders, courierOrders]);

    const hasShopifyCredentials = selectedBrand?.shopifyStore && selectedBrand?.shopifyAccessToken && selectedBrand.shopifyAccessToken !== "";

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 p-6 lg:p-10">

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <ShoppingBag className="w-8 h-8 text-green-600" />
                            Shopify Orders
                        </h1>
                        <p className="text-gray-500 mt-1">Compare Shopify orders with dispatched shipments across courier partners.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Calendar className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                            />
                        </div>
                        <button
                            onClick={() => fetchData(true)}
                            disabled={syncing || !hasShopifyCredentials}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                            {syncing ? "Syncing..." : "Sync Live Data"}
                        </button>
                    </div>
                </div>

                {!hasShopifyCredentials && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4">
                        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-amber-800">Shopify Not Connected</h3>
                            <p className="text-sm text-amber-700 mt-1">
                                Go to Settings and add your Shopify store domain and Admin API access token to start syncing orders.
                            </p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Shopify Orders</p>
                                <p className="text-3xl font-bold text-gray-900 mt-1">{loading ? "..." : totalShopify.toLocaleString()}</p>
                            </div>
                            <div className="p-2.5 bg-green-50 text-green-600 rounded-xl">
                                <ShoppingBag className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Dispatched</p>
                                <p className="text-3xl font-bold text-gray-900 mt-1">{loading ? "..." : totalDispatched.toLocaleString()}</p>
                            </div>
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                <Truck className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Pending</p>
                                <p className="text-3xl font-bold text-amber-600 mt-1">{loading ? "..." : totalUnfulfilled.toLocaleString()}</p>
                            </div>
                            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                                <Clock className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Fulfillment Rate</p>
                                <p className={`text-3xl font-bold mt-1 ${fulfillmentRate >= 80 ? "text-emerald-600" : fulfillmentRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                                    {loading ? "..." : `${fulfillmentRate}%`}
                                </p>
                            </div>
                            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                                <TrendingUp className="w-6 h-6" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-green-500" />
                            Daily: Shopify Orders vs Dispatched
                        </h3>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(str) => {
                                            const d = new Date(str);
                                            return isNaN(d.getTime()) ? str : d.getDate().toString();
                                        }}
                                        stroke="#9CA3AF"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                                        cursor={{ fill: "#F3F4F6" }}
                                    />
                                    <Legend verticalAlign="top" height={36} iconType="circle" />
                                    <Bar dataKey="shopifyOrders" name="Shopify Orders" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="postexDispatched" name="PostEx" stackId="dispatched" fill="#f97316" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="tranzoDispatched" name="Tranzo" stackId="dispatched" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-gradient-to-br from-green-50 to-white p-6 rounded-2xl border border-green-100 shadow-sm">
                            <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-4">Revenue This Month</h4>
                            <p className="text-3xl font-bold text-gray-900">
                                Rs. {Math.round(totalRevenue).toLocaleString()}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">{totalShopify} total orders</p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-4">Dispatch Summary</h4>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                                        <span className="text-sm text-gray-600">PostEx</span>
                                    </div>
                                    <span className="font-bold text-gray-900">
                                        {dailyData.reduce((acc, d) => acc + d.postexDispatched, 0)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                                        <span className="text-sm text-gray-600">Tranzo</span>
                                    </div>
                                    <span className="font-bold text-gray-900">
                                        {dailyData.reduce((acc, d) => acc + d.tranzoDispatched, 0)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                                        <span className="text-sm text-gray-600">Pending</span>
                                    </div>
                                    <span className="font-bold text-amber-600">{totalUnfulfilled}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900">Daily Breakdown</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Shopify Orders</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">PostEx</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Tranzo</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {dailyData.map(day => (
                                    <tr key={day.date} className="hover:bg-green-50/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {new Date(day.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-md text-xs font-bold">{day.shopifyOrders}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            {day.postexDispatched > 0 ? (
                                                <span className="bg-orange-50 text-orange-700 px-2.5 py-1 rounded-md text-xs font-bold">{day.postexDispatched}</span>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            {day.tranzoDispatched > 0 ? (
                                                <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-md text-xs font-bold">{day.tranzoDispatched}</span>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            {day.unfulfilled > 0 ? (
                                                <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md text-xs font-bold">{day.unfulfilled}</span>
                                            ) : (
                                                <span className="text-emerald-500"><CheckCircle className="w-4 h-4 inline" /></span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-emerald-600 font-mono">
                                            Rs. {Math.round(day.shopifyRevenue).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {dailyData.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-16 text-center text-gray-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="bg-gray-100 p-3 rounded-full">
                                                    <ShoppingBag className="w-6 h-6 text-gray-400" />
                                                </div>
                                                <p>No Shopify orders for this month.</p>
                                                {hasShopifyCredentials && (
                                                    <p className="text-xs text-gray-400">Click "Sync Live Data" to pull orders from Shopify.</p>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900">Recent Orders</h3>
                        <span className="text-sm text-gray-500">{shopifyOrders.length} orders</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Order</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Courier</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {shopifyOrders.slice(0, 50).map(order => {
                                    const fulfillStatus = (order.fulfillmentStatus || "unfulfilled").toLowerCase();
                                    const trackingNums: string[] = JSON.parse(order.trackingNumbers || "[]");

                                    let courierLabel = order.courierPartner || "";
                                    if (!courierLabel && trackingNums.length > 0) {
                                        const matched = courierOrders.find(co => trackingNums.includes(co.trackingNumber));
                                        if (matched) courierLabel = matched.courier;
                                    }

                                    return (
                                        <tr key={order.shopifyOrderId} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-3 text-sm font-medium text-gray-900">{order.orderName}</td>
                                            <td className="px-6 py-3 text-sm text-gray-600">{order.customerName || "-"}</td>
                                            <td className="px-6 py-3 text-sm text-gray-500">
                                                {new Date(order.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                {fulfillStatus === "fulfilled" ? (
                                                    <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-bold">Fulfilled</span>
                                                ) : fulfillStatus === "partial" ? (
                                                    <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-xs font-bold">Partial</span>
                                                ) : (
                                                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-xs font-bold">Unfulfilled</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                {courierLabel ? (
                                                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                                        courierLabel.toLowerCase().includes("postex")
                                                            ? "bg-orange-50 text-orange-700"
                                                            : courierLabel.toLowerCase().includes("tranzo")
                                                                ? "bg-purple-50 text-purple-700"
                                                                : "bg-blue-50 text-blue-700"
                                                    }`}>{courierLabel}</span>
                                                ) : (
                                                    <span className="text-gray-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 text-right text-sm font-bold text-gray-900 font-mono">
                                                Rs. {Math.round(order.totalPrice).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {shopifyOrders.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                                            No orders to display
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
