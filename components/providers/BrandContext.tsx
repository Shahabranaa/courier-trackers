"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Brand } from "@/lib/types";

interface BrandContextType {
    brands: Brand[];
    selectedBrand: Brand | null;
    addBrand: (brand: Omit<Brand, "id">) => void;
    updateBrand: (id: string, updates: Partial<Brand>) => void;
    deleteBrand: (id: string) => void;
    selectBrand: (id: string) => void;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: React.ReactNode }) {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const savedBrands = localStorage.getItem("hub_logistic_brands_v1");
            const savedSelection = localStorage.getItem("hub_logistic_selected_brand_v1");

            if (savedBrands) {
                const parsed = JSON.parse(savedBrands);
                setBrands(parsed);

                // Restore selection logic
                if (savedSelection) {
                    const found = parsed.find((b: Brand) => b.id === savedSelection);
                    if (found) setSelectedBrand(found);
                    else if (parsed.length > 0) setSelectedBrand(parsed[0]);
                } else if (parsed.length > 0) {
                    setSelectedBrand(parsed[0]);
                }
            } else {
                // Migration from old keys (Attempt to recover "postex_brands_v1")
                const oldPostExBrands = localStorage.getItem("postex_brands_v1");
                if (oldPostExBrands) {
                    const parsedOld = JSON.parse(oldPostExBrands);
                    if (Array.isArray(parsedOld)) {
                        setBrands(parsedOld);
                        if (parsedOld.length > 0) setSelectedBrand(parsedOld[0]);
                        // Save immediately to new key
                        localStorage.setItem("hub_logistic_brands_v1", JSON.stringify(parsedOld));
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load brands", e);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Persistence
    useEffect(() => {
        if (!isLoaded) return;
        localStorage.setItem("hub_logistic_brands_v1", JSON.stringify(brands));
    }, [brands, isLoaded]);

    useEffect(() => {
        if (!isLoaded) return;
        if (selectedBrand) {
            localStorage.setItem("hub_logistic_selected_brand_v1", selectedBrand.id);
        } else {
            localStorage.removeItem("hub_logistic_selected_brand_v1");
        }
    }, [selectedBrand, isLoaded]);

    const addBrand = (data: Omit<Brand, "id">) => {
        const newBrand: Brand = {
            id: `brand_${Date.now()}`,
            ...data
        };
        const updated = [...brands, newBrand];
        setBrands(updated);

        // Auto-select if first
        if (brands.length === 0) setSelectedBrand(newBrand);
    };

    const updateBrand = (id: string, updates: Partial<Brand>) => {
        setBrands(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
        if (selectedBrand?.id === id) {
            setSelectedBrand(prev => prev ? { ...prev, ...updates } : null);
        }
    };

    const deleteBrand = (id: string) => {
        const updated = brands.filter(b => b.id !== id);
        setBrands(updated);
        if (selectedBrand?.id === id) {
            setSelectedBrand(updated.length > 0 ? updated[0] : null);
        }
    };

    const selectBrand = (id: string) => {
        const found = brands.find(b => b.id === id);
        if (found) setSelectedBrand(found);
    };

    return (
        <BrandContext.Provider value={{ brands, selectedBrand, addBrand, updateBrand, deleteBrand, selectBrand }}>
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
