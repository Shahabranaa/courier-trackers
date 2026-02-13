"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
    DollarSign, TrendingUp, TrendingDown, Wallet, RefreshCw, ChevronDown, ChevronRight,
    AlertCircle, ArrowUpRight, ArrowDownRight, Package, Truck, ShoppingBag,
    Calendar, BarChart3, Receipt
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from "recharts";

interface MonthData {
    month: string;
    totalOrders: number;
    deliveredOrders: number;
    returnedOrders: number;
    grossAmount: number;
    fees: number;
    taxes: number;
    withholdingTax: number;
    upfrontPayments: number;
    netAmount: number;
    days: DayData[];
}

interface DayData {
    date: string;
    totalOrders: number;
    deliveredOrders: number;
    returnedOrders: number;
    grossAmount: number;
    fees: number;
    taxes: number;
    withholdingTax: number;
    upfrontPayments: number;
    netAmount: number;
}

interface CourierData {
    totals: {
        totalOrders: number;
        deliveredOrders: number;
        returnedOrders: number;
        grossAmount: number;
        fees: number;
        taxes: number;
        withholdingTax: number;
        upfrontPayments: number;
        netAmount: number;
    };
    monthly: MonthData[];
}

interface CPRReceipt {
    netAmount: string;
    cashPaymentReceiptStatus: string;
    cashPaymentReceiptStatusId: number;
    createDatetime: string;
}

interface TranzoInvoice {
    net_amount: string;
    invoice_status: string;
    created_at: string;
}

type TimePeriod = "current" | "previous" | "all";

