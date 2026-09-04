"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { Receipt, Download, Filter, RefreshCw, CheckCircle, Clock, AlertTriangle, Ban, AlertCircle, FileText, ChevronDown, ChevronRight, Package, Loader2 } from "lucide-react";

interface TranzoInvoice {
    id: number;
    invoice_number: string;
    invoice_type: string;
    merchant: string;
    merchant_store: string | null;
    total_orders: number;
    net_amount: string;
    created_at: string;
    created_by: string;
    invoice_status: string;
    approved_at: string | null;
    approved_by: string | null;
    hold_at: string | null;
    hold_by: string | null;
    settled_at: string | null;
    settled_by: string | null;
    disputed_at: string | null;
    disputed_by: string | null;
}

interface InvoiceOrder {
    [key: string]: any;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: any }> = {
    "Approved": { color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle },
    "Settled": { color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", icon: CheckCircle },
    "Hold": { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
    "Disputed": { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: Ban },
    "Pending": { color: "text-gray-700", bg: "bg-gray-50 border-gray-200", icon: Clock },
    "Created": { color: "text-gray-700", bg: "bg-gray-50 border-gray-200", icon: Clock },
};

export default function TranzoInvoicesPage() {
    const { selectedBrand } = useBrand();
    const [invoices, setInvoices] = useState<TranzoInvoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

    const hasToken = selectedBrand?.tranzoMerchantToken && selectedBrand.tranzoMerchantToken !== "";

    const [syncing, setSyncing] = useState(false);

    const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);
    const [invoiceOrders, setInvoiceOrders] = useState<Record<number, InvoiceOrder[]>>({});
    const [orderLoading, setOrderLoading] = useState<Record<number, boolean>>({});
    const [orderError, setOrderError] = useState<Record<number, string>>({});

    const loadInvoicesFromDB = async () => {
        if (!selectedBrand) return;
        setLoading(true);
        setError(null);

        try {
            const headers: Record<string, string> = {
                "brand-id": sanitizeHeader(selectedBrand.id),
            };

            const res = await fetch(`/api/tranzo/invoices`, { headers });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to load invoices");
            }

            setInvoices(data.results || []);
        } catch (err: any) {
            setError(err.message);
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    };

    const syncLiveData = async () => {
        if (!hasToken) return;
        setSyncing(true);
        setError(null);

        try {
            const headers: Record<string, string> = {
                "brand-id": sanitizeHeader(selectedBrand!.id),
            };

            const res = await fetch(`/api/tranzo/invoices`, { method: "POST", headers });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to sync invoices");
            }

            setInvoices(data.results || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSyncing(false);
        }
    };

    const toggleInvoiceExpand = useCallback(async (invoiceId: number) => {
        if (expandedInvoice === invoiceId) {
            setExpandedInvoice(null);
            return;
        }

        setExpandedInvoice(invoiceId);

        if (invoiceOrders[invoiceId]) return;

        setOrderLoading(prev => ({ ...prev, [invoiceId]: true }));
        setOrderError(prev => ({ ...prev, [invoiceId]: "" }));

        try {
            const res = await fetch(`/api/tranzo/invoice-orders?invoice_id=${invoiceId}`, {
                headers: { "brand-id": sanitizeHeader(selectedBrand!.id) }
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to load orders");
            }

            setInvoiceOrders(prev => ({ ...prev, [invoiceId]: data.orders || [] }));
        } catch (err: any) {
            setOrderError(prev => ({ ...prev, [invoiceId]: err.message }));
        } finally {
            setOrderLoading(prev => ({ ...prev, [invoiceId]: false }));
        }
    }, [expandedInvoice, invoiceOrders, selectedBrand]);

    useEffect(() => {
        if (selectedBrand) {
            loadInvoicesFromDB();
        }
    }, [selectedBrand]);

    const filteredInvoices = useMemo(() => {
        if (statusFilter === "all") return invoices;
        return invoices.filter(inv => inv.invoice_status.toLowerCase() === statusFilter.toLowerCase());
    }, [invoices, statusFilter]);

    const totalAmount = useMemo(() => filteredInvoices.reduce((sum, inv) => sum + parseFloat(inv.net_amount || "0"), 0), [filteredInvoices]);
    const totalOrders = useMemo(() => filteredInvoices.reduce((sum, inv) => sum + (inv.total_orders || 0), 0), [filteredInvoices]);
    const approvedAmount = useMemo(() => filteredInvoices.filter(inv => inv.invoice_status === "Approved").reduce((sum, inv) => sum + parseFloat(inv.net_amount || "0"), 0), [filteredInvoices]);
    const settledAmount = useMemo(() => filteredInvoices.filter(inv => inv.invoice_status === "Settled").reduce((sum, inv) => sum + parseFloat(inv.net_amount || "0"), 0), [filteredInvoices]);
    const holdAmount = useMemo(() => filteredInvoices.filter(inv => inv.invoice_status === "Hold").reduce((sum, inv) => sum + parseFloat(inv.net_amount || "0"), 0), [filteredInvoices]);
    const disputedAmount = useMemo(() => filteredInvoices.filter(inv => inv.invoice_status === "Disputed").reduce((sum, inv) => sum + parseFloat(inv.net_amount || "0"), 0), [filteredInvoices]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 2 }).format(amount);
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "-";
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
        } catch {
            return dateStr;
        }
    };

    const exportCSV = () => {
        if (filteredInvoices.length === 0) return;
        const headers = ["Invoice #", "Type", "Status", "Total Orders", "Net Amount", "Created", "Created By", "Approved", "Approved By", "Settled", "Settled By", "Merchant"];
        const rows = filteredInvoices.map(inv => [
            inv.invoice_number,
            inv.invoice_type,
            inv.invoice_status,
            inv.total_orders,
            inv.net_amount,
            inv.created_at,
            inv.created_by,
            inv.approved_at || "",
            inv.approved_by || "",
            inv.settled_at || "",
            inv.settled_by || "",
            inv.merchant
        ]);
        const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Tranzo_Invoices_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const uniqueStatuses = useMemo(() => {
        const statuses = new Set(invoices.map(inv => inv.invoice_status));
        return Array.from(statuses);
    }, [invoices]);

    const getOrderColumns = (orders: InvoiceOrder[]) => {
        if (orders.length === 0) return [];
        const allKeys = new Set<string>();
        orders.forEach(o => Object.keys(o).forEach(k => allKeys.add(k)));
        const priorityKeys = ["tracking_number", "cn_number", "consignee_name", "consignee_phone", "consignee_city", "consignee_address", "order_status", "cod_amount", "delivery_charges", "net_amount", "order_date", "created_at"];
        const ordered: string[] = [];
        priorityKeys.forEach(k => { if (allKeys.has(k)) { ordered.push(k); allKeys.delete(k); } });
        allKeys.forEach(k => {
            if (k !== "id" && k !== "invoice_master_id") ordered.push(k);
        });
        return ordered;
    };

    const formatColumnName = (key: string) => {
        return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    const formatCellValue = (value: any) => {
        if (value === null || value === undefined) return "-";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
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
                        <div className="p-2.5 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl text-white shadow-lg">
                            <Receipt size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Payment Receipts</h1>
                            <p className="text-sm text-gray-500">Tranzo Invoice Logs</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={exportCSV} disabled={filteredInvoices.length === 0} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                            <Download size={16} /> Export CSV
                        </button>
                        <button onClick={syncLiveData} disabled={syncing || !hasToken} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl text-sm font-semibold hover:from-purple-600 hover:to-violet-700 disabled:opacity-50 shadow-md transition-all">
                            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                            {syncing ? "Syncing..." : "Sync Live Data"}
                        </button>
                    </div>
                </div>

                {!hasToken && (
                    <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-3">
                        <AlertCircle size={20} className="text-violet-500 shrink-0" />
                        <p className="text-sm text-violet-700">Tranzo Merchant Token not configured. Go to <a href="/settings" className="underline font-medium">Settings</a> and add your token from portal.tranzo.pk.</p>
                    </div>
                )}

                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Status</label>
                        <div className="relative">
                            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-violet-300 focus:ring-2 focus:ring-violet-100 outline-none appearance-none transition-all">
                                <option value="all">All Statuses</option>
                                {uniqueStatuses.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-1.5 pb-2">
                        <FileText size={14} />
                        {invoices.length} total invoices loaded
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Amount</p>
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
                        <p className="text-xs text-gray-500 mt-1">{filteredInvoices.length} invoices / {totalOrders} orders</p>
                    </div>
                    <div className="bg-white border border-green-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-green-500 uppercase tracking-wider mb-1">Approved</p>
                        <p className="text-2xl font-bold text-green-700">{formatCurrency(approvedAmount)}</p>
                        <p className="text-xs text-green-500 mt-1">{filteredInvoices.filter(inv => inv.invoice_status === "Approved").length} invoices</p>
                    </div>
                    <div className="bg-white border border-indigo-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">Settled</p>
                        <p className="text-2xl font-bold text-indigo-700">{formatCurrency(settledAmount)}</p>
                        <p className="text-xs text-indigo-500 mt-1">{filteredInvoices.filter(inv => inv.invoice_status === "Settled").length} invoices</p>
                    </div>
                    <div className="bg-white border border-amber-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1">On Hold</p>
                        <p className="text-2xl font-bold text-amber-700">{formatCurrency(holdAmount)}</p>
                        <p className="text-xs text-amber-500 mt-1">{filteredInvoices.filter(inv => inv.invoice_status === "Hold").length} invoices</p>
                    </div>
                    <div className="bg-white border border-red-200 rounded-2xl p-5">
                        <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Disputed</p>
                        <p className="text-2xl font-bold text-red-700">{formatCurrency(disputedAmount)}</p>
                        <p className="text-xs text-red-500 mt-1">{filteredInvoices.filter(inv => inv.invoice_status === "Disputed").length} invoices</p>
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
                        <h3 className="font-semibold text-gray-900">Invoice Logs</h3>
                        <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{filteredInvoices.length} records</span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <RefreshCw size={24} className="animate-spin text-gray-300" />
                            <span className="ml-3 text-gray-500">Loading invoices...</span>
                        </div>
                    ) : filteredInvoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Receipt size={48} className="mb-3 text-gray-200" />
                            <p className="font-medium">No invoices found</p>
                            <p className="text-sm">Try adjusting your filters or fetch invoices</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-left">
                                        <th className="px-3 py-3 w-10"></th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Invoice #</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Type</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider text-center">Orders</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider text-right">Net Amount</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Created</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Approved</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Settled</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredInvoices.map((inv) => {
                                        const statusInfo = STATUS_CONFIG[inv.invoice_status] || { color: "text-gray-700", bg: "bg-gray-50 border-gray-200", icon: Clock };
                                        const StatusIcon = statusInfo.icon;
                                        const amount = parseFloat(inv.net_amount || "0");
                                        const isExpanded = expandedInvoice === inv.id;
                                        const orders = invoiceOrders[inv.id] || [];
                                        const isLoadingOrders = orderLoading[inv.id];
                                        const orderErr = orderError[inv.id];
                                        const columns = getOrderColumns(orders);

                                        return (
                                            <>
                                                <tr
                                                    key={inv.id}
                                                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? "bg-violet-50/50" : ""}`}
                                                    onClick={() => hasToken && toggleInvoiceExpand(inv.id)}
                                                >
                                                    <td className="px-3 py-4 text-center">
                                                        {hasToken ? (
                                                            isExpanded ? (
                                                                <ChevronDown size={16} className="text-violet-500 mx-auto" />
                                                            ) : (
                                                                <ChevronRight size={16} className="text-gray-400 mx-auto" />
                                                            )
                                                        ) : null}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="font-mono text-sm font-medium text-gray-900">{inv.invoice_number}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-600 text-xs">{inv.invoice_type}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.bg} ${statusInfo.color}`}>
                                                            <StatusIcon size={12} />
                                                            {inv.invoice_status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="font-semibold text-gray-900">{inv.total_orders}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className={`font-semibold ${amount < 0 ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(amount)}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-gray-600 text-xs">{formatDate(inv.created_at)}</div>
                                                        <div className="text-gray-400 text-[10px]">by {inv.created_by}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {inv.approved_at ? (
                                                            <>
                                                                <div className="text-gray-600 text-xs">{formatDate(inv.approved_at)}</div>
                                                                <div className="text-gray-400 text-[10px]">by {inv.approved_by}</div>
                                                            </>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {inv.settled_at ? (
                                                            <>
                                                                <div className="text-gray-600 text-xs">{formatDate(inv.settled_at)}</div>
                                                                <div className="text-gray-400 text-[10px]">by {inv.settled_by}</div>
                                                            </>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr key={`${inv.id}-details`}>
                                                        <td colSpan={9} className="p-0">
                                                            <div className="bg-violet-50/30 border-t border-b border-violet-100 px-6 py-4">
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <Package size={16} className="text-violet-600" />
                                                                    <h4 className="font-semibold text-sm text-gray-800">
                                                                        Order Details for {inv.invoice_number}
                                                                    </h4>
                                                                    {orders.length > 0 && (
                                                                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">{orders.length} orders</span>
                                                                    )}
                                                                </div>

                                                                {isLoadingOrders ? (
                                                                    <div className="flex items-center justify-center py-8">
                                                                        <Loader2 size={20} className="animate-spin text-violet-500" />
                                                                        <span className="ml-2 text-sm text-gray-500">Loading order details...</span>
                                                                    </div>
                                                                ) : orderErr ? (
                                                                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                                                                        <AlertCircle size={16} className="text-red-500 shrink-0" />
                                                                        <p className="text-sm text-red-700">{orderErr}</p>
                                                                    </div>
                                                                ) : orders.length === 0 ? (
                                                                    <div className="text-center py-6 text-gray-400 text-sm">No orders found for this invoice</div>
                                                                ) : (
                                                                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                                                                        <table className="w-full text-xs">
                                                                            <thead>
                                                                                <tr className="bg-gray-50">
                                                                                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">#</th>
                                                                                    {columns.map(col => (
                                                                                        <th key={col} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                                                                            {formatColumnName(col)}
                                                                                        </th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-gray-100">
                                                                                {orders.map((order, idx) => (
                                                                                    <tr key={order.id || order.tracking_number || order.cn_number || idx} className="hover:bg-gray-50/50">
                                                                                        <td className="px-3 py-2.5 text-gray-400 font-mono">{idx + 1}</td>
                                                                                        {columns.map(col => (
                                                                                            <td key={col} className="px-3 py-2.5 text-gray-700 whitespace-nowrap max-w-[200px] truncate" title={formatCellValue(order[col])}>
                                                                                                {formatCellValue(order[col])}
                                                                                            </td>
                                                                                        ))}
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                                        <td></td>
                                        <td className="px-6 py-3 font-bold text-gray-900" colSpan={3}>Total</td>
                                        <td className="px-6 py-3 text-center font-bold text-gray-900">{totalOrders}</td>
                                        <td className="px-6 py-3 text-right font-bold text-gray-900">{formatCurrency(totalAmount)}</td>
                                        <td colSpan={3}></td>
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
