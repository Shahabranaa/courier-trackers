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
  BarChart3, Loader2, AlertCircle, Trophy
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { startDate, endDate } = getDateRange();
        const res = await fetch(`/api/analytics?startDate=${startDate}&endDate=${endDate}`, {
          headers: { "brand-id": selectedBrand.id },
        });
        if (!res.ok) throw new Error("Failed to fetch analytics");
        const json = await res.json();
        setData(json);
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
                        formatter={(value: number, name: string) => {
                          const labels: Record<string, string> = { postex: "PostEx", tranzo: "Tranzo", shopify: "Shopify" };
                          return [value, labels[name] || name];
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
                        formatter={(value: number) => [value, "Orders"]}
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