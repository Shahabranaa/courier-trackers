"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { Plus, Trash2, Edit2, Check, X, Building2, Key, Globe, Loader2, CheckCircle, AlertCircle, Zap } from "lucide-react";

interface TestResult {
    ok: boolean;
    authMethod?: string;
    shop?: {
        name: string | null;
        domain: string | null;
        myshopifyDomain: string | null;
        email: string | null;
        currency: string | null;
        country: string | null;
        planName: string | null;
    };
    productCount?: number | null;
    error?: string;
}

export default function SettingsPage() {
    const { brands, addBrand, updateBrand, deleteBrand, selectBrand, selectedBrand } = useBrand();

    // Form State
    const [isAdding, setIsAdding] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        apiToken: "",
        postexMerchantId: "",
        postexMerchantToken: "",
        tranzoApiToken: "",
        tranzoMerchantToken: "",
        tcsBearerToken: "",
        tcsApiUsername: "",
        tcsApiPassword: "",
        tcsCustomerNumber: "",
        proxyUrl: "",
        shopifyStore: "",
        shopifyAccessToken: "",
        shopifyClientId: "",
        shopifyClientSecret: "",
        wetarseelAccountId: "",
        wetarseelUserId: "", leopardsApiKey: "", leopardsApiPassword: "",
        postexEnabled: true, tranzoEnabled: true, zoomEnabled: true, tcsEnabled: true, shopifyEnabled: true, leopardsEnabled: true
    });

    const resetForm = () => {
        setFormData({ name: "", apiToken: "", postexMerchantId: "", postexMerchantToken: "", tranzoApiToken: "", tranzoMerchantToken: "", tcsBearerToken: "", tcsApiUsername: "", tcsApiPassword: "", tcsCustomerNumber: "", proxyUrl: "", shopifyStore: "", shopifyAccessToken: "", shopifyClientId: "", shopifyClientSecret: "", wetarseelAccountId: "", wetarseelUserId: "", leopardsApiKey: "", leopardsApiPassword: "", postexEnabled: true, tranzoEnabled: true, zoomEnabled: true, tcsEnabled: true, shopifyEnabled: true, leopardsEnabled: true });
        setIsAdding(false);
        setEditId(null);
        setTestResult(null);
    };

    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    const handleTestShopify = async (brandIdOverride?: string) => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch("/api/shopify/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    brandId: brandIdOverride || editId || selectedBrand?.id || undefined,
                    shopifyStore: formData.shopifyStore,
                    shopifyAccessToken: formData.shopifyAccessToken,
                    shopifyClientId: formData.shopifyClientId,
                    shopifyClientSecret: formData.shopifyClientSecret,
                }),
            });
            const data: TestResult = await res.json();
            setTestResult(data);
        } catch (e: any) {
            setTestResult({ ok: false, error: e?.message || "Network error" });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        if (!formData.name) return;
        setSaving(true);
        try {
            if (editId) {
                await updateBrand(editId, formData);
            } else {
                await addBrand(formData);
            }
            resetForm();
        } catch (e) {
            console.error("Failed to save brand:", e);
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (brand: any) => {
        setEditId(brand.id);
        setFormData({
            name: brand.name,
            apiToken: brand.apiToken,
            postexMerchantId: brand.postexMerchantId || "",
            postexMerchantToken: brand.postexMerchantToken || "",
            tranzoApiToken: brand.tranzoApiToken || "",
            tranzoMerchantToken: brand.tranzoMerchantToken || "",
            tcsBearerToken: brand.tcsBearerToken || "",
            tcsApiUsername: brand.tcsApiUsername || "",
            tcsApiPassword: brand.tcsApiPassword || "",
            tcsCustomerNumber: brand.tcsCustomerNumber || "",
            proxyUrl: brand.proxyUrl || "",
            shopifyStore: brand.shopifyStore || "",
            shopifyAccessToken: brand.shopifyAccessToken || "",
            shopifyClientId: brand.shopifyClientId || "",
            shopifyClientSecret: brand.shopifyClientSecret || "",
            wetarseelAccountId: brand.wetarseelAccountId || "",
            wetarseelUserId: brand.wetarseelUserId || "",
            leopardsApiKey: brand.leopardsApiKey || "",
            leopardsApiPassword: brand.leopardsApiPassword || "",
            postexEnabled: brand.postexEnabled !== false,
            tranzoEnabled: brand.tranzoEnabled !== false,
            zoomEnabled: brand.zoomEnabled !== false,
            tcsEnabled: brand.tcsEnabled !== false,
            shopifyEnabled: brand.shopifyEnabled !== false,
            leopardsEnabled: brand.leopardsEnabled !== false
        });
        setIsAdding(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this brand?")) {
            await deleteBrand(id);
        }
    };

    const testBrand = selectedBrand || brands[0] || null;

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 p-6 lg:p-10 max-w-4xl mx-auto w-full">

                <div className="border-b border-gray-200 pb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
                        <p className="text-gray-500 mt-2">Manage your brands and API connections.</p>
                    </div>
                    {!isAdding && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" /> Add Brand
                        </button>
                    )}
                </div>

                {/* Form Area */}
                {isAdding && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in slide-in-from-top-4">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            {editId ? <Edit2 className="w-4 h-4 text-indigo-500" /> : <Plus className="w-4 h-4 text-emerald-500" />}
                            {editId ? "Edit Brand" : "Add New Brand"}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Organic Tea Company"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                />
                            </div>

                            <div className="col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <div className="mb-3">
                                    <h4 className="text-sm font-semibold text-gray-900">Active courier APIs</h4>
                                    <p className="text-xs text-gray-500 mt-1">Only enabled couriers appear in the left navigation for this brand.</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {([
                                        ["postexEnabled", "PostEx"],
                                        ["tranzoEnabled", "Tranzo"],
                                        ["zoomEnabled", "Zoom"],
                                        ["tcsEnabled", "TCS"],
                                        ["leopardsEnabled", "Leopards"],
                                    ] as const).map(([key, label]) => (
                                        <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 cursor-pointer">
                                            <span className="text-sm font-medium text-gray-700">{label}</span>
                                            <span className="relative inline-flex h-6 w-11 shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={formData[key]}
                                                    onChange={e => setFormData({ ...formData, [key]: e.target.checked })}
                                                    className="peer sr-only"
                                                />
                                                <span className="absolute inset-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-indigo-600" />
                                                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-500"></span> PostEx API Token
                                </label>
                                <input
                                    type="password"
                                    value={formData.apiToken}
                                    onChange={e => setFormData({ ...formData, apiToken: e.target.value })}
                                    placeholder="Enter PostEx Token"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-400"></span> PostEx Merchant ID
                                </label>
                                <input
                                    type="text"
                                    value={formData.postexMerchantId}
                                    onChange={e => setFormData({ ...formData, postexMerchantId: e.target.value })}
                                    placeholder="e.g. 53117 (auto-detected from token if empty)"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">Optional — auto-extracted from your PostEx merchant token</p>
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span> PostEx Merchant Token (for CPR/Payments)
                                </label>
                                <input
                                    type="password"
                                    value={formData.postexMerchantToken}
                                    onChange={e => setFormData({ ...formData, postexMerchantToken: e.target.value })}
                                    placeholder="Bearer token from PostEx merchant portal login"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">From merchant.postex.pk — used for Payment Receipts (CPR). Different from the API token above.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-purple-500"></span> Tranzo API Token
                                </label>
                                <input
                                    type="password"
                                    value={formData.tranzoApiToken}
                                    onChange={e => setFormData({ ...formData, tranzoApiToken: e.target.value })}
                                    placeholder="Enter Tranzo API Token"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-violet-500"></span> Tranzo Merchant Token (for Payment Receipts)
                                </label>
                                <input
                                    type="password"
                                    value={formData.tranzoMerchantToken}
                                    onChange={e => setFormData({ ...formData, tranzoMerchantToken: e.target.value })}
                                    placeholder="Bearer token from Tranzo merchant portal login"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">From portal.tranzo.pk — used for Invoice/Payment Receipts. Different from the API token above.</p>
                            </div>

                            <div className="col-span-2 mt-4 pt-4 border-t border-gray-100">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-600"></span> TCS Courier
                                </h4>
                                <p className="text-xs text-gray-400 mb-4">These credentials are saved with this brand and used by the TCS Portal, tracking, and Payments pages.</p>
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                    <Key className="w-4 h-4 text-red-600" /> TCS Bearer Token
                                </label>
                                <input
                                    type="password"
                                    value={formData.tcsBearerToken}
                                    onChange={e => setFormData({ ...formData, tcsBearerToken: e.target.value })}
                                    placeholder="Enter TCS bearer token"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">The authorization token provided for your TCS API account.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">TCS API Username</label>
                                <input
                                    type="text"
                                    value={formData.tcsApiUsername}
                                    onChange={e => setFormData({ ...formData, tcsApiUsername: e.target.value })}
                                    placeholder="Enter TCS API username"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">TCS API Password</label>
                                <input
                                    type="password"
                                    value={formData.tcsApiPassword}
                                    onChange={e => setFormData({ ...formData, tcsApiPassword: e.target.value })}
                                    placeholder="Enter TCS API password"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">TCS Customer Number</label>
                                <input
                                    type="text"
                                    value={formData.tcsCustomerNumber}
                                    onChange={e => setFormData({ ...formData, tcsCustomerNumber: e.target.value })}
                                    placeholder="e.g. LGEC22719"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">Used to fetch CN inquiry and payment data for this brand.</p>
                            </div>

                            <div className="col-span-2 mt-4 pt-4 border-t border-gray-100">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-teal-500"></span> Leopards Courier
                                </h4>
                                <p className="text-xs text-gray-400 mb-4">Enable Leopards and save the API credentials used for order sync, tracking, and COD payments.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Leopards API Key</label>
                                <input type="password" value={formData.leopardsApiKey} onChange={e => setFormData({ ...formData, leopardsApiKey: e.target.value })} placeholder="Uses secure project secret when empty" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all font-mono text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Leopards API Password</label>
                                <input type="password" value={formData.leopardsApiPassword} onChange={e => setFormData({ ...formData, leopardsApiPassword: e.target.value })} placeholder="Uses secure project secret when empty" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all font-mono text-sm" />
                                <p className="text-xs text-gray-400 mt-1">Leave empty to use the secure project secrets, or save brand-specific credentials here.</p>
                            </div>
                            <div className="col-span-2 mt-4 pt-4 border-t border-gray-100">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span> Shopify Integration
                                </h4>
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Store Domain</label>
                                <input
                                    type="text"
                                    value={formData.shopifyStore}
                                    onChange={e => setFormData({ ...formData, shopifyStore: e.target.value })}
                                    placeholder="mystore.myshopify.com"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Admin API Access Token</label>
                                <input
                                    type="password"
                                    value={formData.shopifyAccessToken}
                                    onChange={e => setFormData({ ...formData, shopifyAccessToken: e.target.value })}
                                    placeholder="shpat_xxxxx... (from Custom App in Shopify Admin)"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">For Custom Apps created in Shopify Admin &gt; Settings &gt; Apps &gt; Develop apps</p>
                            </div>

                            <div className="col-span-2 flex items-center gap-3 text-xs text-gray-400">
                                <div className="flex-1 h-px bg-gray-200" />
                                <span>OR use Client Credentials (Dev Dashboard apps)</span>
                                <div className="flex-1 h-px bg-gray-200" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                                <input
                                    type="text"
                                    value={formData.shopifyClientId}
                                    onChange={e => setFormData({ ...formData, shopifyClientId: e.target.value })}
                                    placeholder="e.g. 93c8e2c15a25304ec506d35c4b35c9c3"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                                <input
                                    type="password"
                                    value={formData.shopifyClientSecret}
                                    onChange={e => setFormData({ ...formData, shopifyClientSecret: e.target.value })}
                                    placeholder="Enter Client Secret"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Test Saved Brand</label>
                                <select
                                    value={testBrand?.id || ""}
                                    onChange={e => {
                                        const found = brands.find(brand => brand.id === e.target.value);
                                        if (found) selectBrand(found.id);
                                    }}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition-all bg-white text-sm"
                                >
                                    <option value="" disabled>Select a brand</option>
                                    {brands.map(brand => (
                                        <option key={brand.id} value={brand.id}>{brand.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-span-2">
                                <button
                                    type="button"
                                    onClick={() => handleTestShopify(testBrand?.id)}
                                    disabled={testing || !testBrand}
                                    className="inline-flex items-center gap-2 text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {testing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" /> Testing connection…
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-4 h-4" /> Test Shopify connection
                                        </>
                                    )}
                                </button>
                                {testResult && (
                                    testResult.ok ? (
                                        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
                                            <div className="flex items-start gap-2 text-emerald-800 font-semibold">
                                                <CheckCircle size={16} className="mt-0.5 shrink-0" />
                                                Connection successful
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-emerald-900/80">
                                                {testResult.shop?.name && (
                                                    <div><span className="text-emerald-700/70">Shop:</span> <span className="font-medium">{testResult.shop.name}</span></div>
                                                )}
                                                {testResult.shop?.myshopifyDomain && (
                                                    <div><span className="text-emerald-700/70">Domain:</span> <span className="font-mono">{testResult.shop.myshopifyDomain}</span></div>
                                                )}
                                                {typeof testResult.productCount === "number" && (
                                                    <div><span className="text-emerald-700/70">Products:</span> <span className="font-medium">{testResult.productCount.toLocaleString()}</span></div>
                                                )}
                                                {testResult.shop?.currency && (
                                                    <div><span className="text-emerald-700/70">Currency:</span> <span className="font-medium">{testResult.shop.currency}</span></div>
                                                )}
                                                {testResult.shop?.country && (
                                                    <div><span className="text-emerald-700/70">Country:</span> <span className="font-medium">{testResult.shop.country}</span></div>
                                                )}
                                                {testResult.shop?.planName && (
                                                    <div><span className="text-emerald-700/70">Plan:</span> <span className="font-medium">{testResult.shop.planName}</span></div>
                                                )}
                                                {testResult.authMethod && (
                                                    <div className="col-span-2"><span className="text-emerald-700/70">Auth:</span> <span className="font-medium">{testResult.authMethod}</span></div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
                                            <div className="flex items-start gap-2 text-red-800 font-semibold">
                                                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                                Connection failed
                                            </div>
                                            <p className="mt-1 text-xs text-red-900/80 leading-relaxed break-words">
                                                {testResult.error || "Unknown error. Double-check the store domain and credentials."}
                                            </p>
                                        </div>
                                    )
                                )}
                            </div>

                            <div className="col-span-2 mt-4 pt-4 border-t border-gray-100">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> WeTarSeel (WhatsApp)
                                </h4>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Account ID</label>
                                <input
                                    type="text"
                                    value={formData.wetarseelAccountId}
                                    onChange={e => setFormData({ ...formData, wetarseelAccountId: e.target.value })}
                                    placeholder="e.g. mn3flz113dojgq6"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
                                <input
                                    type="text"
                                    value={formData.wetarseelUserId}
                                    onChange={e => setFormData({ ...formData, wetarseelUserId: e.target.value })}
                                    placeholder="e.g. 0coc3svt14ceq0w"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">Found in WeTarSeel URL parameters (account_id and current_user_id)</p>
                            </div>

                            <div className="col-span-2 mt-4 pt-4 border-t border-gray-100">
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-cyan-500" /> Proxy URL (Optional - For Pakistani IP)
                                </label>
                                <input
                                    type="text"
                                    value={formData.proxyUrl}
                                    onChange={e => setFormData({ ...formData, proxyUrl: e.target.value })}
                                    placeholder="e.g. http://ip:port or http://user:pass@ip:port"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1.5">Required for PostEx API if hosting outside Pakistan. Get free proxies from spys.one or similar.</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                            <button
                                onClick={resetForm}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formData.name || saving}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-sm disabled:opacity-50 transition-all"
                            >
                                {saving ? "Saving..." : "Save Brand"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Brands List */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Connected Brands</h3>

                    {brands.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100 border-dashed">
                            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">No brands added yet.</p>
                            <button onClick={() => setIsAdding(true)} className="text-indigo-600 font-medium text-sm mt-2 hover:underline">Add your first brand</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {brands.map(brand => (
                                <div
                                    key={brand.id}
                                    className={`p-5 rounded-2xl border transition-all relative group ${selectedBrand?.id === brand.id ? 'bg-white border-indigo-200 ring-4 ring-indigo-50/50 shadow-md' : 'bg-white border-gray-100 shadow-sm hover:border-gray-200'}`}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                                                <Building2 className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-900">{brand.name}</h4>
                                                <p className="text-xs text-gray-500 font-mono mt-0.5">{brand.id}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => startEdit(brand)}
                                                className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(brand.id)}
                                                className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mt-4">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> PostEx</span>
                                            {brand.apiToken ? (
                                                <span className="text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                                            ) : (
                                                <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Not Configured</span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> PostEx CPR</span>
                                            {brand.postexMerchantToken ? (
                                                <span className="text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                                            ) : (
                                                <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Not Configured</span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span> Tranzo Invoices</span>
                                            {brand.tranzoMerchantToken ? (
                                                <span className="text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                                            ) : (
                                                <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Not Configured</span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Tranzo</span>
                                            {brand.tranzoApiToken ? (
                                                <span className="text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                                            ) : (
                                                <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Not Configured</span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Shopify</span>
                                            {(brand.shopifyAccessToken || (brand.shopifyClientId && brand.shopifyClientSecret)) ? (
                                                <span className="text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                                            ) : (
                                                <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Not Configured</span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> WeTarSeel</span>
                                            {brand.wetarseelAccountId ? (
                                                <span className="text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                                            ) : (
                                                <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Not Configured</span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-500 flex items-center gap-1.5"><Globe className="w-3 h-3 text-cyan-500" /> Proxy</span>
                                            {brand.proxyUrl ? (
                                                <span className="text-cyan-600 font-medium bg-cyan-50 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono text-[10px] truncate max-w-[120px]" title={brand.proxyUrl}>{brand.proxyUrl.replace(/^https?:\/\//, '').split('@').pop()}</span>
                                            ) : (
                                                <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Direct</span>
                                            )}
                                        </div>
                                    </div>

                                    {selectedBrand?.id !== brand.id && (
                                        <button
                                            onClick={() => selectBrand(brand.id)}
                                            className="w-full mt-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                                        >
                                            Switch to this Brand
                                        </button>
                                    )}
                                    {selectedBrand?.id === brand.id && (
                                        <div className="w-full mt-4 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg text-center flex items-center justify-center gap-2">
                                            <Check className="w-3 h-3" /> Active Brand
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
