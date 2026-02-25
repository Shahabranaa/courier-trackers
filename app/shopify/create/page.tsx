"use client";

import { useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
    ShoppingBag, Plus, Trash2, Loader2, CheckCircle,
    ArrowLeft, Phone, MapPin, User, Package, FileText
} from "lucide-react";

interface LineItem {
    id: string;
    title: string;
    quantity: string;
    price: string;
}

interface CreatedOrder {
    id: string;
    orderNumber: string;
    orderName: string;
    totalPrice: number;
    customerName: string;
    status: string;
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

export default function CreateOrderPage() {
    const { selectedBrand } = useBrand();

    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [shippingAddress, setShippingAddress] = useState("");
    const [shippingCity, setShippingCity] = useState("");
    const [notes, setNotes] = useState("");
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: generateId(), title: "", quantity: "1", price: "" }
    ]);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);

    const addLineItem = () => {
        setLineItems(prev => [...prev, { id: generateId(), title: "", quantity: "1", price: "" }]);
    };

    const removeLineItem = (id: string) => {
        if (lineItems.length <= 1) return;
        setLineItems(prev => prev.filter(item => item.id !== id));
    };

    const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
        setLineItems(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const totalAmount = lineItems.reduce((sum, item) => {
        const qty = parseInt(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        return sum + (qty * price);
    }, 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBrand) {
            setError("Please select a brand first");
            return;
        }

        const validItems = lineItems.filter(item => item.title && item.quantity && item.price);
        if (validItems.length === 0) {
            setError("Add at least one item with title, quantity, and price");
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch("/api/shopify/orders/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "brand-id": selectedBrand.id,
                },
                body: JSON.stringify({
                    customerName,
                    phone,
                    shippingAddress,
                    shippingCity,
                    lineItems: validItems.map(item => ({
                        title: item.title,
                        quantity: parseInt(item.quantity),
                        price: parseFloat(item.price),
                    })),
                    notes,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to create order");
            }

            setCreatedOrder(data.order);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setCustomerName("");
        setPhone("");
        setShippingAddress("");
        setShippingCity("");
        setNotes("");
        setLineItems([{ id: generateId(), title: "", quantity: "1", price: "" }]);
        setCreatedOrder(null);
        setError(null);
    };

    if (createdOrder) {
        return (
            <DashboardLayout>
                <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
                    <div className="max-w-2xl mx-auto">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="text-green-600" size={32} />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Created Successfully</h2>
                            <p className="text-gray-500 mb-6">Your WhatsApp order has been pushed to Shopify</p>

                            <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Order</span>
                                    <span className="text-sm font-semibold text-gray-900">{createdOrder.orderName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Customer</span>
                                    <span className="text-sm font-medium text-gray-900">{createdOrder.customerName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Total</span>
                                    <span className="text-sm font-bold text-green-600">Rs. {createdOrder.totalPrice.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Status</span>
                                    <span className="text-xs font-medium px-2 py-1 bg-amber-100 text-amber-700 rounded-full capitalize">{createdOrder.status}</span>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={resetForm}
                                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                                >
                                    <Plus size={16} />
                                    Create Another
                                </button>
                                <Link
                                    href="/shopify"
                                    className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center gap-2"
                                >
                                    <ShoppingBag size={16} />
                                    View All Orders
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-3 mb-6">
                        <Link
                            href="/shopify"
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft size={20} className="text-gray-500" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Create Order</h1>
                            <p className="text-sm text-gray-500">Add a WhatsApp order to Shopify</p>
                        </div>
                    </div>

                    {!selectedBrand && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-700">
                            Please select a brand from the sidebar before creating an order.
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <User size={16} className="text-indigo-500" />
                                Customer Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer Name</label>
                                    <input
                                        type="text"
                                        value={customerName}
                                        onChange={e => setCustomerName(e.target.value)}
                                        required
                                        placeholder="Full name"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                                    <div className="relative">
                                        <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            required
                                            placeholder="03XX-XXXXXXX"
                                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <MapPin size={16} className="text-indigo-500" />
                                Shipping Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Shipping Address</label>
                                    <input
                                        type="text"
                                        value={shippingAddress}
                                        onChange={e => setShippingAddress(e.target.value)}
                                        required
                                        placeholder="Full address"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                                    <input
                                        type="text"
                                        value={shippingCity}
                                        onChange={e => setShippingCity(e.target.value)}
                                        required
                                        placeholder="e.g. Lahore"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <Package size={16} className="text-indigo-500" />
                                    Order Items
                                </h3>
                                <button
                                    type="button"
                                    onClick={addLineItem}
                                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
                                >
                                    <Plus size={14} />
                                    Add Item
                                </button>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
                                    <div className="col-span-5">Item Name</div>
                                    <div className="col-span-2">Qty</div>
                                    <div className="col-span-3">Price (Rs.)</div>
                                    <div className="col-span-2 text-right">Subtotal</div>
                                </div>

                                {lineItems.map((item) => {
                                    const subtotal = (parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0);
                                    return (
                                        <div key={item.id} className="grid grid-cols-12 gap-3 items-center">
                                            <div className="col-span-5">
                                                <input
                                                    type="text"
                                                    value={item.title}
                                                    onChange={e => updateLineItem(item.id, "title", e.target.value)}
                                                    placeholder="Product name"
                                                    required
                                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={e => updateLineItem(item.id, "quantity", e.target.value)}
                                                    min="1"
                                                    required
                                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <input
                                                    type="number"
                                                    value={item.price}
                                                    onChange={e => updateLineItem(item.id, "price", e.target.value)}
                                                    placeholder="0"
                                                    min="0"
                                                    step="1"
                                                    required
                                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div className="col-span-2 flex items-center justify-end gap-2">
                                                <span className="text-sm font-medium text-gray-700">
                                                    {subtotal > 0 ? `Rs. ${subtotal.toLocaleString()}` : "-"}
                                                </span>
                                                {lineItems.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeLineItem(item.id)}
                                                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total Amount</p>
                                    <p className="text-2xl font-bold text-gray-900">Rs. {totalAmount.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <FileText size={16} className="text-indigo-500" />
                                Notes (Optional)
                            </h3>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Any special instructions or order notes..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <Link
                                href="/shopify"
                                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </Link>
                            <button
                                type="submit"
                                disabled={submitting || !selectedBrand}
                                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Creating Order...
                                    </>
                                ) : (
                                    <>
                                        <ShoppingBag size={18} />
                                        Create Order in Shopify
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </DashboardLayout>
    );
}
