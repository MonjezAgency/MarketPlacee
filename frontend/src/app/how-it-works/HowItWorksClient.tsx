'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, UserCheck, Search, Layers, ListChecks, CreditCard, Truck, ShieldCheck, PackageCheck, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Buyer journey — every step maps to something Atlantis actually supports:
 * account approval (PENDING_APPROVAL flow), catalog search incl. EAN,
 * case/pallet/truck price tiers, cart + /requests, Stripe checkout in EUR
 * request with supplier confirmation and Atlantis approval, tracking + invoices.
 */
const STEPS = [
    { icon: UserCheck, title: 'Create your account', desc: 'Register your business. Our team reviews and activates buyer accounts before trading starts.', href: '/auth/register?role=CUSTOMER', cta: 'Register' },
    { icon: Search, title: 'Discover products', desc: 'Search FMCG products by name, brand, category or EAN barcode across the Atlantis catalog.', href: '/categories', cta: 'Browse catalog' },
    { icon: Layers, title: 'Compare price tiers', desc: 'Every listing shows per-case pricing for case, pallet and truck volumes, so you see what volume unlocks.', href: '/categories?sort=newest', cta: 'See new offers' },
    { icon: ListChecks, title: 'Build your buying list', desc: 'Add products at the tier you need, or list items, quantities and packaging in a sourcing request.', href: '/requests', cta: 'Start a list' },
    { icon: CreditCard, title: 'Order or request a quote', desc: 'Place an order request — nothing is charged. The supplier confirms, Atlantis approves and sends payment details. Or send your list to our desk for a quote.', href: '/requests', cta: 'Request a quote' },
    { icon: Truck, title: 'Track your delivery', desc: 'Follow order status from your dashboard and download invoices for your records.', href: '/dashboard/track', cta: 'Track orders' },
];

const ASSURANCES = [
    { icon: PackageCheck, title: 'Sold & shipped by Atlantis', desc: 'Products are listed and sold by Atlantis directly — one counterparty for every order.' },
    { icon: ShieldCheck, title: 'Confirmed before you pay', desc: 'Suppliers explicitly accept each order and Atlantis approves it before payment. Changed terms need your acceptance.' },
    { icon: FileText, title: 'Clear paperwork', desc: 'Order history and invoices stay available in your dashboard.' },
];

// Desktop roadmap geometry: markers alternate high/low along a gentle wave.
const WAVE_Y = [24, 64, 24, 64, 24, 64];

