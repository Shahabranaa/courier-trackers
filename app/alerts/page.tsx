"use client";

import { useState, useEffect, useCallback } from "react";
import { useBrand } from "@/components/providers/BrandContext";
import {
  AlertTriangle,
  Clock,
  MapPin,
  Truck,
  ChevronDown,
  ChevronUp,
  Package,
  Phone,
  RefreshCw,
  SlidersHorizontal,
  ShieldAlert,
  AlertCircle,
  Info,
  X,
} from "lucide-react";

interface Alert {
  id: string;
  type: "stuck_transit" | "return_spike" | "performance_drop";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  details: any;
  createdAt: string;
}

interface AlertSummary {
  totalAlerts: number;
  critical: number;
  warning: number;
  info: number;
  stuckInTransit: number;
  citiesWithHighReturns: number;
  couriersUnderperforming: number;
}

interface AlertsData {
  alerts: Alert[];
  summary: AlertSummary;
  thresholds: {
    transitThresholdDays: number;
    returnRateThreshold: number;
    performanceThreshold: number;
  };
}

export default function AlertsPage() {
  const { selectedBrand } = useBrand();
  const [data, setData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, boolean>>({});
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [showSettings, setShowSettings] = useState(false);
  const [transitDays, setTransitDays] = useState(5);
  const [returnRate, setReturnRate] = useState(15);
  const [perfThreshold, setPerfThreshold] = useState(80);

  const fetchAlerts = useCallback(async () => {
    if (!selectedBrand) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        transitDays: transitDays.toString(),
        returnRate: returnRate.toString(),
        performanceThreshold: perfThreshold.toString(),
      });
      const res = await fetch(`/api/alerts?${params}`, {
        headers: { "brand-id": selectedBrand.id },
      });
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedBrand, transitDays, returnRate, perfThreshold]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const toggleExpand = (id: string) => {
    setExpandedAlerts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!selectedBrand) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100 max-w-md">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">No Brand Selected</h2>
          <p className="text-gray-500 mt-2">Please select a brand from the sidebar to view alerts.</p>
        </div>
      </div>
    );
  }

  const filteredAlerts = (data?.alerts || []).filter((a) => {
    if (filterType !== "all" && a.type !== filterType) return false;
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    return true;
  });

  const severityConfig = {
    critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: ShieldAlert, badge: "bg-red-100 text-red-700", dot: "bg-red-500" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: AlertCircle, badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
    info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: Info, badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  };

  const typeConfig = {
    stuck_transit: { label: "Stuck in Transit", icon: Clock, color: "text-orange-600" },
    return_spike: { label: "Return Rate Spike", icon: MapPin, color: "text-red-600" },
    performance_drop: { label: "Performance Drop", icon: Truck, color: "text-purple-600" },
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Smart Alerts</h1>
          <p className="text-gray-500 mt-1">Monitor orders, return rates, and courier performance</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${showSettings ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
          >
            <SlidersHorizontal size={16} />
            Thresholds
          </button>
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Alert Thresholds</h3>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stuck in Transit (days)
              </label>
              <input
                type="number"
                value={transitDays}
                onChange={(e) => setTransitDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                min="1"
              />
              <p className="text-xs text-gray-400 mt-1">Flag orders in transit longer than this</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Return Rate Threshold (%)
              </label>
              <input
                type="number"
                value={returnRate}
                onChange={(e) => setReturnRate(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                min="1"
                max="100"
              />
              <p className="text-xs text-gray-400 mt-1">Alert when city return rate exceeds this</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Courier Performance (%)
              </label>
              <input
                type="number"
                value={perfThreshold}
                onChange={(e) => setPerfThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                min="1"
                max="100"
              />
              <p className="text-xs text-gray-400 mt-1">Alert when delivery rate drops below this</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setShowSettings(false);
                fetchAlerts();
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all"
            >
              Apply & Refresh
            </button>
          </div>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gray-100 rounded-lg">
                <AlertTriangle size={18} className="text-gray-600" />
              </div>
              <span className="text-sm text-gray-500">Total Alerts</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{data.summary.totalAlerts}</p>
          </div>
          <div className="bg-white rounded-2xl border border-red-100 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-50 rounded-lg">
                <Clock size={18} className="text-red-600" />
              </div>
              <span className="text-sm text-gray-500">Stuck Orders</span>
            </div>
            <p className="text-3xl font-bold text-red-600">{data.summary.stuckInTransit}</p>
          </div>
          <div className="bg-white rounded-2xl border border-amber-100 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <MapPin size={18} className="text-amber-600" />
              </div>
              <span className="text-sm text-gray-500">High Return Cities</span>
            </div>
            <p className="text-3xl font-bold text-amber-600">{data.summary.citiesWithHighReturns}</p>
          </div>
          <div className="bg-white rounded-2xl border border-purple-100 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Truck size={18} className="text-purple-600" />
              </div>
              <span className="text-sm text-gray-500">Underperforming</span>
            </div>
            <p className="text-3xl font-bold text-purple-600">{data.summary.couriersUnderperforming}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {[
            { value: "all", label: "All Types" },
            { value: "stuck_transit", label: "Stuck" },
            { value: "return_spike", label: "Returns" },
            { value: "performance_drop", label: "Performance" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filterType === opt.value ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {[
            { value: "all", label: "All" },
            { value: "critical", label: "Critical" },
            { value: "warning", label: "Warning" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterSeverity(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filterSeverity === opt.value ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-indigo-600" />
        </div>
      )}

      {data && filteredAlerts.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={32} className="text-green-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">All Clear!</h3>
          <p className="text-gray-500 mt-1">No alerts match your current filters and thresholds.</p>
        </div>
      )}

      <div className="space-y-4">
        {filteredAlerts.map((alert) => {
          const sev = severityConfig[alert.severity];
          const typeConf = typeConfig[alert.type];
          const TypeIcon = typeConf.icon;
          const SevIcon = sev.icon;
          const isExpanded = expandedAlerts[alert.id] || false;

          return (
            <div
              key={alert.id}
              className={`${sev.bg} border ${sev.border} rounded-2xl overflow-hidden shadow-sm transition-all`}
            >
              <div
                className="p-5 cursor-pointer flex items-start gap-4"
                onClick={() => toggleExpand(alert.id)}
              >
                <div className={`p-2.5 rounded-xl ${sev.badge}`}>
                  <SevIcon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${sev.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`}></span>
                      {alert.severity.toUpperCase()}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white/60 px-2.5 py-0.5 rounded-full">
                      <TypeIcon size={12} />
                      {typeConf.label}
                    </span>
                  </div>
                  <h3 className={`font-semibold ${sev.text} text-base`}>{alert.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                </div>
                <button className="p-1 text-gray-400 hover:text-gray-600 shrink-0 mt-1">
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-white/50">
                  {alert.type === "stuck_transit" && <StuckTransitDetails details={alert.details} />}
                  {alert.type === "return_spike" && <ReturnSpikeDetails details={alert.details} />}
                  {alert.type === "performance_drop" && <PerformanceDropDetails details={alert.details} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StuckTransitDetails({ details }: { details: any }) {
  const orders = details.orders || [];
  const totalCount = details.totalCount || orders.length;

  return (
    <div className="mt-4">
      {totalCount > orders.length && (
        <p className="text-sm text-gray-500 mb-3">
          Showing {orders.length} of {totalCount} stuck orders
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200/50">
              <th className="pb-2 pr-4 font-medium">Tracking #</th>
              <th className="pb-2 pr-4 font-medium">Customer</th>
              <th className="pb-2 pr-4 font-medium">City</th>
              <th className="pb-2 pr-4 font-medium">Courier</th>
              <th className="pb-2 pr-4 font-medium">Days Stuck</th>
              <th className="pb-2 pr-4 font-medium">Amount</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/30">
            {orders.map((order: any) => (
              <tr key={order.trackingNumber} className="hover:bg-white/30">
                <td className="py-2.5 pr-4 font-mono text-xs">{order.trackingNumber}</td>
                <td className="py-2.5 pr-4">
                  <div className="font-medium text-gray-900">{order.customerName}</div>
                  {order.customerPhone && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Phone size={10} />
                      {order.customerPhone}
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-4">{order.city}</td>
                <td className="py-2.5 pr-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${order.courier === "PostEx" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {order.courier}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className={`font-semibold ${order.daysInTransit >= 10 ? "text-red-600" : "text-amber-600"}`}>
                    {order.daysInTransit}d
                  </span>
                </td>
                <td className="py-2.5 pr-4 font-medium">Rs {order.amount?.toLocaleString()}</td>
                <td className="py-2.5 text-xs text-gray-500">{order.lastStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReturnSpikeDetails({ details }: { details: any }) {
  const cities = details.cities || [];

  return (
    <div className="mt-4 space-y-3">
      {cities.map((city: any) => (
        <div key={city.city} className="bg-white/60 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-gray-500" />
              <span className="font-semibold text-gray-900">{city.city}</span>
            </div>
            <span className={`text-lg font-bold ${city.returnRate >= 25 ? "text-red-600" : "text-amber-600"}`}>
              {city.returnRate}%
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>{city.total} total orders</span>
            <span className="text-red-600 font-medium">{city.returned} returned</span>
            {city.inTransit > 0 && <span className="text-amber-600">{city.inTransit} in transit</span>}
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${city.returnRate >= 25 ? "bg-red-500" : "bg-amber-500"}`}
              style={{ width: `${Math.min(city.returnRate, 100)}%` }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformanceDropDetails({ details }: { details: any }) {
  const { total, delivered, returned, inTransit, cancelled, deliveryRate, returnRate: retRate, problemCities } = details;

  const segments = [
    { label: "Delivered", count: delivered, color: "bg-green-500", pct: total > 0 ? (delivered / total) * 100 : 0 },
    { label: "Returned", count: returned, color: "bg-red-500", pct: total > 0 ? (returned / total) * 100 : 0 },
    { label: "In Transit", count: inTransit, color: "bg-amber-500", pct: total > 0 ? (inTransit / total) * 100 : 0 },
    { label: "Cancelled", count: cancelled, color: "bg-gray-400", pct: total > 0 ? (cancelled / total) * 100 : 0 },
  ];

  return (
    <div className="mt-4">
      <div className="bg-white/60 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-gray-500" />
            <span className="font-semibold text-gray-900">{details.courier}</span>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Delivery Rate</div>
            <div className={`text-2xl font-bold ${deliveryRate >= 70 ? "text-amber-600" : "text-red-600"}`}>{deliveryRate}%</div>
          </div>
        </div>

        <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex mb-4">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className={`${seg.color} transition-all`}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.label}: ${seg.count}`}
            ></div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {segments.map((seg) => (
            <div key={seg.label} className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${seg.color}`}></div>
                <span className="text-xs text-gray-500">{seg.label}</span>
              </div>
              <p className="text-lg font-bold text-gray-900">{seg.count}</p>
              <p className="text-xs text-gray-400">{Math.round(seg.pct)}%</p>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200/50 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">Total Orders</p>
            <p className="text-lg font-bold text-gray-900">{total}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Delivery Rate</p>
            <p className={`text-lg font-bold ${deliveryRate >= 70 ? "text-amber-600" : "text-red-600"}`}>{deliveryRate}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Return Rate</p>
            <p className={`text-lg font-bold ${retRate >= 15 ? "text-red-600" : "text-amber-600"}`}>{retRate}%</p>
          </div>
        </div>

        {problemCities && problemCities.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200/50">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Underperforming Cities</h4>
            <div className="space-y-2">
              {problemCities.map((city: any) => (
                <div key={city.city} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-gray-400" />
                    <span className="text-gray-700">{city.city}</span>
                    <span className="text-xs text-gray-400">({city.total} orders)</span>
                  </div>
                  <span className={`font-semibold ${city.deliveryRate < 60 ? "text-red-600" : "text-amber-600"}`}>
                    {city.deliveryRate}% delivered
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
