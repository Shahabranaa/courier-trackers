"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import {
    MessageCircle, CheckCircle, AlertCircle, Wifi, WifiOff,
    ShoppingBag, X, RefreshCw, Loader2, Search, ArrowLeft, User, Phone, MapPin, Bell,
    Package, ChevronDown, FileText, ClipboardPaste, Edit3, BarChart3, TrendingUp, ShoppingCart
} from "lucide-react";

const PK_CITIES = [
    "lahore","karachi","islamabad","rawalpindi","faisalabad","multan","peshawar","quetta",
    "sialkot","gujranwala","hyderabad","bahawalpur","sargodha","sahiwal","abbottabad",
    "mardan","mingora","larkana","sheikhupura","rahim yar khan","jhang","gujrat","kasur",
    "okara","chiniot","kamoke","sadiqabad","burewala","jacobabad","muzaffargarh","mirpur",
    "jhelum","khanewal","dera ghazi khan","hafizabad","kohat","wah cantt","wah",
    "mandi bahauddin","tando adam","taxila","vehari","pakpattan","hub","khairpur",
    "mansehra","chakwal","swabi","bannu","attock","nowshera","turbat","khuzdar",
    "dera ismail khan","chaman","zhob","muzaffarabad","kotli","bagh","rawalakot",
    "gilgit","skardu","chitral","swat","haripur","batagram","shangla","hangu",
    "karak","lakki marwat","tank","dera murad jamali","shikarpur","sukkur","nawabshah",
    "mirpurkhas","umerkot","tharparkar","badin","thatta","dadu","sanghar","naushahro feroze",
    "ghotki","kandhkot","kashmore","qambar shahdadkot","matiari","tando allahyar",
    "tando muhammad khan","jamshoro","lasbela","awaran","kech","gwadar","panjgur",
    "washuk","kharan","nushki","mastung","kalat","sibi","kohlu","barkhan","loralai",
    "pishin","killa abdullah","killa saifullah","harnai","duki","sherani","musa khel",
    "ziarat","sohbatpur","nasirabad","jaffarabad","lehri","layyah","lodhran","rajanpur",
    "toba tek singh","nankana sahib","mianwali","bhakkar","khushab","narowal","sialkot",
    "wazirabad","daska","sambrial","pasrur","zafarwal","shakargarh","hasan abdal",
    "bahawalnagar","chishtian","fortabbas","ahmadpur east","alipur","kot addu",
    "taunsa","liaqatpur","khanpur","sadiqabad","uch sharif","mailsi","arifwala",
    "depalpur","renala khurd","chichawatni","haroonabad","hasilpur","dunya pur",
    "kabirwala","tulamba","shorkot","pir mahal","jaranwala","tandlianwala","samundri",
    "dijkot","chak jhumra","summundri","chiniot","lalian","bhowana","rabwah",
    "sohawa","dina","lala musa","kharian","sarai alamgir","pind dadan khan","choa saidan shah"
];

const PK_PHONE_REGEX = /(?:\+?92|0)3\d{2}[\s\-]?\d{7}/;

interface ConvoFlags {
    cityDetected: string | null;
    phoneDetected: boolean;
    needsReply: boolean;
    hasSignals: boolean;
    priority: "high" | "medium" | "low" | "none";
}

function detectSignals(text: string): { city: string | null; phone: boolean } {
    if (!text) return { city: null, phone: false };
    const lower = text.toLowerCase();
    let city: string | null = null;
    for (const c of PK_CITIES) {
        const regex = new RegExp(`\\b${c.replace(/\s+/g, "\\s+")}\\b`, "i");
        if (regex.test(lower)) {
            city = c.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            break;
        }
    }
    const phone = PK_PHONE_REGEX.test(text);
    return { city, phone };
}

