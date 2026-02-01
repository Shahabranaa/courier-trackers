"use client";

import { Order, TrackingStatus } from "@/lib/types";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";

export default function OrdersTable({
    orders,
    trackingStatuses,
    loading,
    refreshTracking,
}: {
    orders: Order[];
    trackingStatuses: Record<string, TrackingStatus | null>;
    loading: boolean;
    refreshTracking: (trackingNumber: string) => void;
}) {
    if (loading && orders.length === 0) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <span className="ml-3 text-gray-600 font-medium">Loading orders...</span>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="bg-white p-10 rounded-xl shadow-sm border border-gray-100 text-center">
                <p className="text-gray-500">No orders found for the selected criteria.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">Order Ref</th>
                            <th className="px-6 py-4">Customer</th>
                            <th className="px-6 py-4">Phone</th>
                            <th className="px-6 py-4 text-right">Amount</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Tracking State</th>
                            <th className="px-6 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {orders.map((order) => {
                            const status = trackingStatuses[order.trackingNumber];
                            const statusText = status?.currentStatus || order.orderStatus || "Pending";

                            const statusColor =
                                statusText.toLowerCase().includes("delivered") ? "text-green-600 bg-green-50" :
                                    statusText.toLowerCase().includes("return") ? "text-red-600 bg-red-50" :
                                        statusText.toLowerCase().includes("cancel") ? "text-red-600 bg-red-50" :
                                            "text-yellow-600 bg-yellow-50";

                            return (
                                <tr key={order.trackingNumber} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900">{order.orderRefNumber}</td>
                                    <td className="px-6 py-4 text-gray-600">{order.customerName}</td>
                                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{order.customerPhone}</td>
                                    <td className="px-6 py-4 text-right font-medium">
                                        {new Intl.NumberFormat("en-PK", {
                                            style: "currency",
                                            currency: "PKR",
                                        }).format(order.invoicePayment)}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-xs">
                                        {new Date(order.transactionDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
                                        >
                                            {statusText}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex justify-center items-center gap-2">
                                            <button
                                                onClick={() => refreshTracking(order.trackingNumber)}
                                                title="Refresh Status"
                                                className="text-gray-400 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                            <a
                                                href={`https://postex.pk/tracking?trackingNumber=${order.trackingNumber}`} // Verify this URL pattern
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-gray-400 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                                title="View on PostEx"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        </div>
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
