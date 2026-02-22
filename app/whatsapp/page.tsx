"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import {
  MessageCircle, Search, Send, Phone, User, ArrowLeft,
  Filter, Calendar, ChevronDown, X, RefreshCw, Clock,
  ArrowDownLeft, ArrowUpRight, Image, FileText, Mic, Video, MapPin
} from "lucide-react";

interface Contact {
  id: string;
  waId: string;
  profileName: string;
  phoneNumber: string;
  lastMessageAt: string;
  messageCount: number;
  lastMessage: {
    body: string;
    type: string;
    direction: string;
    timestamp: string;
  } | null;
}

interface Message {
  id: string;
  messageId: string;
  direction: string;
  type: string;
  body: string;
  mediaUrl: string;
  mediaType: string;
  timestamp: string;
  status: string;
  contact: {
    waId: string;
    profileName: string;
    phoneNumber: string;
  };
}

export default function WhatsAppPage() {
  const { user: authUser } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    direction: "",
    type: "",
    phone: "",
    dateFrom: "",
    dateTo: "",
  });
  const [totalContacts, setTotalContacts] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: "contacts" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/whatsapp/messages?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts);
        setTotalContacts(data.total);
      }
    } catch (e) {
      console.error("Failed to load contacts:", e);
    }
    setLoading(false);
  }, [search]);

  const loadMessages = useCallback(async (contactId: string) => {
    setMessagesLoading(true);
    try {
      const params = new URLSearchParams({ mode: "messages", contactId, limit: "100" });
      if (filters.direction) params.set("direction", filters.direction);
      if (filters.type) params.set("type", filters.type);
      if (filters.phone) params.set("phone", filters.phone);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      const res = await fetch(`/api/whatsapp/messages?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.reverse());
        setTotalMessages(data.total);
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
    setMessagesLoading(false);
  }, [filters]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id);
    }
  }, [selectedContact, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!messageInput.trim() || !selectedContact || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selectedContact.waId,
          message: messageInput.trim(),
        }),
      });
      if (res.ok) {
        setMessageInput("");
        setTimeout(() => loadMessages(selectedContact.id), 500);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to send message");
      }
    } catch (e) {
      console.error("Failed to send:", e);
    }
    setSending(false);
  };

  const clearFilters = () => {
    setFilters({ direction: "", type: "", phone: "", dateFrom: "", dateTo: "" });
  };

  const hasActiveFilters = filters.direction || filters.type || filters.phone || filters.dateFrom || filters.dateTo;

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case "image": return <Image size={14} />;
      case "video": return <Video size={14} />;
      case "audio": return <Mic size={14} />;
      case "document": return <FileText size={14} />;
      case "location": return <MapPin size={14} />;
      default: return null;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isYesterday) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatFullTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString([], {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-0px)]">
        {/* Contacts Sidebar */}
        <div className={`${selectedContact ? "hidden md:flex" : "flex"} flex-col w-full md:w-96 border-r border-gray-200 bg-white`}>
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <div className="p-1.5 bg-green-100 rounded-lg">
                  <MessageCircle size={18} className="text-green-600" />
                </div>
                WhatsApp
              </h1>
              <button
                onClick={loadContacts}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">{totalContacts} conversation{totalContacts !== 1 ? "s" : ""}</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-6 w-6 border-3 border-green-600 border-t-transparent rounded-full"></div>
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageCircle size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm font-medium">No conversations yet</p>
                <p className="text-gray-400 text-xs mt-1">Messages will appear here when received via webhook</p>
              </div>
            ) : (
              contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 ${selectedContact?.id === contact.id ? "bg-green-50" : ""}`}
                >
                  <div className="h-11 w-11 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {(contact.profileName || contact.phoneNumber).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 text-sm truncate">
                        {contact.profileName || contact.phoneNumber}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">
                        {formatTime(contact.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {contact.lastMessage && (
                        <>
                          {contact.lastMessage.direction === "outgoing" && (
                            <ArrowUpRight size={12} className="text-green-500 shrink-0" />
                          )}
                          {getMessageTypeIcon(contact.lastMessage.type)}
                          <p className="text-xs text-gray-500 truncate">
                            {contact.lastMessage.body || `[${contact.lastMessage.type}]`}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {contact.messageCount}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`${selectedContact ? "flex" : "hidden md:flex"} flex-col flex-1 bg-gray-50`}>
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="p-4 bg-white border-b border-gray-200 flex items-center gap-3">
                <button
                  onClick={() => setSelectedContact(null)}
                  className="md:hidden p-1 hover:bg-gray-100 rounded-lg text-gray-500"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="h-10 w-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {(selectedContact.profileName || selectedContact.phoneNumber).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">
                    {selectedContact.profileName || selectedContact.phoneNumber}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Phone size={10} /> +{selectedContact.waId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-2 rounded-lg transition-colors ${hasActiveFilters ? "bg-green-100 text-green-700" : "hover:bg-gray-100 text-gray-500"}`}
                    title="Filters"
                  >
                    <Filter size={16} />
                  </button>
                  <button
                    onClick={() => loadMessages(selectedContact.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                    title="Refresh messages"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>

              {/* Filters Panel */}
              {showFilters && (
                <div className="p-3 bg-white border-b border-gray-200">
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="text"
                      value={filters.phone}
                      onChange={(e) => setFilters(f => ({ ...f, phone: e.target.value }))}
                      placeholder="Filter by phone..."
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none w-36"
                    />
                    <select
                      value={filters.direction}
                      onChange={(e) => setFilters(f => ({ ...f, direction: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="">All Directions</option>
                      <option value="incoming">Incoming</option>
                      <option value="outgoing">Outgoing</option>
                    </select>
                    <select
                      value={filters.type}
                      onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="">All Types</option>
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                      <option value="document">Document</option>
                      <option value="location">Location</option>
                      <option value="template">Template</option>
                    </select>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="From"
                    />
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="To"
                    />
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition-colors"
                      >
                        <X size={14} /> Clear
                      </button>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">{totalMessages} message{totalMessages !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-6 w-6 border-3 border-green-600 border-t-transparent rounded-full"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageCircle size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">No messages found</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outgoing" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          msg.direction === "outgoing"
                            ? "bg-green-600 text-white rounded-br-md"
                            : "bg-white text-gray-900 shadow-sm border border-gray-100 rounded-bl-md"
                        }`}
                      >
                        {msg.type !== "text" && (
                          <div className={`flex items-center gap-1 text-xs mb-1 ${msg.direction === "outgoing" ? "text-green-200" : "text-gray-400"}`}>
                            {getMessageTypeIcon(msg.type)}
                            <span className="capitalize">{msg.type}</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {msg.body || `[${msg.type}]`}
                        </p>
                        <div className={`flex items-center gap-1 mt-1 ${msg.direction === "outgoing" ? "justify-end" : ""}`}>
                          <Clock size={10} className={msg.direction === "outgoing" ? "text-green-200" : "text-gray-400"} />
                          <span className={`text-xs ${msg.direction === "outgoing" ? "text-green-200" : "text-gray-400"}`}>
                            {formatFullTime(msg.timestamp)}
                          </span>
                          {msg.direction === "outgoing" && msg.status && (
                            <span className="text-xs text-green-200 ml-1">
                              {msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : msg.status === "sent" ? "✓" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!messageInput.trim() || sending}
                    className="p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="h-20 w-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle size={36} className="text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">WhatsApp Business</h2>
                <p className="text-gray-500 text-sm max-w-md">
                  Select a conversation from the left to view messages.
                  New messages will appear automatically via webhook.
                </p>
                <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200 inline-block text-left">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Webhook URL</p>
                  <code className="text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg block break-all">
                    {typeof window !== "undefined" ? `${window.location.origin}/api/whatsapp/webhook` : "/api/whatsapp/webhook"}
                  </code>
                  <p className="text-xs text-gray-400 mt-2">Configure this URL in your Meta App Dashboard → WhatsApp → Configuration</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
