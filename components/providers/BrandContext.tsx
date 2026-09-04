"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "@/lib/types";
import { useAuth } from "./AuthContext";

interface BrandContextType {
    brands: Brand[];
    allBrands: Brand[];
    selectedBrand: Brand | null;
    addBrand: (brand: Omit<Brand, "id">) => Promise<void>;
    updateBrand: (id: string, updates: Partial<Brand>) => Promise<void>;
    deleteBrand: (id: string) => Promise<void>;
    selectBrand: (id: string) => void;
    loading: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

const PAYWALL_EXEMPT_PATHS = ["/paywall", "/landing", "/login"];

function isExemptPath(pathname: string | null) {
    if (!pathname) return true;
    if (PAYWALL_EXEMPT_PATHS.includes(pathname)) return true;
    if (pathname.startsWith("/admin/")) return true;
    if (pathname.startsWith("/shopify/create/")) return true;
    return false;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
    const [allBrands, setAllBrands] = useState<Brand[]>([]);
    const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
    const [loading, setLoading] = useState(true);
    const { user: authUser, loading: authLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const isAdmin = authUser?.role === "ADMIN";
    const visibleBrands = isAdmin ? allBrands : allBrands.filter(b => b.isActive !== false);

    const loadBrands = useCallback(async () => {
        if (!authUser) {
            setAllBrands([]);
            setSelectedBrand(null);
            setLoading(false);
            return;
        }
        try {
            const res = await fetch("/api/brands");
            if (!res.ok) throw new Error("Failed to load brands");
            const data: Brand[] = await res.json();
            setAllBrands(data);

            const usable = isAdmin ? data : data.filter(b => b.isActive !== false);

            const savedSelection = localStorage.getItem("hub_logistic_selected_brand_v1");
            let nextSelected: Brand | null = null;
            if (savedSelection) {
                const found = usable.find(b => b.id === savedSelection);
                if (found) nextSelected = found;
                else if (usable.length > 0) nextSelected = usable[0];
            } else if (usable.length > 0) {
                nextSelected = usable[0];
            }
            setSelectedBrand(nextSelected);

            if (data.length === 0) {
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
                                    tranzoApiToken: old.tranzoApiToken || "",
                                    proxyUrl: old.proxyUrl || ""
                                })
                            });
                            if (!postRes.ok) allSucceeded = false;
                        }
                        const refreshRes = await fetch("/api/brands");
                        if (refreshRes.ok) {
                            const refreshed: Brand[] = await refreshRes.json();
                            setAllBrands(refreshed);
                            const usableR = isAdmin ? refreshed : refreshed.filter(b => b.isActive !== false);
                            if (usableR.length > 0) setSelectedBrand(usableR[0]);
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
    }, [authUser, isAdmin]);

    useEffect(() => {
        if (!authLoading) loadBrands();
    }, [authLoading, loadBrands]);

    useEffect(() => {
        if (selectedBrand) {
            localStorage.setItem("hub_logistic_selected_brand_v1", selectedBrand.id);
        } else {
            localStorage.removeItem("hub_logistic_selected_brand_v1");
        }
    }, [selectedBrand]);

    useEffect(() => {
        if (authLoading || loading) return;
        if (!authUser) return;
        if (isAdmin) return;
        if (allBrands.length === 0) return;
        const hasActive = allBrands.some(b => b.isActive !== false);
        if (!hasActive && !isExemptPath(pathname)) {
            router.push("/paywall");
        }
    }, [authLoading, loading, authUser, isAdmin, allBrands, pathname, router]);

    const addBrand = async (data: Omit<Brand, "id">) => {
        try {
            const res = await fetch("/api/brands", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error("Failed to create brand");
            const newBrand: Brand = await res.json();
            setAllBrands(prev => [...prev, newBrand]);
            const isUsable = isAdmin || newBrand.isActive !== false;
            if (isUsable && visibleBrands.length === 0) setSelectedBrand(newBrand);
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
            const updated: Brand = await res.json();
            setAllBrands(prev => prev.map(b => b.id === id ? updated : b));
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
            const updated = allBrands.filter(b => b.id !== id);
            setAllBrands(updated);
            if (selectedBrand?.id === id) {
                const usable = isAdmin ? updated : updated.filter(b => b.isActive !== false);
                setSelectedBrand(usable.length > 0 ? usable[0] : null);
            }
        } catch (e) {
            console.error("Failed to delete brand:", e);
            throw e;
        }
    };

    const selectBrand = (id: string) => {
        const found = allBrands.find(b => b.id === id);
        if (found) setSelectedBrand(found);
    };

    return (
        <BrandContext.Provider value={{ brands: visibleBrands, allBrands, selectedBrand, addBrand, updateBrand, deleteBrand, selectBrand, loading }}>
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
