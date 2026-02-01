"use client";

import { useState } from "react";
import BrandManager from "@/components/BrandManager";
import OrdersTable from "@/components/OrdersTable";
import { Brand, Order, TrackingStatus } from "@/lib/types";
import { Search, Calendar } from "lucide-react";

export default function Home() {
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [trackingStatuses, setTrackingStatuses] = useState<Record<string, TrackingStatus | null>>({});
  const [loadingOrders, setLoadingOrders] = useState(false);

  const fetchOrders = async () => {
    if (!selectedBrand) return;
    setLoadingOrders(true);
    setOrders([]);
    setTrackingStatuses({});

    try {
      const response = await fetch("/api/postex/orders", {
        headers: {
          token: selectedBrand.apiToken,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }

      const data = await response.json();
      // Assuming API returns { dist: [...] } or array. 
      // Adapt based on actual response.
      // For now assume array or property 'dist' which is common in PostEx
      const allOrders = Array.isArray(data) ? data : data.dist || [];

      // Filter by Month
      const filtered = allOrders.filter((order: any) => {
        // transactionDate format might be "YYYY-MM-DD HH:mm:ss"
        if (!order.transactionDate) return false;
        return order.transactionDate.startsWith(selectedMonth);
      });

      setOrders(filtered);
    } catch (error) {
      console.error(error);
      alert("Error fetching orders. Check API Token.");
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchTracking = async (trackingNumber: string) => {
    if (!selectedBrand) return;

    // Optimistic update or loading state could be added here
    try {
      const response = await fetch(`/api/postex/track?trackingNumber=${trackingNumber}`, {
        headers: {
          token: selectedBrand.apiToken,
        },
      });

      const data = await response.json();
      setTrackingStatuses((prev) => ({
        ...prev,
        [trackingNumber]: data,
      }));
    } catch (error) {
      console.error("Error tracking order:", trackingNumber, error);
    }
  };

  // Batch fetch tracking for visible orders? 
  // For now we can stick to manual specific fetch or "Fetch All Statuses" button
  const fetchAllStatuses = async () => {
    // Fetch concurrently with limit?
    // simple for-loop for now to avoid rate limits
    for (const order of orders) {
      if (!trackingStatuses[order.trackingNumber]) {
        await fetchTracking(order.trackingNumber);
        // meaningful delay to be nice to API
        await new Promise(r => setTimeout(r, 200));
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-[family-name:var(--font-geist-sans)]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-1.5 rounded-lg">
              <Search className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">PostEx Dashboard</h1>
          </div>
          {selectedBrand && (
            <div className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {selectedBrand.name}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BrandManager
          onBrandSelect={(brand) => {
            setSelectedBrand(brand);
            setOrders([]); // Clear orders on brand switch
          }}
          selectedBrandId={selectedBrand?.id || null}
        />

        {selectedBrand && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Month
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  />
                </div>
              </div>
              <button
                onClick={fetchOrders}
                disabled={loadingOrders}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingOrders ? "Fetching..." : "Fetch Orders"}
              </button>

              {orders.length > 0 && (
                <button
                  onClick={fetchAllStatuses}
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-2 rounded-lg font-medium shadow-sm active:scale-95 transition-all"
                >
                  Sync All Statuses
                </button>
              )}
            </div>
          </div>
        )}

        <OrdersTable
          orders={orders}
          trackingStatuses={trackingStatuses}
          loading={loadingOrders}
          refreshTracking={fetchTracking}
        />
      </main>
    </div>
  );
}
