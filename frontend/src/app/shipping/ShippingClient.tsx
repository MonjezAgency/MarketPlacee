'use client';

import * as React from 'react';
import Link from 'next/link';
import { Globe2, Calculator, ShieldCheck, Receipt, Truck, Warehouse, Clock, PackageSearch, FileWarning, AlertTriangle, Store, Building2 } from 'lucide-react';
import { ButtonLink, Container, CtaBand, Eyebrow, Faq, Pill, Reveal, Section, SectionHeader } from '@/components/ds';

/**
 * Shipping policy. The zone estimates below are the platform's published
 * guidance (unchanged figures); delivery charges come from the server's
 * delivery calculation or are quoted after the order — never invented here.
 */
const ZONES = [
    { zone: 'Romania & EU', min: 3, max: 7, note: 'Standard intra-EU transport' },
    { zone: 'United Kingdom', min: 5, max: 10, note: 'Post-Brexit customs may apply' },
    { zone: 'Other Europe (non-EU)', min: 7, max: 12, note: 'Norway, Switzerland and others' },
    { zone: 'Gulf (UAE, KSA, Kuwait, Qatar)', min: 7, max: 14, note: 'Import duties may apply at destination' },
    { zone: 'Other international', min: 14, max: 21, note: 'Confirmed per order' },
];
const SCALE = 21;

const FACTS = [
    { icon: Globe2, t: 'Destination checked first', d: 'Your delivery country is checked at checkout against where Atlantis delivers.' },
    { icon: Calculator, t: 'Priced from real rates', d: 'Where Atlantis has a rate for your route, the charge is shown before you order. Otherwise it’s quoted after.' },
    { icon: ShieldCheck, t: 'Nothing ships unconfirmed', d: 'Goods move only after the supplier confirmed and Atlantis approved the order — and you accepted any quoted charge.' },
    { icon: Receipt, t: 'Excluding VAT and duties', d: 'Prices exclude VAT (shown on the invoice) and any import duties at destination.' },
];

