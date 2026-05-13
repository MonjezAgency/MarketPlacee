'use client';

/**
 * /supplier/offers — Ads & Sponsored Placements.
 *
 * Operator decision: gated behind the payment integration. Suppliers
 * can't run paid placements until billing is live, so the sidebar
 * shows a "Soon" badge AND the URL itself renders this placeholder
 * if anyone navigates directly (typed URL, bookmark, deep-link).
 *
 * Re-enable by restoring the previous implementation from git history
 * AND removing `comingSoon: true` from the supplier layout entry once
 * the Stripe Connect ads-billing flow lands.
 */

import * as React from 'react';
import Link from 'next/link';
import { Megaphone, ArrowLeft, Sparkles } from 'lucide-react';

export default function SupplierOffersComingSoonPage() {
    return (
        <div className="min-h-[70vh] flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/20 mx-auto flex items-center justify-center mb-6">
                    <Megaphone className="text-amber-600 dark:text-amber-400" size={28} />
                </div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-600 dark:text-amber-400 mb-2">
                    Coming Soon
                </p>
                <h1 className="text-[28px] font-black text-slate-900 dark:text-zinc-50 tracking-tight mb-3">
                    Offers &amp; Ads
                </h1>
                <p className="text-[14px] text-slate-500 dark:text-zinc-400 leading-relaxed mb-8">
                    Paid placements and sponsored listings are coming once the
                    billing integration lands. We'll let you know the moment
                    they're live — you'll be able to boost your top-performing
                    products straight from your inventory dashboard.
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    <Link
                        href="/supplier"
                        className="h-11 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-semibold inline-flex items-center gap-2 transition-colors"
                    >
                        <ArrowLeft size={15} />
                        Back to dashboard
                    </Link>
                    <Link
                        href="/supplier/wholesale-offers"
                        className="h-11 px-5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-semibold inline-flex items-center gap-2 transition-colors"
                    >
                        <Sparkles size={15} />
                        Try Wholesale Offers
                    </Link>
                </div>
            </div>
        </div>
    );
}
