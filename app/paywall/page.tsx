"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthContext";
import { PACKAGES, getPackageById } from "@/lib/packages";
import {
    CheckCircle, Loader2, Sparkles, ArrowRight, Building2, Clock,
    AlertCircle, LogOut, ShieldAlert, Lock
} from "lucide-react";

interface BrandRow {
    id: string;
    name: string;
    isActive: boolean;
    selectedPackage: string | null;
    packageRequestedAt: string | null;
    activatedAt: string | null;
}

export default function PaywallPage() {
    const { user, loading: authLoading, logout } = useAuth();
    const router = useRouter();

    const [brands, setBrands] = useState<BrandRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingFor, setSubmittingFor] = useState<string | null>(null);
    const [selectedFor, setSelectedFor] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/login");
        }
    }, [authLoading, user, router]);

    const loadBrands = async () => {
        try {
            const res = await fetch("/api/brands");
            if (!res.ok) {
                setLoading(false);
                return;
            }
            const data = await res.json();
            setBrands(data);
            const init: Record<string, string> = {};
            for (const b of data) {
                if (b.selectedPackage) init[b.id] = b.selectedPackage;
            }
            setSelectedFor(init);
        } catch {
            setError("Could not load your brands. Please refresh.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) loadBrands();
    }, [user]);

    const handleSubmit = async (brandId: string) => {
        const packageId = selectedFor[brandId];
        if (!packageId) {
            setError("Please pick a package for this brand first.");
            return;
        }
        setError(null);
        setSubmittingFor(brandId);
        try {
            const res = await fetch("/api/paywall/select", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ brandId, packageId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to submit selection");
            await loadBrands();
        } catch (e: any) {
            setError(e.message || "Failed to submit selection");
        } finally {
            setSubmittingFor(null);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
        );
    }

    if (!user) return null;

    const activeBrands = brands.filter((b) => b.isActive);
    const inactiveBrands = brands.filter((b) => !b.isActive);
    const hasNoBrands = brands.length === 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-indigo-50/30 to-violet-50/40">
            <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link href="/landing" className="flex items-center gap-2.5">
                        <div className="h-9 w-9 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shrink-0">
                            H
                        </div>
                        <span className="font-bold text-lg text-gray-900 tracking-tight">
                            Hub<span className="text-indigo-600">Logistic</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 hidden sm:inline">{user.email}</span>
                        {activeBrands.length > 0 && (
                            <Link
                                href="/"
                                className="text-sm font-medium text-indigo-700 hover:text-indigo-800 px-3 py-1.5"
                            >
                                Go to dashboard
                            </Link>
                        )}
                        <button
                            onClick={logout}
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <LogOut size={14} /> Sign out
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-10">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-1.5 rounded-full text-xs font-semibold mb-4">
                        <Lock size={14} />
                        Activation required
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
                        Pick a package to activate your brand
                    </h1>
                    <p className="mt-3 text-gray-600 max-w-xl mx-auto">
                        Choose a plan for each of your brands below. Once you make payment, our team will manually
                        activate the brand and you&apos;ll get full dashboard access.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700 flex items-start gap-2">
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                        {error}
                    </div>
                )}

                {hasNoBrands && (
                    <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm mb-10">
                        <ShieldAlert className="mx-auto text-amber-500 mb-3" size={32} />
                        <h2 className="text-lg font-semibold text-gray-900">No brands assigned yet</h2>
                        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                            Your account doesn&apos;t have any brands yet. Please contact your administrator to get a brand
                            created for you.
                        </p>
                    </div>
                )}

                {inactiveBrands.length > 0 && (
                    <div className="space-y-8 mb-12">
                        {inactiveBrands.map((brand) => {
                            const requested = brand.selectedPackage;
                            const requestedPkg = getPackageById(requested);
                            const currentSelection = selectedFor[brand.id] || requested || "";

                            return (
                                <section
                                    key={brand.id}
                                    className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden"
                                >
                                    <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50/40 to-violet-50/40 flex items-center justify-between flex-wrap gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                                                <Building2 size={18} className="text-indigo-600" />
                                            </div>
                                            <div>
                                                <h2 className="text-base font-bold text-gray-900">{brand.name}</h2>
                                                <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                                                    <Lock size={11} /> Awaiting activation
                                                </span>
                                            </div>
                                        </div>
                                        {requestedPkg && (
                                            <div className="text-xs text-gray-500 bg-white border border-gray-100 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5">
                                                <Clock size={12} className="text-gray-400" />
                                                <span>
                                                    {requestedPkg.name} requested
                                                    {brand.packageRequestedAt
                                                        ? ` on ${new Date(brand.packageRequestedAt).toLocaleDateString("en-PK", { dateStyle: "medium" })}`
                                                        : ""}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-6">
                                        <div className="grid md:grid-cols-3 gap-4">
                                            {PACKAGES.map((pkg) => {
                                                const checked = currentSelection === pkg.id;
                                                return (
                                                    <label
                                                        key={pkg.id}
                                                        className={`relative cursor-pointer border rounded-2xl p-5 transition-all flex flex-col ${
                                                            checked
                                                                ? "border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50/30"
                                                                : "border-gray-200 hover:border-indigo-200 hover:bg-gray-50/50"
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={`pkg-${brand.id}`}
                                                            value={pkg.id}
                                                            checked={checked}
                                                            onChange={() =>
                                                                setSelectedFor((prev) => ({ ...prev, [brand.id]: pkg.id }))
                                                            }
                                                            className="sr-only"
                                                        />
                                                        {pkg.popular && (
                                                            <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 text-[10px] font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                                                                <Sparkles size={10} /> Popular
                                                            </span>
                                                        )}
                                                        <div className="flex items-center justify-between">
                                                            <h3 className="font-bold text-gray-900">{pkg.name}</h3>
                                                            {checked && (
                                                                <CheckCircle size={18} className="text-indigo-600" />
                                                            )}
                                                        </div>
                                                        <div className="mt-2 flex items-baseline gap-1">
                                                            <span className="text-xl font-bold text-gray-900">{pkg.priceLabel}</span>
                                                            <span className="text-xs text-gray-500">/mo</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1">{pkg.tagline}</p>
                                                        <ul className="mt-3 space-y-1.5 text-xs text-gray-600">
                                                            {pkg.features.slice(0, 4).map((f) => (
                                                                <li key={f} className="flex items-start gap-1.5">
                                                                    <CheckCircle size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                                                                    <span>{f}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </label>
                                                );
                                            })}
                                        </div>

                                        <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
                                            <p className="text-xs text-gray-500 max-w-md">
                                                After you submit, our team will reach out with payment instructions and activate
                                                your brand once the payment is confirmed.
                                            </p>
                                            <button
                                                onClick={() => handleSubmit(brand.id)}
                                                disabled={!currentSelection || submittingFor === brand.id}
                                                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl shadow-sm transition-all"
                                            >
                                                {submittingFor === brand.id ? (
                                                    <>
                                                        <Loader2 size={14} className="animate-spin" /> Submitting…
                                                    </>
                                                ) : requested ? (
                                                    <>
                                                        Update package <ArrowRight size={14} />
                                                    </>
                                                ) : (
                                                    <>
                                                        Submit selection <ArrowRight size={14} />
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}

                {activeBrands.length > 0 && (
                    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-10">
                        <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <CheckCircle size={18} className="text-emerald-600" /> Active brands
                        </h2>
                        <div className="space-y-2">
                            {activeBrands.map((b) => {
                                const pkg = getPackageById(b.selectedPackage);
                                return (
                                    <div
                                        key={b.id}
                                        className="flex items-center justify-between bg-emerald-50/40 border border-emerald-100 rounded-xl px-4 py-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Building2 size={16} className="text-emerald-700" />
                                            <span className="font-medium text-gray-900">{b.name}</span>
                                            {pkg && (
                                                <span className="text-xs font-medium bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-md">
                                                    {pkg.name}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-emerald-700 font-medium">Active</span>
                                    </div>
                                );
                            })}
                        </div>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-indigo-700 hover:text-indigo-800"
                        >
                            Open dashboard <ArrowRight size={14} />
                        </Link>
                    </div>
                )}
            </main>
        </div>
    );
}
