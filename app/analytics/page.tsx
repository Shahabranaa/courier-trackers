"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area, Cell
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowUp, ArrowDown,
  Package, DollarSign, CalendarDays, MapPin,
  BarChart3, Loader2, AlertCircle, Trophy, Clock,
  RotateCcw, Truck, CheckCircle, XCircle, Timer,
  Users, UserCheck, UserX, Crown, AlertTriangle, Phone
} from "lucide-react";

interface DailyTrend {
  date: string;
  total: number;
  postex: number;
  tranzo: number;
  shopify: number;
  revenue: number;
}

interface GrowthMetric {
  current: number;
  previous: number;
  percentage: number;
}

interface AnalyticsData {
  dailyTrends: DailyTrend[];
  growth: { orders: GrowthMetric; revenue: GrowthMetric };
  peakDays: {
    byDayOfWeek: { day: string; count: number }[];
    topDates: { date: string; count: number }[];
  };
  cityBreakdown: { city: string; count: number; revenue: number; percentage: number }[];
}

interface PerformanceData {
  overallStats: { totalOrders: number; totalDelivered: number; totalReturned: number; avgDeliveryDays: number };
  deliveryByCity: { city: string; avgDays: number; deliveredCount: number }[];
  deliveryByCourier: { courier: string; avgDays: number; deliveredCount: number }[];
  cityReturnRates: { city: string; total: number; returned: number; rate: number }[];
  productReturnRates: { product: string; total: number; returned: number; rate: number }[];
  courierComparison: { courier: string; total: number; delivered: number; returned: number; inTransit: number; cancelled: number; deliveryRate: number; returnRate: number }[];
}

interface CustomerEntry {
  phone: string;
  name: string;
  city: string;
  totalOrders: number;
  totalRevenue: number;
  firstOrder: string;
  lastOrder: string;
  deliveredCount: number;
  returnedCount: number;
  cancelledCount: number;
  productCount: number;
  couriers: string[];
  returnRate: number;
  cancelRate: number;
}

interface CustomerData {
  summary: {
    totalCustomers: number;
    repeatCustomerCount: number;
    repeatCustomerPercent: number;
    avgOrdersPerCustomer: number;
    avgLTV: number;
    problemCustomerCount: number;
    topCustomerRevenue: number;
  };
  repeatCustomers: CustomerEntry[];
  topByLTV: CustomerEntry[];
  problemCustomers: CustomerEntry[];
}

const COURIER_COLORS: Record<string, string> = {
  PostEx: "#f97316",
  Tranzo: "#8b5cf6",
};

const PAKISTAN_CITIES: Record<string, { x: number; y: number; province: string }> = {
  "karachi": { x: 245, y: 580, province: "Sindh" },
  "lahore": { x: 365, y: 310, province: "Punjab" },
  "islamabad": { x: 350, y: 240, province: "Federal" },
  "rawalpindi": { x: 345, y: 245, province: "Punjab" },
  "faisalabad": { x: 340, y: 330, province: "Punjab" },
  "multan": { x: 310, y: 395, province: "Punjab" },
  "peshawar": { x: 300, y: 200, province: "KPK" },
  "quetta": { x: 175, y: 400, province: "Balochistan" },
  "sialkot": { x: 385, y: 275, province: "Punjab" },
  "gujranwala": { x: 370, y: 295, province: "Punjab" },
  "hyderabad": { x: 260, y: 540, province: "Sindh" },
  "bahawalpur": { x: 320, y: 430, province: "Punjab" },
  "sargodha": { x: 335, y: 310, province: "Punjab" },
  "sukkur": { x: 265, y: 470, province: "Sindh" },
  "larkana": { x: 245, y: 480, province: "Sindh" },
  "mardan": { x: 310, y: 210, province: "KPK" },
  "gujrat": { x: 375, y: 290, province: "Punjab" },
  "rahim yar khan": { x: 295, y: 450, province: "Punjab" },
  "sahiwal": { x: 345, y: 365, province: "Punjab" },
  "okara": { x: 355, y: 360, province: "Punjab" },
  "wah cantt": { x: 340, y: 235, province: "Punjab" },
  "dera ghazi khan": { x: 280, y: 410, province: "Punjab" },
  "mirpur khas": { x: 275, y: 555, province: "Sindh" },
  "nawabshah": { x: 260, y: 510, province: "Sindh" },
  "mingora": { x: 310, y: 175, province: "KPK" },
  "chiniot": { x: 345, y: 325, province: "Punjab" },
  "kamoke": { x: 365, y: 305, province: "Punjab" },
  "jhelum": { x: 365, y: 270, province: "Punjab" },
  "sadiqabad": { x: 300, y: 445, province: "Punjab" },
  "jacobabad": { x: 240, y: 460, province: "Sindh" },
  "shikarpur": { x: 250, y: 470, province: "Sindh" },
  "khuzdar": { x: 190, y: 470, province: "Balochistan" },
  "abbottabad": { x: 340, y: 215, province: "KPK" },
  "mansehra": { x: 345, y: 205, province: "KPK" },
  "muzaffarabad": { x: 365, y: 225, province: "AJK" },
  "swat": { x: 300, y: 170, province: "KPK" },
  "kohat": { x: 310, y: 225, province: "KPK" },
  "bannu": { x: 295, y: 250, province: "KPK" },
  "gilgit": { x: 365, y: 130, province: "GB" },
  "skardu": { x: 400, y: 150, province: "GB" },
  "turbat": { x: 105, y: 510, province: "Balochistan" },
  "gwadar": { x: 85, y: 530, province: "Balochistan" },
  "zhob": { x: 230, y: 330, province: "Balochistan" },
  "chaman": { x: 185, y: 370, province: "Balochistan" },
};

