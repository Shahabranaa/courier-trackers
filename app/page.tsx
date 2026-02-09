"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Truck, Package, ArrowRight, BarChart3, ShieldCheck, DollarSign, Calendar, TrendingUp, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";

interface DailyStat {
  date: string;
  postexOrders: number;
  postexRevenue: number;
  tranzoOrders: number;
  tranzoRevenue: number;
  totalOrders: number;
  totalRevenue: number;
}

export default function UnifiedDashboard() {
  const { selectedBrand } = useBrand();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  const [postexData, setPostexData] = useState<any[]>([]);
  const [tranzoData, setTranzoData] = useState<any[]>([]);

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
    setTokensMissing(false);

    try {
      if (!selectedBrand) {
        setLoading(false);
        return;
      }

      const postexToken = selectedBrand.apiToken;
      const tranzoToken = selectedBrand.tranzoToken;
      const postexBrandId = selectedBrand.id;

      if (!postexToken && !tranzoToken) {
        setTokensMissing(true);
        setLoading(false);
        return;
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
              "Authorization": `Bearer ${sanitizeHeader(tranzoToken)}`,
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

      const results = await Promise.all(promises);

      results.forEach(res => {
        if (res.type === 'postex') setPostexData(res.data);
        if (res.type === 'tranzo') setTranzoData(res.data);
      });

    } catch (e) {
      console.error("Unified Fetch Error", e);
    } finally {
      setLoading(false);
    }
  };

  const loadFromDB = () => fetchData(false);
  const syncLiveData = () => fetchData(true);

  // --- Aggregation Logic ---
  const { totalOrders, totalRevenue, dailyStats, statsByCourier } = useMemo(() => {
    let totOrders = 0;
    let totRevenue = 0;
    const dailyMap: Record<string, DailyStat> = {};

    // Helper to init day
    const getDay = (d: string) => {
      // Normalized date string YYYY-MM-DD
      if (!d) return "Unknown";
      return d.split("T")[0]; // ISO to YYYY-MM-DD
    }

    // Process PostEx (DB fields are camelCase)
    postexData.forEach(o => {
      const day = getDay(o.orderDate || o.transactionDate);
      if (!dailyMap[day]) dailyMap[day] = { date: day, postexOrders: 0, postexRevenue: 0, tranzoOrders: 0, tranzoRevenue: 0, totalOrders: 0, totalRevenue: 0 };

      const status = (o.orderStatus || o.transactionStatus || "").toLowerCase();
      const net = parseFloat(o.netAmount || "0");

      if (!status.includes("cancel")) {
        dailyMap[day].postexOrders += 1;
        dailyMap[day].postexRevenue += net;
        dailyMap[day].totalOrders += 1;
        dailyMap[day].totalRevenue += net;

        totOrders++;
        totRevenue += net;
      }
    });

    // Process Tranzo (DB fields are camelCase)
    tranzoData.forEach(o => {
      const day = getDay(o.orderDate || o.transactionDate);
      if (!dailyMap[day]) dailyMap[day] = { date: day, postexOrders: 0, postexRevenue: 0, tranzoOrders: 0, tranzoRevenue: 0, totalOrders: 0, totalRevenue: 0 };

      const status = (o.orderStatus || o.transactionStatus || "Unknown").toLowerCase();
      const net = parseFloat(o.netAmount || "0");

      if (!status.includes("cancel") && !status.includes("return")) {
        dailyMap[day].tranzoOrders += 1;
        dailyMap[day].tranzoRevenue += net;
        dailyMap[day].totalOrders += 1;
        dailyMap[day].totalRevenue += net;

        totOrders++;
        totRevenue += net;
      }
    });

    // Sort Days
    const sortedDays = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalOrders: totOrders,
      totalRevenue: totRevenue,
      dailyStats: sortedDays,
      statsByCourier: [
        { name: 'PostEx', value: postexData.filter(o => !(o.orderStatus || "").toLowerCase().includes("cancel")).length, revenue: postexData.reduce((acc, o) => acc + parseFloat(o.netAmount || "0"), 0) },
        { name: 'Tranzo', value: tranzoData.filter(o => { const s = (o.orderStatus || "").toLowerCase(); return !s.includes("cancel") && !s.includes("return"); }).length, revenue: tranzoData.reduce((acc, o) => acc + parseFloat(o.netAmount || "0"), 0) }
      ]
    };

  }, [postexData, tranzoData]);


  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8 p-6 lg:p-10">

        {/* Page Header Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Overview</h1>
            <p className="text-gray-500 mt-1">Unified performance metrics for all connected couriers.</p>
          </div>

          <div className="flex items-center gap-3">
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


        {/* KPI Cards */}
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
            {lastDayComparison(dailyStats) && (
              <div className="text-xs font-medium text-emerald-600 flex items-center gap-1 mt-auto">
                <TrendingUp size={12} />
                Looking good today
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] border border-gray-100 flex flex-col justify-between h-32 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Net Amount</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{loading ? "..." : `Rs. ${Math.round(totalRevenue).toLocaleString()}`}</p>
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
                </div>

                {/* Sync Button */}
                <button
                  onClick={syncLiveData}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Sync Live Data"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Trend Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Order Volume Trend
            </h3>
            <div className="h-[350px] w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  <YAxis
                    stroke="#9CA3AF"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#F3F4F6' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar dataKey="postexOrders" name="PostEx" stackId="a" fill="#f97316" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="tranzoOrders" name="Tranzo" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Actions / Portal Navigation */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-orange-50 to-white p-6 rounded-2xl border border-orange-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all cursor-pointer">
              <Link href="/postex" className="relative z-10 block h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-white text-orange-600 rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                    <Truck className="w-6 h-6" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-orange-300 group-hover:text-orange-600 transition-colors" />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">PostEx Portal</h3>
                <p className="text-sm text-gray-500 mt-1">Manage bookings & payments</p>
                <div className="mt-6 pt-4 border-t border-orange-100/50 flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Active Orders</span>
                  <span className="font-bold text-gray-900 text-xl">{postexData.length}</span>
                </div>
              </Link>
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-orange-100 rounded-full opacity-50 blur-3xl group-hover:opacity-70 transition-opacity"></div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-white p-6 rounded-2xl border border-purple-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all cursor-pointer">
              <Link href="/tranzo" className="relative z-10 block h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-white text-purple-600 rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                    <Package className="w-6 h-6" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-purple-300 group-hover:text-purple-600 transition-colors" />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">Tranzo Portal</h3>
                <p className="text-sm text-gray-500 mt-1">Manage shipments & fees</p>
                <div className="mt-6 pt-4 border-t border-purple-100/50 flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Active Orders</span>
                  <span className="font-bold text-gray-900 text-xl">{tranzoData.length}</span>
                </div>
              </Link>
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-100 rounded-full opacity-50 blur-3xl group-hover:opacity-70 transition-opacity"></div>
            </div>
          </div>
        </div>

        {/* Detailed Daily Breakdown Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-900">Daily Performance</h3>
            <button className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">View Full Report</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">PostEx</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Tranzo</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dailyStats.map((day) => (
                  <tr
                    key={day.date}
                    className="group hover:bg-indigo-50/30 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/daily/${day.date}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600 font-mono">
                      {day.postexOrders > 0 ? <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md text-xs font-bold">{day.postexOrders}</span> : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600 font-mono">
                      {day.tranzoOrders > 0 ? <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md text-xs font-bold">{day.tranzoOrders}</span> : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-900 font-mono ">
                      {day.totalOrders}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-emerald-600 font-mono">
                      Rs. {day.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-all inline-block" />
                    </td>
                  </tr>
                ))}
                {dailyStats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-gray-500">
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

// Logic Helper
function lastDayComparison(stats: DailyStat[]) {
  // Placeholder logic for "Trend"
  return stats.length > 0;
}
