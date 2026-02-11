"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Brand } from "@/lib/types";
import { useAuth } from "./AuthContext";

interface BrandContextType {
    brands: Brand[];
    selectedBrand: Brand | null;
    addBrand: (brand: Omit<Brand, "id">) => Promise<void>;
    updateBrand: (id: string, updates: Partial<Brand>) => Promise<void>;
    deleteBrand: (id: string) => Promise<void>;
    selectBrand: (id: string) => void;
    loading: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: React.ReactNode }) {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
    const [loading, setLoading] = useState(true);
    const { user, loading: authLoading } = useAuth();

    const loadBrands = useCallback(async () => {
        if (authLoading) return;
        if (!user) {
            setBrands([]);
            setSelectedBrand(null);
            setLoading(false);
            return;
        }

        try {
            const res = await fetch("/api/brands");
            if (!res.ok) throw new Error("Failed to load brands");
            let data: Brand[] = await res.json();

            if (user.brandIds !== "all" && Array.isArray(user.brandIds)) {
                data = data.filter((b: Brand) => user.brandIds === "all" || (user.brandIds as string[]).includes(b.id));
            }

            setBrands(data);

            const savedSelection = localStorage.getItem("hub_logistic_selected_brand_v1");
            if (savedSelection) {
                const found = data.find((b: Brand) => b.id === savedSelection);
                if (found) setSelectedBrand(found);
                else if (data.length > 0) setSelectedBrand(data[0]);
            } else if (data.length > 0) {
                setSelectedBrand(data[0]);
            }

            if (data.length === 0 && user.role === "SUPER_ADMIN") {
                const oldBrands = localStorage.getItem("hub_logistic_brands_v1");
                if (oldBrands) {
                    const parsed = JSON.parse(oldBrands);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        let allSucceeded = true;
                        for (const old of parsed) {
                            const postRes = await fetch("/api/brands", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    name: old.name,
                                    apiToken: old.apiToken || "",
                                    tranzoToken: old.tranzoToken || "",
                                    proxyUrl: old.proxyUrl || ""
                                })
                            });
                            if (!postRes.ok) allSucceeded = false;
                        }
                        const refreshRes = await fetch("/api/brands");
                        if (refreshRes.ok) {
                            const refreshed = await refreshRes.json();
                            setBrands(refreshed);
                            if (refreshed.length > 0) setSelectedBrand(refreshed[0]);
                        }
                        if (allSucceeded) {
                            localStorage.removeItem("hub_logistic_brands_v1");
                            localStorage.removeItem("postex_brands_v1");
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load brands from DB:", e);
        } finally {
            setLoading(false);
        }
    }, [user, authLoading]);

    useEffect(() => {
        loadBrands();
    }, [loadBrands]);

    useEffect(() => {
        if (selectedBrand) {
            localStorage.setItem("hub_logistic_selected_brand_v1", selectedBrand.id);
        } else {
            localStorage.removeItem("hub_logistic_selected_brand_v1");
        }
    }, [selectedBrand]);

    const addBrand = async (data: Omit<Brand, "id">) => {
        try {
            const res = await fetch("/api/brands", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error("Failed to create brand");
            const newBrand = await res.json();
            setBrands(prev => [...prev, newBrand]);
            if (brands.length === 0) setSelectedBrand(newBrand);
        } catch (e) {
            console.error("Failed to add brand:", e);
            throw e;
        }
    };

    const updateBrand = async (id: string, updates: Partial<Brand>) => {
        try {
            const res = await fetch(`/api/brands/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error("Failed to update brand");
            const updated = await res.json();
            setBrands(prev => prev.map(b => b.id === id ? updated : b));
            if (selectedBrand?.id === id) {
                setSelectedBrand(updated);
            }
        } catch (e) {
            console.error("Failed to update brand:", e);
            throw e;
        }
    };

    const deleteBrand = async (id: string) => {
        try {
            const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete brand");
            const updated = brands.filter(b => b.id !== id);
            setBrands(updated);
            if (selectedBrand?.id === id) {
                setSelectedBrand(updated.length > 0 ? updated[0] : null);
            }
        } catch (e) {
            console.error("Failed to delete brand:", e);
            throw e;
        }
    };

    const selectBrand = (id: string) => {
        const found = brands.find(b => b.id === id);
        if (found) setSelectedBrand(found);
    };

    return (
        <BrandContext.Provider value={{ brands, selectedBrand, addBrand, updateBrand, deleteBrand, selectBrand, loading }}>
            {children}
        </BrandContext.Provider>
    );
}

export function useBrand() {
    const context = useContext(BrandContext);
    if (context === undefined) {
        throw new Error("useBrand must be used within a BrandProvider");
    }
    return context;
}
