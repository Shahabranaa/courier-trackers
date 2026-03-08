"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
    MessageCircle, Calendar, Package, CheckCircle, AlertCircle, Wifi, WifiOff,
    ShoppingBag, Send, X, RefreshCw, Loader2, Filter, QrCode
} from "lucide-react";

interface WAMessage {
    id: string;
    remoteJid: string;
    senderName: string;
    senderPhone: string;
    message: string;
    messageType: string;
    timestamp: string;
    isFromMe: boolean;
    isOrderDetected: boolean;
    parsedOrder: string;
    orderCreated: boolean;
    shopifyOrderId: string;
}

interface ConvertForm {
    messageId: string;
    customerName: string;
    phone: string;
    shippingAddress: string;
    shippingCity: string;
    product: string;
    price: number;
    deliveryFee: number;
    notes: string;
}

export default function WhatsAppPage() {
    const { selectedBrand } = useBrand();
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [messages, setMessages] = useState<WAMessage[]>([]);
    const [stats, setStats] = useState({ total: 0, orderDetected: 0, orderCreated: 0 });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "orders" | "unconverted">("all");
    const [connectionStatus, setConnectionStatus] = useState<string>("checking");
    const [qrCode, setQrCode] = useState("");
    const [connectedPhone, setConnectedPhone] = useState("");
    const [convertModal, setConvertModal] = useState<ConvertForm | null>(null);
    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState("");

    const getDateRange = () => {
        const [year, month] = selectedMonth.split("-").map(Number);
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        return { startDate, endDate };
    };

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp/status");
            const data = await res.json();
            setConnectionStatus(data.status);
            setQrCode(data.qrCode || "");
            setConnectedPhone(data.phone || "");
        } catch {
            setConnectionStatus("error");
        }
    }, []);

    const fetchMessages = useCallback(async () => {
        if (!selectedBrand) return;
        setLoading(true);
        try {
            const { startDate, endDate } = getDateRange();
            const res = await fetch(
                `/api/whatsapp/messages?startDate=${startDate}&endDate=${endDate}&filter=${filter}`,
                { headers: { "brand-id": selectedBrand.id } }
            );
            const data = await res.json();
            setMessages(data.messages || []);
            setStats(data.stats || { total: 0, orderDetected: 0, orderCreated: 0 });
        } catch {
            setMessages([]);
        } finally {
            setLoading(false);
        }
    }, [selectedBrand, selectedMonth, filter]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    const openConvertModal = (msg: WAMessage) => {
        let parsed: any = {};
        try {
            if (msg.parsedOrder) parsed = JSON.parse(msg.parsedOrder);
        } catch {}
        setConvertModal({
            messageId: msg.id,
            customerName: parsed.name || msg.senderName || "",
            phone: parsed.phone || msg.senderPhone || "",
            shippingAddress: parsed.address || "",
            shippingCity: parsed.city || "",
            product: parsed.product || "",
            price: parsed.price || 0,
            deliveryFee: 190,
            notes: `WhatsApp: ${msg.message.substring(0, 200)}`,
        });
        setConvertError("");
    };

    const handleConvert = async () => {
        if (!convertModal || !selectedBrand) return;
        setConverting(true);
        setConvertError("");
        try {
            const res = await fetch("/api/whatsapp/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json", "brand-id": selectedBrand.id },
                body: JSON.stringify({
                    messageId: convertModal.messageId,
                    customerName: convertModal.customerName,
                    phone: convertModal.phone,
                    shippingAddress: convertModal.shippingAddress,
                    shippingCity: convertModal.shippingCity,
                    lineItems: [{
                        title: convertModal.product || "WhatsApp Order",
                        quantity: 1,
                        price: convertModal.price || 0,
                    }],
                    notes: convertModal.notes,
                    deliveryFee: convertModal.deliveryFee,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setConvertModal(null);
            fetchMessages();
        } catch (err: any) {
            setConvertError(err.message);
        } finally {
            setConverting(false);
        }
    };

    const formatTime = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    };

    const statusColor = connectionStatus === "connected"
        ? "bg-green-100 text-green-700 border-green-200"
        : connectionStatus === "qr_pending"
            ? "bg-amber-100 text-amber-700 border-amber-200"
            : "bg-red-100 text-red-700 border-red-200";

    const statusIcon = connectionStatus === "connected" ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />;
    const statusText = connectionStatus === "connected"
        ? `Connected${connectedPhone ? ` (${connectedPhone})` : ""}`
        : connectionStatus === "qr_pending"
            ? "Scan QR Code to Connect"
            : connectionStatus === "not_configured"
                ? "WhatsApp Server Not Running"
                : connectionStatus === "checking"
                    ? "Checking..."
                    : "Disconnected";

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 p-6 lg:p-10">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <div className="p-2 bg-green-100 text-green-600 rounded-xl">
                                <MessageCircle className="w-7 h-7" />
                            </div>
                            WhatsApp Messages
                        </h1>
                        <p className="text-gray-500 mt-1">View incoming messages and convert orders</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${statusColor}`}>
                            {statusIcon}
                            {statusText}
                        </div>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Calendar className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                            />
                        </div>
                        <button
                            onClick={fetchMessages}
                            className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                </div>

                {connectionStatus === "qr_pending" && qrCode && (
                    <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-8 text-center">
                        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <QrCode className="w-6 h-6 text-amber-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Scan QR Code with WhatsApp</h3>
                        <p className="text-gray-500 mb-6 text-sm">Open WhatsApp on your phone &gt; Settings &gt; Linked Devices &gt; Link a Device</p>
                        <div className="inline-block bg-white p-4 rounded-xl border border-gray-200">
                            <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
                        </div>
                    </div>
                )}

                {connectionStatus === "not_configured" && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <WifiOff className="w-6 h-6 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">WhatsApp Server Not Connected</h3>
                        <p className="text-gray-500 text-sm max-w-md mx-auto">
                            Deploy the WhatsApp server on your VPS and configure it with the same database URL.
                            Once running, the QR code will appear here for scanning.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                                <MessageCircle className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                        <p className="text-xs font-medium text-gray-500 mt-1">Total Messages</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2 bg-amber-50 text-amber-500 rounded-xl">
                                <ShoppingBag className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stats.orderDetected}</p>
                        <p className="text-xs font-medium text-gray-500 mt-1">Orders Detected</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2 bg-green-50 text-green-500 rounded-xl">
                                <CheckCircle className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stats.orderCreated}</p>
                        <p className="text-xs font-medium text-gray-500 mt-1">Orders Converted</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900">Messages</h3>
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-gray-400" />
                            <select
                                value={filter}
                                onChange={e => setFilter(e.target.value as any)}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                            >
                                <option value="all">All Messages</option>
                                <option value="orders">Orders Only</option>
                                <option value="unconverted">Unconverted Orders</option>
                            </select>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p className="font-medium">No messages found</p>
                            <p className="text-sm mt-1">Messages will appear here once the WhatsApp server is connected</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                            {messages.map(msg => (
                                <div key={msg.id} className={`px-6 py-4 hover:bg-gray-50/50 transition-colors ${msg.isFromMe ? "bg-green-50/30" : ""}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-semibold text-gray-900">
                                                    {msg.isFromMe ? "You" : msg.senderName || msg.senderPhone || "Unknown"}
                                                </span>
                                                {msg.senderPhone && !msg.isFromMe && (
                                                    <span className="text-xs text-gray-400">{msg.senderPhone}</span>
                                                )}
                                                <span className="text-xs text-gray-400">{formatTime(msg.timestamp)}</span>
                                                {msg.isOrderDetected && !msg.orderCreated && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Order Detected</span>
                                                )}
                                                {msg.orderCreated && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Order Created</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{msg.message}</p>
                                        </div>
                                        <div className="shrink-0">
                                            {msg.isOrderDetected && !msg.orderCreated && (
                                                <button
                                                    onClick={() => openConvertModal(msg)}
                                                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1"
                                                >
                                                    <ShoppingBag className="w-3 h-3" />
                                                    Convert
                                                </button>
                                            )}
                                            {!msg.isOrderDetected && !msg.isFromMe && (
                                                <button
                                                    onClick={() => openConvertModal(msg)}
                                                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors flex items-center gap-1"
                                                >
                                                    <ShoppingBag className="w-3 h-3" />
                                                    Create Order
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {convertModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900">Convert to Shopify Order</h3>
                            <button onClick={() => setConvertModal(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {convertError && (
                                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {convertError}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                                <input
                                    value={convertModal.customerName}
                                    onChange={e => setConvertModal({ ...convertModal, customerName: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                <input
                                    value={convertModal.phone}
                                    onChange={e => setConvertModal({ ...convertModal, phone: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                <input
                                    value={convertModal.shippingAddress}
                                    onChange={e => setConvertModal({ ...convertModal, shippingAddress: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                                    <input
                                        value={convertModal.shippingCity}
                                        onChange={e => setConvertModal({ ...convertModal, shippingCity: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Fee</label>
                                    <input
                                        type="number"
                                        value={convertModal.deliveryFee}
                                        onChange={e => setConvertModal({ ...convertModal, deliveryFee: Number(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                                    <input
                                        value={convertModal.product}
                                        onChange={e => setConvertModal({ ...convertModal, product: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Price (Rs.)</label>
                                    <input
                                        type="number"
                                        value={convertModal.price}
                                        onChange={e => setConvertModal({ ...convertModal, price: Number(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea
                                    value={convertModal.notes}
                                    onChange={e => setConvertModal({ ...convertModal, notes: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                onClick={() => setConvertModal(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConvert}
                                disabled={converting || !convertModal.customerName || !convertModal.phone}
                                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:bg-gray-300 transition-colors flex items-center gap-2"
                            >
                                {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {converting ? "Creating..." : "Create Shopify Order"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
