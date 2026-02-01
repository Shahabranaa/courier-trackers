"use client";

import { useEffect, useState } from "react";
import { Brand } from "@/lib/types";
import { Trash2, Plus, Key } from "lucide-react";

export default function BrandManager({
    onBrandSelect,
    selectedBrandId,
}: {
    onBrandSelect: (brand: Brand | null) => void;
    selectedBrandId: string | null;
}) {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [newBrandName, setNewBrandName] = useState("");
    const [newBrandToken, setNewBrandToken] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const storedBrands = localStorage.getItem("postex_brands");
        if (storedBrands) {
            setBrands(JSON.parse(storedBrands));
        }
    }, []);

    const addBrand = () => {
        if (!newBrandName || !newBrandToken) return;

        const newBrand: Brand = {
            id: crypto.randomUUID(),
            name: newBrandName,
            apiToken: newBrandToken,
        };

        const updatedBrands = [...brands, newBrand];
        setBrands(updatedBrands);
        localStorage.setItem("postex_brands", JSON.stringify(updatedBrands));
        setNewBrandName("");
        setNewBrandToken("");
        setIsOpen(false);
    };

    const removeBrand = (id: string) => {
        const updatedBrands = brands.filter((b) => b.id !== id);
        setBrands(updatedBrands);
        localStorage.setItem("postex_brands", JSON.stringify(updatedBrands));
        if (selectedBrandId === id) {
            onBrandSelect(null);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Key className="w-5 h-5 text-blue-600" />
                    Manage Brands
                </h2>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Brand
                </button>
            </div>

            {isOpen && (
                <div className="bg-gray-50 p-4 rounded-lg mb-4 animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                            type="text"
                            placeholder="Brand Name (e.g., My Store)"
                            value={newBrandName}
                            onChange={(e) => setNewBrandName(e.target.value)}
                            className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            type="text"
                            placeholder="PostEx API Token"
                            value={newBrandToken}
                            onChange={(e) => setNewBrandToken(e.target.value)}
                            className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        />
                    </div>
                    <div className="mt-3 flex justify-end">
                        <button
                            onClick={addBrand}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        >
                            Save Credentials
                        </button>
                    </div>
                </div>
            )}

            {brands.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    No brands added yet. Add your PostEx API credentials to get started.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {brands.map((brand) => (
                        <div
                            key={brand.id}
                            onClick={() => onBrandSelect(brand)}
                            className={`cursor-pointer p-4 rounded-lg border transition-all hover:shadow-md ${selectedBrandId === brand.id
                                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                                    : "border-gray-200 bg-white hover:border-blue-300"
                                }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-semibold text-gray-800">{brand.name}</h3>
                                    <p className="text-xs text-gray-500 font-mono mt-1">
                                        {brand.apiToken.slice(0, 8)}...•
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeBrand(brand.id);
                                    }}
                                    className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-full transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
