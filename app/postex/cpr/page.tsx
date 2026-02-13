"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { Receipt, Download, Calendar, Filter, RefreshCw, CheckCircle, Clock, Lock, AlertCircle } from "lucide-react";

interface CPRReceipt {
    cashPaymentReceiptMasterId: number;
    merchantId: number;
    merchantName: string;
    cashPaymentReceiptNumber: string;
    cashPaymentReceiptStatusId: number;
    cashPaymentReceiptStatus: string;
    createDatetime: string;
    approveDate: string;
    netAmount: string;
}

const STATUS_MAP: Record<number, { label: string; color: string; bg: string; icon: any }> = {
    1: { label: "PENDING", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
    2: { label: "APPROVED", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle },
    3: { label: "CLOSED", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Lock },
    4: { label: "PAID", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", icon: CheckCircle },
};

export default function PostExCPRPage() {
    const { selectedBrand } = useBrand();
    const [receipts, setReceipts] = useState<CPRReceipt[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [merchantId, setMerchantId] = useState<string>("");

    const today = new Date();
    const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1);
    const [fromDate, setFromDate] = useState(defaultFrom.toISOString().slice(0, 10));
    const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

    const fetchCPR = async () => {
        if (!selectedBrand?.postexMerchantToken) return;
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (fromDate) params.set("fromDate", fromDate);
            if (toDate) params.set("toDate", toDate);
            if (statusFilter !== "all") params.set("statusId", statusFilter);
            params.set("size", "200");

            const headers: Record<string, string> = {
                "brand-id": sanitizeHeader(selectedBrand.id),
            };

            const res = await fetch(`/api/postex/cpr?${params.toString()}`, { headers });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch CPR data");
            }

            setReceipts(data.receipts || []);
            if (data.merchantId) setMerchantId(data.merchantId);
        } catch (err: any) {
            setError(err.message);
            setReceipts([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedBrand?.postexMerchantToken) {
            fetchCPR();
        }
    }, [selectedBrand]);

    const handleApplyFilters = () => {
        fetchCPR();
    };

    const filteredReceipts = useMemo(() => {
        return receipts;
    }, [receipts]);

    const totalAmount = useMemo(() => filteredReceipts.reduce((sum, r) => sum + parseFloat(r.netAmount || "0"), 0), [filteredReceipts]);
    const approvedAmount = useMemo(() => filteredReceipts.filter(r => r.cashPaymentReceiptStatusId === 2).reduce((sum, r) => sum + parseFloat(r.netAmount || "0"), 0), [filteredReceipts]);
    const closedAmount = useMemo(() => filteredReceipts.filter(r => r.cashPaymentReceiptStatusId === 3).reduce((sum, r) => sum + parseFloat(r.netAmount || "0"), 0), [filteredReceipts]);
    const paidAmount = useMemo(() => filteredReceipts.filter(r => r.cashPaymentReceiptStatusId === 4).reduce((sum, r) => sum + parseFloat(r.netAmount || "0"), 0), [filteredReceipts]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 2 }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
        } catch {
            return dateStr;
        }
    };

    const formatDateTime = (dateStr: string) => {
        if (!dateStr) return "-";
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        } catch {
            return dateStr;
        }
    };

    const exportCSV = () => {
        if (filteredReceipts.length === 0) return;
        const headers = ["CPR Number", "Status", "Net Amount", "Created Date", "Approved Date", "Merchant Name"];
        const rows = filteredReceipts.map(r => [
            r.cashPaymentReceiptNumber,
            r.cashPaymentReceiptStatus,
            r.netAmount,
            r.createDatetime,
            r.approveDate,
            r.merchantName
        ]);
        const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `CPR_${fromDate}_to_${toDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

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
                        <div className="p-2.5 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl text-white shadow-lg">
                            <Receipt size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Payment Receipts (CPR)</h1>
                            <p className="text-sm text-gray-500">
                                PostEx Cash Payment Receipts
                                {merchantId && <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">Merchant #{merchantId}</span>}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={exportCSV} disabled={filteredReceipts.length === 0} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                            <Download size={16} /> Export CSV
                        </button>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">From Date</label>
                        <div className="relative">
                            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">To Date</label>
                        <div className="relative">
                            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Status</label>
                        <div className="relative">
                            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none appearance-none transition-all">
                                <option value="all">All Statuses</option>
                                <option value="1">Pending</option>
                                <option value="2">Approved</option>
                                <option value="3">Closed</option>
                                <option value="4">Paid</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={handleApplyFilters} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl text-sm font-semibold hover:from-orange-600 hover:to-red-600 disabled:opacity-50 shadow-md transition-all">
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        {loading ? "Loading..." : "Fetch Receipts"}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Amount</p>
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
                        <p className="text-xs text-gray-500 mt-1">{filteredReceipts.length} receipts</p>
                    </div>
                    <div className="bg-white border border-green-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-green-500 uppercase tracking-wider mb-1">Approved</p>
                        <p className="text-2xl font-bold text-green-700">{formatCurrency(approvedAmount)}</p>
                        <p className="text-xs text-green-500 mt-1">{filteredReceipts.filter(r => r.cashPaymentReceiptStatusId === 2).length} receipts</p>
                    </div>
                    <div className="bg-white border border-blue-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">Closed</p>
                        <p className="text-2xl font-bold text-blue-700">{formatCurrency(closedAmount)}</p>
                        <p className="text-xs text-blue-500 mt-1">{filteredReceipts.filter(r => r.cashPaymentReceiptStatusId === 3).length} receipts</p>
                    </div>
                    <div className="bg-white border border-indigo-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">Paid</p>
                        <p className="text-2xl font-bold text-indigo-700">{formatCurrency(paidAmount)}</p>
                        <p className="text-xs text-indigo-500 mt-1">{filteredReceipts.filter(r => r.cashPaymentReceiptStatusId === 4).length} receipts</p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                        <AlertCircle size={20} className="text-red-500 shrink-0" />
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Payment Receipts</h3>
                        <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{filteredReceipts.length} records</span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <RefreshCw size={24} className="animate-spin text-gray-300" />
                            <span className="ml-3 text-gray-500">Loading receipts...</span>
                        </div>
                    ) : filteredReceipts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Receipt size={48} className="mb-3 text-gray-200" />
                            <p className="font-medium">No receipts found</p>
                            <p className="text-sm">Try adjusting your date range or filters</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-left">
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">CPR Number</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider text-right">Net Amount</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Created</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Approved</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredReceipts.map((receipt) => {
                                        const statusInfo = STATUS_MAP[receipt.cashPaymentReceiptStatusId] || { label: receipt.cashPaymentReceiptStatus, color: "text-gray-700", bg: "bg-gray-50 border-gray-200", icon: Clock };
                                        const StatusIcon = statusInfo.icon;
                                        return (
                                            <tr key={receipt.cashPaymentReceiptMasterId} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <span className="font-mono text-sm font-medium text-gray-900">{receipt.cashPaymentReceiptNumber}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.bg} ${statusInfo.color}`}>
                                                        <StatusIcon size={12} />
                                                        {statusInfo.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="font-semibold text-gray-900">{formatCurrency(parseFloat(receipt.netAmount || "0"))}</span>
                                                </td>
                                                <td className="px-6 py-4 text-gray-600">{formatDateTime(receipt.createDatetime)}</td>
                                                <td className="px-6 py-4 text-gray-600">{formatDateTime(receipt.approveDate)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                                        <td className="px-6 py-3 font-bold text-gray-900" colSpan={2}>Total</td>
                                        <td className="px-6 py-3 text-right font-bold text-gray-900">{formatCurrency(totalAmount)}</td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
