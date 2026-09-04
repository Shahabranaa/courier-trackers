"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { AlertCircle, Calendar, Download, FileText, RefreshCw, Search, Wallet } from "lucide-react";

type Payment = {
  trackingNumber: string;
  orderStatus?: string;
  isReturned?: boolean;
  paymentStatus?: string;
  paymentDate?: string;
  paymentMethod?: string;
  invoiceChequeNumber?: string;
  paymentSlipUrl?: string;
  codAmount?: number;
  shippingCharges?: number;
  returnCharges?: number;
  fuelSurcharge?: number;
  transactionTax?: number;
  courierChargesBeforeTax?: number;
  grossCharges?: number;
  chargedWeight?: number;
};

type Cheque = {
  reference: string;
  date?: string;
  method?: string;
  status?: string;
  slipUrl?: string;
  parcels: number;
  cod: number;
  grossCharges: number;
  net: number;
};

const money = (value: number) =>
  `Rs. ${value.toLocaleString("en-PK", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

const netAmount = (payment: Payment) => {
  if (typeof payment.grossCharges !== "number") return null;
  if (payment.isReturned) return -payment.grossCharges;
  return typeof payment.codAmount === "number" ? payment.codAmount - payment.grossCharges : null;
};

export default function LeopardsPaymentsPage() {
  const { selectedBrand } = useBrand();
  const [month, setMonth] = useState(() => {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 7);
  });
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tab, setTab] = useState<"parcels" | "cheques">("parcels");
  const [source, setSource] = useState("local");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    return {
      startDate: `${month}-01`,
      endDate: `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`,
    };
  }, [month]);

  const load = useCallback(async (force = false) => {
    if (!selectedBrand) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ brandId: selectedBrand.id, ...range });
      if (force) params.set("force", "true");
      const response = await fetch(`/api/leopards/payments?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load payments");
      setPayments(data.payments || []);
      setSource(data.source || "local");
      if (data.error) setError(data.error);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load payments");
    } finally {
      setLoading(false);
    }
  }, [range, selectedBrand]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => payments.filter(payment => !search || Object.values(payment).join(" ").toLowerCase().includes(search.toLowerCase())),
    [payments, search],
  );

  const cheques = useMemo(() => {
    const grouped = new Map<string, Cheque>();
    for (const payment of payments) {
      if (!payment.invoiceChequeNumber) continue;
      const existing = grouped.get(payment.invoiceChequeNumber) || {
        reference: payment.invoiceChequeNumber,
        date: payment.paymentDate,
        method: payment.paymentMethod,
        status: payment.paymentStatus,
        slipUrl: payment.paymentSlipUrl,
        parcels: 0,
        cod: 0,
        grossCharges: 0,
        net: 0,
      };
      existing.parcels += 1;
      existing.cod += Number(payment.codAmount || 0);
      existing.grossCharges += Number(payment.grossCharges || 0);
      existing.net += Number(netAmount(payment) || 0);
      grouped.set(payment.invoiceChequeNumber, existing);
    }
    return Array.from(grouped.values()).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [payments]);

  const filteredCheques = useMemo(
    () => cheques.filter(cheque => !search || Object.values(cheque).join(" ").toLowerCase().includes(search.toLowerCase())),
    [cheques, search],
  );

  const totals = useMemo(() => ({
    cod: payments.reduce((sum, payment) => sum + Number(payment.codAmount || 0), 0),
    charges: payments.reduce((sum, payment) => sum + Number(payment.grossCharges || 0), 0),
    net: payments.reduce((sum, payment) => sum + Number(netAmount(payment) || 0), 0),
    chequeValue: cheques.reduce((sum, cheque) => sum + cheque.net, 0),
  }), [cheques, payments]);

  const exportCsv = () => {
    const rows = tab === "parcels"
      ? filtered.map(payment => [
          payment.trackingNumber, payment.invoiceChequeNumber, payment.paymentStatus, payment.paymentDate,
          payment.codAmount, payment.shippingCharges, payment.returnCharges, payment.fuelSurcharge,
          payment.transactionTax, payment.grossCharges, netAmount(payment),
        ])
      : filteredCheques.map(cheque => [
          cheque.reference, cheque.date, cheque.method, cheque.status, cheque.parcels,
          cheque.cod, cheque.grossCharges, cheque.net,
        ]);
    const headings = tab === "parcels"
      ? ["Tracking", "Cheque/reference", "Payment status", "Payment date", "COD", "Shipping", "Return", "Fuel", "GST", "API gross charges", "Net"]
      : ["Cheque/reference", "Date", "Method", "Status", "Parcels", "COD", "API gross charges", "Total value"];
    const csv = [headings, ...rows]
      .map(row => row.map(value => `"${String(value ?? "").replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `leopards_${tab}_${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 bg-slate-50/60 p-6 lg:p-10">
        <header className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold">
              <Wallet className="h-8 w-8 text-teal-600" />
              Leopards Payments
            </h1>
            <p className="mt-2 text-gray-500">COD payment details, cheque references, and shipment charges.</p>
          </div>
          <button onClick={() => load(true)} disabled={loading || !selectedBrand?.leopardsEnabled} className="flex items-center gap-2 self-start rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Syncing payments…" : "Sync payments"}
          </button>
        </header>

        {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["COD value", totals.cod],
            ["API gross charges", totals.charges],
            ["Net amount", totals.net],
            ["Cheque total value", totals.chequeValue],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
              <p className="mt-2 text-2xl font-bold">{money(Number(value))}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center">
          <div className="flex rounded-xl bg-gray-100 p-1">
            <button onClick={() => setTab("parcels")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "parcels" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"}`}>Parcels</button>
            <button onClick={() => setTab("cheques")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "cheques" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"}`}>Cheques ({cheques.length})</button>
          </div>
          <label className="relative">
            <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="rounded-lg border border-gray-200 py-2 pl-10 text-sm" />
          </label>
          <label className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${tab}…`} className="w-full rounded-lg border border-gray-200 py-2 pl-10 text-sm" />
          </label>
          <button onClick={exportCsv} className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700"><Download className="mr-2 inline h-4 w-4" />Export</button>
        </div>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            {tab === "parcels" ? (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Tracking", "Cheque/reference", "Payment", "Date", "COD", "API gross charges", "Net amount", "Slip"].map(heading => <th key={heading} className="px-5 py-4 whitespace-nowrap">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(payment => {
                    const net = netAmount(payment);
                    return <tr key={payment.trackingNumber}>
                      <td className="px-5 py-4 font-mono text-xs text-teal-700">{payment.trackingNumber}</td>
                      <td className="px-5 py-4 font-medium">{payment.invoiceChequeNumber || "—"}</td>
                      <td className="px-5 py-4">{payment.paymentStatus || "—"}</td>
                      <td className="px-5 py-4 text-gray-600">{payment.paymentDate || "—"}</td>
                      <td className="px-5 py-4 whitespace-nowrap">{typeof payment.codAmount === "number" ? money(payment.codAmount) : "—"}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-red-600">{typeof payment.grossCharges === "number" ? `-${money(payment.grossCharges)}` : "—"}</td>
                      <td className={`px-5 py-4 whitespace-nowrap font-bold ${Number(net) < 0 ? "text-red-600" : "text-teal-700"}`}>{net === null ? "—" : money(net)}</td>
                      <td className="px-5 py-4">{payment.paymentSlipUrl ? <a href={payment.paymentSlipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:underline"><FileText className="h-4 w-4" />View</a> : "—"}</td>
                    </tr>;
                  })}
                  {!loading && !filtered.length && <tr><td colSpan={8} className="px-5 py-16 text-center text-gray-400">No saved Leopards payment records for this month. Sync payments after syncing orders.</td></tr>}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Cheque/reference", "Date", "Method", "Status", "Parcels", "COD", "API gross charges", "Total value", "Slip"].map(heading => <th key={heading} className="px-5 py-4 whitespace-nowrap">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCheques.map(cheque => <tr key={cheque.reference}>
                    <td className="px-5 py-4 font-semibold text-teal-700">{cheque.reference}</td>
                    <td className="px-5 py-4 text-gray-600">{cheque.date || "—"}</td>
                    <td className="px-5 py-4">{cheque.method || "—"}</td>
                    <td className="px-5 py-4">{cheque.status || "—"}</td>
                    <td className="px-5 py-4">{cheque.parcels}</td>
                    <td className="px-5 py-4 whitespace-nowrap">{money(cheque.cod)}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-red-600">-{money(cheque.grossCharges)}</td>
                    <td className={`px-5 py-4 whitespace-nowrap font-bold ${cheque.net < 0 ? "text-red-600" : "text-teal-700"}`}>{money(cheque.net)}</td>
                    <td className="px-5 py-4">{cheque.slipUrl ? <a href={cheque.slipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:underline"><FileText className="h-4 w-4" />View</a> : "—"}</td>
                  </tr>)}
                  {!loading && !filteredCheques.length && <tr><td colSpan={9} className="px-5 py-16 text-center text-gray-400">No cheque references were returned for this month.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
          <p className="border-t px-5 py-3 text-xs text-gray-400">
            {source === "live" ? "Live Leopards payment data" : "Saved payment data"} · {tab === "parcels" ? filtered.length : filteredCheques.length} {tab}
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}