function analyzeConvo(convo: Conversation, allMessages?: Message[]): ConvoFlags {
    let city: string | null = null;
    let phone = false;
    if (allMessages && allMessages.length > 0) {
        for (const msg of allMessages) {
            if (msg.from === "agent") continue;
            const signals = detectSignals(msg.message || "");
            if (signals.city && !city) city = signals.city;
            if (signals.phone) phone = true;
            if (city && phone) break;
        }
    }
    if (!city && !phone) {
        const lastSignals = detectSignals(convo.last_message || "");
        city = lastSignals.city;
        phone = lastSignals.phone;
    }
    const needsReply = convo.last_message_from === "user";
    const hasSignals = !!(city || phone);
    let priority: ConvoFlags["priority"] = "none";
    if (hasSignals && needsReply) priority = "high";
    else if (needsReply) priority = "medium";
    else if (hasSignals) priority = "low";
    return { cityDetected: city, phoneDetected: phone, needsReply, hasSignals, priority };
}

function parseWhatsAppMessage(text: string): { name: string; address: string; city: string; phone: string; product: string } {
    const result = { name: "", address: "", city: "", phone: "", product: "" };
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
        if (nameLabels.includes(label)) result.name = value;
        else if (addressLabels.includes(label)) result.address = value;
        else if (cityLabels.includes(label)) result.city = value;
        else if (phoneLabels.includes(label)) result.phone = value;
        else if (productLabels.includes(label)) result.product = value;
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
            if (fullTitle === q || pTitle === q) score = 100;
            else if (fullTitle.includes(q) || pTitle.includes(q)) score = 80;
            else if (q.includes(pTitle) || q.includes(vTitle)) score = 70;
            else {
                const qWords = q.split(/\s+/);
                const titleWords = fullTitle.split(/\s+/);
                let matched = 0;
                for (const qw of qWords) {
                    if (titleWords.some(tw => tw.includes(qw) || qw.includes(tw))) matched++;
                }
                if (matched > 0) score = Math.round((matched / qWords.length) * 60);
            }
            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { product, variant, score };
            }
        }
    }
    return bestMatch && bestMatch.score >= 30 ? bestMatch : null;
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

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
            p.variants.some(v => v.title.toLowerCase().includes(q) || (v.sku || "").toLowerCase().includes(q))
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

interface OrderModalProps {
    convo: Conversation;
    detectedCity: string;
    brandId: string;
    onClose: () => void;
    chatMessages: Message[];
}

