"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
    Shield, Database, Package, Truck, Users, RefreshCw,
    Activity, Clock, TrendingUp, AlertCircle
} from "lucide-react";

interface AdminStats {
    totalOrders: number;
    postexOrders: number;
    tranzoOrders: number;
    totalBrands: number;
    brands: { id: string; name: string; createdAt: string }[];
    recentOrders: { trackingNumber: string; courier: string; orderStatus: string; orderDate: string; customerName: string; orderAmount: number; brandId: string }[];
    statusCounts: { status: string; count: number }[];
    brandOrderCounts: { brandId: string; courier: string; count: number }[];
}

export default function AdminPanel() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/stats");
            if (!res.ok) throw new Error("Failed to load stats");
            const data = await res.json();
            setStats(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchStats(); }, []);

    const getBrandName = (brandId: string) => {
        return stats?.brands.find(b => b.id === brandId)?.name || brandId;
    };

    return (
        <DashboardLayout>
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-100 rounded-xl">
                            <Shield className="text-indigo-600" size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
                            <p className="text-sm text-gray-500">System overview & database stats</p>
                        </div>
                    </div>
                    <button
                        onClick={fetchStats}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all text-sm font-medium"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                {loading && !stats ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw size={24} className="animate-spin text-indigo-500" />
                    </div>
                ) : stats && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard icon={<Database size={20} />} label="Total Orders" value={stats.totalOrders} color="indigo" />
                            <StatCard icon={<Truck size={20} />} label="PostEx Orders" value={stats.postexOrders} color="orange" />
                            <StatCard icon={<Package size={20} />} label="Tranzo Orders" value={stats.tranzoOrders} color="violet" />
                            <StatCard icon={<Users size={20} />} label="Brands" value={stats.totalBrands} color="emerald" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <Activity size={18} className="text-indigo-500" />
                                    Order Status Breakdown
                                </h2>
                                {stats.statusCounts.length === 0 ? (
                                    <p className="text-gray-400 text-sm">No orders yet</p>
                                ) : (
                                    <div className="space-y-2">
                                        {stats.statusCounts.map((s) => {
                                            const pct = stats.totalOrders > 0 ? (s.count / stats.totalOrders) * 100 : 0;
                                            return (
                                                <div key={s.status} className="flex items-center gap-3">
                                                    <span className="text-sm text-gray-600 w-40 truncate">{s.status}</span>
                                                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                                                        <div
                                                            className="h-full bg-indigo-500 rounded-full transition-all"
                                                            style={{ width: `${Math.max(pct, 1)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-700 w-16 text-right">{s.count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <TrendingUp size={18} className="text-emerald-500" />
                                    Orders per Brand
                                </h2>
                                {stats.brandOrderCounts.length === 0 ? (
                                    <p className="text-gray-400 text-sm">No orders yet</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-100">
                                                    <th className="text-left py-2 text-gray-500 font-medium">Brand</th>
                                                    <th className="text-left py-2 text-gray-500 font-medium">Courier</th>
                                                    <th className="text-right py-2 text-gray-500 font-medium">Orders</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stats.brandOrderCounts.map((b, i) => (
                                                    <tr key={i} className="border-b border-gray-50">
                                                        <td className="py-2 text-gray-800 font-medium">{getBrandName(b.brandId)}</td>
                                                        <td className="py-2">
                                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                b.courier === "PostEx" ? "bg-orange-100 text-orange-700" :
                                                                b.courier === "Tranzo" ? "bg-violet-100 text-violet-700" :
                                                                "bg-gray-100 text-gray-700"
                                                            }`}>{b.courier}</span>
                                                        </td>
                                                        <td className="py-2 text-right font-semibold text-gray-900">{b.count.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Clock size={18} className="text-blue-500" />
                                Recently Synced Orders
                            </h2>
                            {stats.recentOrders.length === 0 ? (
                                <p className="text-gray-400 text-sm">No orders synced yet</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-100">
                                                <th className="text-left py-2 text-gray-500 font-medium">Tracking #</th>
                                                <th className="text-left py-2 text-gray-500 font-medium">Courier</th>
                                                <th className="text-left py-2 text-gray-500 font-medium">Customer</th>
                                                <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                                                <th className="text-right py-2 text-gray-500 font-medium">Amount</th>
                                                <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                                                <th className="text-left py-2 text-gray-500 font-medium">Brand</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.recentOrders.map((o, i) => (
                                                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                                                    <td className="py-2 font-mono text-xs text-gray-700">{o.trackingNumber}</td>
                                                    <td className="py-2">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                            o.courier === "PostEx" ? "bg-orange-100 text-orange-700" :
                                                            o.courier === "Tranzo" ? "bg-violet-100 text-violet-700" :
                                                            "bg-gray-100 text-gray-700"
                                                        }`}>{o.courier}</span>
                                                    </td>
                                                    <td className="py-2 text-gray-800">{o.customerName}</td>
                                                    <td className="py-2">
                                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                                            {o.orderStatus}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 text-right font-medium text-gray-900">
                                                        {o.orderAmount?.toLocaleString("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="py-2 text-gray-500 text-xs">
                                                        {o.orderDate ? new Date(o.orderDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                                                    </td>
                                                    <td className="py-2 text-gray-600 text-xs">{getBrandName(o.brandId)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Users size={18} className="text-emerald-500" />
                                Registered Brands
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {stats.brands.map((brand) => (
                                    <div key={brand.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="font-semibold text-gray-900">{brand.name}</p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Created {new Date(brand.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                        </p>
                                        <p className="text-xs text-gray-400 font-mono mt-0.5">ID: {brand.id}</p>
                                    </div>
                                ))}
                                {stats.brands.length === 0 && (
                                    <p className="text-gray-400 text-sm">No brands registered yet</p>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    const colorClasses: Record<string, string> = {
        indigo: "bg-indigo-100 text-indigo-600",
        orange: "bg-orange-100 text-orange-600",
        violet: "bg-violet-100 text-violet-600",
        emerald: "bg-emerald-100 text-emerald-600",
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl ${colorClasses[color] || "bg-gray-100 text-gray-600"}`}>
                    {icon}
                </div>
                <span className="text-sm text-gray-500">{label}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
        </div>
    );
}
