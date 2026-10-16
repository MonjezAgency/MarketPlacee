'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';

/** Shared building blocks for the trust pages (inspection, payments, warehouses). */

export function TrustHero({ eyebrow, title, lead, children }: { eyebrow: string; title: React.ReactNode; lead: React.ReactNode; children?: React.ReactNode }) {
    return (
        <section className="relative overflow-hidden border-b border-line">
            <div aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #DCE3EA 1px, transparent 0)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(ellipse 60% 70% at 50% 40%, #000 30%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse 60% 70% at 50% 40%, #000 30%, transparent 75%)' }} />
            <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16 text-center">
                <p className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-teal-soft text-[12px] font-semibold text-teal">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6]" /> {eyebrow}
                </p>
                <h1 className="font-sans mt-5 text-[32px] sm:text-[44px] font-bold tracking-tight text-heading leading-[1.08]">{title}</h1>
                <p className="mt-4 text-[16px] sm:text-[18px] text-ink-2 leading-relaxed">{lead}</p>
                {children && <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>}
            </div>
        </section>
    );
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <Link href={href} className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[15px] font-semibold transition-colors">{children} <ArrowRight size={16} /></Link>;
}
export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <Link href={href} className="inline-flex items-center h-12 px-6 rounded-xl bg-surface ring-1 ring-[#DCE3EA] hover:ring-ink text-heading text-[15px] font-semibold transition-colors">{children}</Link>;
}

export function SectionHead({ eyebrow, title, lead, id }: { eyebrow?: string; title: string; lead?: React.ReactNode; id?: string }) {
    return (
        <div className="text-center max-w-2xl mx-auto">
            {eyebrow && <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">{eyebrow}</p>}
            <h2 id={id} className="font-sans mt-2 text-[24px] sm:text-[30px] font-bold tracking-tight text-heading">{title}</h2>
            {lead && <p className="mt-3 text-[15px] text-ink-2 leading-relaxed">{lead}</p>}
        </div>
    );
}

export function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
    return (
        <div className="max-w-3xl mx-auto divide-y divide-line rounded-2xl ring-1 ring-line bg-surface">
            {items.map((f) => (
                <details key={f.q} className="group px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                        {f.q}
                        <ChevronDown size={18} className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-2.5 text-[14px] text-ink-2 leading-relaxed">{f.a}</div>
                </details>
            ))}
        </div>
    );
}

export function TrustCta({ title, lead, children }: { title: string; lead: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
            <h2 className="font-sans text-[26px] sm:text-[32px] font-bold tracking-tight text-heading">{title}</h2>
            <p className="mt-3 text-[16px] text-ink-2">{lead}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">{children}</div>
        </section>
    );
}

/** Related trust pages, shown at the foot of each. */
export function TrustNav({ current }: { current: 'inspection' | 'payments' | 'warehouses' }) {
    const pages = [
        { key: 'payments', href: '/protected-payments', title: 'Protected Payments', desc: 'Who approves each step before money moves.' },
        { key: 'inspection', href: '/goods-inspection', title: 'Goods Inspection', desc: 'What an inspection checks and how issues are resolved.' },
        { key: 'warehouses', href: '/warehouses', title: 'Warehouses', desc: 'Verified Atlantis hubs and where we deliver.' },
    ].filter((p) => p.key !== current);
    return (
        <section className="border-t border-line bg-[#F6F8FA]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 grid gap-4 sm:grid-cols-2">
                {pages.map((p) => (
                    <Link key={p.key} href={p.href} className="group rounded-2xl bg-surface ring-1 ring-line p-5 hover:ring-[#2EC4B6] transition-colors">
                        <p className="text-[15px] font-semibold text-heading inline-flex items-center gap-1.5">{p.title} <ArrowRight size={15} className="text-teal transition-transform group-hover:translate-x-0.5" /></p>
                        <p className="mt-1 text-[14px] text-ink-3">{p.desc}</p>
                    </Link>
                ))}
            </div>
        </section>
    );
}
