"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
    MessageCircle, Calendar, CheckCircle, AlertCircle, Wifi, WifiOff,
    ShoppingBag, X, RefreshCw, Loader2, Search, ArrowLeft, Send, User, Phone, Clock
} from "lucide-react";

interface Conversation {
    convo_id: string;
    id: string;
    name: string;
    phone_number: string;
    last_message: string;
    last_message_from: string;
    last_message_created: string;
    status: string;
    unread_count: number;
    tags: string;
    country: string;
    assigned_agent: string;
    agent_name: string | null;
}

interface Message {
    id: string;
    convo_id: string;
    message: string;
    from: string;
    type: string | null;
    file_url: string | null;
    delivery_status: string;
    created: string;
    user: string;
}

interface ConvertForm {
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
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const [convertModal, setConvertModal] = useState<ConvertForm | null>(null);
    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState("");
    const [convertSuccess, setConvertSuccess] = useState(false);

    const checkStatus = useCallback(async () => {
        if (!selectedBrand) return;
        try {
            const res = await fetch("/api/whatsapp/status", { headers: { "brand-id": selectedBrand.id } });
            const data = await res.json();
            setConfigured(data.configured);
        } catch {
            setConfigured(false);
        }
    }, [selectedBrand]);

    const fetchConversations = useCallback(async () => {
        if (!selectedBrand) return;
        setLoading(true);
        try {
            const res = await fetch("/api/whatsapp/messages?limit=1000", {
                headers: { "brand-id": selectedBrand.id }
            });
            const data = await res.json();
            if (data.error) {
                setConfigured(false);
                setConversations([]);
            } else {
                setConversations(data.conversations || []);
            }
        } catch {
            setConversations([]);
        } finally {
            setLoading(false);
        }
    }, [selectedBrand]);

    const fetchMessages = useCallback(async (convoId: string) => {
        if (!selectedBrand) return;
        setLoadingMessages(true);
        try {
            const res = await fetch(`/api/whatsapp/chat?convo_id=${convoId}&limit=100`, {
                headers: { "brand-id": selectedBrand.id }
            });
            const data = await res.json();
            setMessages(data.messages || []);
        } catch {
            setMessages([]);
        } finally {
            setLoadingMessages(false);
        }
    }, [selectedBrand]);

    useEffect(() => {
        checkStatus();
        fetchConversations();
    }, [checkStatus, fetchConversations]);

    const selectConversation = (convo: Conversation) => {
        setSelectedConvo(convo);
        fetchMessages(convo.convo_id);
    };

