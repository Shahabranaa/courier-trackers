"use client";

import { useState, useEffect } from "react";
import { Order, TrackingStatus } from "@/lib/types";
import { Loader2, RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

export default function OrdersTable({
    orders,
    trackingStatuses,
    paymentStatuses,
    loading,
    refreshTracking,
}: {
    orders: Order[];
    trackingStatuses: Record<string, TrackingStatus | null>;
    paymentStatuses: Record<string, any>;
    loading: boolean;
    refreshTracking: (trackingNumber: string, force?: boolean) => void;
}) {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    // Reset page to 1 if orders change
    useEffect(() => {
        setCurrentPage(1);
    }, [orders]);

    const totalPages = Math.ceil(orders.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentOrders = orders.slice(startIndex, endIndex);

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
                            <th className="px-6 py-4 whitespace-nowrap">#</th>
                            <th className="px-6 py-4 whitespace-nowrap">Date</th>
                            <th className="px-6 py-4 whitespace-nowrap">Order Ref</th>
                            <th className="px-6 py-4 whitespace-nowrap">Tracking #</th>
                            <th className="px-6 py-4 whitespace-nowrap">Customer</th>
                            <th className="px-6 py-4 whitespace-nowrap">City</th>
                            <th className="px-6 py-4 whitespace-nowrap">Phone</th>
                            <th className="px-6 py-4 whitespace-nowrap">Address</th>
                            <th className="px-6 py-4 whitespace-nowrap">Items</th>
                            <th className="px-6 py-4 whitespace-nowrap text-right">Amount</th>
                            <th className="px-6 py-4 whitespace-nowrap">Tax</th>
                            <th className="px-6 py-4 whitespace-nowrap">Fee</th>
                            <th className="px-6 py-4 whitespace-nowrap">Upfront</th>
                            <th className="px-6 py-4 whitespace-nowrap">Weight</th>
                            <th className="px-6 py-4 whitespace-nowrap">Sales + Withholding (4%)</th>
                            <th className="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-800">Net Amount</th>
                            <th className="px-6 py-4 whitespace-nowrap">Status</th>
                            <th className="px-6 py-4 whitespace-nowrap">Last Update</th>
                            <th className="px-6 py-4 whitespace-nowrap">Live Status</th>
                            <th className="px-6 py-4 whitespace-nowrap">Payment</th>
                            <th className="px-6 py-4 whitespace-nowrap text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {currentOrders.map((order, index) => {
                            // Absolute index for row numbering
                            const rowNumber = startIndex + index + 1;

                            // Handle potential field alias
                            const trackingNo = order.trackingNumber || order.tracking || "";
                            const liveStatus = trackingStatuses[trackingNo];
                            // Handle various API response formats (dist object or flat)
                            const statusData = liveStatus?.dist || liveStatus || {};
                            const liveStatusText = statusData.currentStatus ||
                                statusData.transactionStatus ||
                                statusData.orderStatus ||
                                "Check Status";

                            // Payment Status logic
                            const paymentData = paymentStatuses[trackingNo];
                            let paymentStatusText = "-";

                            if (paymentData) {
                                // User provided logic: json.dist.settle
                                // Verify if paymentData has dist or is the dist object itself.
                                // Safely access dist if it exists, otherwise assume paymentData might be flat (just in case).
                                const dist = (paymentData as any).dist || paymentData;

                                if (dist) {
                                    // Default to potentially existing status or just blank/pending if checking boolean
                                    // The logic:
                                    // settle === true/1 => "PAID"
                                    // settle === false/0 => "UNPAID"

                                    const settle = dist.settle;
                                    if (settle === true || settle === "1" || settle === 1) {
                                        paymentStatusText = "PAID";
                                    } else if (settle === false || settle === "0" || settle === 0) {
                                        paymentStatusText = "UNPAID";
                                    }

                                    // Overwrite if settleStatus is RETURN related
                                    if (dist.settleStatus) {
                                        const st = dist.settleStatus.toString().toUpperCase();
                                        if (st === "RETURN") paymentStatusText = "RETURN";
                                        else if (st === "RETURN PROCESSED") paymentStatusText = "RETURN PROCESSED";
                                    }
                                }
                            }

                            const paymentColor =
                                paymentStatusText === "PAID" ? "text-green-600 bg-green-50" :
                                    paymentStatusText === "UNPAID" ? "text-yellow-600 bg-yellow-50" :
                                        paymentStatusText.includes("RETURN") ? "text-red-600 bg-red-50" :
                                            "text-gray-600 bg-gray-50";

                            const statusColor =
                                liveStatusText.toLowerCase().includes("delivered") ? "text-green-600 bg-green-50" :
                                    liveStatusText.toLowerCase().includes("return") ? "text-red-600 bg-red-50" :
                                        liveStatusText.toLowerCase().includes("cancel") ? "text-red-600 bg-red-50" :
                                            "text-gray-600 bg-gray-50";

                            return (
                                <tr key={trackingNo || order.orderRefNumber} className="hover:bg-blue-50/50 transition-colors group">
                                    <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap group-hover:text-blue-600">
                                        {rowNumber}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap">
                                        {(order.orderDate || order.transactionDate) ? new Date(order.orderDate || order.transactionDate!).toLocaleDateString() : "-"}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{order.orderRefNumber}</td>
                                    <td className="px-6 py-4 font-mono text-xs text-blue-600 whitespace-nowrap">{trackingNo}</td>
                                    <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{order.customerName}</td>
                                    <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{order.cityName}</td>
                                    <td className="px-6 py-4 font-mono text-xs text-gray-500 whitespace-nowrap">{order.customerPhone}</td>
                                    <td className="px-6 py-4 text-gray-600 text-xs min-w-[200px]">{order.deliveryAddress}</td>
                                    <td className="px-6 py-4 text-gray-600 text-xs min-w-[150px]">{order.orderDetail}</td>
                                    <td className="px-6 py-4 text-right font-medium whitespace-nowrap">
                                        {new Intl.NumberFormat("en-PK", {
                                            style: "currency",
                                            currency: "PKR",
                                        }).format(order.invoicePayment)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-xs text-gray-600 whitespace-nowrap">
                                        {(() => {
                                            const isReturn =
                                                (order.transactionStatus && order.transactionStatus.toLowerCase().includes("return")) ||
                                                (order.orderStatus && order.orderStatus.toLowerCase().includes("return")) ||
                                                (liveStatusText.toLowerCase().includes("return"));

                                            // Prefer reversal if return, fallback to transaction
                                            // Handle cases where reversal might be 0 but transaction exists? 
                                            // User said "Take from reversal", implies strictness.
                                            const val = isReturn ? (order.reversalTax ?? order.transactionTax) : order.transactionTax;
                                            return val ? val.toFixed(2) : "-";
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 text-right text-xs text-gray-600 whitespace-nowrap">
                                        {(() => {
                                            const isReturn =
                                                (order.transactionStatus && order.transactionStatus.toLowerCase().includes("return")) ||
                                                (order.orderStatus && order.orderStatus.toLowerCase().includes("return")) ||
                                                (liveStatusText.toLowerCase().includes("return"));

                                            const val = isReturn ? (order.reversalFee ?? order.transactionFee) : order.transactionFee;
                                            return val ? val.toFixed(2) : "-";
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 text-right text-xs text-gray-600 whitespace-nowrap">
                                        {order.upfrontPayment ? order.upfrontPayment.toFixed(2) : "-"}
                                    </td>
                                    <td className="px-6 py-4 text-right text-xs text-gray-600 whitespace-nowrap">
                                        {order.actualWeight ? `${order.actualWeight} kg` : "-"}
                                    </td>
                                    <td className="px-6 py-4 text-right text-xs text-gray-600 whitespace-nowrap">
                                        {order.salesWithholdingTax ? order.salesWithholdingTax.toFixed(2) : "0.00"}
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">
                                        {order.netAmount ? new Intl.NumberFormat("en-PK", {
                                            style: "currency",
                                            currency: "PKR",
                                        }).format(order.netAmount) : "-"}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                                        {order.transactionStatus || order.orderStatus || "-"}
                                    </td>
                                    <td className="px-6 py-4 text-xs whitespace-nowrap">
                                        {order.lastStatus ? (
                                            <div className="flex flex-col">
                                                <span className="font-medium text-gray-700">{order.lastStatus}</span>
                                                <span className="text-gray-400 text-[10px]">
                                                    {order.lastStatusTime ? new Date(order.lastStatusTime).toLocaleString() : ""}
                                                </span>
                                            </div>
                                        ) : "-"}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                                            {liveStatusText}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentColor}`}>
                                            {paymentStatusText}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                        <div className="flex justify-center items-center gap-2">
                                            <button
                                                onClick={() => refreshTracking(trackingNo, true)}
                                                title="Refresh Status & Payment"
                                                className="text-gray-400 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                            <a
                                                href={`https://postex.pk/tracking?trackingNumber=${trackingNo}`}
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

            {/* Pagination Controls */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
                <div className="flex flex-1 justify-between sm:hidden">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
                <div className="hidden sm:flex flex-1 items-center justify-between">
                    <div className="flex gap-4 items-center">
                        <p className="text-sm text-gray-700">
                            Showing <span className="font-medium">{startIndex + 1}</span> to <span className="font-medium">{Math.min(endIndex, orders.length)}</span> of <span className="font-medium">{orders.length}</span> results
                        </p>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        >
                            <option value={20}>20 per page</option>
                            <option value={50}>50 per page</option>
                            <option value={100}>100 per page</option>
                        </select>
                    </div>
                    <div>
                        <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 hover:text-gray-700"
                            >
                                <span className="sr-only">Previous</span>
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">
                                Page {currentPage} / {totalPages}
                            </span>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 hover:text-gray-700"
                            >
                                <span className="sr-only">Next</span>
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    );
}
