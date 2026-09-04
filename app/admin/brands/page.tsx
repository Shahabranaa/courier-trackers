"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/components/providers/AuthContext";
import { useRouter } from "next/navigation";
import {
    Building2, Loader2, Mail, Calendar, CheckCircle, Clock, Lock,
    Sparkles, Truck, Package, Zap, ShoppingBag, ToggleLeft, ToggleRight,
    ChevronDown, ChevronUp, StickyNote, User, Shield
} from "lucide-react";
import { getPackageById, PACKAGES } from "@/lib/packages";

interface AdminBrand {
    id: string;
    name: string;
    isActive: boolean;
    adminNotes: string;
    postexEnabled: boolean;
    tranzoEnabled: boolean;
    zoomEnabled: boolean;
    shopifyEnabled: boolean;
    apiToken: string;
    tranzoApiToken: string;
    postexMerchantId: string;
    postexMerchantToken: string;
    tranzoMerchantToken: string;
    shopifyStore: string;
    shopifyAccessToken: string;
    selectedPackage: string | null;
    packageRequestedAt: string | null;
    activatedAt: string | null;
    createdAt: string;
    user: { id: string; email: string; name: string } | null;
}

type CourierKey = "postexEnabled" | "tranzoEnabled" | "zoomEnabled" | "shopifyEnabled";

const COURIERS: { key: CourierKey; label: string; icon: any; color: string; credCheck: (b: AdminBrand) => boolean }[] = [
    { key: "postexEnabled", label: "PostEx", icon: Truck, color: "indigo", credCheck: (b) => !!(b.postexMerchantId && b.postexMerchantToken) },
    { key: "tranzoEnabled", label: "Tranzo", icon: Package, color: "violet", credCheck: (b) => !!(b.tranzoApiToken || b.tranzoMerchantToken) },
    { key: "zoomEnabled", label: "Zoom", icon: Zap, color: "amber", credCheck: (b) => !!b.apiToken },
    { key: "shopifyEnabled", label: "Shopify", icon: ShoppingBag, color: "emerald", credCheck: (b) => !!(b.shopifyStore && b.shopifyAccessToken) },
];

const colorMap: Record<string, { on: string; off: string }> = {
    indigo: { on: "bg-indigo-100 text-indigo-700 border-indigo-200", off: "bg-gray-100 text-gray-400 border-gray-200" },
    violet: { on: "bg-violet-100 text-violet-700 border-violet-200", off: "bg-gray-100 text-gray-400 border-gray-200" },
    amber: { on: "bg-amber-100 text-amber-700 border-amber-200", off: "bg-gray-100 text-gray-400 border-gray-200" },
    emerald: { on: "bg-emerald-100 text-emerald-700 border-emerald-200", off: "bg-gray-100 text-gray-400 border-gray-200" },
};

type ExpandPanel = "couriers" | "notes" | "package" | null;

