"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { AlertTriangle, Download, Filter, Search, ArrowUpDown } from "lucide-react";

interface Discrepancy {
  trackingNumber: string;
  courier: string;
  orderRef: string;
  customerName: string;
  customerPhone: string;
  city: string;
  courierAmount: number;
  courierStatus: string;
  shopifyStatus: string;
  shopifyFulfillment: string;
  orderDate: string;
  orderDetail: string;
  hasShopifyMatch: boolean;
}

interface Summary {
  total: number;
  postex: number;
  tranzo: number;
  totalAmount: number;
}

export default function DiscrepanciesPage() {
  const { selectedBrand } = useBrand();
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, postex: 0, tranzo: 0, totalAmount: 0 });
  const [loading, setLoading] = useState(false);
  const [courierFilter, setCourierFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("orderDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);

  useEffect(() => {
    if (!selectedBrand) return;
    fetchDiscrepancies();
  }, [selectedBrand, courierFilter, startDate, endDate]);

  async function fetchDiscrepancies() {
    if (!selectedBrand) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (courierFilter !== "all") params.set("courier", courierFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/discrepancies?${params}`, {
        headers: { "brand-id": selectedBrand.id },
      });
      const data = await res.json();
      setDiscrepancies(data.discrepancies || []);
      setSummary(data.summary || { total: 0, postex: 0, tranzo: 0, totalAmount: 0 });
    } catch (err) {
      console.error("Failed to fetch discrepancies:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let items = [...discrepancies];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (d) =>
          d.trackingNumber.toLowerCase().includes(q) ||
          d.orderRef.toLowerCase().includes(q) ||
          d.customerName.toLowerCase().includes(q) ||
          d.customerPhone.includes(q) ||
          d.city.toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => {
      let aVal: any = a[sortField as keyof Discrepancy];
      let bVal: any = b[sortField as keyof Discrepancy];
      if (sortField === "courierAmount") {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } else {
        aVal = String(aVal || "").toLowerCase();
        bVal = String(bVal || "").toLowerCase();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [discrepancies, searchQuery, sortField, sortDir]);

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function exportCSV() {
    const headers = [
      "Tracking Number",
      "Courier",
      "Order Ref",
      "Customer",
      "Phone",
      "City",
      "Amount",
      "Courier Status",
      "Shopify Status",
      "Shopify Fulfillment",
      "Order Date",
      "Product",
    ];
    const rows = filtered.map((d) => [
      d.trackingNumber,
      d.courier,
      d.orderRef,
      d.customerName,
      d.customerPhone,
      d.city,
      d.courierAmount.toFixed(2),
      d.courierStatus,
      d.shopifyStatus,
      d.shopifyFulfillment,
      d.orderDate ? new Date(d.orderDate).toLocaleDateString() : "",
      d.orderDetail,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `return-discrepancies-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDate(d: string) {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return d;
    }
  }

  if (!selectedBrand) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center p-8 bg-white rounded-2xl border border-gray-100 shadow-sm max-w-md">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-gray-400" size={28} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No Brand Selected</h2>
            <p className="text-gray-500">Please select a brand from the sidebar to view return discrepancies.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Return Discrepancies</h1>
            <p className="text-gray-500 mt-1">Orders marked as returned by courier but not cancelled/refunded in Shopify</p>
          </div>
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Mismatches</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{summary.total}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">PostEx Returns</p>
            <p className="text-3xl font-bold text-orange-600 mt-1">{summary.postex}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tranzo Returns</p>
            <p className="text-3xl font-bold text-violet-600 mt-1">{summary.tranzo}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Amount at Risk</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">Rs {summary.totalAmount.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <select
                value={courierFilter}
                onChange={(e) => setCourierFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Couriers</option>
                <option value="PostEx">PostEx</option>
                <option value="Tranzo">Tranzo</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by tracking #, order ref, customer, phone, city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <AlertTriangle size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-500">No discrepancies found</p>
              <p className="text-sm mt-1">All returned courier orders match Shopify records for this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[
                      { key: "trackingNumber", label: "Tracking #" },
                      { key: "courier", label: "Courier" },
                      { key: "orderRef", label: "Order Ref" },
                      { key: "customerName", label: "Customer" },
                      { key: "city", label: "City" },
                      { key: "courierAmount", label: "Amount" },
                      { key: "courierStatus", label: "Courier Status" },
                      { key: "shopifyStatus", label: "Shopify Status" },
                      { key: "orderDate", label: "Order Date" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          <ArrowUpDown size={12} className={sortField === col.key ? "text-indigo-600" : "text-gray-300"} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((d, i) => (
                    <tr key={d.trackingNumber + i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{d.trackingNumber}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            d.courier === "PostEx"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-violet-100 text-violet-700"
                          }`}
                        >
                          {d.courier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{d.orderRef}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 font-medium">{d.customerName}</div>
                        {d.customerPhone && <div className="text-gray-400 text-xs">{d.customerPhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{d.city || "-"}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">Rs {d.courierAmount.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {d.courierStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            d.hasShopifyMatch
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {d.shopifyStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(d.orderDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400">
              Showing {filtered.length} discrepanc{filtered.length === 1 ? "y" : "ies"}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