export default function ShippingClient() {
    return (
        <main className="min-h-screen bg-surface text-start">
            <Section size="md" className="border-b border-line">
                <Container size="content">
                    <Reveal hero className="max-w-2xl">
                        <Eyebrow pill>Policies · Updated October 2026</Eyebrow>
                        <h1 className="mt-5 font-sans text-display-sm sm:text-display text-heading">Shipping policy</h1>
                        <p className="mt-5 text-body sm:text-lead text-ink-2">How delivery works for Atlantis orders: where we deliver, how delivery is priced, how long it usually takes, and what to do if something goes wrong.</p>
                    </Reveal>
                    <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {FACTS.map((f, i) => (
                            <Reveal hero as="li" key={f.t} delay={0.1 + i * 0.06} className="rounded-2xl ring-1 ring-line p-5">
                                <span className="w-10 h-10 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><f.icon size={18} aria-hidden /></span>
                                <h2 className="font-sans mt-4 text-[16px] leading-snug font-semibold text-heading">{f.t}</h2>
                                <p className="mt-1.5 text-body text-ink-2">{f.d}</p>
                            </Reveal>
                        ))}
                    </ul>
                </Container>
            </Section>

            {/* Platform vs product terms */}
            <Section labelledBy="terms-title">
                <Container size="content">
                    <SectionHeader id="terms-title" eyebrow="Two kinds of terms" title="Platform-wide guidance and product terms" lead="This page sets the rules for every order. Each product listing adds terms that belong to that product — read both." />
                    <div className="mt-10 grid gap-4 md:grid-cols-2">
                        <Reveal className="rounded-2xl ring-1 ring-line p-6">
                            <p className="flex items-center gap-2 text-subtitle text-heading"><Building2 size={18} className="text-teal" aria-hidden /> Platform-wide (this page)</p>
                            <ul className="mt-4 space-y-2 text-body text-ink-2 list-disc ps-5 marker:text-ink-4">
                                <li>Which countries Atlantis delivers to</li>
                                <li>How delivery charges are priced and accepted</li>
                                <li>Typical transit times by zone</li>
                                <li>Customs, duties, and what to do about problems</li>
                            </ul>
                        </Reveal>
                        <Reveal delay={0.08} className="rounded-2xl ring-1 ring-line p-6">
                            <p className="flex items-center gap-2 text-subtitle text-heading"><Store size={18} className="text-teal" aria-hidden /> Product-specific (each listing)</p>
                            <ul className="mt-4 space-y-2 text-body text-ink-2 list-disc ps-5 marker:text-ink-4">
                                <li>EXW location — where the goods are dispatched from</li>
                                <li>Lead time before the goods are ready</li>
                                <li>Minimum order and packaging (cases, pallets, trucks)</li>
                                <li>Shelf life and other product details</li>
                            </ul>
                        </Reveal>
                    </div>
                </Container>
            </Section>

            {/* Zones */}
            <Section tone="muted" labelledBy="zones-title">
                <Container size="content">
                    <SectionHeader id="zones-title" eyebrow="Transit times" title="Estimated transit by zone" lead="Estimates in business days from dispatch — not from when you order, and not guarantees. Customs can add time outside Atlantis’s control." />
                    <Reveal className="mt-10 rounded-2xl ring-1 ring-line bg-surface p-5 sm:p-7">
                        <div className="hidden sm:grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6rem] gap-4 pb-3 border-b border-line text-small text-ink-3">
                            <span>Destination</span>
                            <span className="flex justify-between tabular-nums"><span>0</span><span>7</span><span>14</span><span>21 days</span></span>
                            <span className="text-end">Estimate</span>
                        </div>
                        <ul>
                            {ZONES.map((z) => (
                                <li key={z.zone} className="grid gap-2 sm:gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6rem] items-center py-4 border-b border-line last:border-0">
                                    <div>
                                        <p className="text-[15px] font-semibold text-heading">{z.zone}</p>
                                        <p className="text-small text-ink-3">{z.note}</p>
                                    </div>
                                    <div className="relative h-2.5 rounded-full bg-surface-3" aria-hidden>
                                        <span className="absolute inset-y-0 rounded-full bg-[#2EC4B6]" style={{ left: `${(z.min / SCALE) * 100}%`, width: `${((z.max - z.min) / SCALE) * 100}%` }} />
                                    </div>
                                    <p className="sm:text-end text-[15px] font-semibold tabular-nums text-heading">{z.min}–{z.max} days</p>
                                </li>
                            ))}
                        </ul>
                    </Reveal>
                    <p className="mt-4 text-small text-ink-3">Whether Atlantis delivers to your country is checked at checkout; a zone listed here isn’t a promise of delivery to every country in it. See <Link href="/warehouses" className="font-medium text-teal hover:underline">where Atlantis delivers</Link>.</p>
                </Container>
            </Section>

            {/* Pricing and methods */}
            <Section labelledBy="price-title">
                <Container size="content" className="grid gap-12 lg:grid-cols-2">
                    <Reveal>
                        <Eyebrow>Delivery charges</Eyebrow>
                        <h2 id="price-title" className="mt-3 font-sans text-title-sm sm:text-title text-heading">How delivery is priced</h2>
                        <ol className="mt-6 space-y-5">
                            {[
                                ['Configured rate', 'Where Atlantis has a rate for your route, the delivery charge is calculated from it and shown at checkout, with what it’s based on (per pallet, per truck).'],
                                ['Quoted after the order', 'Where there’s no rate yet, delivery is quoted by Atlantis after the order. Nothing is added until you accept it as part of the confirmed terms.'],
                                ['What the price depends on', 'Destination, weight and volume (cases, pallets or a full truck) and the carrier booked for your route.'],
                            ].map(([t, d], i) => (
                                <li key={t} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                                    <span className="w-8 h-8 rounded-full ring-1 ring-line-strong text-[14px] font-semibold text-heading flex items-center justify-center tabular-nums">{i + 1}</span>
                                    <div><p className="text-[16px] font-semibold text-heading">{t}</p><p className="mt-1 text-body text-ink-2">{d}</p></div>
                                </li>
                            ))}
                        </ol>
                        <p className="mt-6 text-body text-ink-2">Atlantis books a carrier for each order — for example DB Schenker, LKW Walter, Raben or DHL — depending on the route.</p>
                    </Reveal>
                    <Reveal delay={0.08}>
                        <Eyebrow>Delivery methods</Eyebrow>
                        <h2 className="mt-3 font-sans text-title-sm sm:text-title text-heading">Who moves the goods</h2>
                        <div className="mt-6 space-y-4">
                            <div className="rounded-2xl ring-1 ring-line p-5">
                                <p className="flex items-center justify-between gap-3 text-[16px] font-semibold text-heading"><span className="flex items-center gap-2"><Truck size={18} className="text-teal" aria-hidden /> Atlantis arranges collection</span><Pill tone="success">Available</Pill></p>
                                <p className="mt-2 text-body text-ink-2">A carrier booked by Atlantis collects from the supplier’s EXW location and delivers to you. Responsibility passes at collection.</p>
                            </div>
                            <div className="rounded-2xl ring-1 ring-line p-5">
                                <p className="flex items-center justify-between gap-3 text-[16px] font-semibold text-heading"><span className="flex items-center gap-2"><Warehouse size={18} className="text-teal" aria-hidden /> Via an Atlantis hub</span><Pill>When a hub is verified</Pill></p>
                                <p className="mt-2 text-body text-ink-2">The supplier delivers to a verified Atlantis hub and Atlantis ships onward. Available only where a verified hub exists — see <Link href="/warehouses" className="font-medium text-teal hover:underline">Warehouses</Link>.</p>
                            </div>
                        </div>
                    </Reveal>
                </Container>
            </Section>

            {/* Processing, tracking, customs */}
            <Section tone="muted">
                <Container size="content">
                    <ul className="grid gap-4 md:grid-cols-3">
                        {[
                            { icon: Clock, t: 'Processing time', d: 'After your order is confirmed and payment is received, Atlantis has up to 48 business hours to begin processing it. Preparing the goods (picking, packing, dispatch) is separate from transit and follows the lead time on each product.' },
                            { icon: PackageSearch, t: 'Tracking', d: <>When the order is marked shipped, its status updates in your account and you get an email. A tracking number appears on the order once the carrier reference is added. Go to <Link href="/dashboard/customer/orders" className="font-medium text-teal hover:underline">Orders &amp; tracking</Link>.</> },
                            { icon: FileWarning, t: 'Customs and duties', d: 'For destinations outside the EU, or with import restrictions, customs duties, taxes or fees may be charged at destination. They are the buyer’s responsibility and not included in Atlantis prices.' },
                        ].map((c, i) => (
                            <Reveal as="li" key={c.t} delay={i * 0.06} className="rounded-2xl bg-surface ring-1 ring-line p-6">
                                <span className="w-10 h-10 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><c.icon size={18} aria-hidden /></span>
                                <h2 className="font-sans mt-4 text-subtitle text-heading">{c.t}</h2>
                                <p className="mt-2 text-body text-ink-2">{c.d}</p>
                            </Reveal>
                        ))}
                    </ul>
                </Container>
            </Section>

            {/* Problems */}
            <Section labelledBy="issues-title">
                <Container size="content">
                    <SectionHeader id="issues-title" eyebrow="If something goes wrong" title="Late, damaged or not as ordered" />
                    <Reveal className="mt-8 rounded-2xl ring-1 ring-[#FDE68A] bg-[#FFFBEB] p-5 sm:p-6 flex gap-3">
                        <AlertTriangle size={20} className="text-[#B45309] shrink-0 mt-0.5" aria-hidden />
                        <ul className="space-y-2 text-body text-[#78350F]">
                            <li><strong>Don’t confirm delivery</strong> if goods are damaged, missing or different from the confirmed order.</li>
                            <li>Report it from your order page within <strong>7 days</strong>, with photos of the damage or difference.</li>
                            <li>For urgent matters, email <a href="mailto:Info@atlantisfmcg.com" className="font-semibold underline">Info@atlantisfmcg.com</a>.</li>
                        </ul>
                    </Reveal>
                    <p className="mt-4 text-body text-ink-2">Where an inspection was arranged, its report is the basis for resolving the issue. See <Link href="/goods-inspection" className="font-medium text-teal hover:underline">Goods Inspection</Link> and <Link href="/returns" className="font-medium text-teal hover:underline">Returns &amp; Refunds</Link>.</p>
                </Container>
            </Section>

            <Section tone="muted" labelledBy="faq-title">
                <Container>
                    <SectionHeader id="faq-title" align="center" title="Shipping questions" />
                    <Faq className="mt-10" items={[
                        { q: 'Why isn’t the delivery charge shown at checkout?', a: 'Atlantis hasn’t configured a rate for your route yet, so delivery is quoted after the order. You accept the quote before anything ships.' },
                        { q: 'Can the delivery charge change after I order?', a: 'Only as a new version of the confirmed terms, which you see and accept before shipping.' },
                        { q: 'Are the transit times guaranteed?', a: 'No. They are typical times from dispatch. Customs and route conditions can add time.' },
                        { q: 'Can I collect the goods myself?', a: 'Ask the team before you order. Where self-collection from the EXW location is possible, it is agreed per order.' },
                    ]} />
                </Container>
            </Section>

            <CtaBand title="Shipping question not answered here?" lead="Tell us the products, quantities and destination — we’ll answer for your route.">
                <ButtonLink href="/contact">Contact the team</ButtonLink>
                <ButtonLink href="/returns" variant="secondary">Returns & Refunds</ButtonLink>
            </CtaBand>
        </main>
    );
}
