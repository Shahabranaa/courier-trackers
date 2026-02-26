"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
    ShoppingBag, Plus, Loader2, CheckCircle,
    ArrowLeft, Phone, MapPin, User, Package, FileText, Search, ChevronDown, X,
    ClipboardPaste, Edit3
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

interface CreatedOrder {
    id: string;
    orderNumber: string;
    orderName: string;
    totalPrice: number;
    customerName: string;
    status: string;
}

interface ParsedData {
    name: string;
    address: string;
    city: string;
    phone: string;
    product: string;
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

function parseWhatsAppMessage(text: string): ParsedData {
    const result: ParsedData = { name: "", address: "", city: "", phone: "", product: "" };
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const nameLabels = ["name", "customer", "customer name", "naam"];
    const addressLabels = ["address", "shipping address", "delivery address", "addr", "pata"];
    const cityLabels = ["city", "shehar", "shehr"];
    const phoneLabels = ["phone", "phone number", "mobile", "cell", "contact", "number", "ph", "#", "whatsapp", "no"];
    const productLabels = ["product", "item", "order", "plan", "package", "products", "items"];

    for (const line of lines) {
        const match = line.match(/^([^:|\-–]+)\s*[:\-–|]\s*(.+)$/);
        if (!match) continue;
        const label = match[1].trim().toLowerCase();
        const value = match[2].trim();
        if (!value) continue;

        if (nameLabels.includes(label)) {
            result.name = value;
        } else if (addressLabels.includes(label)) {
            result.address = value;
        } else if (cityLabels.includes(label)) {
            result.city = value;
        } else if (phoneLabels.includes(label)) {
            result.phone = value;
        } else if (productLabels.includes(label)) {
            result.product = value;
        }
    }

    if (!result.phone) {
        const phoneMatch = text.match(/(0\d{2,3}[-\s]?\d{7,8})/m) ||
                           text.match(/(\+92[-\s]?\d{3}[-\s]?\d{7})/m) ||
                           text.match(/(\+92\d{10})/m);
        if (phoneMatch) result.phone = phoneMatch[1];
    }

    return result;
}

function fuzzyMatchProduct(query: string, products: Product[]): { product: Product; variant: ProductVariant; score: number } | null {
    if (!query.trim() || products.length === 0) return null;
    const q = query.toLowerCase().trim();
    let bestMatch: { product: Product; variant: ProductVariant; score: number } | null = null;

    for (const product of products) {
        const pTitle = product.title.toLowerCase();
        for (const variant of product.variants) {
            const vTitle = variant.title.toLowerCase();
            const fullTitle = vTitle === "default title" ? pTitle : `${pTitle} ${vTitle}`;

            let score = 0;
            if (fullTitle === q || pTitle === q) {
                score = 100;
            } else if (fullTitle.includes(q) || pTitle.includes(q)) {
                score = 80;
            } else if (q.includes(pTitle) || q.includes(vTitle)) {
                score = 70;
            } else {
                const qWords = q.split(/\s+/);
                const titleWords = fullTitle.split(/\s+/);
                let matched = 0;
                for (const qw of qWords) {
                    if (titleWords.some(tw => tw.includes(qw) || qw.includes(tw))) matched++;
                }
                if (matched > 0) {
                    score = Math.round((matched / qWords.length) * 60);
                }
            }

            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { product, variant, score };
            }
        }
    }

    return bestMatch && bestMatch.score >= 30 ? bestMatch : null;
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
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
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
                <span className="text-gray-400 flex-1">Select product...</span>
                <ChevronDown size={14} className="text-gray-400" />
            </button>

