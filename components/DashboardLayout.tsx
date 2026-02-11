"use client";

import DashboardSidebar from "./DashboardSidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-gray-50/50">
            {/* Sidebar - Fix position handled inside Sidebar component */}
            <DashboardSidebar />

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 transition-all duration-300">
                <div className="mx-auto w-full max-w-[1920px]">
                    {children}
                </div>
            </main>
        </div>
    );
}