export default function FinancePage() {
    const { selectedBrand } = useBrand();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");

    const [postexData, setPostexData] = useState<CourierData | null>(null);
    const [tranzoData, setTranzoData] = useState<CourierData | null>(null);
    const [shopifyData, setShopifyData] = useState<{ totalRevenue: number; totalOrders: number; monthly: any[] } | null>(null);

    const [postexReceiptsLoading, setPostexReceiptsLoading] = useState(false);
    const [tranzoReceiptsLoading, setTranzoReceiptsLoading] = useState(false);

    const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

    const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

    const fetchFinanceData = async () => {
        if (!selectedBrand) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/finance", {
                headers: { "brand-id": sanitizeHeader(selectedBrand.id) }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to fetch finance data");
            setPostexData(data.postex);
            setTranzoData(data.tranzo);
            setShopifyData(data.shopify);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const [allCprReceipts, setAllCprReceipts] = useState<CPRReceipt[]>([]);

    const fetchPostexReceipts = async () => {
        if (!selectedBrand) return;
        setPostexReceiptsLoading(true);
        try {
            const res = await fetch("/api/postex/cpr", {
                headers: { "brand-id": sanitizeHeader(selectedBrand.id) }
            });
            const data = await res.json();
            if (res.ok && data.receipts) {
                setAllCprReceipts(data.receipts);
            }
        } catch (err) {
            console.error("Failed to fetch PostEx receipts:", err);
        } finally {
            setPostexReceiptsLoading(false);
        }
    };

    const [allTranzoInvoices, setAllTranzoInvoices] = useState<TranzoInvoice[]>([]);

    const fetchTranzoReceipts = async () => {
        if (!selectedBrand) return;
        setTranzoReceiptsLoading(true);
        try {
            const res = await fetch("/api/tranzo/invoices", {
                headers: { "brand-id": sanitizeHeader(selectedBrand.id) }
            });
            const data = await res.json();
            if (res.ok && data.results) {
                setAllTranzoInvoices(data.results);
            }
        } catch (err) {
            console.error("Failed to fetch Tranzo invoices:", err);
        } finally {
            setTranzoReceiptsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedBrand) {
            fetchFinanceData();
            fetchPostexReceipts();
            fetchTranzoReceipts();
        }
    }, [selectedBrand]);

    const filterMonthly = (monthly: MonthData[] | undefined): MonthData[] => {
        if (!monthly) return [];
        if (timePeriod === "current") return monthly.filter(m => m.month === currentMonthKey);
        if (timePeriod === "previous") return monthly.filter(m => m.month === prevMonthKey);
        return monthly;
    };

    const sumMonthly = (monthly: MonthData[]) => {
        return monthly.reduce((acc, m) => ({
            totalOrders: acc.totalOrders + m.totalOrders,
            deliveredOrders: acc.deliveredOrders + m.deliveredOrders,
            returnedOrders: acc.returnedOrders + m.returnedOrders,
            grossAmount: acc.grossAmount + m.grossAmount,
            fees: acc.fees + m.fees,
            taxes: acc.taxes + m.taxes,
            withholdingTax: acc.withholdingTax + m.withholdingTax,
            upfrontPayments: acc.upfrontPayments + m.upfrontPayments,
            netAmount: acc.netAmount + m.netAmount,
        }), { totalOrders: 0, deliveredOrders: 0, returnedOrders: 0, grossAmount: 0, fees: 0, taxes: 0, withholdingTax: 0, upfrontPayments: 0, netAmount: 0 });
    };

    const postexFiltered = filterMonthly(postexData?.monthly);
    const tranzoFiltered = filterMonthly(tranzoData?.monthly);
    const postexSum = sumMonthly(postexFiltered);
    const tranzoSum = sumMonthly(tranzoFiltered);

    const filteredCprTotal = useMemo(() => {
        const validStatuses = [2, 3, 4];
        let filtered = allCprReceipts.filter((r: CPRReceipt) => validStatuses.includes(r.cashPaymentReceiptStatusId));

        if (timePeriod === "current") {
            filtered = filtered.filter((r: CPRReceipt) => (r.createDatetime || "").startsWith(currentMonthKey));
        } else if (timePeriod === "previous") {
            filtered = filtered.filter((r: CPRReceipt) => (r.createDatetime || "").startsWith(prevMonthKey));
        }

        return filtered.reduce((sum: number, r: CPRReceipt) => sum + parseFloat(r.netAmount || "0"), 0);
    }, [allCprReceipts, timePeriod, currentMonthKey, prevMonthKey]);

    const postexPaymentsReceived = filteredCprTotal;

    const filteredTranzoTotal = useMemo(() => {
        let filtered = allTranzoInvoices.filter((inv: TranzoInvoice) => ["Approved", "Settled"].includes(inv.invoice_status));

        if (timePeriod === "current") {
            filtered = filtered.filter((inv: TranzoInvoice) => (inv.created_at || "").startsWith(currentMonthKey));
        } else if (timePeriod === "previous") {
            filtered = filtered.filter((inv: TranzoInvoice) => (inv.created_at || "").startsWith(prevMonthKey));
        }

        return filtered.reduce((sum: number, inv: TranzoInvoice) => sum + parseFloat(inv.net_amount || "0"), 0);
    }, [allTranzoInvoices, timePeriod, currentMonthKey, prevMonthKey]);

    const tranzoPaymentsReceived = filteredTranzoTotal;

    const postexOwed = useMemo(() => {
        return postexSum.netAmount - postexPaymentsReceived;
    }, [postexSum, postexPaymentsReceived]);

    const tranzoOwed = useMemo(() => {
        return tranzoSum.netAmount - tranzoPaymentsReceived;
    }, [tranzoSum, tranzoPaymentsReceived]);

    const shopifyRevenue = shopifyData?.totalRevenue || 0;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    };

    const formatCurrencyFull = (amount: number) => {
        return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 2 }).format(amount);
    };

    const formatMonthLabel = (monthKey: string) => {
        if (monthKey === "Unknown") return "Unknown";
        const [year, month] = monthKey.split("-");
        const d = new Date(parseInt(year), parseInt(month) - 1);
        return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    };

    const formatDateLabel = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        } catch {
            return dateStr;
        }
    };

    const toggleMonth = (key: string) => {
        setExpandedMonths(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const chartData = useMemo(() => {
        if (!postexData?.monthly && !tranzoData?.monthly) return [];
        const allMonths = new Set<string>();
        postexData?.monthly.forEach(m => allMonths.add(m.month));
        tranzoData?.monthly.forEach(m => allMonths.add(m.month));

        const sorted = Array.from(allMonths).filter(m => m !== "Unknown").sort();
        return sorted.map(month => {
            const pe = postexData?.monthly.find(m => m.month === month);
            const tr = tranzoData?.monthly.find(m => m.month === month);
            const sh = shopifyData?.monthly.find((m: any) => m.month === month);
            return {
                month: formatMonthLabel(month),
                PostEx: pe ? Math.round(pe.netAmount) : 0,
                Tranzo: tr ? Math.round(tr.netAmount) : 0,
                Shopify: sh ? Math.round(sh.revenue) : 0,
            };
        });
    }, [postexData, tranzoData, shopifyData]);

    if (!selectedBrand) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                        <AlertCircle size={48} className="mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium">No brand selected</p>
                        <p className="text-sm">Please select or create a brand in Settings</p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-white shadow-lg">
                            <Wallet size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
                            <p className="text-sm text-gray-500">Payment tracking & courier settlements</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 rounded-xl p-1">
                            {([["current", "This Month"], ["previous", "Last Month"], ["all", "All Time"]] as [TimePeriod, string][]).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setTimePeriod(key)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${timePeriod === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => { fetchFinanceData(); fetchPostexReceipts(); fetchTranzoReceipts(); }}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 shadow-md transition-all"
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                            Refresh
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                        <AlertCircle size={20} className="text-red-500 shrink-0" />
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw size={24} className="animate-spin text-gray-300" />
                        <span className="ml-3 text-gray-500">Loading financial data...</span>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-2xl p-5 relative overflow-hidden">
                                <div className="absolute top-3 right-3 p-2 bg-white/60 rounded-lg">
                                    <Truck size={18} className="text-orange-500" />
                                </div>
                                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-1">PostEx Owes You</p>
                                <p className={`text-2xl font-bold ${postexOwed >= 0 ? "text-orange-800" : "text-red-600"}`}>
                                    {formatCurrency(postexOwed)}
                                </p>
                                <div className="flex items-center gap-1 mt-2 text-xs text-orange-600">
                                    {postexOwed >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    <span>Net: {formatCurrency(postexData?.totals.netAmount || 0)} - CPR: {formatCurrency(postexPaymentsReceived)}</span>
                                </div>
                                {postexReceiptsLoading && <p className="text-[10px] text-orange-400 mt-1">Fetching receipts...</p>}
                            </div>

                            <div className="bg-gradient-to-br from-purple-50 to-violet-100 border border-purple-200 rounded-2xl p-5 relative overflow-hidden">
                                <div className="absolute top-3 right-3 p-2 bg-white/60 rounded-lg">
                                    <Package size={18} className="text-purple-500" />
                                </div>
                                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1">Tranzo Owes You</p>
                                <p className={`text-2xl font-bold ${tranzoOwed >= 0 ? "text-purple-800" : "text-red-600"}`}>
                                    {formatCurrency(tranzoOwed)}
                                </p>
                                <div className="flex items-center gap-1 mt-2 text-xs text-purple-600">
                                    {tranzoOwed >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    <span>Net: {formatCurrency(tranzoData?.totals.netAmount || 0)} | Received: {formatCurrency(tranzoPaymentsReceived)}</span>
                                </div>
                                {tranzoReceiptsLoading && <p className="text-[10px] text-purple-400 mt-1">Fetching invoices...</p>}
                            </div>

                            <div className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-2xl p-5 relative overflow-hidden">
                                <div className="absolute top-3 right-3 p-2 bg-white/60 rounded-lg">
                                    <ShoppingBag size={18} className="text-green-500" />
                                </div>
                                <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">Shopify Revenue</p>
                                <p className="text-2xl font-bold text-green-800">{formatCurrency(shopifyRevenue)}</p>
                                <p className="text-xs text-green-600 mt-2">{shopifyData?.totalOrders || 0} total orders</p>
                            </div>

                            <div className="bg-gradient-to-br from-teal-50 to-cyan-100 border border-teal-200 rounded-2xl p-5 relative overflow-hidden">
                                <div className="absolute top-3 right-3 p-2 bg-white/60 rounded-lg">
                                    <DollarSign size={18} className="text-teal-500" />
                                </div>
                                <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-1">Total Owed To You</p>
                                <p className={`text-2xl font-bold ${(postexOwed + tranzoOwed) >= 0 ? "text-teal-800" : "text-red-600"}`}>
                                    {formatCurrency(postexOwed + tranzoOwed)}
                                </p>
                                <p className="text-xs text-teal-600 mt-2">Combined courier balance</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-orange-100 rounded-lg">
                                        <Truck size={18} className="text-orange-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">PostEx Settlement</h3>
                                        <p className="text-xs text-gray-500">{timePeriod === "current" ? "This month" : timePeriod === "previous" ? "Last month" : "All time"}</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-gray-600">Gross Order Value (COD)</span>
                                        <span className="font-semibold text-gray-900">{formatCurrencyFull(postexSum.grossAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-red-500">(-) Delivery Fees</span>
                                        <span className="font-semibold text-red-600">-{formatCurrencyFull(postexSum.fees)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-red-500">(-) Taxes</span>
                                        <span className="font-semibold text-red-600">-{formatCurrencyFull(postexSum.taxes)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-red-500">(-) Withholding Tax (4%)</span>
                                        <span className="font-semibold text-red-600">-{formatCurrencyFull(postexSum.withholdingTax)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-200 bg-gray-50 -mx-6 px-6">
                                        <span className="text-sm font-bold text-gray-900">Net Amount Owed</span>
                                        <span className="font-bold text-gray-900">{formatCurrencyFull(postexSum.netAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-emerald-600">CPR Payments Received</span>
                                        <span className="font-semibold text-emerald-600">{formatCurrencyFull(postexPaymentsReceived)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 bg-orange-50 -mx-6 px-6 rounded-b-xl">
                                        <span className="text-sm font-bold text-orange-800">Balance Owed</span>
                                        <span className={`text-lg font-bold ${postexOwed >= 0 ? "text-orange-800" : "text-red-600"}`}>{formatCurrencyFull(postexOwed)}</span>
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-lg font-bold text-gray-900">{postexSum.totalOrders}</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Orders</p>
                                    </div>
                                    <div className="bg-green-50 rounded-xl p-3">
                                        <p className="text-lg font-bold text-green-700">{postexSum.deliveredOrders}</p>
                                        <p className="text-[10px] text-green-600 uppercase tracking-wider">Delivered</p>
                                    </div>
                                    <div className="bg-red-50 rounded-xl p-3">
                                        <p className="text-lg font-bold text-red-700">{postexSum.returnedOrders}</p>
                                        <p className="text-[10px] text-red-600 uppercase tracking-wider">Returned</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-purple-100 rounded-lg">
                                        <Package size={18} className="text-purple-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">Tranzo Settlement</h3>
                                        <p className="text-xs text-gray-500">{timePeriod === "current" ? "This month" : timePeriod === "previous" ? "Last month" : "All time"}</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-gray-600">Gross Order Value (COD)</span>
                                        <span className="font-semibold text-gray-900">{formatCurrencyFull(tranzoSum.grossAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-red-500">(-) Delivery Fees</span>
                                        <span className="font-semibold text-red-600">-{formatCurrencyFull(tranzoSum.fees)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-red-500">(-) Taxes</span>
                                        <span className="font-semibold text-red-600">-{formatCurrencyFull(tranzoSum.taxes)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-200 bg-gray-50 -mx-6 px-6">
                                        <span className="text-sm font-bold text-gray-900">Net Amount Owed</span>
                                        <span className="font-bold text-gray-900">{formatCurrencyFull(tranzoSum.netAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-sm text-emerald-600">Invoice Payments Received</span>
                                        <span className="font-semibold text-emerald-600">{formatCurrencyFull(tranzoPaymentsReceived)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 bg-purple-50 -mx-6 px-6 rounded-b-xl">
                                        <span className="text-sm font-bold text-purple-800">Balance Owed</span>
                                        <span className={`text-lg font-bold ${tranzoOwed >= 0 ? "text-purple-800" : "text-red-600"}`}>{formatCurrencyFull(tranzoOwed)}</span>
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-lg font-bold text-gray-900">{tranzoSum.totalOrders}</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Orders</p>
                                    </div>
                                    <div className="bg-green-50 rounded-xl p-3">
                                        <p className="text-lg font-bold text-green-700">{tranzoSum.deliveredOrders}</p>
                                        <p className="text-[10px] text-green-600 uppercase tracking-wider">Delivered</p>
                                    </div>
                                    <div className="bg-red-50 rounded-xl p-3">
                                        <p className="text-lg font-bold text-red-700">{tranzoSum.returnedOrders}</p>
                                        <p className="text-[10px] text-red-600 uppercase tracking-wider">Returned</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {chartData.length > 1 && (
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-teal-100 rounded-lg">
                                        <BarChart3 size={18} className="text-teal-600" />
                                    </div>
                                    <h3 className="font-bold text-gray-900">Monthly Revenue Comparison</h3>
                                </div>
                                <div className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} barGap={4}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                                            <Tooltip
                                                formatter={(value: any) => formatCurrency(Number(value || 0))}
                                                contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                                            <Bar dataKey="PostEx" fill="#f97316" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Tranzo" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Shopify" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                                    <Truck size={16} className="text-orange-500" />
                                    <h3 className="font-semibold text-gray-900">PostEx Monthly Breakdown</h3>
                                </div>
                                {postexFiltered.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-sm">No data for this period</div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {postexFiltered.map(m => (
                                            <div key={`pe-${m.month}`}>
                                                <button
                                                    onClick={() => toggleMonth(`pe-${m.month}`)}
                                                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {expandedMonths[`pe-${m.month}`] ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                                                        <div className="text-left">
                                                            <p className="font-semibold text-gray-900">{formatMonthLabel(m.month)}</p>
                                                            <p className="text-xs text-gray-500">{m.totalOrders} orders / {m.deliveredOrders} delivered</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-gray-900">{formatCurrency(m.netAmount)}</p>
                                                        <p className="text-xs text-gray-500">Net amount</p>
                                                    </div>
                                                </button>
                                                {expandedMonths[`pe-${m.month}`] && (
                                                    <div className="bg-gray-50 border-t border-gray-100">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="text-gray-500 uppercase tracking-wider">
                                                                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                                                                    <th className="px-4 py-2 text-center font-semibold">Orders</th>
                                                                    <th className="px-4 py-2 text-right font-semibold">Gross</th>
                                                                    <th className="px-4 py-2 text-right font-semibold">Fees</th>
                                                                    <th className="px-4 py-2 text-right font-semibold">Net</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {m.days.map((d: DayData) => (
                                                                    <tr key={d.date} className="hover:bg-white transition-colors">
                                                                        <td className="px-4 py-2.5 text-gray-700 font-medium">{formatDateLabel(d.date)}</td>
                                                                        <td className="px-4 py-2.5 text-center text-gray-600">{d.totalOrders}</td>
                                                                        <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(d.grossAmount)}</td>
                                                                        <td className="px-4 py-2.5 text-right text-red-500">-{formatCurrency(d.fees + d.taxes + d.withholdingTax)}</td>
                                                                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(d.netAmount)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                                    <Package size={16} className="text-purple-500" />
                                    <h3 className="font-semibold text-gray-900">Tranzo Monthly Breakdown</h3>
                                </div>
                                {tranzoFiltered.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-sm">No data for this period</div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {tranzoFiltered.map(m => (
                                            <div key={`tr-${m.month}`}>
                                                <button
                                                    onClick={() => toggleMonth(`tr-${m.month}`)}
                                                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {expandedMonths[`tr-${m.month}`] ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                                                        <div className="text-left">
                                                            <p className="font-semibold text-gray-900">{formatMonthLabel(m.month)}</p>
                                                            <p className="text-xs text-gray-500">{m.totalOrders} orders / {m.deliveredOrders} delivered</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-gray-900">{formatCurrency(m.netAmount)}</p>
                                                        <p className="text-xs text-gray-500">Net amount</p>
                                                    </div>
                                                </button>
                                                {expandedMonths[`tr-${m.month}`] && (
                                                    <div className="bg-gray-50 border-t border-gray-100">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="text-gray-500 uppercase tracking-wider">
                                                                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                                                                    <th className="px-4 py-2 text-center font-semibold">Orders</th>
                                                                    <th className="px-4 py-2 text-right font-semibold">Gross</th>
                                                                    <th className="px-4 py-2 text-right font-semibold">Fees</th>
                                                                    <th className="px-4 py-2 text-right font-semibold">Net</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {m.days.map((d: DayData) => (
                                                                    <tr key={d.date} className="hover:bg-white transition-colors">
                                                                        <td className="px-4 py-2.5 text-gray-700 font-medium">{formatDateLabel(d.date)}</td>
                                                                        <td className="px-4 py-2.5 text-center text-gray-600">{d.totalOrders}</td>
                                                                        <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(d.grossAmount)}</td>
                                                                        <td className="px-4 py-2.5 text-right text-red-500">-{formatCurrency(d.fees + d.taxes)}</td>
                                                                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(d.netAmount)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