const PAKISTAN_OUTLINE = "M 85,530 L 70,490 L 90,450 L 100,400 L 120,370 L 140,340 L 170,310 L 180,280 L 200,250 L 220,230 L 250,200 L 270,180 L 290,160 L 300,140 L 320,130 L 350,120 L 380,110 L 420,130 L 440,160 L 420,180 L 400,200 L 390,230 L 400,260 L 410,290 L 400,320 L 390,350 L 380,380 L 370,410 L 360,440 L 340,470 L 320,500 L 300,530 L 280,560 L 260,580 L 240,590 L 220,580 L 200,560 L 180,540 L 140,530 L 110,530 Z";

function getHeatColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.5) {
    const ratio = clamped / 0.5;
    const h = 220 + (45 - 220) * ratio;
    const s = 80 + (90 - 80) * ratio;
    const l = 60 + (55 - 60) * ratio;
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  } else {
    const ratio = (clamped - 0.5) / 0.5;
    const h = 45 + (0 - 45) * ratio;
    const s = 90 + (80 - 90) * ratio;
    const l = 55 + (55 - 55) * ratio;
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  }
}

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString("en-PK")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-PK", { month: "short", day: "numeric" });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-PK", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

type ViewMode = "daily" | "weekly" | "monthly";

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function groupByWeek(data: DailyTrend[]): DailyTrend[] {
  if (data.length === 0) return [];
  const weekMap: Record<string, DailyTrend[]> = {};
  for (const entry of data) {
    const key = getWeekKey(entry.date);
    if (!weekMap[key]) weekMap[key] = [];
    weekMap[key].push(entry);
  }
  const weeks = Object.values(weekMap);

  return weeks.map((week) => {
    const startDate = week[0].date;
    const endDate = week[week.length - 1].date;
    return {
      date: `${formatDate(startDate)} - ${formatDate(endDate)}`,
      total: week.reduce((s, d) => s + d.total, 0),
      postex: week.reduce((s, d) => s + d.postex, 0),
      tranzo: week.reduce((s, d) => s + d.tranzo, 0),
      shopify: week.reduce((s, d) => s + d.shopify, 0),
      revenue: week.reduce((s, d) => s + d.revenue, 0),
    };
  });
}

