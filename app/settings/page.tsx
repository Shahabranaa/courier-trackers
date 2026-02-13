"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { Plus, Trash2, Edit2, Check, X, Building2, Key, Globe } from "lucide-react";

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
        proxyUrl: "",
        shopifyStore: "",
        shopifyAccessToken: "",
        shopifyClientId: "",
        shopifyClientSecret: ""
    });

    const resetForm = () => {
        setFormData({ name: "", apiToken: "", postexMerchantId: "", postexMerchantToken: "", tranzoApiToken: "", tranzoMerchantToken: "", proxyUrl: "", shopifyStore: "", shopifyAccessToken: "", shopifyClientId: "", shopifyClientSecret: "" });
        setIsAdding(false);
        setEditId(null);
    };

    const [saving, setSaving] = useState(false);

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
            proxyUrl: brand.proxyUrl || "",
            shopifyStore: brand.shopifyStore || "",
            shopifyAccessToken: brand.shopifyAccessToken || "",
            shopifyClientId: brand.shopifyClientId || "",
            shopifyClientSecret: brand.shopifyClientSecret || ""
        });
        setIsAdding(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this brand?")) {
            await deleteBrand(id);
        }
    };

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
