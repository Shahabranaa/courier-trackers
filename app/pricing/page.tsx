"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle, ArrowRight, Sparkles, X, Loader2, MessageCircle,
  Truck, Package, BarChart3, ShieldCheck, Users, TrendingUp, Zap
} from "lucide-react";

const PLAN = {
  id: "growth",
  name: "Growth",
  priceLabel: "PKR 9,999",
  priceSub: "per month",
  tagline: "Everything you need to run your e-commerce shipping, reconciliation, and analytics — in one place.",
  features: [
    "Up to 3 active brands",
    "PostEx, Tranzo & Shopify sync",
    "WhatsApp order capture",
    "Finance & payment reconciliation",
    "Discrepancy & smart alerts",
    "Customer & delivery insights",
    "Sales performance dashboards",
    "Up to 15 employee order links",
    "Priority support",
  ],
};

interface FormData {
  name: string;
  company: string;
  website: string;
  ordersPerMonth: string;
}

export default function PricingPage() {
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>({
    name: "",
    company: "",
    website: "",
    ordersPerMonth: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
    const text = `Hello HubLogistic Team! I'm interested in the ${PLAN.name} plan.

*Name:* ${form.name}
*Company:* ${form.company}
*Website:* ${form.website || "N/A"}
*Orders per month:* ${form.ordersPerMonth}
*Plan:* ${PLAN.name} (${PLAN.priceLabel}/month)

Please get in touch with me. Thank you!`;

    const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");

    setTimeout(() => {
      setSubmitting(false);
      setShowModal(false);
      setForm({ name: "", company: "", website: "", ordersPerMonth: "" });
    }, 800);
  };

  const isValid = form.name.trim() && form.company.trim() && form.ordersPerMonth;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-2.5">
            <div className="h-9 w-9 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shrink-0">
              H
            </div>
            <span className="font-bold text-lg text-gray-900 tracking-tight">
              Hub<span className="text-indigo-600">Logistic</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <Link href="/landing#features" className="hover:text-gray-900 transition">Features</Link>
            <Link href="/pricing" className="text-indigo-600 font-semibold">Pricing</Link>
            <Link href="/landing#how-it-works" className="hover:text-gray-900 transition">How it works</Link>
          </nav>
          <Link
            href="/login"
            className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 px-5 py-2.5 rounded-xl shadow-sm transition-all hover:shadow-md inline-flex items-center gap-1.5"
          >
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-10 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full text-xs font-semibold mb-6 tracking-wide uppercase">
          Transparent Pricing
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
          Logistics Software Pricing<br />
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            That Scales With You
          </span>
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
          One simple plan for Pakistani e-commerce brands. Sync PostEx, Tranzo, Shopify and WhatsApp
          with no hidden fees and no lock-in.
        </p>
        <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500 flex-wrap">
          {["No credit card required", "Activated by our team", "Cancel anytime"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <CheckCircle size={15} className="text-emerald-500" />
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Plan card */}
      <section className="max-w-xl mx-auto px-6 pb-24">
        <div className="relative bg-white border-2 border-indigo-400 rounded-3xl shadow-xl overflow-visible mt-10">
          {/* Popular badge */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md tracking-wide uppercase">
              <Sparkles size={12} /> Most Popular
            </span>
          </div>

          <div className="p-8 pt-10">
            {/* Plan header */}
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider mb-4">
              Best Value
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900">{PLAN.name}</h2>
            <p className="text-gray-500 mt-2 text-sm leading-relaxed">{PLAN.tagline}</p>

            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-gray-900">{PLAN.priceLabel}</span>
              <span className="text-gray-400 text-sm">{PLAN.priceSub}</span>
            </div>

            <hr className="my-6 border-gray-100" />

            {/* Features */}
            <ul className="space-y-3">
              {PLAN.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle size={17} className="text-indigo-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <button
              onClick={() => setShowModal(true)}
              className="mt-8 w-full inline-flex items-center justify-center gap-2 text-base font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 px-6 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all"
            >
              <MessageCircle size={18} /> Get Started — Contact Us
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">
              We'll reach out with payment details and activate your account within hours.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Prices in Pakistani Rupees (PKR). Billed monthly. Activation handled by our team.
        </p>
      </section>

      {/* Features strip */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 mb-10">Everything included in your plan</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {[
              { icon: Truck, title: "Multi-courier sync", body: "Pull live order data from PostEx, Tranzo and Shopify into one workspace." },
              { icon: BarChart3, title: "Finance reconciliation", body: "Match courier settlements against your orders and catch discrepancies automatically." },
              { icon: ShieldCheck, title: "Smart alerts", body: "Spot return mismatches, stuck shipments and performance drops before they hurt revenue." },
              { icon: MessageCircle, title: "WhatsApp orders", body: "Convert WhatsApp chats into Shopify orders in seconds with smart city & phone detection." },
              { icon: Users, title: "Employee links", body: "Give each agent a personal order link and track who closed what without sharing logins." },
              { icon: TrendingUp, title: "Analytics", body: "Delivery rate, return rate, net revenue and daily performance trends — all in one place." },
            ].map((f) => (
              <div key={f.title} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mb-3">
                  <f.icon size={19} className="text-indigo-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-10 md:p-14 text-center text-white shadow-xl">
          <Zap className="mx-auto mb-4" size={32} />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Ready to take control of your shipping?
          </h2>
          <p className="mt-4 text-indigo-100 max-w-xl mx-auto text-sm leading-relaxed">
            Get started today — our team activates your account within hours of payment confirmation.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 mt-7 text-sm font-bold text-indigo-700 bg-white hover:bg-indigo-50 px-7 py-3.5 rounded-2xl shadow-md transition-all"
          >
            <MessageCircle size={16} /> Contact us on WhatsApp
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white/60">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">H</div>
            <span className="font-semibold text-gray-700">HubLogistic</span>
          </div>
          <span>© {new Date().getFullYear()} HubLogistic. All rights reserved.</span>
        </div>
      </footer>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 z-10">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <div className="h-11 w-11 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg mb-4 shadow-md">H</div>
              <h2 className="text-xl font-bold text-gray-900">Get started with {PLAN.name}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Fill in your details and we'll open a WhatsApp chat so our team can get you activated.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="Ahmed Khan"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Company / Store name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  required
                  placeholder="My E-commerce Store"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  name="website"
                  value={form.website}
                  onChange={handleChange}
                  placeholder="www.mystore.pk"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Orders per month <span className="text-red-400">*</span></label>
                <select
                  name="ordersPerMonth"
                  value={form.ordersPerMonth}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition bg-white"
                >
                  <option value="">Select range…</option>
                  <option value="Under 500">Under 500</option>
                  <option value="500 – 1,000">500 – 1,000</option>
                  <option value="1,000 – 3,000">1,000 – 3,000</option>
                  <option value="3,000 – 10,000">3,000 – 10,000</option>
                  <option value="10,000+">10,000+</option>
                </select>
              </div>

              <div className="pt-1">
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-500 mb-4">
                  <span className="font-semibold text-gray-700">Selected plan:</span> {PLAN.name} — {PLAN.priceLabel}/month
                </div>
                <button
                  type="submit"
                  disabled={!isValid || submitting}
                  className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3.5 rounded-2xl shadow-md transition-all"
                >
                  {submitting ? (
                    <><Loader2 size={16} className="animate-spin" /> Opening WhatsApp…</>
                  ) : (
                    <><MessageCircle size={16} /> Send via WhatsApp</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
