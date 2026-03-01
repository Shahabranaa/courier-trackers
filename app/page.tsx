"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Truck, Package, ArrowRight, BarChart3, ShieldCheck, DollarSign, Calendar, TrendingUp, RefreshCw, Zap, CheckCircle, RotateCcw, Clock, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";

interface DailyStat {
  date: string;
  postexOrders: number;
  postexNet: number;
  tranzoOrders: number;
  tranzoNet: number;
  zoomOrders: number;
  zoomNet: number;
  totalOrders: number;
  totalNet: number;
}

export default function UnifiedDashboard() {
  const { selectedBrand } = useBrand();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  const [postexData, setPostexData] = useState<any[]>([]);
  const [tranzoData, setTranzoData] = useState<any[]>([]);
  const [zoomData, setZoomData] = useState<any[]>([]);

  const [tokensMissing, setTokensMissing] = useState(false);

  const sanitizeHeader = (val?: string) => (val || "").replace(/[^\x00-\x7F]/g, "").trim();

  const getDateRange = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    return { startDate, endDate };
  };

  useEffect(() => {
    loadFromDB();
  }, [selectedMonth, selectedBrand]);

  const fetchData = async (forceSync = false) => {
    setLoading(true);
    setPostexData([]);
    setTranzoData([]);
    setZoomData([]);
    setTokensMissing(false);

    try {
      if (!selectedBrand) {
        setLoading(false);
        return;
      }

      const postexToken = selectedBrand.apiToken;
      const tranzoToken = selectedBrand.tranzoApiToken;
      const postexBrandId = selectedBrand.id;

      if (!postexToken && !tranzoToken) {
        setTokensMissing(true);
      }

      const { startDate, endDate } = getDateRange();
      const promises = [];

      if (postexToken) {
        const url = `/api/postex/orders?startDate=${startDate}&endDate=${endDate}${forceSync ? '&force=true' : ''}`;
        const headers: Record<string, string> = {
          token: sanitizeHeader(postexToken),
          "brand-id": sanitizeHeader(postexBrandId)
        };
        if (selectedBrand.proxyUrl) {
          headers["proxy-url"] = sanitizeHeader(selectedBrand.proxyUrl);
        }
        promises.push(
          fetch(url, { headers }).then(async r => {
            if (r.ok) {
              const data = await r.json();
              return { type: 'postex', data: data.dist || [] };
            }
            return { type: 'postex', data: [] };
          })
        );
      }

      if (tranzoToken) {
        const tranzoParams = new URLSearchParams();
        tranzoParams.set("startDate", startDate);
        tranzoParams.set("endDate", endDate);
        if (forceSync) tranzoParams.set("sync", "true");
        const tranzoUrl = `/api/tranzo/orders?${tranzoParams.toString()}`;
        promises.push(
          fetch(tranzoUrl, {
            headers: {
              "api-token": sanitizeHeader(tranzoToken),
              "brand-id": sanitizeHeader(selectedBrand.id)
            }
          }).then(async r => {
            if (r.ok) {
              const data = await r.json();
              const list = Array.isArray(data) ? data : (data.results || data.orders || []);
              return { type: 'tranzo', data: list };
            }
            return { type: 'tranzo', data: [] };
          })
        );
      }

      const zoomUrl = `/api/zoom/orders?startDate=${startDate}&endDate=${endDate}`;
      promises.push(
        fetch(zoomUrl, {
          headers: { "brand-id": sanitizeHeader(postexBrandId) }
        }).then(async r => {
          if (r.ok) {
            const data = await r.json();
            return { type: 'zoom', data: data.orders || [] };
          }
          return { type: 'zoom', data: [] };
        })
      );

      const results = await Promise.all(promises);

      results.forEach(res => {
        if (res.type === 'postex') setPostexData(res.data);
        if (res.type === 'tranzo') setTranzoData(res.data);
        if (res.type === 'zoom') setZoomData(res.data);
      });

    } catch (e) {
      console.error("Unified Fetch Error", e);
    } finally {
      setLoading(false);
    }
  };

  const loadFromDB = () => fetchData(false);
  const syncLiveData = () => fetchData(true);

  const { totalOrders, totalNet, dailyStats } = useMemo(() => {
    let totOrders = 0;
    let totNet = 0;
    const dailyMap: Record<string, DailyStat> = {};

    const getDay = (d: string) => {
      if (!d) return "Unknown";
      return d.split("T")[0];
    };

    const initDay = (day: string): DailyStat => ({
      date: day, postexOrders: 0, postexNet: 0, tranzoOrders: 0, tranzoNet: 0, zoomOrders: 0, zoomNet: 0, totalOrders: 0, totalNet: 0
    });

    postexData.forEach(o => {
      const day = getDay(o.orderDate || o.transactionDate);
      if (!dailyMap[day]) dailyMap[day] = initDay(day);
      const status = (o.orderStatus || o.transactionStatus || "").toLowerCase();
      const net = parseFloat(o.netAmount || "0");
      if (!status.includes("cancel")) {
        dailyMap[day].postexOrders += 1;
        dailyMap[day].postexNet += net;
        dailyMap[day].totalOrders += 1;
        dailyMap[day].totalNet += net;
        totOrders++;
        totNet += net;
      }
    });

    tranzoData.forEach(o => {
      const day = getDay(o.orderDate || o.transactionDate);
      if (!dailyMap[day]) dailyMap[day] = initDay(day);
      const status = (o.orderStatus || o.transactionStatus || "Unknown").toLowerCase();
      if (status.includes("cancel")) return;
      const isDelivered = status === "delivered" || status.includes("transferred");
      const isReturned = status.includes("return");
      dailyMap[day].tranzoOrders += 1;
      dailyMap[day].totalOrders += 1;
      totOrders++;
      if (isDelivered) {
        const net = parseFloat(o.netAmount || "0");
        dailyMap[day].tranzoNet += net;
        dailyMap[day].totalNet += net;
        totNet += net;
      } else if (isReturned) {
        const fee = parseFloat(o.transactionFee || "0");
        dailyMap[day].tranzoNet -= fee;
        dailyMap[day].totalNet -= fee;
        totNet -= fee;
      }
    });

    zoomData.forEach(o => {
      const day = getDay(o.createdAt || o.orderDate);
      if (!dailyMap[day]) dailyMap[day] = initDay(day);
      const fStatus = (o.fulfillmentStatus || "").toLowerCase();
      const finStatus = (o.financialStatus || "").toLowerCase();
      const tags = (o.tags || "").toLowerCase();
      const isReturned = finStatus === "refunded" || finStatus === "voided" || tags.includes("return");
      const isFulfilled = fStatus === "fulfilled";
      dailyMap[day].zoomOrders += 1;
      dailyMap[day].totalOrders += 1;
      totOrders++;
      const price = parseFloat(o.totalPrice || "0");
      if (isReturned) {
        const fee = 150;
        dailyMap[day].zoomNet -= fee;
        dailyMap[day].totalNet -= fee;
        totNet -= fee;
      } else if (isFulfilled) {
        const net = price - 150 - (price * 0.04);
        dailyMap[day].zoomNet += net;
        dailyMap[day].totalNet += net;
        totNet += net;
      }
    });

    const sortedDays = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    return {
      totalOrders: totOrders,
      totalNet: totNet,
      dailyStats: sortedDays,
    };
  }, [postexData, tranzoData, zoomData]);

  const chartData = useMemo(() => {
    return [...dailyStats].sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyStats]);

  const overallStats = useMemo(() => {
    let delivered = 0, returned = 0, inTransit = 0, deliveredRevenue = 0;

    postexData.forEach(o => {
      const s = (o.orderStatus || o.transactionStatus || "").toLowerCase();
      if (s.includes("cancel")) return;
      if (s.includes("delivered") || s.includes("transferred")) {
        delivered++;
        deliveredRevenue += parseFloat(o.invoicePayment || o.orderAmount || "0");
      } else if (s.includes("return")) {
        returned++;
      } else {
        inTransit++;
      }
    });

    tranzoData.forEach(o => {
      const s = (o.orderStatus || o.transactionStatus || "Unknown").toLowerCase();
      if (s.includes("cancel")) return;
      if (s === "delivered" || s.includes("transferred")) {
        delivered++;
        deliveredRevenue += parseFloat(o.invoicePayment || o.orderAmount || o.booking_amount || "0");
      } else if (s.includes("return")) {
        returned++;
      } else {
        inTransit++;
      }
    });

    zoomData.forEach(o => {
      const fStatus = (o.fulfillmentStatus || "").toLowerCase();
      const finStatus = (o.financialStatus || "").toLowerCase();
      const tags = (o.tags || "").toLowerCase();
      const isReturned = finStatus === "refunded" || finStatus === "voided" || tags.includes("return");
      if (isReturned) {
        returned++;
      } else if (fStatus === "fulfilled") {
        delivered++;
        deliveredRevenue += parseFloat(o.totalPrice || "0");
      } else {
        inTransit++;
      }
    });

    const total = delivered + returned + inTransit;
    const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;
    const returnRate = total > 0 ? (returned / total) * 100 : 0;
    const avgOrderValue = delivered > 0 ? deliveredRevenue / delivered : 0;

    return { delivered, returned, inTransit, total, deliveryRate, returnRate, avgOrderValue };
  }, [postexData, tranzoData, zoomData]);

  const formatRs = (v: number) => `Rs. ${Math.round(v).toLocaleString()}`;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8 p-6 lg:p-10">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Overview</h1>
            <p className="text-gray-500 mt-1">Unified performance metrics for all connected couriers.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={syncLiveData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Sync Live Data
            </button>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm hover:border-gray-300 transition-all cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 flex flex-col justify-between h-32 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Orders</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{loading ? "..." : totalOrders.toLocaleString()}</p>
              </div>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Package className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] border border-gray-100 flex flex-col justify-between h-32 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Net Amount</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{loading ? "..." : formatRs(totalNet)}</p>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(99,102,241,0.1)] border border-gray-100 flex flex-col justify-between h-32 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Active Sources</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${postexData.length > 0 ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-400"}`}>PostEx</span>
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${tranzoData.length > 0 ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400"}`}>Tranzo</span>
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${zoomData.length > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}`}>Zoom</span>
                </div>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle className="w-5 h-5" />
              </div>
              {!loading && overallStats.total > 0 && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {overallStats.deliveryRate.toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? "..." : overallStats.delivered.toLocaleString()}</p>
            <p className="text-xs font-medium text-gray-500 mt-1">Delivered</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-xl">
                <RotateCcw className="w-5 h-5" />
              </div>
              {!loading && overallStats.total > 0 && (
                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  {overallStats.returnRate.toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? "..." : overallStats.returned.toLocaleString()}</p>
            <p className="text-xs font-medium text-gray-500 mt-1">Returned</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-amber-50 text-amber-500 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? "..." : overallStats.inTransit.toLocaleString()}</p>
            <p className="text-xs font-medium text-gray-500 mt-1">In Transit</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                <Target className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? "..." : overallStats.avgOrderValue > 0 ? formatRs(overallStats.avgOrderValue) : "-"}</p>
            <p className="text-xs font-medium text-gray-500 mt-1">Avg Order Value</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Order Volume Trend
            </h3>
            <div className="h-[350px] w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(str) => new Date(str).getDate().toString()}
                    stroke="#9CA3AF"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#F3F4F6' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar dataKey="postexOrders" name="PostEx" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="tranzoOrders" name="Tranzo" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="zoomOrders" name="Zoom" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-4">
            <Link href="/postex" className="block bg-gradient-to-br from-orange-50 to-white p-5 rounded-2xl border border-orange-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white text-orange-600 rounded-xl shadow-sm">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">PostEx</h3>
                    <p className="text-xs text-gray-500">{postexData.length} orders</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-orange-300 group-hover:text-orange-600 transition-colors" />
              </div>
            </Link>
            <Link href="/tranzo" className="block bg-gradient-to-br from-purple-50 to-white p-5 rounded-2xl border border-purple-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white text-purple-600 rounded-xl shadow-sm">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Tranzo</h3>
                    <p className="text-xs text-gray-500">{tranzoData.length} orders</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-purple-300 group-hover:text-purple-600 transition-colors" />
              </div>
            </Link>
            <Link href="/zoom" className="block bg-gradient-to-br from-blue-50 to-white p-5 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white text-blue-600 rounded-xl shadow-sm">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Zoom</h3>
                    <p className="text-xs text-gray-500">{zoomData.length} orders</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-blue-300 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">Daily Courier Breakdown</h3>
            <p className="text-sm text-gray-500 mt-0.5">Net payment and orders per courier, per day (newest first)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="text-center border-l border-gray-100" colSpan={2}>
                    <div className="flex items-center justify-center gap-1.5 py-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">PostEx</span>
                    </div>
                  </th>
                  <th className="text-center border-l border-gray-100" colSpan={2}>
                    <div className="flex items-center justify-center gap-1.5 py-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tranzo</span>
                    </div>
                  </th>
                  <th className="text-center border-l border-gray-100" colSpan={2}>
                    <div className="flex items-center justify-center gap-1.5 py-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Zoom</span>
                    </div>
                  </th>
                  <th className="text-center border-l border-gray-200 bg-gray-100/50" colSpan={2}>
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Total</span>
                  </th>
                </tr>
                <tr className="border-t border-gray-100">
                  <th className="px-5 py-2 text-left text-[10px] font-medium text-gray-400 uppercase"></th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-400 uppercase border-l border-gray-100">Orders</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400 uppercase">Net</th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-400 uppercase border-l border-gray-100">Orders</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400 uppercase">Net</th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-400 uppercase border-l border-gray-100">Orders</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400 uppercase">Net</th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-400 uppercase border-l border-gray-200 bg-gray-100/50">Orders</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400 uppercase bg-gray-100/50">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dailyStats.map((day) => (
                  <tr
                    key={day.date}
                    className="group hover:bg-indigo-50/30 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/daily/${day.date}`}
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm font-medium text-gray-900">
                      {new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-center text-sm border-l border-gray-50">
                      {day.postexOrders > 0 ? <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md text-xs font-bold">{day.postexOrders}</span> : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right text-xs font-mono text-gray-600">
                      {day.postexNet !== 0 ? formatRs(day.postexNet) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-center text-sm border-l border-gray-50">
                      {day.tranzoOrders > 0 ? <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md text-xs font-bold">{day.tranzoOrders}</span> : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right text-xs font-mono text-gray-600">
                      {day.tranzoNet !== 0 ? formatRs(day.tranzoNet) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-center text-sm border-l border-gray-50">
                      {day.zoomOrders > 0 ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-xs font-bold">{day.zoomOrders}</span> : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right text-xs font-mono text-gray-600">
                      {day.zoomNet !== 0 ? formatRs(day.zoomNet) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-center text-sm font-bold text-gray-900 border-l border-gray-200 bg-gray-50/30">
                      {day.totalOrders}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right text-sm font-bold text-emerald-600 font-mono bg-gray-50/30">
                      {formatRs(day.totalNet)}
                    </td>
                  </tr>
                ))}
                {dailyStats.length > 0 && (
                  <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                    <td className="px-5 py-4 text-sm text-gray-700">Monthly Total</td>
                    <td className="px-3 py-4 text-center text-sm text-orange-700 border-l border-gray-100">
                      {dailyStats.reduce((s, d) => s + d.postexOrders, 0) || '-'}
                    </td>
                    <td className="px-3 py-4 text-right text-xs font-mono text-orange-700">
                      {formatRs(dailyStats.reduce((s, d) => s + d.postexNet, 0))}
                    </td>
                    <td className="px-3 py-4 text-center text-sm text-purple-700 border-l border-gray-100">
                      {dailyStats.reduce((s, d) => s + d.tranzoOrders, 0) || '-'}
                    </td>
                    <td className="px-3 py-4 text-right text-xs font-mono text-purple-700">
                      {formatRs(dailyStats.reduce((s, d) => s + d.tranzoNet, 0))}
                    </td>
                    <td className="px-3 py-4 text-center text-sm text-blue-700 border-l border-gray-100">
                      {dailyStats.reduce((s, d) => s + d.zoomOrders, 0) || '-'}
                    </td>
                    <td className="px-3 py-4 text-right text-xs font-mono text-blue-700">
                      {formatRs(dailyStats.reduce((s, d) => s + d.zoomNet, 0))}
                    </td>
                    <td className="px-3 py-4 text-center text-sm text-gray-900 border-l border-gray-200 bg-gray-100/50">
                      {totalOrders}
                    </td>
                    <td className="px-3 py-4 text-right text-sm font-mono text-emerald-700 bg-gray-100/50">
                      {formatRs(totalNet)}
                    </td>
                  </tr>
                )}
                {dailyStats.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <div className="bg-gray-100 p-3 rounded-full"><Calendar className="w-6 h-6 text-gray-400" /></div>
                        <p>No data available for this month.</p>
                        {tokensMissing && <span className="text-red-500 text-xs font-medium bg-red-50 px-3 py-1 rounded-full">Missing API Credentials</span>}
                        {!selectedBrand && <span className="text-indigo-500 text-xs font-medium bg-indigo-50 px-3 py-1 rounded-full">Please Select a Brand</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
