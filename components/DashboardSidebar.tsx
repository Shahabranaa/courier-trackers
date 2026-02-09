"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Truck, Package, Settings, LogOut, ChevronLeft, ChevronRight, PieChart, ChevronDown, Plus, Building2, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useBrand } from "./providers/BrandContext";

export default function DashboardSidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [brandMenuOpen, setBrandMenuOpen] = useState(false);

    const { brands, selectedBrand, selectBrand } = useBrand();

    const navItems = [
        { name: "Overview", href: "/", icon: LayoutDashboard },
        {
            name: "PostEx Portal",
            href: "/postex",
            icon: Truck,
            children: [
                { name: "All Orders", href: "/postex" },
                { name: "Critical Orders", href: "/postex/critical" },
            ]
        },
        { name: "Tranzo Portal", href: "/tranzo", icon: Package },
        { name: "Shopify Orders", href: "/shopify", icon: ShoppingBag },
    ];

    // Track expanded state for menus (default PostEx open if on a sub-page? or just manual?)
    // Let's default to expanded if pathname starts with href
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        "/postex": true // Default expanded for visibility
    });

    const toggleGroup = (href: string) => {
        setExpandedGroups(prev => ({ ...prev, [href]: !prev[href] }));
    };

    return (
        <aside
            className={`bg-white border-r border-gray-200 h-screen sticky top-0 flex flex-col transition-all duration-300 z-40 ${collapsed ? "w-20" : "w-64"}`}
        >
            {/* Logo Area */}
            <div className="h-16 flex items-center justify-center border-b border-gray-100 relative">
                {collapsed ? (
                    <div className="h-10 w-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
                        H
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-6 w-full">
                        <div className="h-8 w-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md shrink-0">
                            H
                        </div>
                        <span className="font-bold text-lg text-gray-900 tracking-tight">Hub<span className="text-indigo-600">Logistic</span></span>
                    </div>
                )}
            </div>

            {/* Brand Switcher */}
            {!collapsed && (
                <div className="px-3 pt-4 pb-2">
                    <div className="relative">
                        <button
                            onClick={() => setBrandMenuOpen(!brandMenuOpen)}
                            className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200 rounded-xl transition-all group"
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-1.5 bg-white rounded-lg shadow-sm text-indigo-600">
                                    <Building2 size={16} />
                                </div>
                                <div className="text-left overflow-hidden">
                                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Current Brand</p>
                                    <p className="text-sm font-bold text-gray-900 truncate">{selectedBrand ? selectedBrand.name : "Select Brand"}</p>
                                </div>
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform ${brandMenuOpen ? "rotate-180" : ""}`} />
                        </button>

                        {/* Dropdown */}
                        {brandMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setBrandMenuOpen(false)}></div>
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <div className="max-h-60 overflow-y-auto py-1">
                                        {brands.map(brand => (
                                            <button
                                                key={brand.id}
                                                onClick={() => {
                                                    selectBrand(brand.id);
                                                    setBrandMenuOpen(false);
                                                }}
                                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between group ${selectedBrand?.id === brand.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700"}`}
                                            >
                                                <span className="truncate">{brand.name}</span>
                                                {selectedBrand?.id === brand.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600"></div>}
                                            </button>
                                        ))}
                                        {brands.length === 0 && (
                                            <div className="px-4 py-3 text-xs text-gray-400 text-center">No brands found</div>
                                        )}
                                    </div>
                                    <div className="border-t border-gray-100 p-2 bg-gray-50">
                                        <Link href="/settings" onClick={() => setBrandMenuOpen(false)} className="flex items-center justify-center gap-2 w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
                                            <Plus size={14} /> Manage Brands
                                        </Link>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.children && item.children.some(child => pathname === child.href));
                    const isExpanded = expandedGroups[item.href] || false;
                    const Icon = item.icon;

                    return (
                        <div key={item.href}>
                            <div
                                onClick={() => item.children ? toggleGroup(item.href) : null}
                                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all group cursor-pointer ${(!item.children && isActive)
                                        ? "bg-indigo-50 text-indigo-700 font-medium shadow-sm ring-1 ring-indigo-200"
                                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                    }`}
                                title={collapsed ? item.name : ""}
                            >
                                <Link
                                    href={item.children ? "#" : item.href}
                                    onClick={(e) => {
                                        if (item.children) {
                                            e.preventDefault();
                                            toggleGroup(item.href);
                                        }
                                    }}
                                    className="flex items-center flex-1 gap-3"
                                >
                                    <div className={`${isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600"}`}>
                                        <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                                    </div>

                                    {!collapsed && (
                                        <span className="whitespace-nowrap flex-1">{item.name}</span>
                                    )}
                                </Link>

                                {!collapsed && item.children && (
                                    <ChevronDown
                                        size={16}
                                        className={`text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                                    />
                                )}
                            </div>

                            {/* Sub-menu */}
                            {!collapsed && item.children && isExpanded && (
                                <div className="mt-1 ml-4 space-y-1 border-l-2 border-gray-100 pl-2">
                                    {item.children.map((child) => {
                                        const isChildActive = pathname === child.href;
                                        return (
                                            <Link
                                                key={child.href}
                                                href={child.href}
                                                className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${isChildActive
                                                        ? "text-indigo-700 font-medium bg-indigo-50/50"
                                                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                                    }`}
                                            >
                                                {child.name}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* Footer / User Profile */}
            <div className="p-3 border-t border-gray-100">
                <Link href="/settings" className="flex items-center gap-3 w-full p-2 hover:bg-gray-50 rounded-xl transition-colors group">
                    <div className="h-9 w-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 border border-gray-200 group-hover:border-indigo-200 group-hover:text-indigo-600 transition-colors">
                        <Settings size={18} />
                    </div>
                    {!collapsed && (
                        <div className="text-left overflow-hidden">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">Settings</p>
                            <p className="text-xs text-gray-500 truncate">Manage keys</p>
                        </div>
                    )}
                </Link>
            </div>

            {/* Collapse Toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="absolute -right-3 top-20 bg-white border border-gray-200 rounded-full p-1 shadow-sm text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-all"
            >
                {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

        </aside>
    );
}
