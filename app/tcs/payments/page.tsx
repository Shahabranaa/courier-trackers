"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { AlertCircle, Calendar, CheckCircle2, Clock3, Download, Receipt, RefreshCw, Search, Wallet, type LucideIcon } from "lucide-react";

interface TcsPayment {
  trackingNumber: string;
  paymentStatus: string;
  paid: boolean;
  bookingDate: string;
  deliveryDate: string;
  paymentDate: string;
  amountPaid: number;
  codAmount: number;
  orderAmount: number;
  weight: number;
  city: string;
  status: string;
  customerReference: string;
  deliveryCharges: number;
  osaCharges: number;
  fuelSurcharge: number;
  salesTax: number;
  whgst: number;
  whit: number;
  additionalWithholding: number;
  withholdingTax: number;
  totalCharges: number;
  totalPayable: number;
}

const formatDate = (value: string) => {
  if (!value || value === "Invalid Date") return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
};

const formatCurrency = (value: number) => `Rs. ${Math.round(value || 0).toLocaleString("en-PK")}`;

const isDeliveredStatus = (status: string) => {
  const normalized = status.toLowerCase();
  return normalized === "delivered" || normalized.startsWith("delivered ") || ["ok", "transferred", "payment transferred"].includes(normalized);
};

const isReturnStatus = (status: string) => {
  const normalized = status.toLowerCase();
  return normalized.includes("return") || ["ro", "rs"].includes(normalized);
};


