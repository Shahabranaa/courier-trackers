"use client";

import Link from "next/link";
import {
    Truck, Package, BarChart3, ShieldCheck, DollarSign, Zap,
    CheckCircle, ArrowRight, MessageCircle, Users, TrendingUp, Sparkles
} from "lucide-react";
import { PACKAGES } from "@/lib/packages";

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-indigo-50/30 to-violet-50/40">
            <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-gray-100">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shrink-0">
                            H
                        </div>
                        <span className="font-bold text-lg text-gray-900 tracking-tight">
                            Hub<span className="text-indigo-600">Logistic</span>
                        </span>
                    </div>
                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
                        <a href="#features" className="hover:text-gray-900 transition">Features</a>
                        <a href="#pricing" className="hover:text-gray-900 transition">Pricing</a>
                        <a href="#how-it-works" className="hover:text-gray-900 transition">How it works</a>
                    </nav>
                    <div className="flex items-center gap-3">
                        <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2">
                            Sign in
                        </Link>
                        <a
                            href="#pricing"
                            className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 px-5 py-2.5 rounded-xl shadow-sm transition-all hover:shadow-md"
                        >
                            Get started
                        </a>
                    </div>
                </div>
            </header>

            <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
                <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-xs font-semibold mb-6">
                    <Sparkles size={14} />
                    Built for Pakistani e-commerce brands
                </div>
                <h1 className="text-4xl md:text-6xl font-bold text-gray-900 leading-tight tracking-tight max-w-4xl mx-auto">
                    All your courier orders.{" "}
                    <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                        One unified dashboard.
                    </span>
                </h1>
                <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
                    HubLogistic brings PostEx, Tranzo, Shopify and WhatsApp orders together.
                    Track deliveries, reconcile payments, and stop discrepancies before they hurt your bottom line.
                </p>
                <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
                    <a
                        href="#pricing"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 px-6 py-3 rounded-xl shadow-md transition-all hover:shadow-lg"
                    >
                        See pricing <ArrowRight size={16} />
                    </a>
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:border-gray-300 px-6 py-3 rounded-xl transition-all"
                    >
                        Sign in to dashboard
                    </Link>
                </div>

                <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                    {[
                        { icon: Truck, label: "PostEx" },
                        { icon: Package, label: "Tranzo" },
                        { icon: BarChart3, label: "Shopify" },
                        { icon: MessageCircle, label: "WhatsApp" },
                    ].map((item) => (
                        <div key={item.label} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-gray-600 font-medium text-sm shadow-sm">
                            <item.icon size={16} className="text-indigo-500" />
                            {item.label}
                        </div>
                    ))}
                </div>
            </section>

            <section id="features" className="max-w-6xl mx-auto px-6 py-20">
                <div className="text-center mb-14">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
                        Everything you need to run your shipping
                    </h2>
                    <p className="mt-4 text-gray-600 max-w-xl mx-auto">
                        Stop logging into five different portals. HubLogistic unifies the entire post-checkout flow.
                    </p>
                </div>
                <div className="grid md:grid-cols-3 gap-5">
                    {[
                        { icon: Truck, title: "Multi-courier sync", body: "Pull live order data from PostEx, Tranzo and Shopify into one workspace and track every shipment in real time." },
                        { icon: DollarSign, title: "Finance reconciliation", body: "Match courier settlements against your orders. Catch missing CPRs, deductions and disputes automatically." },
                        { icon: ShieldCheck, title: "Discrepancy alerts", body: "Spot return mismatches, stuck-in-transit shipments and performance drops before they become losses." },
                        { icon: MessageCircle, title: "WhatsApp inbox", body: "Convert WhatsApp conversations into Shopify orders in seconds with smart city + phone detection." },
                        { icon: Users, title: "Employee order links", body: "Give each agent a personal link to create orders. Track who closed what without sharing logins." },
                        { icon: TrendingUp, title: "Analytics & insights", body: "Repeat customers, LTV, delivery performance by city, return rate trends and more — all in one place." },
                    ].map((f) => (
                        <div key={f.title} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mb-4">
                                <f.icon size={20} className="text-indigo-600" />
                            </div>
                            <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                            <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20">
                <div className="text-center mb-14">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
                        How it works
                    </h2>
                    <p className="mt-4 text-gray-600 max-w-xl mx-auto">
                        Get up and running in three steps.
                    </p>
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                    {[
                        { n: "1", title: "Pick a package", body: "Choose the plan that fits your brand count and feature needs. Pricing starts at PKR 4,999." },
                        { n: "2", title: "Pay & get activated", body: "Make payment via bank transfer. Our team activates your brand within hours of confirmation." },
                        { n: "3", title: "Connect your stores", body: "Plug in your PostEx, Tranzo, Shopify and WhatsApp credentials. Start syncing instantly." },
                    ].map((s) => (
                        <div key={s.n} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm relative">
                            <div className="absolute -top-3 -left-3 h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white font-bold flex items-center justify-center shadow-md">
                                {s.n}
                            </div>
                            <h3 className="font-semibold text-gray-900 mb-2 mt-2">{s.title}</h3>
                            <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
                <div className="text-center mb-14">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
                        Simple, transparent pricing
                    </h2>
                    <p className="mt-4 text-gray-600 max-w-xl mx-auto">
                        Pick the package that fits your brand size. Upgrade any time.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6 items-stretch">
                    {PACKAGES.map((pkg) => (
                        <div
                            key={pkg.id}
                            className={`relative bg-white border rounded-2xl p-7 shadow-sm flex flex-col ${
                                pkg.popular
                                    ? "border-indigo-300 ring-2 ring-indigo-100 shadow-md"
                                    : "border-gray-100"
                            }`}
                        >
                            {pkg.popular && (
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 rounded-full shadow-md">
                                    <Sparkles size={12} /> Most popular
                                </span>
                            )}
                            <h3 className="text-lg font-bold text-gray-900">{pkg.name}</h3>
                            <p className="text-sm text-gray-500 mt-1 min-h-[2.5rem]">{pkg.tagline}</p>
                            <div className="mt-5 flex items-baseline gap-1">
                                <span className="text-3xl font-bold text-gray-900">{pkg.priceLabel}</span>
                                <span className="text-sm text-gray-500">/month</span>
                            </div>
                            <ul className="mt-6 space-y-2.5 flex-1">
                                {pkg.features.map((feat) => (
                                    <li key={feat} className="flex items-start gap-2 text-sm text-gray-700">
                                        <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                                        <span>{feat}</span>
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href="/login"
                                className={`mt-7 inline-flex items-center justify-center gap-2 text-sm font-semibold px-5 py-3 rounded-xl transition-all ${
                                    pkg.popular
                                        ? "text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-md hover:shadow-lg"
                                        : "text-gray-700 bg-gray-100 hover:bg-gray-200"
                                }`}
                            >
                                Get {pkg.name} <ArrowRight size={14} />
                            </Link>
                        </div>
                    ))}
                </div>

                <p className="text-center text-xs text-gray-400 mt-8">
                    Prices are in Pakistani Rupees (PKR). Billed monthly. Activation handled by our team.
                </p>
            </section>

            <section className="max-w-5xl mx-auto px-6 py-16">
                <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-10 md:p-14 text-center text-white shadow-xl">
                    <Zap className="mx-auto mb-4" size={32} />
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                        Ready to take control of your shipping?
                    </h2>
                    <p className="mt-4 text-indigo-100 max-w-xl mx-auto">
                        Sign in, pick a package, and our team will get you activated within hours.
                    </p>
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 mt-7 text-sm font-semibold text-indigo-700 bg-white hover:bg-indigo-50 px-6 py-3 rounded-xl shadow-md transition-all"
                    >
                        Sign in to dashboard <ArrowRight size={16} />
                    </Link>
                </div>
            </section>

            <footer className="border-t border-gray-100 bg-white/60">
                <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                            H
                        </div>
                        <span className="font-semibold text-gray-700">HubLogistic</span>
                    </div>
                    <span>© {new Date().getFullYear()} HubLogistic. All rights reserved.</span>
                </div>
            </footer>
        </div>
    );
}