            {open && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search products..."
                                className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {loadingProducts ? (
                            <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
                                <Loader2 size={16} className="animate-spin" />
                                Loading products...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="py-6 text-center text-sm text-gray-400">
                                {search ? "No products match your search" : "No products found"}
                            </div>
                        ) : (
                            filtered.map(product => (
                                <div key={product.id}>
                                    {product.variants.length === 1 ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const v = product.variants[0];
                                                onSelect(product.title, v.price, product.image, v.id);
                                                setOpen(false);
                                                setSearch("");
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors text-left"
                                        >
                                            {product.image ? (
                                                <img src={product.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" />
                                            ) : (
                                                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                                    <Package size={14} className="text-gray-400" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                                                {product.variants[0].sku && (
                                                    <p className="text-xs text-gray-400">SKU: {product.variants[0].sku}</p>
                                                )}
                                            </div>
                                            <span className="text-sm font-bold text-gray-700 shrink-0">Rs. {parseFloat(product.variants[0].price).toLocaleString()}</span>
                                        </button>
                                    ) : (
                                        <div>
                                            <div className="flex items-center gap-3 px-3 py-2 bg-gray-50/50">
                                                {product.image ? (
                                                    <img src={product.image} alt="" className="w-7 h-7 rounded-md object-cover border border-gray-100 shrink-0" />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                                                        <Package size={12} className="text-gray-400" />
                                                    </div>
                                                )}
                                                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider truncate">{product.title}</p>
                                            </div>
                                            {product.variants.map(v => (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => {
                                                        const title = v.title === "Default Title" ? product.title : `${product.title} - ${v.title}`;
                                                        onSelect(title, v.price, product.image, v.id);
                                                        setOpen(false);
                                                        setSearch("");
                                                    }}
                                                    className="w-full flex items-center gap-3 px-3 pl-12 py-2 hover:bg-indigo-50 transition-colors text-left"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-gray-700 truncate">{v.title}</p>
                                                        {v.sku && <p className="text-xs text-gray-400">SKU: {v.sku}</p>}
                                                    </div>
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
                        <button
                            type="button"
                            onClick={() => {
                                onSelect(search || "", "", null, null);
                                setOpen(false);
                                setSearch("");
                            }}
                            className="w-full text-center text-xs text-indigo-600 font-medium py-2 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                            + Add custom item{search ? `: "${search}"` : ""}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CreateOrderPage() {
    const { selectedBrand } = useBrand();

    const [mode, setMode] = useState<"quick" | "manual">("quick");
    const [pasteText, setPasteText] = useState("");
    const [filledFromPaste, setFilledFromPaste] = useState(false);

    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [shippingAddress, setShippingAddress] = useState("");
    const [shippingCity, setShippingCity] = useState("");
    const [notes, setNotes] = useState("");
    const [deliveryFee, setDeliveryFee] = useState("0");
    const [lineItems, setLineItems] = useState<LineItem[]>([]);

    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);

    useEffect(() => {
        if (!selectedBrand) return;
        setLoadingProducts(true);
        fetch("/api/shopify/products", {
            headers: { "brand-id": selectedBrand.id }
        })
            .then(r => r.json())
            .then(data => {
                if (data.products) setProducts(data.products);
            })
            .catch(() => {})
            .finally(() => setLoadingProducts(false));
    }, [selectedBrand]);

    const handleParse = () => {
        if (!pasteText.trim()) return;
        const data = parseWhatsAppMessage(pasteText);

        setCustomerName(data.name);
        setPhone(data.phone);
        setShippingAddress(data.address);
        setShippingCity(data.city);

        if (data.product) {
            const match = fuzzyMatchProduct(data.product, products);
            if (match) {
                const title = match.variant.title === "Default Title"
                    ? match.product.title
                    : `${match.product.title} - ${match.variant.title}`;
                setLineItems([{
                    id: generateId(),
                    title,
                    quantity: "1",
                    price: match.variant.price,
                    image: match.product.image,
                    variantId: match.variant.id,
                }]);
            } else {
                setLineItems([{
                    id: generateId(),
                    title: data.product,
                    quantity: "1",
                    price: "",
                    image: null,
                    variantId: null,
                }]);
            }
        }

        setFilledFromPaste(true);
    };

    const addProduct = (title: string, price: string, image: string | null, variantId: number | null) => {
        setLineItems(prev => [...prev, {
            id: generateId(),
            title,
            quantity: "1",
            price,
            image,
            variantId,
        }]);
    };

    const removeLineItem = (id: string) => {
        setLineItems(prev => prev.filter(item => item.id !== id));
    };

    const updateLineItem = (id: string, field: "quantity" | "price" | "title", value: string) => {
        setLineItems(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const itemsTotal = lineItems.reduce((sum, item) => {
        const qty = parseInt(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        return sum + (qty * price);
    }, 0);
    const deliveryFeeNum = parseFloat(deliveryFee) || 0;
    const totalAmount = itemsTotal + deliveryFeeNum;

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
                    deliveryFee: deliveryFeeNum,
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
        setDeliveryFee("0");
        setLineItems([]);
        setCreatedOrder(null);
        setError(null);
        setPasteText("");
        setFilledFromPaste(false);
        setMode("quick");
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
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
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
                        <div className="flex bg-gray-100 rounded-xl p-1">
                            <button
                                type="button"
                                onClick={() => setMode("quick")}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${mode === "quick" ? "bg-white shadow-sm text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                <ClipboardPaste size={14} />
                                Quick Paste
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("manual")}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${mode === "manual" ? "bg-white shadow-sm text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                <Edit3 size={14} />
                                Manual
                            </button>
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

                    {mode === "quick" && !filledFromPaste && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <ClipboardPaste size={16} className="text-indigo-500" />
                                Paste WhatsApp Order
                            </h3>
                            <p className="text-xs text-gray-400 mb-3">
                                Paste the order message below. Expected format:
                            </p>
                            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-500 font-mono leading-relaxed border border-gray-100">
                                Name: Customer Name<br />
                                Address: Full shipping address<br />
                                City: City name<br />
                                Phone: 03XX-XXXXXXX<br />
                                Product: Product or plan name
                            </div>
                            <textarea
                                value={pasteText}
                                onChange={e => setPasteText(e.target.value)}
                                rows={6}
                                placeholder={"Name: Shahab\nAddress: 35-W DHA Phase 3\nCity: Lahore\nPhone: 03337297773\nProduct: 1 month plan"}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all font-mono"
                            />
                            <div className="flex justify-end mt-4">
                                <button
                                    type="button"
                                    onClick={handleParse}
                                    disabled={!pasteText.trim()}
                                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                    <Search size={16} />
                                    Parse Order
                                </button>
                            </div>
                        </div>
                    )}

                    {(mode === "manual" || filledFromPaste) && (
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
                                    <span className="text-xs text-gray-400">
                                        {products.length > 0 ? `${products.length} products loaded` : loadingProducts ? "Loading..." : ""}
                                    </span>
                                </div>

                                <div className="mb-4">
                                    <ProductSelector
                                        products={products}
                                        loadingProducts={loadingProducts}
                                        onSelect={addProduct}
                                    />
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
                                                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                                                <Package size={12} className="text-gray-400" />
                                                            </div>
                                                        )}
                                                        <input
                                                            type="text"
                                                            value={item.title}
                                                            onChange={e => updateLineItem(item.id, "title", e.target.value)}
                                                            placeholder="Product name"
                                                            required
                                                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={e => updateLineItem(item.id, "quantity", e.target.value)}
                                                            min="1"
                                                            required
                                                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                                                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 flex items-center justify-end gap-1">
                                                        <span className="text-sm font-medium text-gray-700">
                                                            {subtotal > 0 ? `${subtotal.toLocaleString()}` : "-"}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeLineItem(item.id)}
                                                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {lineItems.length === 0 && (
                                    <div className="text-center py-8 text-gray-400 text-sm">
                                        Select products from the dropdown above to add them to the order
                                    </div>
                                )}

                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-gray-700">Delivery Fee (Rs.)</label>
                                        <input
                                            type="number"
                                            value={deliveryFee}
                                            onChange={e => setDeliveryFee(e.target.value)}
                                            min="0"
                                            step="1"
                                            placeholder="0"
                                            className="w-32 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-sm text-gray-500">
                                        <span>Items Subtotal</span>
                                        <span>Rs. {itemsTotal.toLocaleString()}</span>
                                    </div>
                                    {deliveryFeeNum > 0 && (
                                        <div className="flex items-center justify-between text-sm text-gray-500">
                                            <span>Delivery</span>
                                            <span>Rs. {deliveryFeeNum.toLocaleString()}</span>
                                        </div>
                                    )}
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
                                    disabled={submitting || !selectedBrand || lineItems.length === 0}
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
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