export default function AnalyticsPage() {
  const { selectedBrand } = useBrand();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerTab, setCustomerTab] = useState<"repeat" | "ltv" | "problem">("repeat");
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [hoveredCity, setHoveredCity] = useState<{ city: string; count: number; revenue: number; percentage: number; x: number; y: number } | null>(null);

  const getDateRange = useCallback(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    return { startDate, endDate, daysInMonth: lastDay };
  }, [selectedMonth]);

  useEffect(() => {
    if (!selectedBrand) {
      setData(null);
      setPerfData(null);
      setCustomerData(null);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { startDate, endDate } = getDateRange();
        const headers = { "brand-id": selectedBrand.id };
        const [analyticsRes, perfRes, customerRes] = await Promise.all([
          fetch(`/api/analytics?startDate=${startDate}&endDate=${endDate}`, { headers }),
          fetch(`/api/analytics/performance?startDate=${startDate}&endDate=${endDate}`, { headers }),
          fetch(`/api/analytics/customers`, { headers }),
        ]);
        if (!analyticsRes.ok) throw new Error("Failed to fetch analytics");
        const json = await analyticsRes.json();
        setData(json);
        if (perfRes.ok) {
          const perfJson = await perfRes.json();
          setPerfData(perfJson);
        }
        if (customerRes.ok) {
          const custJson = await customerRes.json();
          setCustomerData(custJson);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedBrand, selectedMonth, getDateRange]);

  const chartData = useMemo(() => {
    if (!data) return [];
    if (viewMode === "weekly") return groupByWeek(data.dailyTrends);
    return data.dailyTrends;
  }, [data, viewMode]);

  const avgOrdersPerDay = useMemo(() => {
    if (!data || data.dailyTrends.length === 0) return 0;
    const total = data.dailyTrends.reduce((s, d) => s + d.total, 0);
    const { daysInMonth } = getDateRange();
    return Math.round((total / daysInMonth) * 10) / 10;
  }, [data, getDateRange]);

  const cityHeatmapData = useMemo(() => {
    if (!data) return [];
    const maxCount = Math.max(...data.cityBreakdown.map((c) => c.count), 1);
    return data.cityBreakdown
      .map((cityData) => {
        const key = cityData.city.toLowerCase().trim();
        const coords = PAKISTAN_CITIES[key];
        if (!coords) return null;
        const t = cityData.count / maxCount;
        const radius = 8 + (40 - 8) * t;
        const color = getHeatColor(t);
        return { ...cityData, ...coords, t, radius, color, key };
      })
      .filter(Boolean) as (typeof data.cityBreakdown[0] & { x: number; y: number; province: string; t: number; radius: number; color: string; key: string })[];
  }, [data]);

  if (!selectedBrand) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-10">
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center max-w-md shadow-sm">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Brand Selected</h2>
            <p className="text-gray-500">Please select a brand from the sidebar to view analytics.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 lg:p-10">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-indigo-600" />
              Analytics
            </h1>
            <p className="text-gray-500 mt-2">Insights and trends for {selectedBrand.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-gray-400" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
            <p className="text-gray-500 font-medium">Loading analytics...</p>
          </div>
        ) : data ? (
          <>
            {/* Section 1: Order Trends */}
            <section>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 bg-indigo-50 rounded-xl">
                      <Package className="w-5 h-5 text-indigo-600" />
                    </div>
                    {data.growth.orders.percentage !== 0 && (
                      <div className={`flex items-center gap-1 text-sm font-semibold ${data.growth.orders.percentage > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {data.growth.orders.percentage > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                        {Math.abs(data.growth.orders.percentage)}%
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Total Orders</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{data.growth.orders.current.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-2">vs {data.growth.orders.previous.toLocaleString()} previous period</p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 bg-emerald-50 rounded-xl">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                    </div>
                    {data.growth.revenue.percentage !== 0 && (
                      <div className={`flex items-center gap-1 text-sm font-semibold ${data.growth.revenue.percentage > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {data.growth.revenue.percentage > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                        {Math.abs(data.growth.revenue.percentage)}%
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Total Revenue</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(data.growth.revenue.current)}</p>
                  <p className="text-xs text-gray-400 mt-2">vs {formatCurrency(data.growth.revenue.previous)} previous period</p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 bg-amber-50 rounded-xl">
                      <BarChart3 className="w-5 h-5 text-amber-600" />
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Avg Orders / Day</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{avgOrdersPerDay}</p>
                  <p className="text-xs text-gray-400 mt-2">across {getDateRange().daysInMonth} days</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                  <h2 className="text-lg font-semibold text-gray-900">Order Trends</h2>
                  <div className="flex bg-gray-100 rounded-xl p-1">
                    {(["daily", "weekly", "monthly"] as ViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gradPostex" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradTranzo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradShopify" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: "#9ca3af" }}
                        tickFormatter={(val) => viewMode === "daily" ? formatDate(val) : val}
                        interval={viewMode === "daily" ? Math.max(0, Math.floor(chartData.length / 8)) : 0}
                      />
                      <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "12px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          padding: "12px",
                        }}
                        labelFormatter={(val) => viewMode === "daily" ? formatFullDate(val) : val}
                        formatter={(value: number | undefined, name: string | undefined) => {
                          const labels: Record<string, string> = { postex: "PostEx", tranzo: "Tranzo", shopify: "Shopify" };
                          return [value ?? 0, labels[name ?? ""] || name || ""];
                        }}
                      />
                      <Area type="monotone" dataKey="postex" stackId="1" stroke="#f97316" fill="url(#gradPostex)" strokeWidth={2} name="postex" />
                      <Area type="monotone" dataKey="tranzo" stackId="1" stroke="#8b5cf6" fill="url(#gradTranzo)" strokeWidth={2} name="tranzo" />
                      <Area type="monotone" dataKey="shopify" stackId="1" stroke="#22c55e" fill="url(#gradShopify)" strokeWidth={2} name="shopify" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <BarChart3 className="w-10 h-10 mb-3" />
                    <p className="font-medium">No order data for this period</p>
                  </div>
                )}

                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    <span className="text-xs text-gray-500 font-medium">PostEx</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-violet-500" />
                    <span className="text-xs text-gray-500 font-medium">Tranzo</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-xs text-gray-500 font-medium">Shopify</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Peak Order Days */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Orders by Day of Week</h2>
                {data.peakDays.byDayOfWeek.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.peakDays.byDayOfWeek} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 12, fill: "#9ca3af" }}
                        tickFormatter={(val) => val.slice(0, 3)}
                      />
                      <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "12px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          padding: "12px",
                        }}
                        formatter={(value: number | undefined) => [value ?? 0, "Orders"]}
                      />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={48}>
                        {data.peakDays.byDayOfWeek.map((entry, index) => {
                          const maxCount = Math.max(...data.peakDays.byDayOfWeek.map((d) => d.count));
                          const isPeak = entry.count === maxCount && entry.count > 0;
                          return (
                            <Cell
                              key={`cell-${index}`}
                              fill={isPeak ? "#6366f1" : "#e0e7ff"}
                              stroke={isPeak ? "#4f46e5" : "transparent"}
                              strokeWidth={isPeak ? 2 : 0}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <CalendarDays className="w-10 h-10 mb-3" />
                    <p className="font-medium">No data available</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  Top 5 Busiest Days
                </h2>
                {data.peakDays.topDates.length > 0 ? (
                  <div className="space-y-4">
                    {data.peakDays.topDates.map((entry, index) => {
                      const maxCount = data.peakDays.topDates[0].count;
                      const widthPercent = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
                      return (
                        <div key={entry.date} className="flex items-center gap-4">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${index === 0 ? "bg-amber-100 text-amber-700" : index === 1 ? "bg-gray-100 text-gray-600" : index === 2 ? "bg-orange-50 text-orange-600" : "bg-gray-50 text-gray-500"}`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-900">{formatFullDate(entry.date)}</span>
                              <span className="text-sm font-bold text-gray-700">{entry.count} orders</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className="h-2 rounded-full transition-all duration-500"
                                style={{
                                  width: `${widthPercent}%`,
                                  backgroundColor: index === 0 ? "#f59e0b" : index === 1 ? "#6366f1" : "#a5b4fc",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Trophy className="w-10 h-10 mb-3" />
                    <p className="font-medium">No data available</p>
                  </div>
                )}
              </div>
            </section>

            {/* Section 3: Pakistan City Heatmap */}
            <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <MapPin className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">City Demand Heatmap</h2>
                  <p className="text-sm text-gray-500">Geographic distribution of orders across Pakistan</p>
                </div>
              </div>

              {cityHeatmapData.length > 0 ? (
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1 flex justify-center relative">
                    <svg
                      viewBox="40 90 450 530"
                      className="w-full max-w-[500px] h-auto"
                      style={{ minHeight: 400 }}
                    >
                      <defs>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                          <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                        <linearGradient id="mapBg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f8fafc" />
                          <stop offset="100%" stopColor="#f1f5f9" />
                        </linearGradient>
                      </defs>

                      <rect x="40" y="90" width="450" height="530" rx="16" fill="url(#mapBg)" />

                      <path
                        d={PAKISTAN_OUTLINE}
                        fill="#e2e8f0"
                        stroke="#cbd5e1"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        opacity="0.7"
                      />

                      {cityHeatmapData
                        .sort((a, b) => a.count - b.count)
                        .map((city) => (
                          <g key={city.key}>
                            <circle
                              cx={city.x}
                              cy={city.y}
                              r={city.radius}
                              fill={city.color}
                              opacity={0.5}
                              filter="url(#glow)"
                            />
                            <circle
                              cx={city.x}
                              cy={city.y}
                              r={city.radius * 0.6}
                              fill={city.color}
                              opacity={0.8}
                            />
                            <circle
                              cx={city.x}
                              cy={city.y}
                              r={city.radius + 4}
                              fill="transparent"
                              stroke="transparent"
                              strokeWidth="8"
                              className="cursor-pointer"
                              onMouseEnter={(e) => {
                                const svg = e.currentTarget.closest("svg");
                                if (!svg) return;
                                const rect = svg.getBoundingClientRect();
                                const svgWidth = rect.width;
                                const svgHeight = rect.height;
                                const viewBox = { x: 40, y: 90, w: 450, h: 530 };
                                const px = ((city.x - viewBox.x) / viewBox.w) * svgWidth + rect.left;
                                const py = ((city.y - viewBox.y) / viewBox.h) * svgHeight + rect.top;
                                setHoveredCity({ city: city.city, count: city.count, revenue: city.revenue, percentage: city.percentage, x: px, y: py });
                              }}
                              onMouseLeave={() => setHoveredCity(null)}
                            />
                          </g>
                        ))}
                    </svg>

                    {hoveredCity && (
                      <div
                        className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-3 pointer-events-none"
                        style={{
                          left: hoveredCity.x + 15,
                          top: hoveredCity.y - 10,
                          transform: "translateY(-50%)",
                        }}
                      >
                        <p className="text-sm font-bold text-gray-900">{hoveredCity.city}</p>
                        <div className="mt-1 space-y-0.5">
                          <p className="text-xs text-gray-500">Orders: <span className="font-semibold text-gray-700">{hoveredCity.count.toLocaleString()}</span></p>
                          <p className="text-xs text-gray-500">Revenue: <span className="font-semibold text-gray-700">{formatCurrency(hoveredCity.revenue)}</span></p>
                          <p className="text-xs text-gray-500">Share: <span className="font-semibold text-gray-700">{hoveredCity.percentage}%</span></p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="lg:w-80 shrink-0">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Cities</h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                      {data.cityBreakdown.slice(0, 15).map((city, i) => {
                        const maxCount = data.cityBreakdown[0].count;
                        const widthPercent = maxCount > 0 ? (city.count / maxCount) * 100 : 0;
                        const t = maxCount > 0 ? city.count / maxCount : 0;
                        return (
                          <div key={city.city} className="group">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                                <span className="text-sm font-medium text-gray-800">{city.city}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-semibold text-gray-700">{city.count}</span>
                                <span className="text-xs text-gray-400 ml-1">({city.percentage}%)</span>
                              </div>
                            </div>
                            <div className="ml-7 w-auto bg-gray-100 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${widthPercent}%`, backgroundColor: getHeatColor(t) }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <MapPin className="w-10 h-10 mb-3" />
                  <p className="font-medium">No city data available for this period</p>
                </div>
              )}

              {cityHeatmapData.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-medium">Low</span>
                    <div className="flex-1 max-w-[200px] h-3 rounded-full overflow-hidden" style={{
                      background: `linear-gradient(to right, hsl(220, 80%, 60%), hsl(45, 90%, 55%), hsl(0, 80%, 55%))`
                    }} />
                    <span className="text-xs text-gray-500 font-medium">High</span>
                    <span className="text-xs text-gray-400 ml-4">Circle size indicates order volume</span>
                  </div>
                </div>
              )}
            </section>

            {/* Section 4: Delivery Performance Insights */}
            {perfData && (
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-emerald-50 rounded-xl">
                    <Truck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Delivery Performance</h2>
                    <p className="text-sm text-gray-500">Delivery times, return rates, and courier comparison</p>
                  </div>
                </div>

                {/* Overall Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-50 rounded-lg"><Timer className="w-4 h-4 text-blue-600" /></div>
                      <span className="text-sm text-gray-500">Avg Delivery Time</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{perfData.overallStats.avgDeliveryDays} <span className="text-sm font-normal text-gray-400">days</span></p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4 text-green-600" /></div>
                      <span className="text-sm text-gray-500">Delivered</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{perfData.overallStats.totalDelivered.toLocaleString()}</p>
                    {perfData.overallStats.totalOrders > 0 && (
                      <p className="text-xs text-gray-400 mt-1">{Math.round((perfData.overallStats.totalDelivered / perfData.overallStats.totalOrders) * 100)}% of total</p>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-red-50 rounded-lg"><RotateCcw className="w-4 h-4 text-red-500" /></div>
                      <span className="text-sm text-gray-500">Returned</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{perfData.overallStats.totalReturned.toLocaleString()}</p>
                    {perfData.overallStats.totalOrders > 0 && (
                      <p className="text-xs text-gray-400 mt-1">{Math.round((perfData.overallStats.totalReturned / perfData.overallStats.totalOrders) * 100)}% return rate</p>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-indigo-50 rounded-lg"><Package className="w-4 h-4 text-indigo-600" /></div>
                      <span className="text-sm text-gray-500">Total Orders</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{perfData.overallStats.totalOrders.toLocaleString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Courier Comparison Side-by-Side */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-gray-500" />
                      Courier Comparison
                    </h3>
                    {perfData.courierComparison.length > 0 ? (
                      <div className="space-y-6">
                        {perfData.courierComparison.map((c) => (
                          <div key={c.courier} className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold" style={{ color: COURIER_COLORS[c.courier] || "#6366f1" }}>{c.courier}</span>
                              <span className="text-xs text-gray-400">{c.total} orders</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              <div className="text-center p-2 bg-green-50 rounded-lg">
                                <p className="text-lg font-bold text-green-700">{c.deliveryRate}%</p>
                                <p className="text-[10px] text-green-600 font-medium">Delivered</p>
                              </div>
                              <div className="text-center p-2 bg-red-50 rounded-lg">
                                <p className="text-lg font-bold text-red-600">{c.returnRate}%</p>
                                <p className="text-[10px] text-red-500 font-medium">Returned</p>
                              </div>
                              <div className="text-center p-2 bg-amber-50 rounded-lg">
                                <p className="text-lg font-bold text-amber-700">{c.inTransit}</p>
                                <p className="text-[10px] text-amber-600 font-medium">In Transit</p>
                              </div>
                              <div className="text-center p-2 bg-gray-50 rounded-lg">
                                <p className="text-lg font-bold text-gray-600">{c.cancelled}</p>
                                <p className="text-[10px] text-gray-500 font-medium">Cancelled</p>
                              </div>
                            </div>
                            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                              {c.delivered > 0 && (
                                <div className="bg-green-500 transition-all" style={{ width: `${(c.delivered / c.total) * 100}%` }} title={`Delivered: ${c.delivered}`} />
                              )}
                              {c.returned > 0 && (
                                <div className="bg-red-400 transition-all" style={{ width: `${(c.returned / c.total) * 100}%` }} title={`Returned: ${c.returned}`} />
                              )}
                              {c.inTransit > 0 && (
                                <div className="bg-amber-400 transition-all" style={{ width: `${(c.inTransit / c.total) * 100}%` }} title={`In Transit: ${c.inTransit}`} />
                              )}
                              {c.cancelled > 0 && (
                                <div className="bg-gray-400 transition-all" style={{ width: `${(c.cancelled / c.total) * 100}%` }} title={`Cancelled: ${c.cancelled}`} />
                              )}
                            </div>
                          </div>
                        ))}
                        {perfData.courierComparison.length >= 2 && (
                          <div className="pt-4 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-2 font-medium">Delivery Rate Comparison</p>
                            <div className="h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={perfData.courierComparison} barCategoryGap="30%">
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis dataKey="courier" tick={{ fontSize: 12 }} />
                                  <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                                  <Tooltip
                                    contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", padding: "12px" }}
                                    formatter={(value: number | undefined, name: string | undefined) => [`${value ?? 0}%`, name === "deliveryRate" ? "Delivery Rate" : "Return Rate"]}
                                  />
                                  <Bar dataKey="deliveryRate" name="deliveryRate" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={40} />
                                  <Bar dataKey="returnRate" name="returnRate" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={40} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Truck className="w-8 h-8 mb-2" />
                        <p className="text-sm">No courier data available</p>
                      </div>
                    )}
                  </div>

                  {/* Average Delivery Time by City */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      Avg Delivery Time by City
                    </h3>
                    {perfData.deliveryByCity.length > 0 ? (
                      <>
                        <div className="h-64 mb-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={perfData.deliveryByCity.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 11 }} unit=" d" />
                              <YAxis type="category" dataKey="city" tick={{ fontSize: 11 }} width={80} />
                              <Tooltip
                                contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", padding: "12px" }}
                                formatter={(value: number | undefined) => [`${value ?? 0} days`, "Avg Delivery"]}
                              />
                              <Bar dataKey="avgDays" radius={[0, 6, 6, 0]} maxBarSize={24}>
                                {perfData.deliveryByCity.slice(0, 10).map((entry, index) => (
                                  <Cell key={index} fill={entry.avgDays <= 3 ? "#22c55e" : entry.avgDays <= 5 ? "#f59e0b" : "#ef4444"} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        {perfData.deliveryByCourier.length > 0 && (
                          <div className="flex gap-4 pt-3 border-t border-gray-100">
                            {perfData.deliveryByCourier.map((c) => (
                              <div key={c.courier} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COURIER_COLORS[c.courier] || "#6366f1" }} />
                                <span className="text-xs text-gray-600">{c.courier}: <strong>{c.avgDays}d</strong> avg ({c.deliveredCount} orders)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Clock className="w-8 h-8 mb-2" />
                        <p className="text-sm">No delivery time data available</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Return Rate Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Return Rate by City */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-red-500" />
                      Return Rate by City
                    </h3>
                    {perfData.cityReturnRates.length > 0 ? (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {perfData.cityReturnRates.map((city, i) => {
                          const maxRate = perfData.cityReturnRates[0].rate;
                          return (
                            <div key={city.city} className="group">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                                  <span className="text-sm font-medium text-gray-800">{city.city}</span>
                                </div>
                                <div className="flex items-center gap-3 text-right">
                                  <span className="text-xs text-gray-400">{city.returned}/{city.total} orders</span>
                                  <span className={`text-sm font-bold ${city.rate > 30 ? "text-red-600" : city.rate > 15 ? "text-amber-600" : "text-green-600"}`}>{city.rate}%</span>
                                </div>
                              </div>
                              <div className="ml-7 bg-gray-100 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${maxRate > 0 ? (city.rate / maxRate) * 100 : 0}%`,
                                    backgroundColor: city.rate > 30 ? "#ef4444" : city.rate > 15 ? "#f59e0b" : "#22c55e",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <RotateCcw className="w-8 h-8 mb-2" />
                        <p className="text-sm">No return data available</p>
                      </div>
                    )}
                  </div>

                  {/* Return Rate by Product */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-500" />
                      Highest Return Products
                    </h3>
                    {perfData.productReturnRates.length > 0 ? (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {perfData.productReturnRates.map((p, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${p.rate > 30 ? "bg-red-100 text-red-700" : p.rate > 15 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate" title={p.product}>{p.product}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-gray-400">{p.returned}/{p.total} returned</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.rate > 30 ? "bg-red-100 text-red-700" : p.rate > 15 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>{p.rate}%</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <XCircle className="w-8 h-8 mb-2" />
                        <p className="text-sm">No product return data</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Section 5: Customer Insights */}
            {customerData && (
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-violet-50 rounded-xl">
                    <Users className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Customer Insights</h2>
                    <p className="text-sm text-gray-500">Repeat customers, lifetime value, and problem flagging</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-violet-50 rounded-lg"><Users className="w-4 h-4 text-violet-600" /></div>
                      <span className="text-sm text-gray-500">Total Customers</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{customerData.summary.totalCustomers.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-1">Avg {customerData.summary.avgOrdersPerCustomer} orders each</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-green-50 rounded-lg"><UserCheck className="w-4 h-4 text-green-600" /></div>
                      <span className="text-sm text-gray-500">Repeat Customers</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{customerData.summary.repeatCustomerCount.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-1">{customerData.summary.repeatCustomerPercent}% of all customers</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-amber-50 rounded-lg"><Crown className="w-4 h-4 text-amber-600" /></div>
                      <span className="text-sm text-gray-500">Avg Lifetime Value</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">Rs {customerData.summary.avgLTV.toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="w-4 h-4 text-red-500" /></div>
                      <span className="text-sm text-gray-500">Problem Customers</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{customerData.summary.problemCustomerCount}</p>
                    <p className="text-xs text-gray-400 mt-1">Frequent returns/cancellations</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex border-b border-gray-100">
                    {[
                      { key: "repeat" as const, label: "Repeat Customers", icon: UserCheck, count: customerData.repeatCustomers.length },
                      { key: "ltv" as const, label: "Top by Revenue", icon: Crown, count: customerData.topByLTV.length },
                      { key: "problem" as const, label: "Problem Customers", icon: AlertTriangle, count: customerData.problemCustomers.length },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setCustomerTab(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors ${
                          customerTab === tab.key
                            ? "text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/50"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <tab.icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${customerTab === tab.key ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}>{tab.count}</span>
                      </button>
                    ))}
                  </div>

                  <div className="p-5">
                    {customerTab === "repeat" && (
                      customerData.repeatCustomers.length > 0 ? (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {customerData.repeatCustomers.map((c, i) => (
                            <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0">
                                {c.totalOrders}x
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                                  {c.totalOrders >= 5 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Loyal</span>}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                                  <span>{c.city}</span>
                                  <span>Rs {c.totalRevenue.toLocaleString()}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs text-gray-400">Since {c.firstOrder}</p>
                                <p className="text-xs text-gray-400">Last: {c.lastOrder}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                          <UserCheck className="w-8 h-8 mb-2" />
                          <p className="text-sm">No repeat customers found</p>
                        </div>
                      )
                    )}

                    {customerTab === "ltv" && (
                      customerData.topByLTV.length > 0 ? (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {customerData.topByLTV.map((c, i) => {
                            const maxRevenue = customerData.topByLTV[0].totalRevenue;
                            const widthPct = maxRevenue > 0 ? (c.totalRevenue / maxRevenue) * 100 : 0;
                            return (
                              <div key={i} className="p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-4">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i < 3 ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                                    #{i + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                                      <p className="text-sm font-bold text-gray-900 shrink-0 ml-2">Rs {c.totalRevenue.toLocaleString()}</p>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                      <span>{c.totalOrders} orders</span>
                                      <span>{c.city}</span>
                                      <span>{c.deliveredCount} delivered</span>
                                      {c.returnedCount > 0 && <span className="text-red-500">{c.returnedCount} returned</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2 ml-12 bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className="h-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-500"
                                    style={{ width: `${widthPct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                          <Crown className="w-8 h-8 mb-2" />
                          <p className="text-sm">No customer data available</p>
                        </div>
                      )
                    )}

                    {customerTab === "problem" && (
                      customerData.problemCustomers.length > 0 ? (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {customerData.problemCustomers.map((c, i) => (
                            <div key={i} className="p-4 rounded-xl bg-red-50/50 border border-red-100 hover:bg-red-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                  <UserX className="w-5 h-5 text-red-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                                    {c.returnRate >= 50 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">High Return</span>}
                                    {c.cancelRate >= 50 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">High Cancel</span>}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                                    <span>{c.city}</span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-gray-900 font-semibold">{c.totalOrders} orders</p>
                                  <div className="flex gap-2 mt-1">
                                    <span className="text-xs text-red-600 font-medium">{c.returnedCount} returned</span>
                                    <span className="text-xs text-orange-600 font-medium">{c.cancelledCount} cancelled</span>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 ml-14 flex gap-1">
                                {Array.from({ length: c.totalOrders }).map((_, idx) => {
                                  const isDelivered = idx < c.deliveredCount;
                                  const isReturned = idx >= c.deliveredCount && idx < c.deliveredCount + c.returnedCount;
                                  return (
                                    <div
                                      key={idx}
                                      className={`h-2 flex-1 rounded-full max-w-[20px] ${isDelivered ? "bg-green-400" : isReturned ? "bg-red-400" : "bg-orange-300"}`}
                                      title={isDelivered ? "Delivered" : isReturned ? "Returned" : "Cancelled/Other"}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                          <CheckCircle className="w-8 h-8 mb-2 text-green-400" />
                          <p className="text-sm text-green-600 font-medium">No problem customers!</p>
                          <p className="text-xs text-gray-400 mt-1">All customers have healthy order patterns</p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BarChart3 className="w-10 h-10 mb-3" />
            <p className="font-medium">No analytics data available</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}