"use client";

import { useMemo } from "react";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { Order, TrackingStatus } from "@/lib/types";

const STATUS_COLORS = {
    delivered: "#16a34a", // green-600
    returned: "#dc2626", // red-600
    other: "#fbbf24",    // amber-400
};

export default function OrderCharts({
    orders,
    trackingStatuses,
}: {
    orders: Order[];
    trackingStatuses: Record<string, TrackingStatus | null>;
}) {
    // Pie Chart Data
    const pieData = useMemo(() => {
        let delivered = 0;
        let returned = 0;
        let other = 0;
        let deliveredAmount = 0;
        let returnedAmount = 0;
        let otherAmount = 0;

        orders.forEach((order) => {
            const trackingNo = order.trackingNumber || "";
            const liveStatus = trackingStatuses[trackingNo]?.currentStatus;
            const dbStatus = order.transactionStatus || order.orderStatus || "";
            const status = (liveStatus || dbStatus).toLowerCase();
            const amount = order.netAmount || 0;

            if (status.includes("delivered") || status.includes("completed")) {
                delivered++;
                deliveredAmount += amount;
            } else if (status.includes("return")) {
                returned++;
                returnedAmount += amount;
            } else {
                other++;
                otherAmount += amount;
            }
        });

        const total = orders.length;
        if (total === 0) return [];

        return [
            { name: "Delivered", value: delivered, amount: deliveredAmount, color: STATUS_COLORS.delivered },
            { name: "Returned", value: returned, amount: returnedAmount, color: STATUS_COLORS.returned },
            { name: "Other", value: other, amount: otherAmount, color: STATUS_COLORS.other },
        ];
    }, [orders, trackingStatuses]);

    // Helper to get raw date string YYYY-MM-DD
    const getRawDate = (dateStr: string) => {
        if (!dateStr) return "Unknown";
        if (dateStr.includes("T")) return dateStr.split("T")[0];
        if (dateStr.includes(" ")) return dateStr.split(" ")[0];
        return dateStr;
    };

    // Determine Aggregation Mode (Daily vs Monthly)
    const aggregationMode = useMemo(() => {
        if (orders.length < 2) return "daily";

        // Find min and max dates
        const dates = orders
            // STRICT: Order Date (Dispatch Date)
            .map(o => getRawDate(o.orderDate || ""))
            .filter(d => d !== "Unknown")
            .sort();

        if (dates.length === 0) return "daily";

        const start = new Date(dates[0]);
        const end = new Date(dates[dates.length - 1]);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays > 35 ? "monthly" : "daily";
    }, [orders]);

    const minKey = aggregationMode === "monthly" ? "Unknown-Month" : "Unknown-Date";

    const getDateKey = (dateStr: string) => {
        const raw = getRawDate(dateStr);
        if (raw === "Unknown") return minKey;
        if (aggregationMode === "monthly") {
            return raw.slice(0, 7); // YYYY-MM
        }
        return raw; // YYYY-MM-DD
    };


    // Daily/Monthly Status Distribution Data
    const dailyStatusData = useMemo(() => {

        const stats: Record<string, { date: string; delivered: number; returned: number; other: number; total: number }> = {};

        orders.forEach((order) => {
            const date = getDateKey(order.orderDate || "");

            if (!stats[date]) {
                stats[date] = { date, delivered: 0, returned: 0, other: 0, total: 0 };
            }

            const trackingNo = order.trackingNumber || "";
            const liveStatus = trackingStatuses[trackingNo]?.currentStatus;
            const dbStatus = order.transactionStatus || order.orderStatus || "";
            const status = (liveStatus || dbStatus).toLowerCase();

            if (status.includes("delivered") || status.includes("completed")) {
                stats[date].delivered++;
            } else if (status.includes("return")) {
                stats[date].returned++;
            } else {
                stats[date].other++;
            }
            stats[date].total++;
        });

        // Convert to array and calculate percentages
        return Object.values(stats)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(day => ({
                ...day,
                deliveredPct: day.total ? (day.delivered / day.total) * 100 : 0,
                returnedPct: day.total ? (day.returned / day.total) * 100 : 0,
                otherPct: day.total ? (day.other / day.total) * 100 : 0,
            }));
    }, [orders, trackingStatuses, aggregationMode]);


    // Daily/Monthly Earnings Data
    const dailyData = useMemo(() => {

        const earnings: Record<string, number> = {};

        orders.forEach((order) => {
            // Only consider Delivered or Returned for earnings
            const trackingNo = order.trackingNumber || "";
            const liveStatus = trackingStatuses[trackingNo]?.currentStatus;
            const dbStatus = order.transactionStatus || order.orderStatus || "";
            const status = (liveStatus || dbStatus).toLowerCase();

            const isDelivered = status.includes("delivered") || status.includes("completed");
            const isReturn = status.includes("return");

            if (!isDelivered && !isReturn) return;

            // Date processing
            const date = getDateKey(order.orderDate || "");

            if (!earnings[date]) earnings[date] = 0;

            // Net Amount should already be calculated in the order object
            earnings[date] += (order.netAmount || 0);
        });

        return Object.entries(earnings)
            .map(([date, amount]) => ({
                date,
                amount
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

    }, [orders, trackingStatuses, aggregationMode]);


    // Calculate Summary Stats
    const totalEarnings = dailyData.reduce((sum, day) => sum + day.amount, 0);
    const avgEarnings = dailyData.length > 0 ? totalEarnings / dailyData.length : 0;

    const formatCurrency = (val: number) => new Intl.NumberFormat("en-PK", {
        style: "currency",
        currency: "PKR",
        maximumFractionDigits: 0
    }).format(val);

    const toPercent = (decimal: number) => `${decimal.toFixed(0)}%`;

    const getPercent = (value: number, total: number) => {
        const ratio = total > 0 ? value / total : 0;
        return toPercent(ratio * 100);
    };

    const renderTooltipContent = (o: any) => {
        const { payload, label } = o;
        if (!payload || payload.length === 0) return null;

        const data = payload[0].payload;

        return (
            <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-lg text-sm">
                <p className="font-semibold text-gray-800 mb-2">
                    {aggregationMode === "monthly"
                        ? new Date(label + "-01").toLocaleString('default', { month: 'long', year: 'numeric' })
                        : label}
                </p>
                <ul className="space-y-1">
                    {payload.map((entry: any, index: number) => (
                        <li key={`item-${index}`} className="flex items-center gap-2" style={{ color: entry.color }}>
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="font-medium">{entry.name}:</span>
                            <span className="ml-auto font-bold">
                                {entry.value} ({getPercent(entry.value, data.total)})
                            </span>
                        </li>
                    ))}
                    <li className="pt-2 mt-2 border-t border-gray-100 flex justify-between text-gray-500">
                        <span>Total Orders</span>
                        <span className="font-mono">{data.total}</span>
                    </li>
                </ul>
            </div>
        );
    };

    const renderPieTooltip = (o: any) => {
        const { active, payload } = o;
        if (!active || !payload || payload.length === 0) return null;
        const data = payload[0];

        return (
            <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-lg text-sm">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.payload.color }} />
                    <p className="font-semibold text-gray-800">{data.name}</p>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Orders:</span>
                        <span className="font-mono font-medium">{data.value}</span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-gray-50 pt-1 mt-1">
                        <span className="text-gray-500">Amount:</span>
                        <span className="font-mono font-bold text-gray-900">{formatCurrency(data.payload.amount)}</span>
                    </div>
                </div>
            </div>
        );
    };

    if (orders.length === 0) return null;

    return (
        <div className="space-y-6 mb-8">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Status Chart */}
                <div className="glass-card p-6 rounded-xl">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Overall Status Distribution</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip content={renderPieTooltip} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    {/* Summary Stats */}
                    <div className="flex justify-center gap-8 mt-4 text-sm text-gray-600">
                        {pieData.map((item) => (
                            <div key={item.name} className="flex flex-col items-center">
                                <span className="font-bold text-lg" style={{ color: item.color }}>
                                    {((item.value / orders.length) * 100).toFixed(1)}%
                                </span>
                                <span>{item.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Daily Earnings Chart */}
                <div className="glass-card p-6 rounded-xl flex flex-col">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">
                                {aggregationMode === "monthly" ? "Monthly" : "Daily"} Net Earnings
                            </h3>

                            <p className="text-sm text-gray-400">Net delivered minus returns</p>
                        </div>
                        <div className="flex gap-4 text-right">
                            <div>
                                <div className="text-xs text-gray-500 uppercase font-semibold">Total Net</div>
                                <div className="text-xl font-bold text-gray-900">{formatCurrency(totalEarnings)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 uppercase font-semibold">Avg / {aggregationMode === "monthly" ? "Month" : "Day"}</div>
                                <div className="text-xl font-bold text-gray-900">{formatCurrency(avgEarnings)}</div>
                            </div>

                        </div>
                    </div>

                    <div className="h-[300px] w-full flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dailyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(str) => aggregationMode === "monthly" ? str : str.slice(8, 10)}
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />

                                <YAxis
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => `Rs ${val / 1000}k`}
                                />
                                <Tooltip
                                    formatter={(value: any) => [
                                        formatCurrency(value),
                                        "Net Earnings"
                                    ]}
                                    labelFormatter={(label) => aggregationMode === "monthly"
                                        ? new Date(label + "-01").toLocaleString('default', { month: 'long', year: 'numeric' })
                                        : label
                                    }
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />

                                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    {aggregationMode === "monthly" ? "Monthly" : "Daily"} Status Distribution
                </h3>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={dailyStatusData}
                            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(str) => aggregationMode === "monthly" ? str : str.slice(8, 10)}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => val}
                            />
                            <Tooltip content={renderTooltipContent} cursor={{ fill: 'transparent' }} />
                            <Legend iconType="circle" />
                            <Bar dataKey="delivered" name="Delivered" stackId="a" fill={STATUS_COLORS.delivered} />
                            <Bar dataKey="returned" name="Returned" stackId="a" fill={STATUS_COLORS.returned} />
                            <Bar dataKey="other" name="Other" stackId="a" fill={STATUS_COLORS.other} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
