"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { AlertCircle, Calendar, Download, Receipt, RefreshCw, Search, Wallet } from "lucide-react";

interface MnpPayment {
  trackingNumber?: string;
  paymentId?: string;
  paymentDate?: string;
  rrAmount?: number | string;
  invoiceAmount?: number | string;
  netPayable?: number | string;
  instrumentMode?: string;
  instrumentNumber?: string;
}

const amount = (value: number | string | undefined) => Number(value || 0);
const formatCurrency = (value: number) => `Rs. ${Math.round(value).toLocaleString("en-PK")}`;
const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-PK");
};

export default function MnpPaymentsPage() {
  const { selectedBrand } = useBrand();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payments, setPayments] = useState<MnpPayment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("local");

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
      if (force) params.set("force", "true");
      const response = await fetch(`/api/mnp/payments?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load M&P payments");
      setPayments(Array.isArray(data.payments) ? data.payments : []);
      setSource(data.source || "local");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load M&P payments");
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedBrand]);

  useEffect(() => { loadPayments(false); }, [loadPayments]);

  const filteredPayments = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return payments.filter((payment) => !query || [
      payment.trackingNumber, payment.paymentId, payment.paymentDate,
      payment.instrumentMode, payment.instrumentNumber,
    ].join(" ").toLowerCase().includes(query));
  }, [payments, searchQuery]);

  const totals = useMemo(() => ({
    count: payments.length,
    rrAmount: payments.reduce((sum, payment) => sum + amount(payment.rrAmount), 0),
    invoiceAmount: payments.reduce((sum, payment) => sum + amount(payment.invoiceAmount), 0),
    netPayable: payments.reduce((sum, payment) => sum + amount(payment.netPayable), 0),
    paid: payments.filter((payment) => Boolean(payment.paymentDate)).length,
  }), [payments]);

  const downloadCsv = () => {
    const headers = ["Tracking Number", "Payment ID", "Payment Date", "RR Amount", "Invoice Amount", "Net Payable", "Instrument Mode", "Instrument Number"];
    const rows = filteredPayments.map((payment) => [
      payment.trackingNumber, payment.paymentId, payment.paymentDate,
      payment.rrAmount, payment.invoiceAmount, payment.netPayable, payment.instrumentMode, payment.instrumentNumber,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mnp_payments_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    ["Payment records", totals.count, Receipt],
    ["RR amount", formatCurrency(totals.rrAmount), Receipt],
    ["Invoice amount", formatCurrency(totals.invoiceAmount), Receipt],
    ["Net payable", formatCurrency(totals.netPayable), Wallet],
  ] as const;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 lg:p-10">
        <header className="flex flex-col justify-between gap-6 border-b border-gray-200 pb-6 lg:flex-row lg:items-center">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-orange-600">M&amp;P settlement desk</p>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900"><Wallet className="h-8 w-8 text-orange-600" />M&amp;P Payments</h1>
            <p className="mt-2 text-gray-500">Payment reports, instruments, and payable amounts.</p>
          </div>
          <button onClick={() => loadPayments(true)} disabled={loading || !selectedBrand} className="flex items-center gap-2 self-start rounded-xl bg-orange-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-orange-700 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Syncing..." : "Sync payments"}
          </button>
        </header>
        {error && <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-700"><AlertCircle className="h-5 w-5" />{error}</div>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span><Icon className="h-5 w-5 text-orange-600" /></div><p className="mt-3 text-2xl font-bold text-gray-900">{value}</p></div>)}
        </div>
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <label><span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Month</span><span className="relative block"><Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm" /></span></label>
            <label><span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Search report</span><span className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tracking, payment ID, instrument…" className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm" /></span></label>
            <div className="flex items-end"><button onClick={downloadCsv} disabled={!filteredPayments.length} className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button></div>
          </div>
          <p className="mt-3 text-xs text-gray-400">{source === "live" ? "Showing live M&P payment report data" : "Showing saved payment report data"} · {totals.paid} records include a payment date.</p>
        </section>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>{["Tracking Number", "Payment ID", "Payment Date", "RR Amount", "Invoice Amount", "Net Payable", "Instrument Mode", "Instrument Number"].map((heading) => <th key={heading} className="px-5 py-4">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayments.map((payment, index) => <tr key={`${payment.paymentId ?? "payment"}-${payment.trackingNumber ?? index}`} className="hover:bg-orange-50/30"><td className="px-5 py-4 font-mono text-xs text-blue-600">{payment.trackingNumber || "-"}</td><td className="px-5 py-4 text-gray-700">{payment.paymentId || "-"}</td><td className="px-5 py-4 text-gray-600">{formatDate(payment.paymentDate)}</td><td className="px-5 py-4 text-right">{formatCurrency(amount(payment.rrAmount))}</td><td className="px-5 py-4 text-right">{formatCurrency(amount(payment.invoiceAmount))}</td><td className="px-5 py-4 text-right font-bold text-emerald-700">{formatCurrency(amount(payment.netPayable))}</td><td className="px-5 py-4 text-gray-700">{payment.instrumentMode || "-"}</td><td className="px-5 py-4 font-mono text-xs text-gray-600">{payment.instrumentNumber || "-"}</td></tr>)}
                {!loading && filteredPayments.length === 0 && <tr><td colSpan={8} className="px-5 py-16 text-center text-gray-400">No M&amp;P payment report records found for this month.</td></tr>}
                {loading && <tr><td colSpan={8} className="px-5 py-16 text-center text-gray-400">Loading M&amp;P payment report…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}