export default function AdminBrandsPage() {
    const { user: authUser } = useAuth();
    const router = useRouter();

    const [brands, setBrands] = useState<AdminBrand[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedPanel, setExpandedPanel] = useState<ExpandPanel>(null);
    const [filter, setFilter] = useState<"all" | "pending" | "active" | "inactive">("all");
    const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
    const [savingNote, setSavingNote] = useState(false);
    const [packageDraft, setPackageDraft] = useState<Record<string, string>>({});
    const [savingPackage, setSavingPackage] = useState(false);

    useEffect(() => {
        if (authUser && authUser.role !== "ADMIN") router.push("/");
    }, [authUser, router]);

    const load = async () => {
        try {
            const res = await fetch("/api/admin/brands");
            if (res.ok) setBrands(await res.json());
        } catch {}
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const patch = async (brandId: string, data: Record<string, any>) => {
        setUpdatingId(brandId);
        try {
            const res = await fetch("/api/admin/brands", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ brandId, ...data }),
            });
            if (res.ok) {
                const updated = await res.json();
                setBrands(prev => prev.map(b => b.id === brandId ? { ...b, ...updated } : b));
            }
        } catch {}
        setUpdatingId(null);
    };

    const openPanel = (brandId: string, panel: ExpandPanel, brand?: AdminBrand) => {
        if (expandedId === brandId && expandedPanel === panel) {
            setExpandedId(null);
            setExpandedPanel(null);
            return;
        }
        setExpandedId(brandId);
        setExpandedPanel(panel);
        if (panel === "notes" && brand) {
            setNoteDrafts(prev => ({ ...prev, [brandId]: brand.adminNotes || "" }));
        }
        if (panel === "package" && brand) {
            setPackageDraft(prev => ({ ...prev, [brandId]: brand.selectedPackage || "" }));
        }
    };

    const saveNote = async (brandId: string) => {
        setSavingNote(true);
        await patch(brandId, { adminNotes: noteDrafts[brandId] ?? "" });
        setSavingNote(false);
        setExpandedId(null);
        setExpandedPanel(null);
    };

    const savePackage = async (brandId: string) => {
        setSavingPackage(true);
        await patch(brandId, { selectedPackage: packageDraft[brandId] || "" });
        setSavingPackage(false);
        setExpandedId(null);
        setExpandedPanel(null);
    };

    if (authUser?.role !== "ADMIN") return null;

    const filtered = brands.filter((b) => {
        if (filter === "active") return b.isActive;
        if (filter === "inactive") return !b.isActive;
        if (filter === "pending") return !b.isActive && b.selectedPackage;
        return true;
    });

    const pendingCount = brands.filter((b) => !b.isActive && b.selectedPackage).length;
    const activeCount = brands.filter((b) => b.isActive).length;
    const inactiveCount = brands.filter((b) => !b.isActive).length;

    return (
        <DashboardLayout>
            <div className="p-6 lg:p-10 max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Brand Management</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Activate brands, control courier access, manage packages and admin notes.
                    </p>
                </div>

                {/* Filter tabs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {[
                        { key: "all", label: "All brands", count: brands.length, icon: Building2, color: "text-gray-700" },
                        { key: "pending", label: "Pending payment", count: pendingCount, icon: Clock, color: "text-amber-700" },
                        { key: "active", label: "Active", count: activeCount, icon: CheckCircle, color: "text-emerald-700" },
                        { key: "inactive", label: "Inactive", count: inactiveCount, icon: Lock, color: "text-gray-500" },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key as any)}
                            className={`text-left bg-white border rounded-2xl p-4 transition-all ${filter === tab.key ? "border-indigo-300 ring-2 ring-indigo-100 shadow-sm" : "border-gray-100 hover:border-gray-200"}`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <tab.icon size={16} className={tab.color} />
                                <span className="text-2xl font-bold text-gray-900">{tab.count}</span>
                            </div>
                            <span className={`text-xs font-medium ${tab.color}`}>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="animate-spin text-gray-400" size={32} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                        <Building2 className="mx-auto text-gray-300 mb-4" size={48} />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No brands match this filter</h3>
                        <p className="text-sm text-gray-500">Try a different filter above.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((b) => {
                            const pkg = getPackageById(b.selectedPackage);
                            const isUpdating = updatingId === b.id;
                            const isExpanded = expandedId === b.id;
                            const panel = isExpanded ? expandedPanel : null;

                            return (
                                <div key={b.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                    {/* Main row */}
                                    <div className="flex items-center gap-4 px-5 py-4 flex-wrap">
                                        {/* Brand info */}
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center shrink-0">
                                                <Building2 size={16} className="text-indigo-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-900 truncate">{b.name}</p>
                                                {b.user ? (
                                                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                        <User size={10} />
                                                        <span className="font-medium">{b.user.name}</span>
                                                        <span className="text-gray-400">·</span>
                                                        <Mail size={10} /> {b.user.email}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-gray-400 mt-0.5">Unassigned</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Package */}
                                        <div className="shrink-0">
                                            {pkg ? (
                                                <div className="flex items-center gap-1.5">
                                                    {pkg.popular && <Sparkles size={12} className="text-indigo-500" />}
                                                    <div>
                                                        <p className="text-xs font-semibold text-gray-900">{pkg.name}</p>
                                                        <p className="text-xs text-gray-400">{pkg.priceLabel}/mo</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400">No plan</span>
                                            )}
                                        </div>

                                        {/* Status badge */}
                                        <div className="shrink-0">
                                            {b.isActive ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                                                    <CheckCircle size={11} /> Active
                                                </span>
                                            ) : b.selectedPackage ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
                                                    <Clock size={11} /> Pending
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">
                                                    <Lock size={11} /> Inactive
                                                </span>
                                            )}
                                        </div>

                                        {/* Dates */}
                                        <div className="hidden lg:flex items-center gap-4 text-xs text-gray-400 shrink-0">
                                            {b.packageRequestedAt && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={11} />
                                                    Requested {new Date(b.packageRequestedAt).toLocaleDateString("en-PK", { dateStyle: "medium" })}
                                                </span>
                                            )}
                                            {b.activatedAt && (
                                                <span className="flex items-center gap-1">
                                                    <CheckCircle size={11} className="text-emerald-400" />
                                                    Activated {new Date(b.activatedAt).toLocaleDateString("en-PK", { dateStyle: "medium" })}
                                                </span>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 shrink-0 ml-auto flex-wrap">
                                            <button
                                                onClick={() => patch(b.id, { isActive: !b.isActive })}
                                                disabled={isUpdating}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${b.isActive ? "text-gray-700 bg-gray-100 hover:bg-red-50 hover:text-red-600" : "text-white bg-emerald-600 hover:bg-emerald-700"}`}
                                            >
                                                {isUpdating ? <Loader2 size={12} className="animate-spin" /> : b.isActive ? <><ToggleRight size={14} /> Deactivate</> : <><ToggleLeft size={14} /> Activate</>}
                                            </button>
                                            <button
                                                onClick={() => openPanel(b.id, "couriers", b)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${panel === "couriers" ? "bg-indigo-600 text-white" : "text-indigo-700 bg-indigo-50 hover:bg-indigo-100"}`}
                                            >
                                                <Truck size={13} /> Couriers
                                                {panel === "couriers" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                            </button>
                                            <button
                                                onClick={() => openPanel(b.id, "package", b)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${panel === "package" ? "bg-violet-600 text-white" : "text-violet-700 bg-violet-50 hover:bg-violet-100"}`}
                                            >
                                                <Shield size={13} /> Plan
                                                {panel === "package" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                            </button>
                                            <button
                                                onClick={() => openPanel(b.id, "notes", b)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${panel === "notes" ? "bg-amber-500 text-white" : b.adminNotes ? "text-amber-700 bg-amber-50 hover:bg-amber-100" : "text-gray-600 bg-gray-100 hover:bg-gray-200"}`}
                                            >
                                                <StickyNote size={13} /> Notes
                                                {panel === "notes" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Courier Panel */}
                                    {isExpanded && panel === "couriers" && (
                                        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Courier Access & Credentials</p>
                                            <div className="flex flex-wrap gap-3">
                                                {COURIERS.map(({ key, label, icon: Icon, color, credCheck }) => {
                                                    const enabled = b[key];
                                                    const hasCreds = credCheck(b);
                                                    const c = colorMap[color];
                                                    return (
                                                        <button
                                                            key={key}
                                                            onClick={() => patch(b.id, { [key]: !enabled })}
                                                            disabled={isUpdating}
                                                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all disabled:opacity-50 ${enabled ? c.on : c.off}`}
                                                        >
                                                            <Icon size={15} />
                                                            {label}
                                                            <span className={`w-2 h-2 rounded-full shrink-0 ${hasCreds ? "bg-emerald-500" : "bg-gray-300"}`} title={hasCreds ? "Credentials configured" : "No credentials set"} />
                                                            {isUpdating ? (
                                                                <Loader2 size={13} className="animate-spin ml-1" />
                                                            ) : enabled ? (
                                                                <span className="ml-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">ON</span>
                                                            ) : (
                                                                <span className="ml-0.5 text-[10px] font-bold uppercase tracking-wide opacity-60">OFF</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
                                                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Credentials configured</span>
                                                <span className="mx-1">·</span>
                                                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> No credentials</span>
                                                <span className="mx-1">·</span>
                                                Disabled couriers are blocked from syncing data.
                                            </p>
                                        </div>
                                    )}

                                    {/* Package Panel */}
                                    {isExpanded && panel === "package" && (
                                        <div className="border-t border-gray-100 bg-violet-50/40 px-5 py-4">
                                            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                                <Shield size={12} /> Subscription Plan
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                                <button
                                                    onClick={() => setPackageDraft(prev => ({ ...prev, [b.id]: "" }))}
                                                    className={`p-3 rounded-xl border-2 text-left transition-all ${(packageDraft[b.id] ?? b.selectedPackage ?? "") === "" ? "border-gray-400 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}
                                                >
                                                    <p className="text-xs font-bold text-gray-700">No Plan</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">Remove package</p>
                                                </button>
                                                {PACKAGES.map((p) => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => setPackageDraft(prev => ({ ...prev, [b.id]: p.id }))}
                                                        className={`p-3 rounded-xl border-2 text-left transition-all relative ${(packageDraft[b.id] ?? b.selectedPackage ?? "") === p.id ? "border-violet-500 bg-violet-50" : "border-gray-200 hover:border-violet-200"}`}
                                                    >
                                                        {p.popular && <span className="absolute top-2 right-2 text-[9px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full uppercase">Popular</span>}
                                                        <p className="text-xs font-bold text-gray-900">{p.name}</p>
                                                        <p className="text-xs text-violet-600 font-semibold">{p.priceLabel}/mo</p>
                                                        <p className="text-xs text-gray-400 mt-0.5">{p.tagline}</p>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => savePackage(b.id)}
                                                    disabled={savingPackage}
                                                    className="px-4 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                                                >
                                                    {savingPackage ? "Saving..." : "Save Plan"}
                                                </button>
                                                <button
                                                    onClick={() => { setExpandedId(null); setExpandedPanel(null); }}
                                                    className="px-4 py-1.5 text-gray-600 bg-white border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Notes Panel */}
                                    {isExpanded && panel === "notes" && (
                                        <div className="border-t border-gray-100 bg-amber-50/40 px-5 py-4">
                                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <StickyNote size={12} /> Admin Notes
                                            </p>
                                            <textarea
                                                value={noteDrafts[b.id] ?? ""}
                                                onChange={(e) => setNoteDrafts(prev => ({ ...prev, [b.id]: e.target.value }))}
                                                rows={3}
                                                placeholder="Add private notes about this brand (only visible to admins)..."
                                                className="w-full px-3 py-2 rounded-xl border border-amber-200 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none text-sm text-gray-800 bg-white resize-none"
                                            />
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    onClick={() => saveNote(b.id)}
                                                    disabled={savingNote}
                                                    className="px-4 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                                                >
                                                    {savingNote ? "Saving..." : "Save Note"}
                                                </button>
                                                <button
                                                    onClick={() => { setExpandedId(null); setExpandedPanel(null); }}
                                                    className="px-4 py-1.5 text-gray-600 bg-white border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
