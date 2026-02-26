"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
    ShoppingBag, Plus, Loader2, CheckCircle,
    ArrowLeft, Phone, MapPin, User, Package, FileText, Search, ChevronDown, X,
    AlertTriangle, Edit3
} from "lucide-react";

interface ProductVariant {
    id: number;
    title: string;
    price: string;
    sku: string;
    inventoryQuantity: number;
}

interface Product {
    id: number;
    title: string;
    productType: string;
    image: string | null;
    variants: ProductVariant[];
}

interface LineItem {
    id: string;
    title: string;
    quantity: string;
    price: string;
    image: string | null;
    variantId: number | null;
}

interface UpdatedOrder {
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

function ProductSelector({ onSelect, products, loadingProducts }: {
    onSelect: (title: string, price: string, image: string | null, variantId: number | null) => void;
    products: Product[];
    loadingProducts: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return products;
        const q = search.toLowerCase();
        return products.filter(p =>
            p.title.toLowerCase().includes(q) ||
            p.variants.some(v => v.title.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
        );
    }, [products, search]);

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-left flex items-center gap-2 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            >
                <Package size={14} className="text-gray-400 shrink-0" />
                <span className="text-gray-400 flex-1">Add product...</span>
                <ChevronDown size={14} className="text-gray-400" />
            </button>
            {open && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input ref={inputRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {loadingProducts ? (
                            <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2"><Loader2 size={16} className="animate-spin" />Loading...</div>
                        ) : filtered.length === 0 ? (
                            <div className="py-6 text-center text-sm text-gray-400">{search ? "No products match" : "No products found"}</div>
                        ) : (
                            filtered.map(product => (
                                <div key={product.id}>
                                    {product.variants.length === 1 ? (
                                        <button type="button" onClick={() => { const v = product.variants[0]; onSelect(product.title, v.price, product.image, v.id); setOpen(false); setSearch(""); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors text-left">
                                            {product.image ? <img src={product.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" /> : <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Package size={14} className="text-gray-400" /></div>}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                                                {product.variants[0].sku && <p className="text-xs text-gray-400">SKU: {product.variants[0].sku}</p>}
                                            </div>
                                            <span className="text-sm font-bold text-gray-700 shrink-0">Rs. {parseFloat(product.variants[0].price).toLocaleString()}</span>
                                        </button>
                                    ) : (
                                        <div>
                                            <div className="flex items-center gap-3 px-3 py-2 bg-gray-50/50">
                                                {product.image ? <img src={product.image} alt="" className="w-7 h-7 rounded-md object-cover border border-gray-100 shrink-0" /> : <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0"><Package size={12} className="text-gray-400" /></div>}
                                                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider truncate">{product.title}</p>
                                            </div>
                                            {product.variants.map(v => (
                                                <button key={v.id} type="button" onClick={() => { const title = v.title === "Default Title" ? product.title : `${product.title} - ${v.title}`; onSelect(title, v.price, product.image, v.id); setOpen(false); setSearch(""); }} className="w-full flex items-center gap-3 px-3 pl-12 py-2 hover:bg-indigo-50 transition-colors text-left">
                                                    <div className="flex-1 min-w-0"><p className="text-sm text-gray-700 truncate">{v.title}</p>{v.sku && <p className="text-xs text-gray-400">SKU: {v.sku}</p>}</div>
                                                    <span className="text-sm font-bold text-gray-700 shrink-0">Rs. {parseFloat(v.price).toLocaleString()}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                    <div className="border-t border-gray-100 p-2">
                        <button type="button" onClick={() => { onSelect(search || "", "", null, null); setOpen(false); setSearch(""); }} className="w-full text-center text-xs text-indigo-600 font-medium py-2 hover:bg-indigo-50 rounded-lg transition-colors">
                            + Add custom item{search ? `: "${search}"` : ""}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function EditOrderPage() {
    const { id } = useParams<{ id: string }>();
    const { selectedBrand } = useBrand();

    const [loading, setLoading] = useState(true);
    const [orderNotFound, setOrderNotFound] = useState(false);
    const [originalOrderName, setOriginalOrderName] = useState("");

    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [shippingAddress, setShippingAddress] = useState("");
    const [shippingCity, setShippingCity] = useState("");
    const [notes, setNotes] = useState("");
    const [deliveryFee, setDeliveryFee] = useState("190");
    const [freeDelivery, setFreeDelivery] = useState(false);
    const [manualDeliveryOverride, setManualDeliveryOverride] = useState(false);
    const [lineItems, setLineItems] = useState<LineItem[]>([]);

    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [updatedOrder, setUpdatedOrder] = useState<UpdatedOrder | null>(null);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        fetch(`/api/shopify/orders/${id}/edit`)
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    setOrderNotFound(true);
                    setError(data.error);
                    return;
                }
                const o = data.order;
                setOriginalOrderName(o.orderName || "");
                setCustomerName(o.customerName || "");
                setPhone(o.phone || "");
                setShippingAddress(o.shippingAddress || "");
                setShippingCity(o.shippingCity || "");

                let parsedItems: any[] = [];
                try { parsedItems = JSON.parse(o.lineItems || "[]"); } catch (_) {}
                setLineItems(parsedItems.map((item: any) => ({
                    id: generateId(),
                    title: item.title || "",
                    quantity: String(item.quantity || 1),
                    price: String(item.price || ""),
                    image: null,
                    variantId: null,
                })));

                const itemsSum = parsedItems.reduce((s: number, item: any) => s + ((parseInt(item.quantity) || 1) * (parseFloat(item.price) || 0)), 0);
                const totalWithDelivery = o.totalPrice || 0;
                const inferredDelivery = Math.max(0, Math.round(totalWithDelivery - itemsSum));
                if (inferredDelivery === 0) {
                    setDeliveryFee("0");
                    setFreeDelivery(true);
                    setManualDeliveryOverride(true);
                } else {
                    setDeliveryFee(String(inferredDelivery));
                }
            })
            .catch(() => { setOrderNotFound(true); setError("Failed to load order"); })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        if (!selectedBrand) return;
        setLoadingProducts(true);
        fetch("/api/shopify/products", { headers: { "brand-id": selectedBrand.id } })
            .then(r => r.json())
            .then(data => { if (data.products) setProducts(data.products); })
            .catch(() => {})
            .finally(() => setLoadingProducts(false));
    }, [selectedBrand]);

    const addProduct = (title: string, price: string, image: string | null, variantId: number | null) => {
        setLineItems(prev => [...prev, { id: generateId(), title, quantity: "1", price, image, variantId }]);
    };

    const removeLineItem = (itemId: string) => {
        setLineItems(prev => prev.filter(item => item.id !== itemId));
    };

    const updateLineItem = (itemId: string, field: "quantity" | "price" | "title", value: string) => {
        setLineItems(prev => prev.map(item => item.id === itemId ? { ...item, [field]: value } : item));
    };

    const itemsTotal = lineItems.reduce((sum, item) => {
        return sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0));
    }, 0);

    useEffect(() => {
        if (manualDeliveryOverride) return;
        if (itemsTotal >= 2200) {
            setFreeDelivery(true);
            setDeliveryFee("0");
        } else {
            setFreeDelivery(false);
            setDeliveryFee("190");
        }
    }, [itemsTotal, manualDeliveryOverride]);

    const deliveryFeeNum = freeDelivery ? 0 : (parseFloat(deliveryFee) || 0);
    const totalAmount = itemsTotal + deliveryFeeNum;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const validItems = lineItems.filter(item => item.title && item.quantity && item.price);
        if (validItems.length === 0) {
            setError("Add at least one item with title, quantity, and price");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/shopify/orders/${id}/edit`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
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
                    deliveryFee: deliveryFeeNum,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update order");
            setUpdatedOrder({
                ...data.order,
            });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6 flex items-center justify-center">
                    <Loader2 size={32} className="animate-spin text-indigo-500" />
                </div>
            </DashboardLayout>
        );
    }

    if (orderNotFound) {
        return (
            <DashboardLayout>
                <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
                    <div className="max-w-2xl mx-auto text-center py-20">
                        <AlertTriangle size={48} className="mx-auto text-amber-500 mb-4" />
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Cannot Edit Order</h2>
                        <p className="text-gray-500 mb-6">{error || "Order not found or not editable"}</p>
                        <Link href="/shopify" className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">
                            Back to Orders
                        </Link>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (updatedOrder) {
        return (
            <DashboardLayout>
                <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
                    <div className="max-w-2xl mx-auto">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="text-green-600" size={32} />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Updated Successfully</h2>
                            <p className="text-gray-500 mb-6">The old order was cancelled and a new one was created on Shopify</p>
                            <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Old Order</span>
                                    <span className="text-sm text-gray-400 line-through">{originalOrderName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">New Order</span>
                                    <span className="text-sm font-semibold text-gray-900">{updatedOrder.orderName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Customer</span>
                                    <span className="text-sm font-medium text-gray-900">{updatedOrder.customerName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Phone</span>
                                    <span className="text-sm font-medium text-gray-900">{phone}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Address</span>
                                    <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{shippingAddress}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">City</span>
                                    <span className="text-sm font-medium text-gray-900">{shippingCity}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Total</span>
                                    <span className="text-sm font-bold text-green-600">Rs. {updatedOrder.totalPrice.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Status</span>
                                    <span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-700 rounded-full">Order Updated</span>
                                </div>
                            </div>
                            <div className="flex gap-3 justify-center">
                                <Link href="/shopify" className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
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
                        <Link href="/shopify" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <ArrowLeft size={20} className="text-gray-500" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Edit Order</h1>
                            <p className="text-sm text-gray-500">Editing {originalOrderName}</p>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-700 flex items-start gap-3">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">This will cancel the current order and create a new one</p>
                            <p className="text-xs text-amber-600 mt-1">Shopify does not allow direct editing of orders. A new order will be created with your changes and the old one will be cancelled.</p>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{error}</div>
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
                                    <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} required placeholder="Full name" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                                    <div className="relative">
                                        <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="03XX-XXXXXXX" className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
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
                                    <input type="text" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} required placeholder="Full address" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                                    <input type="text" value={shippingCity} onChange={e => setShippingCity(e.target.value)} required placeholder="e.g. Lahore" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <Package size={16} className="text-indigo-500" />
                                    Order Items
                                </h3>
                                <span className="text-xs text-gray-400">
                                    {products.length > 0 ? `${products.length} products loaded` : loadingProducts ? "Loading..." : ""}
                                </span>
                            </div>
                            <div className="mb-4">
                                <ProductSelector products={products} loadingProducts={loadingProducts} onSelect={addProduct} />
                            </div>
                            {lineItems.length > 0 && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
                                        <div className="col-span-5">Item</div>
                                        <div className="col-span-2">Qty</div>
                                        <div className="col-span-3">Price (Rs.)</div>
                                        <div className="col-span-2 text-right">Subtotal</div>
                                    </div>
                                    {lineItems.map((item) => {
                                        const subtotal = (parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0);
                                        return (
                                            <div key={item.id} className="grid grid-cols-12 gap-3 items-center bg-gray-50/50 rounded-xl p-2">
                                                <div className="col-span-5 flex items-center gap-2">
                                                    {item.image ? (
                                                        <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover border border-gray-100 shrink-0" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Package size={12} className="text-gray-400" /></div>
                                                    )}
                                                    <input type="text" value={item.title} onChange={e => updateLineItem(item.id, "title", e.target.value)} placeholder="Product name" required className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                                </div>
                                                <div className="col-span-2">
                                                    <input type="number" value={item.quantity} onChange={e => updateLineItem(item.id, "quantity", e.target.value)} min="1" required className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                                </div>
                                                <div className="col-span-3">
                                                    <input type="number" value={item.price} onChange={e => updateLineItem(item.id, "price", e.target.value)} placeholder="0" min="0" step="1" required className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                                </div>
                                                <div className="col-span-2 flex items-center justify-end gap-1">
                                                    <span className="text-sm font-medium text-gray-700">{subtotal > 0 ? subtotal.toLocaleString() : "-"}</span>
                                                    <button type="button" onClick={() => removeLineItem(item.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors"><X size={14} /></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {lineItems.length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-sm">Add products to the order</div>
                            )}
                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <label className="text-sm font-medium text-gray-700">Delivery Fee (Rs.)</label>
                                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                            <input type="checkbox" checked={freeDelivery} onChange={e => { setManualDeliveryOverride(true); setFreeDelivery(e.target.checked); setDeliveryFee(e.target.checked ? "0" : "190"); }} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                            <span className="text-xs font-medium text-green-600">Free Delivery</span>
                                        </label>
                                    </div>
                                    <input type="number" value={freeDelivery ? "0" : deliveryFee} onChange={e => { setManualDeliveryOverride(true); setDeliveryFee(e.target.value); setFreeDelivery(false); }} min="0" step="1" placeholder="0" disabled={freeDelivery} className={`w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 ${freeDelivery ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-gray-50"}`} />
                                </div>
                                {itemsTotal >= 2200 && !manualDeliveryOverride && <p className="text-xs text-green-600">Free delivery applied (order over Rs. 2,200)</p>}
                                {itemsTotal < 2200 && <p className="text-xs text-gray-400">Free delivery on orders over Rs. 2,200</p>}
                                <div className="flex items-center justify-between text-sm text-gray-500">
                                    <span>Items Subtotal</span><span>Rs. {itemsTotal.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-500">
                                    <span>Delivery</span>
                                    <span className={freeDelivery ? "text-green-600 font-medium" : ""}>{freeDelivery ? "FREE" : `Rs. ${deliveryFeeNum.toLocaleString()}`}</span>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
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
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any special instructions or order notes..." className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all" />
                        </div>

                        <div className="flex justify-end gap-3">
                            <Link href="/shopify" className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">Cancel</Link>
                            <button type="submit" disabled={submitting || lineItems.length === 0} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm">
                                {submitting ? (<><Loader2 size={18} className="animate-spin" />Updating Order...</>) : (<><Edit3 size={18} />Update Order</>)}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </DashboardLayout>
    );
}
