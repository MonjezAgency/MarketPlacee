'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, ChevronRight, ClipboardCheck, Layers, Package, Search, Truck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { DEPARTMENTS } from '@/lib/departments';

/**
 * /wholesale — the "Source wholesale at B2B prices" landing page (footer:
 * "Pallets, trucks & mixed loads"; in the sitemap). It explains how volumes
 * work on Atlantis and sends buyers into the real catalog. Every statement
 * matches what the platform does (see CLAUDE.md product rules): no invented
 * price tiers, discounts or guarantees.
 */
export default function WholesaleClient() {
    const { t } = useLanguage();
    const tw = (k: string) => t('wholesalePage', k);

    const volumes = [
        { icon: Package, title: tw('caseTitle'), desc: tw('caseDesc') },
        { icon: Boxes, title: tw('palletTitle'), desc: tw('palletDesc') },
        { icon: Truck, title: tw('truckTitle'), desc: tw('truckDesc') },
    ];
    const steps = ['step1', 'step2', 'step3', 'step4'];

    return (
        <main className="min-h-screen bg-surface text-start" data-no-translate>
            <section className="border-b border-line">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12 sm:pb-16">
                    <nav aria-label={tw('breadcrumbAria')} className="flex items-center gap-1.5 text-[13px] text-ink-3">
                        <Link href="/" className="hover:text-heading">{tw('home')}</Link>
                        <ChevronRight size={13} className="rtl:rotate-180" />
                        <span className="text-ink font-medium">{tw('crumb')}</span>
                    </nav>
                    <div className="mt-10 max-w-3xl">
                        <p className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-teal-soft text-[12px] font-semibold text-teal">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6]" /> {tw('eyebrow')}
                        </p>
                        <h1 className="font-sans mt-4 text-[32px] sm:text-[42px] font-bold tracking-tight text-heading leading-[1.1]">{tw('title')}</h1>
                        <p className="mt-4 text-[16px] sm:text-[17px] text-ink-2 leading-relaxed">{tw('lead')}</p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <Link href="/categories" className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold transition-colors">
                                {tw('browse')} <ArrowRight size={16} className="rtl:rotate-180" />
                            </Link>
                            <Link href="/auth/register?role=CUSTOMER" className="inline-flex items-center h-11 px-5 rounded-xl bg-surface ring-1 ring-line hover:ring-ink text-heading text-[14px] font-semibold transition-colors">
                                {tw('register')}
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section aria-labelledby="ws-volumes" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">{tw('volumesEyebrow')}</p>
                <h2 id="ws-volumes" className="font-sans mt-2 text-[24px] sm:text-[28px] font-bold tracking-tight text-heading">{tw('volumesTitle')}</h2>
                <p className="mt-2 text-[15px] text-ink-2 max-w-2xl leading-relaxed">{tw('volumesLead')}</p>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    {volumes.map((v) => (
                        <div key={v.title} className="rounded-2xl bg-surface ring-1 ring-line p-5">
                            <span className="w-10 h-10 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><v.icon size={19} /></span>
                            <h3 className="font-sans mt-4 text-[16px] font-bold text-heading">{v.title}</h3>
                            <p className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">{v.desc}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 rounded-2xl bg-surface-2 ring-1 ring-line p-5 flex gap-4 items-start">
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-surface ring-1 ring-line text-teal flex items-center justify-center"><Layers size={19} /></span>
                    <div>
                        <h3 className="font-sans text-[16px] font-bold text-heading">{tw('mixedTitle')}</h3>
                        <p className="mt-1.5 text-[14px] text-ink-2 leading-relaxed max-w-3xl">{tw('mixedDesc')}</p>
                    </div>
                </div>
            </section>

            <section aria-labelledby="ws-order" className="bg-surface-2 border-y border-line">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">{tw('orderEyebrow')}</p>
                    <h2 id="ws-order" className="font-sans mt-2 text-[24px] sm:text-[28px] font-bold tracking-tight text-heading">{tw('orderTitle')}</h2>
                    <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {steps.map((s, i) => (
                            <li key={s} className="rounded-2xl bg-surface ring-1 ring-line p-5">
                                <span className="w-8 h-8 rounded-full bg-cta text-cta-fg text-[13px] font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
                                <h3 className="font-sans mt-4 text-[15px] font-bold text-heading">{tw(`${s}Title`)}</h3>
                                <p className="mt-1.5 text-[13.5px] text-ink-2 leading-relaxed">{tw(`${s}Desc`)}</p>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-5 text-[13px] text-ink-3 flex items-center gap-2"><ClipboardCheck size={15} className="text-teal shrink-0" /> <span>{tw('orderNote')} <Link href="/how-it-works" className="font-medium text-teal hover:underline">{tw('howLink')}</Link></span></p>
                </div>
            </section>

            <section aria-labelledby="ws-cats" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
                <h2 id="ws-cats" className="font-sans text-[24px] sm:text-[28px] font-bold tracking-tight text-heading">{tw('catsTitle')}</h2>
                <div className="mt-6 flex flex-wrap gap-2">
                    {DEPARTMENTS.map((d) => (
                        <Link key={d.slug} href={`/categories?dept=${d.slug}`} className="h-10 px-4 inline-flex items-center rounded-full bg-surface ring-1 ring-line hover:ring-ink text-[14px] font-medium text-ink-2 hover:text-ink transition-colors">
                            {t('departments', d.slug) || d.label}
                        </Link>
                    ))}
                </div>
                <div className="mt-12 rounded-3xl bg-cta text-cta-fg p-7 sm:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="max-w-xl">
                        <h2 className="font-sans text-[22px] sm:text-[26px] font-bold tracking-tight">{tw('ctaTitle')}</h2>
                        <p className="mt-2 text-[15px] opacity-80 leading-relaxed">{tw('ctaDesc')}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href="/requests" className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-surface text-heading text-[14px] font-semibold hover:bg-surface-2 transition-colors">
                            <Search size={16} /> {tw('ctaRequest')}
                        </Link>
                        <Link href="/contact" className="inline-flex items-center h-11 px-5 rounded-xl ring-1 ring-white/30 text-[14px] font-semibold hover:ring-white/60 transition-colors">{tw('ctaContact')}</Link>
                    </div>
                </div>
            </section>
        </main>
    );
}