    const openConvertModal = (convo: Conversation) => {
        setConvertModal({
            customerName: convo.name || "",
            phone: convo.phone_number || "",
            shippingAddress: "",
            shippingCity: "",
            product: "",
            price: 0,
            deliveryFee: 190,
            notes: `WhatsApp conversation with ${convo.name || convo.phone_number}`,
        });
        setConvertError("");
        setConvertSuccess(false);
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
            setConvertSuccess(true);
            setTimeout(() => {
                setConvertModal(null);
                setConvertSuccess(false);
            }, 1500);
        } catch (err: any) {
            setConvertError(err.message);
        } finally {
            setConverting(false);
        }
    };

    const formatTime = (ts: string) => {
        if (!ts) return "";
        const d = new Date(ts);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) return d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
        return d.toLocaleDateString("en-PK", { day: "numeric", month: "short" });
    };

    const formatFullTime = (ts: string) => {
        if (!ts) return "";
        return new Date(ts).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    };

    const formatPhone = (phone: string) => {
        if (!phone) return "";
        if (phone.startsWith("92") && phone.length >= 12) {
            return `0${phone.slice(2, 5)}-${phone.slice(5)}`;
        }
        return phone;
    };

    const filteredConversations = conversations.filter(c => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.phone_number && c.phone_number.includes(q)) ||
            (c.last_message && c.last_message.toLowerCase().includes(q))
        );
    });

    if (configured === false) {
        return (
            <DashboardLayout>
                <div className="flex flex-col gap-6 p-6 lg:p-10">
                    <div className="pb-6 border-b border-gray-200">
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <div className="p-2 bg-green-100 text-green-600 rounded-xl">
                                <MessageCircle className="w-7 h-7" />
                            </div>
                            WhatsApp Messages
                        </h1>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <WifiOff className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-3">WeTarSeel Not Configured</h3>
                        <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                            To view WhatsApp conversations, add your WeTarSeel Account ID and User ID in brand settings.
                        </p>
                        <a href="/settings" className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
                            Go to Settings
                        </a>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col h-[calc(100vh-64px)]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        {selectedConvo && (
                            <button
                                onClick={() => { setSelectedConvo(null); setMessages([]); }}
                                className="lg:hidden p-2 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </button>
                        )}
                        <div className="p-2 bg-green-100 text-green-600 rounded-xl">
                            <MessageCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">WhatsApp</h1>
                            <p className="text-xs text-gray-500">{conversations.length} conversations</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                            <Wifi className="w-3 h-3" />
                            WeTarSeel
                        </div>
                        <button
                            onClick={() => { fetchConversations(); if (selectedConvo) fetchMessages(selectedConvo.convo_id); }}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className={`w-full lg:w-[380px] border-r border-gray-200 bg-white flex flex-col ${selectedConvo ? "hidden lg:flex" : "flex"}`}>
                        <div className="p-3 border-b border-gray-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search conversations..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
                                </div>
                            ) : filteredConversations.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                                    <p className="text-sm font-medium">No conversations found</p>
                                </div>
                            ) : (
                                filteredConversations.map(convo => (
                                    <button
                                        key={convo.convo_id}
                                        onClick={() => selectConversation(convo)}
                                        className={`w-full px-4 py-3.5 text-left border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                                            selectedConvo?.convo_id === convo.convo_id ? "bg-green-50 border-l-2 border-l-green-500" : ""
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                                                <User className="w-5 h-5 text-gray-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                                    <span className="text-sm font-semibold text-gray-900 truncate">
                                                        {convo.name || formatPhone(convo.phone_number) || "Unknown"}
                                                    </span>
                                                    <span className="text-[11px] text-gray-400 shrink-0">{formatTime(convo.last_message_created)}</span>
                                                </div>
                                                {convo.name && convo.phone_number && (
                                                    <p className="text-[11px] text-gray-400 mb-0.5">{formatPhone(convo.phone_number)}</p>
                                                )}
                                                <p className="text-xs text-gray-500 truncate">
                                                    {convo.last_message_from === "agent" && <span className="text-gray-400">You: </span>}
                                                    {convo.last_message || "No messages"}
                                                </p>
                                            </div>
                                            {convo.unread_count > 0 && (
                                                <span className="bg-green-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                                                    {convo.unread_count}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className={`flex-1 flex flex-col bg-gray-50 ${selectedConvo ? "flex" : "hidden lg:flex"}`}>
                        {!selectedConvo ? (
                            <div className="flex-1 flex items-center justify-center text-gray-400">
                                <div className="text-center">
                                    <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                    <p className="text-lg font-medium text-gray-400">Select a conversation</p>
                                    <p className="text-sm text-gray-300 mt-1">Choose from your WhatsApp conversations</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="px-5 py-3.5 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => { setSelectedConvo(null); setMessages([]); }}
                                            className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                                        >
                                            <ArrowLeft className="w-4 h-4 text-gray-600" />
                                        </button>
                                        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                                            <User className="w-5 h-5 text-green-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">
                                                {selectedConvo.name || formatPhone(selectedConvo.phone_number) || "Unknown"}
                                            </p>
                                            <p className="text-xs text-gray-400 flex items-center gap-1">
                                                <Phone className="w-3 h-3" />
                                                {formatPhone(selectedConvo.phone_number)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openConvertModal(selectedConvo)}
                                        className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1.5"
                                    >
                                        <ShoppingBag className="w-3.5 h-3.5" />
                                        Create Order
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                                    {loadingMessages ? (
                                        <div className="flex items-center justify-center py-20">
                                            <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <div className="text-center py-16 text-gray-400">
                                            <p className="text-sm">No messages in this conversation</p>
                                        </div>
                                    ) : (
                                        [...messages].reverse().map(msg => (
                                            <div
                                                key={msg.id}
                                                className={`flex ${msg.from === "agent" ? "justify-end" : "justify-start"}`}
                                            >
                                                <div
                                                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                                                        msg.from === "agent"
                                                            ? "bg-green-600 text-white rounded-br-md"
                                                            : "bg-white text-gray-800 border border-gray-200 rounded-bl-md shadow-sm"
                                                    }`}
                                                >
                                                    <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                                                    <p className={`text-[10px] mt-1 text-right ${
                                                        msg.from === "agent" ? "text-green-200" : "text-gray-400"
                                                    }`}>
                                                        {formatFullTime(msg.created)}
                                                        {msg.from === "agent" && msg.delivery_status && (
                                                            <span className="ml-1.5">
                                                                {msg.delivery_status === "delivered" ? " \u2713\u2713" : msg.delivery_status === "sent" ? " \u2713" : ""}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {convertModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900">Create Order from WhatsApp</h3>
                            <button onClick={() => { setConvertModal(null); setConvertSuccess(false); }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {convertSuccess && (
                                <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 shrink-0" />
                                    Order created successfully!
                                </div>
                            )}
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
                                onClick={() => { setConvertModal(null); setConvertSuccess(false); }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConvert}
                                disabled={converting || convertSuccess}
                                className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
                                {converting ? "Creating..." : "Create Order"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
