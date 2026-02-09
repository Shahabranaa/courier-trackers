"use client";

import { useMemo } from "react";
import { Order, TrackingStatus } from "@/lib/types";

export default function CityStats({
    orders,
    trackingStatuses,
}: {
    orders: Order[];
    trackingStatuses: Record<string, TrackingStatus | null>;
}) {
    const stats = useMemo(() => {
        const cityData: Record<string, { total: number; delivered: number }> = {};

        orders.forEach((order) => {
            const city = order.cityName || "Unknown";
            if (!cityData[city]) {
                cityData[city] = { total: 0, delivered: 0 };
            }

            cityData[city].total += 1;

            // Check status
            // Prioritize live status if available, else DB status
            const trackingNo = order.trackingNumber || "";
            const liveStatus = trackingStatuses[trackingNo]?.currentStatus;
            const dbStatus = order.transactionStatus || order.orderStatus || "";
            const status = (liveStatus || dbStatus).toLowerCase();

            if (status.includes("delivered") || status.includes("completed")) {
                cityData[city].delivered += 1;
            }
        });

        // Convert to array and sort
        return Object.entries(cityData)
            .map(([city, data]) => ({
                city,
                rate: (data.delivered / data.total) * 100,
                total: data.total,
                delivered: data.delivered
            }))
            .sort((a, b) => b.total - a.total);
    }, [orders, trackingStatuses]);

    if (orders.length === 0) return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-fit sticky top-24">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-800">Delivery Rates</h3>
                <p className="text-xs text-gray-500">By City (Most Orders First)</p>
            </div>
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium text-xs sticky top-0">
                        <tr>
                            <th className="px-4 py-2">City</th>
                            <th className="px-4 py-2 text-right">%</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {stats.map((stat) => {
                            // Color code the rate
                            // < 50% red, 50-80 yellow, > 80 green
                            const colorClass =
                                stat.rate < 50 ? "text-red-600 bg-red-50" :
                                    stat.rate < 80 ? "text-yellow-600 bg-yellow-50" :
                                        "text-green-600 bg-green-50";

                            return (
                                <tr key={stat.city} className="hover:bg-gray-50/50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-gray-900">{stat.city}</div>
                                        <div className="text-[10px] text-gray-400">
                                            {stat.delivered}/{stat.total} Orders
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${colorClass}`}>
                                            {stat.rate.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