export default function HowItWorksPage() {
    const [active, setActive] = React.useState(0);

    // Smooth wave through the marker centres (x at column midpoints, 0–600).
    const points = WAVE_Y.map((y, i) => ({ x: 50 + i * 100, y }));
    const path = points.reduce((d, p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = points[i - 1];
        const mx = (prev.x + p.x) / 2;
        return `${d} C ${mx} ${prev.y}, ${mx} ${p.y}, ${p.x} ${p.y}`;
    }, '');

    return (
        <main className="min-h-screen bg-surface text-start">
            {/* Hero */}
            <section className="relative overflow-hidden border-b border-line">
                <div aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #DCE3EA 1px, transparent 0)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(ellipse 55% 70% at 50% 40%, #000 30%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse 55% 70% at 50% 40%, #000 30%, transparent 75%)' }} />
                <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-14 sm:pt-24 sm:pb-20 text-center">
                    <p className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-teal-soft text-[12px] font-semibold text-teal">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6]" /> Buyer journey
                    </p>
                    <h1 className="font-sans mt-5 text-[34px] sm:text-[46px] font-bold tracking-tight text-heading leading-[1.08]">
                        How Atlantis works
                    </h1>
                    <p className="mt-4 text-[16px] sm:text-[18px] text-ink-2 leading-relaxed">
                        A B2B marketplace for FMCG wholesale. Find products, buy at the volume you need, and track every order — from first search to delivery.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link href="/auth/register?role=CUSTOMER" className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[15px] font-semibold transition-colors">
                            Start buying <ArrowRight size={16} />
                        </Link>
                        <Link href="/contact" className="inline-flex items-center h-12 px-6 rounded-xl bg-surface ring-1 ring-[#DCE3EA] hover:ring-ink text-heading text-[15px] font-semibold transition-colors">
                            Talk to sales
                        </Link>
                    </div>
                </div>
            </section>

            {/* Roadmap */}
            <section aria-labelledby="journey-heading" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
                <div className="text-center max-w-2xl mx-auto">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">Six steps</p>
                    <h2 id="journey-heading" className="font-sans mt-2 text-[26px] sm:text-[32px] font-bold tracking-tight text-heading">From first search to delivery</h2>
                </div>

                {/* Desktop: gentle dotted wave */}
                <ol className="hidden lg:grid grid-cols-6 relative mt-16">
                    <svg aria-hidden className="absolute left-0 right-0 top-0 w-full h-[88px] pointer-events-none" viewBox="0 0 600 88" preserveAspectRatio="none">
                        <path d={path} fill="none" stroke="#C7D2DD" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                    {STEPS.map((s, i) => {
                        const on = active === i;
                        return (
                            <li
                                key={s.title}
                                tabIndex={0}
                                onMouseEnter={() => setActive(i)}
                                onFocus={() => setActive(i)}
                                className="relative px-3 text-center outline-none group"
                                aria-current={on ? 'step' : undefined}
                            >
                                <div className="relative mx-auto w-14 h-14" style={{ marginTop: WAVE_Y[i] - 28 }}>
                                    {/* soft glow rising from beneath the marker */}
                                    <span aria-hidden className={cn('absolute -inset-3 rounded-full bg-[radial-gradient(circle_at_50%_70%,rgba(46,196,182,0.35),transparent_70%)] transition-all duration-500', on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2')} />
                                    <span className={cn(
                                        'relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ring-1 group-focus-visible:ring-2 group-focus-visible:ring-[#2EC4B6]',
                                        on ? 'bg-cta text-[#7FE3D9] ring-ink shadow-[0_10px_30px_rgba(11,31,58,0.25)]' : 'bg-surface text-teal ring-[#DCE3EA]'
                                    )}>
                                        <s.icon size={22} />
                                    </span>
                                    <span className={cn('absolute -top-1 -right-1 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ring-2 ring-white transition-colors', on ? 'bg-[#2EC4B6] text-heading' : 'bg-[#EEF2F5] text-ink-2')}>
                                        {i + 1}
                                    </span>
                                </div>
                                <div style={{ marginTop: 88 - WAVE_Y[i] + 4 }}>
                                    <h3 className={cn('font-sans text-[16px] font-bold transition-colors', on ? 'text-heading' : 'text-ink-2')}>{s.title}</h3>
                                    <p className={cn('mt-2 text-[14px] leading-relaxed transition-all duration-300', on ? 'text-ink-2 opacity-100' : 'text-ink-3 opacity-70')}>{s.desc}</p>
                                    <Link href={s.href} tabIndex={on ? 0 : -1} className={cn('mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-teal transition-all duration-300', on ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none')}>
                                        {s.cta} <ArrowRight size={13} />
                                    </Link>
                                </div>
                            </li>
                        );
                    })}
                </ol>

                {/* Mobile / tablet: vertical timeline */}
                <ol className="lg:hidden relative mt-12 max-w-xl mx-auto">
                    <span aria-hidden className="absolute left-[27px] top-4 bottom-4 border-l-2 border-dotted border-[#C7D2DD]" />
                    {STEPS.map((s, i) => {
                        const on = active === i;
                        return (
                            <li key={s.title} tabIndex={0} onFocus={() => setActive(i)} onClick={() => setActive(i)} className="relative flex gap-5 pb-10 last:pb-0 outline-none group">
                                <span className={cn(
                                    'relative z-10 w-14 h-14 rounded-full shrink-0 flex items-center justify-center ring-1 transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-[#2EC4B6]',
                                    on ? 'bg-cta text-[#7FE3D9] ring-ink shadow-[0_8px_24px_rgba(46,196,182,0.35)]' : 'bg-surface text-teal ring-[#DCE3EA]'
                                )}>
                                    <s.icon size={22} />
                                </span>
                                <div className="pt-1.5">
                                    <p className="text-[12px] font-semibold text-teal tabular-nums">Step {i + 1}</p>
                                    <h3 className="font-sans text-[17px] font-bold text-heading">{s.title}</h3>
                                    <p className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">{s.desc}</p>
                                    <Link href={s.href} className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-teal">
                                        {s.cta} <ArrowRight size={13} />
                                    </Link>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </section>

            {/* Assurances */}
            <section className="bg-[#F6F8FA]">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
                    <h2 className="font-sans text-center text-[24px] sm:text-[28px] font-bold tracking-tight text-heading">Built for serious wholesale</h2>
                    <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {ASSURANCES.map((a) => (
                            <div key={a.title} className="text-center">
                                <span className="mx-auto w-12 h-12 rounded-2xl bg-surface ring-1 ring-[#E2E8EE] text-teal flex items-center justify-center"><a.icon size={22} /></span>
                                <h3 className="font-sans mt-4 text-[16px] font-bold text-ink">{a.title}</h3>
                                <p className="mt-1.5 text-[14px] text-ink-3 leading-relaxed">{a.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
                <h2 className="font-sans text-[26px] sm:text-[32px] font-bold tracking-tight text-heading">Ready to source your range?</h2>
                <p className="mt-3 text-[16px] text-ink-2">Open a buyer account, or tell us what you need and we&apos;ll quote it.</p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                    <Link href="/auth/register?role=CUSTOMER" className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[15px] font-semibold transition-colors">
                        Create account <ArrowRight size={16} />
                    </Link>
                    <Link href="/requests" className="inline-flex items-center h-12 px-6 rounded-xl bg-surface ring-1 ring-[#DCE3EA] hover:ring-ink text-heading text-[15px] font-semibold transition-colors">
                        Request a quote
                    </Link>
                </div>
            </section>
        </main>
    );
}
