"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBrand } from "@/components/providers/BrandContext";
import { Plus, Trash2, Edit2, Check, X, Building2, Key } from "lucide-react";

export default function SettingsPage() {
    const { brands, addBrand, updateBrand, deleteBrand, selectBrand, selectedBrand } = useBrand();

    // Form State
    const [isAdding, setIsAdding] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        apiToken: "",
        tranzoToken: ""
    });

    const resetForm = () => {
        setFormData({ name: "", apiToken: "", tranzoToken: "" });
        setIsAdding(false);
        setEditId(null);
    };

    const handleSave = () => {
        if (!formData.name) return; // Simple validation

        if (editId) {
            updateBrand(editId, formData);
        } else {
            addBrand(formData);
        }
        resetForm();
    };

    const startEdit = (brand: any) => {
        setEditId(brand.id);
        setFormData({
            name: brand.name,
            apiToken: brand.apiToken,
            tranzoToken: brand.tranzoToken || ""
        });
        setIsAdding(true);
    };

    const handleDelete = (id: string) => {
        if (confirm("Are you sure you want to delete this brand?")) {
            deleteBrand(id);
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
                                    <span className="w-2 h-2 rounded-full bg-purple-500"></span> Tranzo Bearer Token
                                </label>
                                <input
                                    type="password"
                                    value={formData.tranzoToken}
                                    onChange={e => setFormData({ ...formData, tranzoToken: e.target.value })}
                                    placeholder="Enter Tranzo Token"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono text-sm"
                                />
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
                                disabled={!formData.name}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-sm disabled:opacity-50 transition-all"
                            >
                                Save Brand
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
                                            <span className="text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Tranzo</span>
                                            {brand.tranzoToken ? (
                                                <span className="text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                                            ) : (
                                                <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Not Configured</span>
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
