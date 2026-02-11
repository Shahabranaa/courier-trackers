"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Package, Truck, RotateCcw, ArrowUpDown, X } from "lucide-react";

interface SyncSummary {
  totalFetched: number;
  newOrders: number;
  newDelivered: number;
  newReturned: number;
  statusChanged: number;
}

interface SyncToastProps {
  summary: SyncSummary | null;
  onClose: () => void;
  courier: "PostEx" | "Tranzo";
}

export default function SyncToast({ summary, onClose, courier }: SyncToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (summary) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 300);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [summary, onClose]);

  if (!summary) return null;

  const accentColor = courier === "PostEx" ? "orange" : "purple";
  const hasChanges = summary.newOrders > 0 || summary.newDelivered > 0 || summary.newReturned > 0 || summary.statusChanged > 0;

  return (
    <div
      className={`fixed top-6 right-6 z-50 max-w-sm w-full transition-all duration-300 ${visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}`}
    >
      <div className={`bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden`}>
        <div className={`px-4 py-3 flex items-center justify-between ${accentColor === "orange" ? "bg-orange-50 border-b border-orange-100" : "bg-purple-50 border-b border-purple-100"}`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className={accentColor === "orange" ? "text-orange-600" : "text-purple-600"} />
            <span className={`font-semibold text-sm ${accentColor === "orange" ? "text-orange-800" : "text-purple-800"}`}>
              {courier} Sync Complete
            </span>
          </div>
          <button onClick={() => { setVisible(false); setTimeout(onClose, 300); }} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Total fetched</span>
            <span className="font-bold text-gray-900">{summary.totalFetched} orders</span>
          </div>

          {hasChanges ? (
            <div className="space-y-2">
              {summary.newOrders > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-xl">
                  <Package size={15} className="text-blue-600" />
                  <span className="text-sm text-blue-800 font-medium">{summary.newOrders} new order{summary.newOrders !== 1 ? "s" : ""} added</span>
                </div>
              )}
              {summary.newDelivered > 0 && (
                <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded-xl">
                  <Truck size={15} className="text-green-600" />
                  <span className="text-sm text-green-800 font-medium">{summary.newDelivered} newly delivered</span>
                </div>
              )}
              {summary.newReturned > 0 && (
                <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-xl">
                  <RotateCcw size={15} className="text-red-600" />
                  <span className="text-sm text-red-800 font-medium">{summary.newReturned} new return{summary.newReturned !== 1 ? "s" : ""}</span>
                </div>
              )}
              {summary.statusChanged > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 px-3 py-2 rounded-xl">
                  <ArrowUpDown size={15} className="text-amber-600" />
                  <span className="text-sm text-amber-800 font-medium">{summary.statusChanged} status update{summary.statusChanged !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-gray-500">Everything is up to date. No changes detected.</p>
            </div>
          )}
        </div>

        <div className={`h-1 ${accentColor === "orange" ? "bg-orange-500" : "bg-purple-500"} transition-all duration-[8000ms] ease-linear ${visible ? "w-0" : "w-full"}`}></div>
      </div>
    </div>
  );
}
