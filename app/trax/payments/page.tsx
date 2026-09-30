"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, CreditCard, RefreshCw, Wallet } from "lucide-react";

type PaymentRow = {
  trackingNumber: string;
  orderRefNumber?: string;
  customerName?: string;
  orderDate?: string;
  paymentStatus?: string;
  paymentId?: string;
  paymentDate?: string;
  paymentMethod?: string;
  paymentType?: string;
  billingMethod?: string;
  id?: string | number;
  datetime?: string;
  type?: string;
  amount?: string | number;
  charges?: string | number;
  gst?: string | number;
  payable?: string | number;
};

const money = (value: unknown) => {
  const number = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(number) ? `Rs. ${number.toLocaleString("en-PK", { maximumFractionDigits: 2 })}` : "—";
};
const localMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export default function TraxPaymentsPage() {
  const { selectedBrand } = useBrand();
  const [month, setMonth] = useState(localMonth);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const range = useMemo(() => monthRange(month), [month]);

  const loadPayments = useCallback(async () => {
    if (!selectedBrand) {
      setPayments([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ brandId: selectedBrand.id, ...range });
      const response = await fetch(`/api/trax/payments?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load TRAX payment details");
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load TRAX payment details");
    } finally {
      setLoading(false);
    }
  }, [range, selectedBrand]);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const syncPayments = async () => {
    if (!selectedBrand) return;
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/trax/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrand.id, ...range }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "TRAX payment sync failed");
      setPayments(Array.isArray(data.payments) ? data.payments : []);
      const syncMessage = data.emptyReason || `Updated payment details for ${data.fetched || 0} recorded shipment payment entries.`;
      const warningMessage = Array.isArray(data.warnings) && data.warnings.length
        ? ` Some details could not be fetched: ${data.warnings.slice(0, 3).join("; ")}`
        : "";
      setNotice(syncMessage + warningMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "TRAX payment sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const payableTotal = useMemo(() => payments.reduce((sum, row) => {
    const value = Number(String(row.payable ?? "").replace(/,/g, ""));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0), [payments]);
  const shipmentCount = useMemo(() => new Set(payments.map(row => row.trackingNumber)).size, [payments]);

  return <DashboardLayout>
    <div className="flex flex-col gap-6 bg-slate-50/60 p-5 sm:p-6 lg:p-10">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <Link href="/trax" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-sky-700"><ArrowLeft className="h-3.5 w-3.5" />TRAX Portal</Link>
          <div className="flex items-center gap-3"><Wallet className="h-8 w-8 text-sky-600" /><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">TRAX courier</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Payment details</h1></div></div>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Saved payment and charges details returned for this brand’s TRAX shipments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative inline-flex items-center"><Calendar className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" /><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-400" /></label>
          <button onClick={() => void syncPayments()} disabled={syncing || loading || !selectedBrand?.traxEnabled} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />{syncing ? "Syncing payments…" : "Sync payment details"}
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        TRAX returns payment status labels and payment amounts separately. The guide does not define the allowed status values, so this page shows them exactly as returned and does not label an amount as settled.
      </div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
      {selectedBrand && (!selectedBrand.traxEnabled || !selectedBrand.courierCredentials?.trax) && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">TRAX is disabled or not configured for this brand. Update <Link href="/settings" className="font-semibold underline">Settings</Link> to use live sync.</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">Shipments with payment records<CreditCard className="h-4 w-4 text-sky-600" /></p><p className="mt-3 text-2xl font-bold text-slate-950">{shipmentCount}</p></section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">Recorded payable<Wallet className="h-4 w-4 text-sky-600" /></p><p className="mt-3 text-2xl font-bold text-slate-950">{money(payableTotal)}</p></section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-1 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div><h2 className="font-bold text-slate-900">Payment history</h2><p className="mt-1 text-xs text-slate-500">{month} · filtered by locally saved shipment booking date</p></div>
          <span className="text-xs font-medium text-slate-500">{payments.length} entries</span>
        </div>
        {loading && !payments.length ? <div className="p-12 text-center text-sm text-slate-500">Loading saved TRAX payment data…</div>
          : !payments.length ? <div className="p-12 text-center"><Wallet className="mx-auto mb-3 h-9 w-9 text-slate-300" /><p className="font-semibold text-slate-700">No saved payment details</p><p className="mt-1 text-sm text-slate-500">Refresh payment details after booking or adding TRAX shipments.</p></div>
            : <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500"><tr>
                  <th className="px-4 py-3">Tracking</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Payment status</th>
                  <th className="px-4 py-3">Payment date</th><th className="px-4 py-3">Payment ID</th><th className="px-4 py-3">Method / type</th>
                  <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Charges</th><th className="px-4 py-3 text-right">GST</th><th className="px-4 py-3 text-right">Payable</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((row, index) => <tr key={`${row.trackingNumber}-${row.id ?? row.paymentId ?? index}`} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-sky-800">{row.trackingNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{row.orderRefNumber || "—"}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{row.paymentStatus || "—"}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.paymentDate || row.datetime || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.paymentId || row.id || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{[row.paymentMethod, row.paymentType || row.type, row.billingMethod].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{money(row.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{money(row.charges)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{money(row.gst)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{money(row.payable)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>}
      </section>
    </div>
  </DashboardLayout>;
}