export default function TcsPaymentsPage() {
  const { selectedBrand } = useBrand();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payments, setPayments] = useState<TcsPayment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("local");
  const customerNumber = selectedBrand?.tcsCustomerNumber?.trim() || "";

  const dateRange = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return { startDate: `${selectedMonth}-01`, endDate: `${selectedMonth}-${String(lastDay).padStart(2, "0")}` };
  }, [selectedMonth]);

  const loadPayments = useCallback(async (force = false) => {
    if (!selectedBrand) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ brandId: selectedBrand.id, ...dateRange });
      if (force) {
        params.set("force", "true");
      }
      const response = await fetch(`/api/tcs/payments?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load TCS payments");
      setPayments(data.payments || []);
      setSource(data.source || "local");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load TCS payments");
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedBrand]);

  useEffect(() => {
    loadPayments(false);
  }, [loadPayments]);

  const filteredPayments = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return payments.filter((payment) => !query || [
      payment.trackingNumber,
      payment.customerReference,
      payment.city,
      payment.status,
      payment.paymentStatus,
    ].join(" ").toLowerCase().includes(query));
  }, [payments, searchQuery]);

  const totals = useMemo(() => ({
    count: payments.length,
    paid: payments.filter((payment) => payment.paid).length,
    unpaid: payments.filter((payment) => !payment.paid).length,
    orderAmount: payments.reduce((sum, payment) => sum + payment.orderAmount, 0),
    amountPaid: payments.reduce((sum, payment) => sum + payment.amountPaid, 0),
    charges: payments.reduce((sum, payment) => sum + payment.totalCharges, 0),
    payable: payments.reduce((sum, payment) => sum + payment.totalPayable, 0),
    delivered: payments.filter((payment) => isDeliveredStatus(payment.status)).length,
    returns: payments.filter((payment) => isReturnStatus(payment.status)).length,
    deliveryCharges: payments.reduce((sum, payment) => sum + payment.deliveryCharges, 0),
    returnShippingDeducted: payments
      .filter((payment) => isReturnStatus(payment.status))
      .reduce((sum, payment) => sum + payment.deliveryCharges, 0),
    osaCharges: payments.reduce((sum, payment) => sum + payment.osaCharges, 0),
    fuelSurcharge: payments.reduce((sum, payment) => sum + payment.fuelSurcharge, 0),
    salesTax: payments.reduce((sum, payment) => sum + payment.salesTax, 0),
    whgst: payments.reduce((sum, payment) => sum + payment.whgst, 0),
    whit: payments.reduce((sum, payment) => sum + payment.whit, 0),
    additionalWithholding: payments.reduce((sum, payment) => sum + payment.additionalWithholding, 0),
  }), [payments]);

  const reconciliation = useMemo(() => {
    const returned = payments.filter((payment) => isReturnStatus(payment.status));
    const delivered = payments.filter((payment) => isDeliveredStatus(payment.status));
    const inTransit = payments.filter((payment) => !isDeliveredStatus(payment.status) && !isReturnStatus(payment.status));
    const deliveredOrderValue = delivered.reduce((sum, payment) => sum + payment.orderAmount, 0);
    const deliveredCharges = delivered.reduce((sum, payment) => sum + payment.totalCharges, 0);
    return {
      returnedOrderValue: returned.reduce((sum, payment) => sum + payment.orderAmount, 0),
      inTransitOrderValue: inTransit.reduce((sum, payment) => sum + payment.orderAmount, 0),
      deliveredOrderValue,
      deliveredCharges,
      deliveredPayable: deliveredOrderValue - deliveredCharges,
      returnShipping: returned.reduce((sum, payment) => sum + payment.deliveryCharges, 0),
      totalPayable: deliveredOrderValue - deliveredCharges - returned.reduce((sum, payment) => sum + payment.deliveryCharges, 0),
    };
  }, [payments]);

  const downloadCsv = () => {
    const headers = ["Tracking #", "Reference", "Booking Date", "City", "Payment Status", "Order Amount", "Amount Paid", "Shipping Fee", "OSA Charges", "Fuel Surcharge", "Sales Tax", "WHGST", "WHIT", "Additional Withholding", "Total Charges", "Total Payable", "Payment Date", "Delivery Date"];
    const rows = filteredPayments.map((payment) => [
      payment.trackingNumber, payment.customerReference, payment.bookingDate, payment.city, payment.paymentStatus,
      payment.orderAmount, payment.amountPaid, payment.deliveryCharges, payment.osaCharges, payment.fuelSurcharge,
      payment.salesTax, payment.whgst, payment.whit, payment.additionalWithholding, payment.totalCharges,
      payment.totalPayable, payment.paymentDate, payment.deliveryDate,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `tcs_payments_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 lg:p-10">
        <div className="flex flex-col justify-between gap-6 border-b border-gray-200 pb-6 lg:flex-row lg:items-center">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900"><Wallet className="h-8 w-8 text-red-600" />TCS Payments</h1>
            <p className="mt-2 text-gray-500">Payment status, COD settlements, and delivery charges</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => loadPayments(true)} disabled={loading || !selectedBrand || !customerNumber} className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-red-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Syncing..." : "Sync Payments"}</button>
          </div>
        </div>
        {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          {([
            ["Total Parcels", totals.count, Receipt, "text-blue-600"],
            ["Order Total", formatCurrency(totals.orderAmount), Receipt, "text-slate-600"],
            ["Total Charges", formatCurrency(totals.charges), Receipt, "text-red-600"],
            ["Total Payable", formatCurrency(totals.payable), Wallet, "text-emerald-600"],
            ["Paid", totals.paid, CheckCircle2, "text-emerald-600"],
            ["Unpaid", totals.unpaid, Clock3, "text-amber-600"],
          ] as [string, string | number, LucideIcon, string][]).map(([label, value, Icon, color]) => (
            <div key={String(label)} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span><Icon className={`h-5 w-5 ${color}`} /></div>
              <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"><span className="block text-xs font-semibold uppercase text-gray-500">TCS Customer Number</span><p className="mt-1 font-mono text-sm text-gray-800">{customerNumber || "Not configured"}</p><a href="/settings" className="mt-1 inline-block text-xs font-medium text-red-600 hover:underline">{customerNumber ? "Update in Settings" : "Configure in Settings"}</a></div>
            <label><span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Month</span><div className="relative"><Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm" /></div></label>
            <label><span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Search</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tracking, city, status…" className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm" /></div></label>
            <div className="flex items-end"><button onClick={downloadCsv} disabled={!filteredPayments.length} className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button></div>
          </div>
          <p className="mt-3 text-xs text-gray-400">{source === "live" ? "Showing live TCS Payment/detail data" : "Showing saved payment data"} · Delivered: {totals.delivered} · Returns: {totals.returns} · In-transit orders are excluded from payable.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
          {[
            ["Shipping Fee", totals.deliveryCharges],
            ["OSA Charges", totals.osaCharges],
            ["Fuel Surcharge", totals.fuelSurcharge],
            ["Sales Tax", totals.salesTax],
            ["WHGST", totals.whgst],
            ["WHIT", totals.whit],
            ["Additional WHT", totals.additionalWithholding],
            ["All Charges", totals.charges],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
              <p className="mt-1 text-sm font-bold text-gray-800">{formatCurrency(Number(value))}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Return settlement adjustment</p>
            <p className="text-sm text-amber-800">Shipping fees deducted for returned orders</p>
          </div>
          <p className="text-lg font-bold text-amber-800">Return shipping deducted: {formatCurrency(totals.returnShippingDeducted)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-bold text-gray-900">Complete payable reconciliation</h2>
              <p className="text-xs text-gray-500">Only delivered orders generate payable value; returned orders contribute a shipping deduction.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">Final: {formatCurrency(reconciliation.totalPayable)}</span>
          </div>
          <div className="grid grid-cols-1 gap-x-10 gap-y-2 text-sm lg:grid-cols-2">
            <div className="flex justify-between border-b border-gray-100 py-2"><span className="text-gray-600">Total orders value</span><span className="font-semibold text-gray-900">{formatCurrency(totals.orderAmount)}</span></div>
            <div className="flex justify-between border-b border-gray-100 py-2"><span className="text-gray-600">Less: undelivered / returned orders</span><span className="font-semibold text-red-600">-{formatCurrency(reconciliation.returnedOrderValue)}</span></div>
            <div className="flex justify-between border-b border-gray-100 py-2"><span className="text-gray-600">Less: in-transit / other orders</span><span className="font-semibold text-red-600">-{formatCurrency(reconciliation.inTransitOrderValue)}</span></div>
            <div className="flex justify-between border-b border-gray-100 py-2"><span className="font-semibold text-gray-700">Delivered orders value</span><span className="font-bold text-gray-900">{formatCurrency(reconciliation.deliveredOrderValue)}</span></div>
            <div className="flex justify-between border-b border-gray-100 py-2"><span className="text-gray-600">Less: charges on delivered orders</span><span className="font-semibold text-red-600">-{formatCurrency(reconciliation.deliveredCharges)}</span></div>
            <div className="flex justify-between border-b border-gray-100 py-2"><span className="font-semibold text-gray-700">Delivered payable</span><span className="font-bold text-gray-900">{formatCurrency(reconciliation.deliveredPayable)}</span></div>
            <div className="flex justify-between border-b border-gray-100 py-2"><span className="text-gray-600">Less: return shipping deducted</span><span className="font-semibold text-red-600">-{formatCurrency(reconciliation.returnShipping)}</span></div>
            <div className="flex justify-between rounded-lg bg-emerald-50 px-3 py-2"><span className="font-bold text-emerald-800">Total payable</span><span className="font-bold text-emerald-800">{formatCurrency(reconciliation.totalPayable)}</span></div>
          </div>
          <p className="mt-3 text-xs text-gray-400">Total charges across all parcels: {formatCurrency(totals.charges)}. Charges from undelivered and in-transit parcels are not applied to payable because those order values are excluded.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-4">Tracking #</th><th className="px-5 py-4">Booking Date</th><th className="px-5 py-4">City</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Payment</th><th className="px-5 py-4 text-right">Order Amount</th><th className="px-5 py-4 text-right">Shipping</th><th className="px-5 py-4 text-right">OSA</th><th className="px-5 py-4 text-right">Fuel</th><th className="px-5 py-4 text-right">Sales Tax</th><th className="px-5 py-4 text-right">WHGST</th><th className="px-5 py-4 text-right">WHIT</th><th className="px-5 py-4 text-right">Add&apos;l WHT</th><th className="px-5 py-4 text-right">Total Charges</th><th className="px-5 py-4 text-right">Total Payable</th><th className="px-5 py-4">Payment Date</th><th className="px-5 py-4">Delivery Date</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayments.map((payment) => <tr key={payment.trackingNumber} className="hover:bg-red-50/30"><td className="px-5 py-4 font-mono text-xs text-blue-600">{payment.trackingNumber}</td><td className="px-5 py-4 text-gray-600">{formatDate(payment.bookingDate)}</td><td className="px-5 py-4 text-gray-800">{payment.city || "-"}</td><td className="px-5 py-4 text-gray-600">{payment.status || "-"}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${payment.paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{payment.paymentStatus}</span></td><td className="px-5 py-4 text-right font-medium">{formatCurrency(payment.orderAmount)}</td><td className="px-5 py-4 text-right text-red-600">-{formatCurrency(payment.deliveryCharges)}</td><td className="px-5 py-4 text-right text-red-600">-{formatCurrency(payment.osaCharges)}</td><td className="px-5 py-4 text-right text-red-600">-{formatCurrency(payment.fuelSurcharge)}</td><td className="px-5 py-4 text-right text-red-600">-{formatCurrency(payment.salesTax)}</td><td className="px-5 py-4 text-right text-red-600">-{formatCurrency(payment.whgst)}</td><td className="px-5 py-4 text-right text-red-600">-{formatCurrency(payment.whit)}</td><td className="px-5 py-4 text-right text-red-600">-{formatCurrency(payment.additionalWithholding)}</td><td className="px-5 py-4 text-right text-red-600">-{formatCurrency(payment.totalCharges)}</td><td className="px-5 py-4 text-right font-bold text-emerald-700">{formatCurrency(payment.totalPayable)}</td><td className="px-5 py-4 text-gray-600">{formatDate(payment.paymentDate)}</td><td className="px-5 py-4 text-gray-600">{formatDate(payment.deliveryDate)}</td></tr>)}
                {!loading && filteredPayments.length === 0 && <tr><td colSpan={17} className="px-5 py-16 text-center text-gray-400">No payment records found for this month. Enter the customer number and sync payments.</td></tr>}
                {loading && <tr><td colSpan={17} className="px-5 py-16 text-center text-gray-400">Loading TCS payment records…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}