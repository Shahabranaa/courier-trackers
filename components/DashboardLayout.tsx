"use client";

import DashboardSidebar from "./DashboardSidebar";
import { useAuth } from "./providers/AuthContext";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="flex min-h-screen bg-gray-50/50">
            <DashboardSidebar />
            <main className="flex-1 min-w-0 transition-all duration-300">
                <div className="mx-auto w-full max-w-[1920px]">
                    {children}
                </div>
            </main>
        </div>
    );
}