function OrderCreationModal({ convo, detectedCity, brandId, onClose, chatMessages }: OrderModalProps) {
    const [mode, setMode] = useState<"quick" | "manual">("manual");
    const [pasteText, setPasteText] = useState("");
    const [filledFromPaste, setFilledFromPaste] = useState(false);

    const [customerName, setCustomerName] = useState(convo.name || "");
    const [phone, setPhone] = useState(convo.phone_number ? formatPhoneForForm(convo.phone_number) : "");
    const [shippingAddress, setShippingAddress] = useState("");
    const [shippingCity, setShippingCity] = useState(detectedCity);
    const [notes, setNotes] = useState(`WhatsApp conversation with ${convo.name || convo.phone_number}`);
    const [deliveryFee, setDeliveryFee] = useState("190");
    const [freeDelivery, setFreeDelivery] = useState(false);
    const [manualDeliveryOverride, setManualDeliveryOverride] = useState(false);
    const [lineItems, setLineItems] = useState<LineItem[]>([]);

    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        setLoadingProducts(true);
        fetch("/api/shopify/products", { headers: { "brand-id": brandId } })
            .then(r => r.json())
            .then(data => { if (data.products) setProducts(data.products); })
            .catch(() => {})
            .finally(() => setLoadingProducts(false));
    }, [brandId]);

    useEffect(() => {
        if (chatMessages.length > 0) {
            const recentCustomerMsgs = chatMessages
                .filter(m => m.from !== "agent" && m.message)
                .slice(-5)
                .map(m => m.message);
            for (const msg of recentCustomerMsgs) {
                const hasLabels = /(?:name|address|city|phone)\s*[:\-–|]/i.test(msg);
                if (hasLabels) {
                    setPasteText(msg);
                    setMode("quick");
                    break;
                }
            }
        }
    }, [chatMessages]);

    const handleParse = () => {
        if (!pasteText.trim()) return;
        const data = parseWhatsAppMessage(pasteText);
        if (data.name) setCustomerName(data.name);
        if (data.phone) setPhone(data.phone);
        if (data.address) setShippingAddress(data.address);
        if (data.city) setShippingCity(data.city);
        if (data.product && products.length > 0) {
            const match = fuzzyMatchProduct(data.product, products);
            if (match) {
                const title = match.variant.title === "Default Title"
                    ? match.product.title
                    : `${match.product.title} - ${match.variant.title}`;
                setLineItems([{ id: generateId(), title, quantity: "1", price: match.variant.price, image: match.product.image, variantId: match.variant.id }]);
            } else {
                setLineItems([{ id: generateId(), title: data.product, quantity: "1", price: "", image: null, variantId: null }]);
            }
        }
        setFilledFromPaste(true);
    };

    const addProduct = (title: string, price: string, image: string | null, variantId: number | null) => {
        setLineItems(prev => [...prev, { id: generateId(), title, quantity: "1", price, image, variantId }]);
    };

    const removeLineItem = (id: string) => {
        setLineItems(prev => prev.filter(item => item.id !== id));
    };

    const updateLineItem = (id: string, field: "quantity" | "price" | "title", value: string) => {
        setLineItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const itemsTotal = lineItems.reduce((sum, item) => {
        const qty = parseInt(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        return sum + (qty * price);
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

    const handleSubmit = async () => {
        const validItems = lineItems.filter(item => item.title && item.quantity && item.price);
        if (validItems.length === 0) {
            setError("Add at least one item with title, quantity, and price");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/whatsapp/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json", "brand-id": brandId },
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
            if (!res.ok) throw new Error(data.error || "Failed to create order");
            setSuccess(true);
            setTimeout(() => onClose(), 1500);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const showForm = mode === "manual" || filledFromPaste;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl shadow-2xl max-w-3xl w-full my-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                            <ArrowLeft size={18} className="text-gray-500" />
                        </button>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Create Order</h2>
                            <p className="text-xs text-gray-500">Add a WhatsApp order to Shopify</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 rounded-xl p-1">
                            <button
                                type="button"
                                onClick={() => { setMode("quick"); setFilledFromPaste(false); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${mode === "quick" && !filledFromPaste ? "bg-white shadow-sm text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                <ClipboardPaste size={12} />
                                Quick Paste
                            </button>
                            <button
                                type="button"
                                onClick={() => { setMode("manual"); setFilledFromPaste(false); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${showForm ? "bg-white shadow-sm text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                <Edit3 size={12} />
                                Manual
                            </button>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-5 max-h-[calc(100vh-180px)] overflow-y-auto">
                    {success && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 flex items-center gap-2">
                            <CheckCircle size={16} className="shrink-0" />
                            Order created successfully! Closing...
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            {error}
                        </div>
                    )}

                    {mode === "quick" && !filledFromPaste && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <ClipboardPaste size={16} className="text-indigo-500" />
                                Paste WhatsApp Order
                            </h3>
                            <p className="text-xs text-gray-400 mb-3">Paste the order message below. Expected format:</p>
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
                                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
                                >
                                    <Search size={14} />
                                    Parse Order
                                </button>
                            </div>
                        </div>
                    )}

                    {showForm && (
                        <>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
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
                                                placeholder="03XX-XXXXXXX"
                                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
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
                                            placeholder="e.g. Lahore"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
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
                                        {lineItems.map(item => {
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
                                                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={e => updateLineItem(item.id, "quantity", e.target.value)}
                                                            min="1"
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
                                                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 flex items-center justify-end gap-1">
                                                        <span className="text-sm font-medium text-gray-700">
                                                            {subtotal > 0 ? subtotal.toLocaleString() : "-"}
                                                        </span>
                                                        <button type="button" onClick={() => removeLineItem(item.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {lineItems.length === 0 && (
                                    <div className="text-center py-6 text-gray-400 text-sm">
                                        Select products from the dropdown above
                                    </div>
                                )}

                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-medium text-gray-700">Delivery Fee (Rs.)</label>
                                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={freeDelivery}
                                                    onChange={e => {
                                                        setManualDeliveryOverride(true);
                                                        setFreeDelivery(e.target.checked);
                                                        if (e.target.checked) setDeliveryFee("0");
                                                        else setDeliveryFee("190");
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-xs font-medium text-green-600">Free Delivery</span>
                                            </label>
                                        </div>
                                        <input
                                            type="number"
                                            value={freeDelivery ? "0" : deliveryFee}
                                            onChange={e => {
                                                setManualDeliveryOverride(true);
                                                setDeliveryFee(e.target.value);
                                                setFreeDelivery(false);
                                            }}
                                            min="0"
                                            step="1"
                                            disabled={freeDelivery}
                                            className={`w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 ${freeDelivery ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-gray-50"}`}
                                        />
                                    </div>
                                    {itemsTotal >= 2200 && !manualDeliveryOverride && (
                                        <p className="text-xs text-green-600">Free delivery applied (order over Rs. 2,200)</p>
                                    )}
                                    {itemsTotal < 2200 && (
                                        <p className="text-xs text-gray-400">Free delivery on orders over Rs. 2,200</p>
                                    )}
                                    <div className="flex items-center justify-between text-sm text-gray-500">
                                        <span>Items Subtotal</span>
                                        <span>Rs. {itemsTotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm text-gray-500">
                                        <span>Delivery</span>
                                        <span className={freeDelivery ? "text-green-600 font-medium" : ""}>
                                            {freeDelivery ? "FREE" : `Rs. ${deliveryFeeNum.toLocaleString()}`}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                        <p className="text-xs text-gray-500 uppercase tracking-wider">Total Amount</p>
                                        <p className="text-2xl font-bold text-gray-900">Rs. {totalAmount.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <FileText size={16} className="text-indigo-500" />
                                    Notes (Optional)
                                </h3>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Any special instructions or order notes..."
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                                />
                            </div>
                        </>
                    )}
                </div>

                {showForm && (
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-white rounded-b-2xl">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || success || lineItems.length === 0}
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm shadow-sm"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Creating Order...
                                </>
                            ) : (
                                <>
                                    <ShoppingBag size={16} />
                                    Create Order in Shopify
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function formatPhoneForForm(phone: string): string {
    if (!phone) return "";
    if (phone.startsWith("92") && phone.length >= 12) {
        return `0${phone.slice(2)}`;
    }
    return phone;
}

export default function WhatsAppPage() {
    const { selectedBrand } = useBrand();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "attention" | "unreplied">("all");

    const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const [orderModalConvo, setOrderModalConvo] = useState<Conversation | null>(null);
    const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
    const scanAbortRef = useRef<AbortController | null>(null);

    const [showStats, setShowStats] = useState(false);
    const [analyticsData, setAnalyticsData] = useState<{
        totals: { totalConversations: number; totalConverted: number; conversionRate: number; totalRevenue: number };
        dailyStats: { date: string; total: number; converted: number; conversionRate: number; revenue: number }[];
        orderMap: Record<string, { orderName: string; orderNumber: string }>;
    } | null>(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [analyticsMonth, setAnalyticsMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    });

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

    const fetchAnalytics = useCallback(async (month?: string) => {
        if (!selectedBrand) return;
        setAnalyticsLoading(true);
        try {
            const m = month || analyticsMonth;
            const [year, mo] = m.split("-").map(Number);
            const startDate = `${year}-${String(mo).padStart(2, "0")}-01`;
            const lastDay = new Date(year, mo, 0).getDate();
            const endDate = `${year}-${String(mo).padStart(2, "0")}-${lastDay}`;
            const res = await fetch(`/api/whatsapp/analytics?startDate=${startDate}&endDate=${endDate}`, {
                headers: { "brand-id": selectedBrand.id },
            });
            if (res.ok) {
                const data = await res.json();
                setAnalyticsData(data);
            }
        } catch {}
        finally { setAnalyticsLoading(false); }
    }, [selectedBrand, analyticsMonth]);

    useEffect(() => {
        checkStatus();
        fetchConversations();
    }, [checkStatus, fetchConversations]);

    useEffect(() => {
        if (selectedBrand && configured) {
            fetchAnalytics();
        }
    }, [selectedBrand, configured, analyticsMonth]);

    const [deepScanResults, setDeepScanResults] = useState<Map<string, ConvoFlags>>(new Map());

    const convoAnalysis = useMemo(() => {
        const map = new Map<string, ConvoFlags>();
        conversations.forEach(c => {
            const deep = deepScanResults.get(c.convo_id);
            map.set(c.convo_id, deep || analyzeConvo(c));
        });
        return map;
    }, [conversations, deepScanResults]);

    useEffect(() => {
        if (selectedConvo && messages.length > 0) {
            const deepFlags = analyzeConvo(selectedConvo, messages);
            setDeepScanResults(prev => {
                const existing = prev.get(selectedConvo.convo_id);
                if (!existing || deepFlags.cityDetected !== existing.cityDetected || deepFlags.phoneDetected !== existing.phoneDetected || deepFlags.priority !== existing.priority) {
                    const next = new Map(prev);
                    next.set(selectedConvo.convo_id, deepFlags);
                    return next;
                }
                return prev;
            });
        }
    }, [selectedConvo, messages]);

    useEffect(() => {
        if (!selectedBrand || conversations.length === 0) return;
        if (scanAbortRef.current) scanAbortRef.current.abort();
        const controller = new AbortController();
        scanAbortRef.current = controller;
        let cancelled = false;

        const sorted = [...conversations].sort((a, b) => {
            const aUnreplied = a.last_message_from === "user" ? 0 : 1;
            const bUnreplied = b.last_message_from === "user" ? 0 : 1;
            return aUnreplied - bUnreplied;
        });

        const brandId = selectedBrand.id;
        let done = 0;
        setScanProgress({ done: 0, total: sorted.length });

        (async () => {
            for (const convo of sorted) {
                if (cancelled) break;
                const alreadyScanned = deepScanResults.get(convo.convo_id);
                if (alreadyScanned) {
                    done++;
                    if (!cancelled) setScanProgress({ done, total: sorted.length });
                    continue;
                }
                try {
                    const res = await fetch(`/api/whatsapp/chat?convo_id=${convo.convo_id}&limit=50`, {
                        headers: { "brand-id": brandId },
                        signal: controller.signal,
                    });
                    if (cancelled) break;
                    const data = await res.json();
                    const msgs: Message[] = data.messages || [];
                    if (msgs.length > 0 && !cancelled) {
                        const flags = analyzeConvo(convo, msgs);
                        setDeepScanResults(prev => {
                            const next = new Map(prev);
                            next.set(convo.convo_id, flags);
                            return next;
                        });
                    }
                } catch {
                    if (cancelled) break;
                }
                done++;
                if (!cancelled) setScanProgress({ done, total: sorted.length });
                if (!cancelled) {
                    await new Promise(r => setTimeout(r, 200));
                }
            }
            if (!cancelled) {
                setScanProgress(null);
            }
        })();

        return () => {
            cancelled = true;
            controller.abort();
            setScanProgress(null);
        };
    }, [selectedBrand, conversations]);

    const attentionCount = useMemo(() => {
        let count = 0;
        convoAnalysis.forEach(flags => { if (flags.priority === "high" || flags.priority === "medium") count++; });
        return count;
    }, [convoAnalysis]);

    const selectConversation = (convo: Conversation) => {
        setSelectedConvo(convo);
        fetchMessages(convo.convo_id);
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

    const filteredConversations = useMemo(() => {
        return conversations.filter(c => {
            if (filter === "attention") {
                const flags = convoAnalysis.get(c.convo_id);
                if (!flags || (flags.priority !== "high" && flags.priority !== "medium")) return false;
            } else if (filter === "unreplied") {
                if (c.last_message_from !== "user") return false;
            }
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (
                (c.name && c.name.toLowerCase().includes(q)) ||
                (c.phone_number && c.phone_number.includes(q)) ||
                (c.last_message && c.last_message.toLowerCase().includes(q))
            );
        });
    }, [conversations, convoAnalysis, filter, searchQuery]);

    const selectedFlags = selectedConvo ? convoAnalysis.get(selectedConvo.convo_id) : null;

    const messageSignals = useMemo(() => {
        const results: Map<string, { city: string | null; phone: boolean }> = new Map();
        messages.forEach(msg => {
            if (msg.from !== "agent" && msg.message) {
                const signals = detectSignals(msg.message);
                if (signals.city || signals.phone) {
                    results.set(msg.id, signals);
                }
            }
        });
        return results;
    }, [messages]);

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

    const getConvoBorderClass = (flags: ConvoFlags | undefined, isSelected: boolean) => {
        if (isSelected) return "bg-green-50 border-l-4 border-l-green-500";
        if (!flags) return "";
        if (flags.priority === "high") return "bg-red-50/40 border-l-4 border-l-red-500";
        if (flags.priority === "medium") return "bg-amber-50/40 border-l-4 border-l-amber-400";
        if (flags.priority === "low") return "border-l-4 border-l-blue-300";
        return "";
    };

    const getAvatarClass = (flags: ConvoFlags | undefined) => {
        if (!flags) return "bg-gray-100";
        if (flags.priority === "high") return "bg-red-100";
        if (flags.priority === "medium") return "bg-amber-100";
        return "bg-gray-100";
    };

    const getAvatarIconClass = (flags: ConvoFlags | undefined) => {
        if (!flags) return "text-gray-400";
        if (flags.priority === "high") return "text-red-500";
        if (flags.priority === "medium") return "text-amber-500";
        return "text-gray-400";
    };

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
                        {attentionCount > 0 && (
                            <button
                                onClick={() => setFilter(filter === "attention" ? "all" : "attention")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                    filter === "attention"
                                        ? "bg-red-600 text-white"
                                        : "bg-red-50 text-red-700 hover:bg-red-100"
                                }`}
                            >
                                <Bell className="w-3 h-3" />
                                {attentionCount} Need Attention
                            </button>
                        )}
                        <button
                            onClick={() => setShowStats(!showStats)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                showStats ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                            }`}
                        >
                            <BarChart3 className="w-3 h-3" />
                            Stats
                        </button>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                            <Wifi className="w-3 h-3" />
                            WeTarSeel
                        </div>
                        <button
                            onClick={() => { fetchConversations(); fetchAnalytics(); if (selectedConvo) fetchMessages(selectedConvo.convo_id); }}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                {showStats && (
                    <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 shrink-0">
                        <div className="flex items-center gap-3 mb-3">
                            <input
                                type="month"
                                value={analyticsMonth}
                                onChange={e => setAnalyticsMonth(e.target.value)}
                                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            {analyticsLoading && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                        </div>
                        {analyticsData ? (
                            <>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                                    <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Messages Received</p>
                                        <p className="text-2xl font-bold text-gray-900">{analyticsData.totals.totalConversations}</p>
                                    </div>
                                    <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Orders Converted</p>
                                        <p className="text-2xl font-bold text-emerald-600">{analyticsData.totals.totalConverted}</p>
                                    </div>
                                    <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Closing Ratio</p>
                                        <p className="text-2xl font-bold text-indigo-600">{analyticsData.totals.conversionRate}%</p>
                                    </div>
                                    <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Revenue</p>
                                        <p className="text-2xl font-bold text-gray-900">Rs. {Math.round(analyticsData.totals.totalRevenue).toLocaleString()}</p>
                                    </div>
                                </div>
                                {analyticsData.dailyStats.length > 0 && (
                                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden max-h-[200px] overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    <th className="text-left px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Date</th>
                                                    <th className="text-center px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Messages</th>
                                                    <th className="text-center px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Converted</th>
                                                    <th className="text-center px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Rate</th>
                                                    <th className="text-right px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Revenue</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {analyticsData.dailyStats.map(day => (
                                                    <tr key={day.date} className="border-t border-gray-50 hover:bg-gray-50/50">
                                                        <td className="px-3 py-2 text-gray-700 font-medium">
                                                            {new Date(day.date + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", weekday: "short" })}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs font-bold">{day.total}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${day.converted > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>{day.converted}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`text-xs font-bold ${day.conversionRate >= 50 ? "text-emerald-600" : day.conversionRate >= 25 ? "text-amber-600" : "text-gray-500"}`}>
                                                                {day.conversionRate}%
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-xs text-gray-600 font-mono">
                                                            {day.revenue > 0 ? `Rs. ${Math.round(day.revenue).toLocaleString()}` : "-"}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-4 text-gray-400 text-sm">
                                {analyticsLoading ? "Loading analytics..." : "No data available"}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-1 overflow-hidden">
                    <div className={`w-full lg:w-[380px] border-r border-gray-200 bg-white flex flex-col ${selectedConvo ? "hidden lg:flex" : "flex"}`}>
                        <div className="p-3 border-b border-gray-100 space-y-2">
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
                            <div className="flex gap-1.5">
                                <button
                                    onClick={() => setFilter("all")}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                        filter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => setFilter("unreplied")}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                        filter === "unreplied" ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    Unreplied
                                </button>
                                <button
                                    onClick={() => setFilter("attention")}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                                        filter === "attention" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    <AlertCircle className="w-3 h-3" />
                                    Needs Attention
                                    {attentionCount > 0 && (
                                        <span className={`ml-0.5 text-[10px] font-bold ${filter === "attention" ? "text-white" : "text-red-600"}`}>
                                            {attentionCount}
                                        </span>
                                    )}
                                </button>
                            </div>
                            {scanProgress && (
                                <div className="flex items-center gap-2 mt-1.5 px-1">
                                    <Loader2 className="w-3 h-3 text-indigo-500 animate-spin shrink-0" />
                                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                                            style={{ width: `${Math.round((scanProgress.done / scanProgress.total) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-gray-400 shrink-0">
                                        Scanning {scanProgress.done}/{scanProgress.total}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
                                </div>
                            ) : filteredConversations.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                                    <p className="text-sm font-medium">
                                        {filter !== "all" ? "No conversations match this filter" : "No conversations found"}
                                    </p>
                                </div>
                            ) : (
                                filteredConversations.map(convo => {
                                    const flags = convoAnalysis.get(convo.convo_id);
                                    const isSelected = selectedConvo?.convo_id === convo.convo_id;
                                    return (
                                        <button
                                            key={convo.convo_id}
                                            onClick={() => selectConversation(convo)}
                                            className={`w-full px-4 py-3.5 text-left border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${getConvoBorderClass(flags, isSelected)}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${getAvatarClass(flags)}`}>
                                                    <User className={`w-5 h-5 ${getAvatarIconClass(flags)}`} />
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
                                                    {(flags && (flags.hasSignals || flags.needsReply)) || analyticsData?.orderMap[convo.convo_id] ? (
                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                            {analyticsData?.orderMap[convo.convo_id] && (
                                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                                                                    <ShoppingCart className="w-2.5 h-2.5" />
                                                                    {analyticsData.orderMap[convo.convo_id].orderName}
                                                                </span>
                                                            )}
                                                            {flags?.cityDetected && (
                                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-700">
                                                                    <MapPin className="w-2.5 h-2.5" />
                                                                    {flags.cityDetected}
                                                                </span>
                                                            )}
                                                            {flags?.phoneDetected && (
                                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-purple-100 text-purple-700">
                                                                    <Phone className="w-2.5 h-2.5" />
                                                                    Phone
                                                                </span>
                                                            )}
                                                            {flags?.needsReply && (
                                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-100 text-amber-700">
                                                                    <Bell className="w-2.5 h-2.5" />
                                                                    No Reply
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {convo.unread_count > 0 && (
                                                    <span className="bg-green-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                                                        {convo.unread_count}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
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
                                <div className="px-5 py-3.5 bg-white border-b border-gray-200 shrink-0">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => { setSelectedConvo(null); setMessages([]); }}
                                                className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                                            >
                                                <ArrowLeft className="w-4 h-4 text-gray-600" />
                                            </button>
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                                                selectedFlags?.priority === "high" ? "bg-red-100" : "bg-green-100"
                                            }`}>
                                                <User className={`w-5 h-5 ${
                                                    selectedFlags?.priority === "high" ? "text-red-600" : "text-green-600"
                                                }`} />
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
                                            onClick={() => setOrderModalConvo(selectedConvo)}
                                            className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1.5"
                                        >
                                            <ShoppingBag className="w-3.5 h-3.5" />
                                            Create Order
                                        </button>
                                    </div>
                                    {selectedFlags && (selectedFlags.hasSignals || selectedFlags.needsReply) && (
                                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                                            {selectedFlags.needsReply && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                                    <Bell className="w-3 h-3" />
                                                    Customer waiting for reply
                                                </span>
                                            )}
                                            {selectedFlags.cityDetected && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                                    <MapPin className="w-3 h-3" />
                                                    City: {selectedFlags.cityDetected}
                                                </span>
                                            )}
                                            {selectedFlags.phoneDetected && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                                                    <Phone className="w-3 h-3" />
                                                    Phone number detected
                                                </span>
                                            )}
                                        </div>
                                    )}
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
                                        [...messages].reverse().map(msg => {
                                            const msgSignals = messageSignals.get(msg.id);
                                            return (
                                                <div key={msg.id}>
                                                    <div className={`flex ${msg.from === "agent" ? "justify-end" : "justify-start"}`}>
                                                        <div
                                                            className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                                                                msg.from === "agent"
                                                                    ? "bg-green-600 text-white rounded-br-md"
                                                                    : msgSignals
                                                                        ? "bg-white text-gray-800 border-2 border-blue-300 rounded-bl-md shadow-sm"
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
                                                    {msgSignals && (
                                                        <div className={`flex ${msg.from === "agent" ? "justify-end" : "justify-start"} mt-1`}>
                                                            <div className="flex gap-1">
                                                                {msgSignals.city && (
                                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600">
                                                                        <MapPin className="w-2.5 h-2.5" />
                                                                        {msgSignals.city}
                                                                    </span>
                                                                )}
                                                                {msgSignals.phone && (
                                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-600">
                                                                        <Phone className="w-2.5 h-2.5" />
                                                                        Phone
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {orderModalConvo && selectedBrand && (
                <OrderCreationModal
                    convo={orderModalConvo}
                    detectedCity={convoAnalysis.get(orderModalConvo.convo_id)?.cityDetected || ""}
                    brandId={selectedBrand.id}
                    onClose={() => setOrderModalConvo(null)}
                    chatMessages={messages}
                />
            )}
        </DashboardLayout>
    );
}
