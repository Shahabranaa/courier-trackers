"use client";

import DashboardSidebar from "./DashboardSidebar";
import AuthGuard from "./AuthGuard";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthGuard>
            <div className="flex min-h-screen bg-gray-50/50">
                <DashboardSidebar />
                <main className="flex-1 min-w-0 transition-all duration-300">
                    <div className="mx-auto w-full max-w-[1920px]">
                        {children}
                    </div>
                </main>
            </div>
        </AuthGuard>
    );
}
