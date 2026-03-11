"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { Calendar, Users, Package, CheckCircle, TrendingUp, Award, MessageCircle, Loader2 } from "lucide-react";

interface EmployeeStats {
    name: string;
    total: number;
    delivered: number;
    daily: Record<string, number>;
}

interface WhatsAppAnalytics {
    totals: { totalConversations: number; totalConverted: number; conversionRate: number; totalRevenue: number };
    dailyStats: { date: string; total: number; converted: number; conversionRate: number; revenue: number }[];
}

export default function SalesPerformancePage() {
    const { selectedBrand } = useBrand();
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [employees, setEmployees] = useState<EmployeeStats[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const [waAnalytics, setWaAnalytics] = useState<WhatsAppAnalytics | null>(null);
    const [waLoading, setWaLoading] = useState(false);

    const getDateRange = () => {
        const [year, month] = selectedMonth.split("-").map(Number);
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        return { startDate, endDate };
    };

    const fetchWhatsAppAnalytics = useCallback(async () => {
        if (!selectedBrand) return;
        setWaLoading(true);
        try {
            const { startDate, endDate } = getDateRange();
            const res = await fetch(`/api/whatsapp/analytics?startDate=${startDate}&endDate=${endDate}`, {
                headers: { "brand-id": selectedBrand.id },
            });
            if (res.ok) {
                const data = await res.json();
                setWaAnalytics(data);
            } else {
                setWaAnalytics(null);
            }
        } catch {
            setWaAnalytics(null);
        } finally {
            setWaLoading(false);
        }
    }, [selectedBrand, selectedMonth]);

    useEffect(() => {
        if (!selectedBrand) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const { startDate, endDate } = getDateRange();
        fetch(`/api/shopify/sales?startDate=${startDate}&endDate=${endDate}`, {
            headers: { "brand-id": selectedBrand.id },
        })
            .then(r => r.json())
            .then(data => {
                setEmployees(data.employees || []);
                setDates(data.dates || []);
            })
            .catch(() => {
                setEmployees([]);
                setDates([]);
            })
            .finally(() => setLoading(false));

        fetchWhatsAppAnalytics();
    }, [selectedMonth, selectedBrand]);

    const totals = useMemo(() => {
        const totalOrders = employees.reduce((s, e) => s + e.total, 0);
        const totalDelivered = employees.reduce((s, e) => s + e.delivered, 0);
        return { totalOrders, totalDelivered, activeEmployees: employees.length };
    }, [employees]);

    const topPerformer = useMemo(() => {
        if (employees.length === 0) return null;
        return employees[0];
    }, [employees]);

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 p-6 lg:p-10">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <div className="p-2 bg-green-100 text-green-600 rounded-xl">
                                <TrendingUp className="w-7 h-7" />
                            </div>
                            Sales Performance
                        </h1>
                        <p className="text-gray-500 mt-1">Track employee order creation and delivery performance</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
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
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    </div>
                ) : employees.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Sales Data</h3>
                        <p className="text-gray-500">No employee-created orders found for this month.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                                        <Package className="w-5 h-5" />
                                    </div>
                                </div>
                                <p className="text-2xl font-bold text-gray-900">{totals.totalOrders}</p>
                                <p className="text-xs font-medium text-gray-500 mt-1">Total Orders Created</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="p-2 bg-green-50 text-green-500 rounded-xl">
                                        <CheckCircle className="w-5 h-5" />
                                    </div>
                                    {totals.totalOrders > 0 && (
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                                            {((totals.totalDelivered / totals.totalOrders) * 100).toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                                <p className="text-2xl font-bold text-gray-900">{totals.totalDelivered}</p>
                                <p className="text-xs font-medium text-gray-500 mt-1">Total Delivered</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="p-2 bg-violet-50 text-violet-500 rounded-xl">
                                        <Users className="w-5 h-5" />
                                    </div>
                                </div>
                                <p className="text-2xl font-bold text-gray-900">{totals.activeEmployees}</p>
                                <p className="text-xs font-medium text-gray-500 mt-1">Active Employees</p>
                            </div>
                            {topPerformer && (
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="p-2 bg-amber-50 text-amber-500 rounded-xl">
                                            <Award className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 truncate">{topPerformer.name}</p>
                                    <p className="text-xs font-medium text-gray-500 mt-1">Top Performer ({topPerformer.total} orders)</p>
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-6 py-5 border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900">Employee Summary</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50/50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employee</th>
                                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Total Orders</th>
                                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Delivered</th>
                                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Delivery Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {employees.map((emp, idx) => (
                                            <tr key={emp.name} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 text-sm text-gray-400 font-medium">{idx + 1}</td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-semibold text-gray-900">{emp.name}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="text-sm font-bold text-gray-900">{emp.total}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="text-sm font-bold text-green-600">{emp.delivered}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                                        emp.total > 0 && (emp.delivered / emp.total) >= 0.7
                                                            ? "bg-green-100 text-green-700"
                                                            : emp.total > 0 && (emp.delivered / emp.total) >= 0.4
                                                                ? "bg-amber-100 text-amber-700"
                                                                : "bg-gray-100 text-gray-600"
                                                    }`}>
                                                        {emp.total > 0 ? ((emp.delivered / emp.total) * 100).toFixed(1) : "0.0"}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-6 py-5 border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900">Daily Breakdown</h3>
                                <p className="text-sm text-gray-500 mt-1">Orders created per employee per day</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50/50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50/50 z-10">Date</th>
                                            {employees.map(emp => (
                                                <th key={emp.name} className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{emp.name}</th>
                                            ))}
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {dates.map(date => {
                                            const dayTotal = employees.reduce((s, e) => s + (e.daily[date] || 0), 0);
                                            return (
                                                <tr key={date} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-6 py-3 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 whitespace-nowrap">
                                                        {new Date(date + "T00:00:00").toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" })}
                                                    </td>
                                                    {employees.map(emp => (
                                                        <td key={emp.name} className="px-4 py-3 text-center">
                                                            {emp.daily[date] ? (
                                                                <span className="text-sm font-bold text-gray-900">{emp.daily[date]}</span>
                                                            ) : (
                                                                <span className="text-sm text-gray-300">-</span>
                                                            )}
                                                        </td>
                                                    ))}
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="text-sm font-bold text-indigo-600">{dayTotal}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-gray-50 font-semibold">
                                            <td className="px-6 py-3 text-sm font-bold text-gray-900 sticky left-0 bg-gray-50 z-10">Total</td>
                                            {employees.map(emp => (
                                                <td key={emp.name} className="px-4 py-3 text-center text-sm font-bold text-gray-900">{emp.total}</td>
                                            ))}
                                            <td className="px-4 py-3 text-center text-sm font-bold text-indigo-600">{totals.totalOrders}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-50 text-green-500 rounded-xl">
                                    <MessageCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">WhatsApp Conversion</h3>
                                    <p className="text-sm text-gray-500">Messages matched to Shopify orders</p>
                                </div>
                            </div>
                            {waLoading && <Loader2 className="w-5 h-5 text-green-500 animate-spin" />}
                        </div>
                    </div>

                    {waLoading && !waAnalytics ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                        </div>
                    ) : waAnalytics ? (
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Messages Received</p>
                                    <p className="text-2xl font-bold text-gray-900">{waAnalytics.totals.totalConversations}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Orders Converted</p>
                                    <p className="text-2xl font-bold text-emerald-600">{waAnalytics.totals.totalConverted}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Closing Ratio</p>
                                    <p className="text-2xl font-bold text-indigo-600">{waAnalytics.totals.conversionRate}%</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Revenue</p>
                                    <p className="text-2xl font-bold text-gray-900">Rs. {Math.round(waAnalytics.totals.totalRevenue).toLocaleString()}</p>
                                </div>
                            </div>

                            {waAnalytics.dailyStats.length > 0 && (
                                <div className="border border-gray-100 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Messages</th>
                                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Converted</th>
                                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rate</th>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {waAnalytics.dailyStats.map(day => (
                                                <tr key={day.date} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3 text-gray-700 font-medium">
                                                        {new Date(day.date + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", weekday: "short" })}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs font-bold">{day.total}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${day.converted > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>{day.converted}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-xs font-bold ${day.conversionRate >= 50 ? "text-emerald-600" : day.conversionRate >= 25 ? "text-amber-600" : "text-gray-500"}`}>
                                                            {day.conversionRate}%
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs text-gray-600 font-mono">
                                                        {day.revenue > 0 ? `Rs. ${Math.round(day.revenue).toLocaleString()}` : "-"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-400">
                            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-medium">No WhatsApp data available</p>
                            <p className="text-xs text-gray-300 mt-1">Configure WeTarSeel in Settings to see conversion analytics</p>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
