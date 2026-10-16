'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { Check, ScanLine, CalendarClock, Boxes, PackageX, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ButtonLink, Container, CtaBand, Eyebrow, Faq, Frame, Pill, Reveal, Section, SectionHeader, TrustNav } from '@/components/ds';
import { InspectionReport } from '@/components/orders/InspectionReport';
import type { Inspection } from '@/lib/order-workflow';

// ── Hero: products on a scan plane. Below the moving line they read as "checked". ──
function Products({ tone }: { tone: 'ink' | 'clear' }) {
    const fill = tone === 'ink' ? 'rgb(var(--atl-heading))' : '#fff';
    return (
        <svg viewBox="0 0 320 200" className="absolute inset-0 w-full h-full" aria-hidden>
            <g style={{ fill }}>
                {/* bottle */}
                <path d="M86 60h16v14c10 6 16 16 16 28v64a6 6 0 0 1-6 6H76a6 6 0 0 1-6-6v-64c0-12 6-22 16-28z" />
                <rect x="84" y="50" width="20" height="12" rx="3" />
                {/* carton */}
                <rect x="132" y="66" width="84" height="106" rx="5" />
                {/* tube */}
                <path d="M228 84h50l-8 82a6 6 0 0 1-6 6h-22a6 6 0 0 1-6-6z" />
                <rect x="226" y="76" width="54" height="10" rx="3" />
            </g>
        </svg>
    );
}

function ScanHero() {
    return (
        <Frame className="aspect-[16/11] bg-surface">
            <div aria-hidden className="absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(var(--atl-line)) 1px, transparent 0)', backgroundSize: '18px 18px' }} />
            {/* viewfinder corners */}
            {['top-3 start-3 border-t-2 border-s-2', 'top-3 end-3 border-t-2 border-e-2', 'bottom-3 start-3 border-b-2 border-s-2', 'bottom-3 end-3 border-b-2 border-e-2'].map((c) => <span key={c} aria-hidden className={cn('absolute w-5 h-5 border-[#2EC4B6]', c)} />)}
            <div className="absolute inset-x-[8%] top-[6%] bottom-[34%] sm:bottom-[24%]">
                <Products tone="ink" />
                <div className="absolute inset-0 animate-atl-scan-clip" style={{ clipPath: 'inset(45% 0 0 0)' }}>
                    <div className="absolute inset-0 bg-gradient-to-b from-[#2EC4B6]/25 to-[#2EC4B6]/5" />
                    <Products tone="clear" />
                </div>
                <span aria-hidden className="absolute inset-x-0 h-0.5 bg-[#2EC4B6] shadow-[0_0_18px_rgba(46,196,182,0.8)] animate-atl-scan-line" style={{ top: '45%' }} />
            </div>
            <div className="absolute bottom-4 inset-x-4 flex flex-wrap justify-center gap-2">
                <Pill tone="success" icon={<Check size={12} aria-hidden />}>EAN matched</Pill>
                <Pill tone="success" icon={<Check size={12} aria-hidden />}>48 / 48 cartons</Pill>
                <Pill tone="warning">BBD 08/2026</Pill>
            </div>
        </Frame>
    );
}

// ── "You'd find this later" illustrations, built from UI parts ──
function Barcode() {
    const bars = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2];
    return <div className="flex h-12 items-stretch gap-[2px] px-3 py-2 rounded-lg ring-1 ring-line bg-surface">{bars.map((b, i) => <span key={i} className="bg-heading" style={{ width: b * 1.5 }} />)}</div>;
}
const ILLUSTRATIONS: Record<string, React.ReactNode> = {
    ean: (
        <div className="w-full max-w-[16rem] rounded-2xl bg-surface ring-1 ring-line shadow-float p-4">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold text-heading"><ScanLine size={15} className="text-teal" aria-hidden /> EAN check</p>
            <div className="mt-3"><Barcode /></div>
            <dl className="mt-3 grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 text-small font-mono">
                <dt className="font-sans text-ink-3">Order</dt><dd className="text-ink">5410076123455</dd><span />
                <dt className="font-sans text-ink-3">Scanned</dt><dd className="text-[#B45309]">5410076123456</dd><X size={14} className="text-[#B45309]" aria-hidden />
            </dl>
        </div>
    ),
    date: (
        <div className="w-full max-w-[16rem] rounded-2xl bg-surface ring-1 ring-line shadow-float p-4">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold text-heading"><CalendarClock size={15} className="text-teal" aria-hidden /> Best-before</p>
            <p className="mt-2 text-title font-semibold tabular-nums text-heading">08 / 2026 <span className="text-small font-normal text-ink-3">BBD</span></p>
            <div className="mt-3 h-1.5 rounded-full bg-surface-3"><div className="h-full w-1/4 rounded-full bg-[#F59E0B]" /></div>
            <div className="mt-1.5 flex justify-between text-small text-ink-3"><span>now</span><span>12 months required</span></div>
        </div>
    ),
    cartons: (
        <div className="w-full max-w-[16rem] rounded-2xl bg-surface ring-1 ring-line shadow-float p-4">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold text-heading"><Boxes size={15} className="text-teal" aria-hidden /> Carton count</p>
            <div className="mt-3 grid grid-cols-8 gap-1">
                {Array.from({ length: 48 }).map((_, i) => <span key={i} className={cn('aspect-square rounded-[3px]', i === 21 || i === 38 ? 'ring-1 ring-dashed ring-[#F59E0B] bg-[#FFFBEB]' : 'bg-surface-3 ring-1 ring-line')} />)}
            </div>
            <p className="mt-2 text-small text-ink-3 flex justify-between"><span>Counted per layer</span><span className="tabular-nums text-[#B45309] font-medium">46 / 48</span></p>
        </div>
    ),
    condition: (
        <div className="w-full max-w-[16rem] rounded-2xl bg-surface ring-1 ring-line shadow-float p-4">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold text-heading"><PackageX size={15} className="text-teal" aria-hidden /> Condition</p>
            <svg viewBox="0 0 200 90" className="mt-3 w-full" aria-hidden>
                <rect x="20" y="20" width="70" height="56" rx="4" style={{ fill: 'rgb(var(--atl-surface-3))', stroke: 'rgb(var(--atl-line-strong))' }} />
                <path d="M110 20h70v56h-70z" style={{ fill: '#FFFBEB', stroke: '#F59E0B' }} strokeDasharray="4 3" />
                <path d="M118 30l18 14-10 8 22 16" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-1 text-small text-ink-3 flex justify-between"><span>Photographed</span><span className="text-[#B45309] font-medium">2 crushed</span></p>
        </div>
    ),
};
const ISSUES = [
    { key: 'ean', title: 'Barcode mismatch', desc: 'The scanned barcode doesn’t match the confirmed order — often another market’s version or a different pack size.' },
    { key: 'date', title: 'Short best-before date', desc: 'Remaining shelf life falls below what was offered. Dates are read from sampled cartons across the pallet, not only the top layer.' },
    { key: 'cartons', title: 'Missing cartons', desc: 'Fewer cartons than confirmed. Every layer is counted per line, not estimated from the top.' },
    { key: 'condition', title: 'Damaged packaging', desc: 'Crushed, wet or opened cartons are photographed and noted against the shipment.' },
];

// ── A statement that lights up word by word as it scrolls past ──
function Word({ w, progress, range }: { w: string; progress: MotionValue<number>; range: [number, number] }) {
    const opacity = useTransform(progress, range, [0.18, 1]);
    return <motion.span style={{ opacity }}>{w} </motion.span>;
}
function Statement({ text }: { text: string }) {
    const ref = React.useRef<HTMLParagraphElement>(null);
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
    const words = text.split(' ');
    if (reduce) return <p ref={ref} className="font-sans text-title-sm sm:text-title text-heading">{text}</p>;
    return (
        <p ref={ref} className="font-sans text-title-sm sm:text-title text-heading">
            {words.map((w, i) => <Word key={i} w={w} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} />)}
        </p>
    );
}

// ── Accept, adjust or reject ──
const OUTCOMES = [
    { key: 'adjust', title: 'Accept with an adjustment', desc: 'Keep goods with a minor issue — for example shorter dates — at a price agreed with you and the supplier.', art: (
        <svg viewBox="0 0 120 80" className="w-28 h-20" aria-hidden><path d="M30 28l30-14 30 14v32l-30 14-30-14z" fill="none" style={{ stroke: 'rgb(var(--atl-ink-3))' }} strokeWidth="1.6" /><path d="M30 28l30 14 30-14M60 42v32" fill="none" style={{ stroke: 'rgb(var(--atl-ink-3))' }} strokeWidth="1.6" /><circle cx="86" cy="58" r="11" style={{ fill: 'rgb(var(--atl-surface))', stroke: 'rgb(var(--atl-teal))' }} strokeWidth="1.6" /><text x="86" y="62" textAnchor="middle" fontSize="11" fontWeight="700" style={{ fill: 'rgb(var(--atl-teal))' }}>%</text></svg>
    ) },
    { key: 'partial', title: 'Partial acceptance', desc: 'Keep the lines or cartons that pass and pay only for those. What happens to the rest is settled with the supplier.', art: (
        <svg viewBox="0 0 120 80" className="w-28 h-20" aria-hidden>{[0, 1].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={26 + c * 24} y={14 + r * 26} width="20" height="22" rx="3" fill="none" style={{ stroke: 'rgb(var(--atl-ink-3))' }} strokeWidth="1.6" />))}<rect x="78" y="14" width="20" height="22" rx="3" fill="none" style={{ stroke: 'rgb(var(--atl-line-strong))' }} strokeDasharray="3 3" strokeWidth="1.6" /><rect x="78" y="40" width="20" height="22" rx="3" fill="none" style={{ stroke: 'rgb(var(--atl-line-strong))' }} strokeDasharray="3 3" strokeWidth="1.6" /></svg>
    ) },
    { key: 'reject', title: 'Reject', desc: 'Goods that don’t match the confirmed order are rejected and the order or the affected line is cancelled. Any refund is arranged by the team.', art: (
        <svg viewBox="0 0 120 80" className="w-28 h-20" aria-hidden><path d="M30 28l30-14 30 14v32l-30 14-30-14z" fill="none" style={{ stroke: 'rgb(var(--atl-ink-3))' }} strokeWidth="1.6" /><path d="M30 28l30 14 30-14M60 42v32" fill="none" style={{ stroke: 'rgb(var(--atl-ink-3))' }} strokeWidth="1.6" /><circle cx="86" cy="58" r="11" style={{ fill: 'rgb(var(--atl-surface))', stroke: '#B91C1C' }} strokeWidth="1.6" /><path d="M81 58a5 5 0 1 0 2-4m-2-2v3h3" fill="none" stroke="#B91C1C" strokeWidth="1.6" strokeLinecap="round" /></svg>
    ) },
];

function Outcomes() {
    const [pick, setPick] = React.useState('adjust');
    return (
        <div role="radiogroup" aria-label="Possible outcomes" className="mt-10 grid gap-4 md:grid-cols-3">
            {OUTCOMES.map((o, i) => {
                const on = pick === o.key;
                return (
                    <Reveal key={o.key} delay={i * 0.06}>
                        <button type="button" role="radio" aria-checked={on} onClick={() => setPick(o.key)}
                            className={cn('w-full h-full text-start rounded-2xl ring-1 bg-surface p-5 transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]', on ? 'ring-2 ring-heading shadow-float' : 'ring-line hover:shadow-card')}>
                            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center ring-1 transition-colors duration-150', on ? 'bg-heading ring-heading text-white' : 'ring-line-strong text-transparent')}><Check size={14} aria-hidden /></span>
                            <span className="mt-4 flex justify-center rounded-xl bg-surface-2 py-6">{o.art}</span>
                            <span className="mt-5 block text-subtitle text-heading">{o.title}</span>
                            <span className="mt-2 block text-body text-ink-2">{o.desc}</span>
                        </button>
                    </Reveal>
                );
            })}
        </div>
    );
}

/** Illustrative only — rendered with the same component as real reports, clearly labelled. */
const SAMPLE: Inspection = {
    id: 'sample', status: 'PASSED_WITH_FINDINGS', inspectedAt: '2026-09-14T09:00:00.000Z', inspectorName: 'Inspector name', hubId: null,
    lines: [
        { itemId: 'a', name: 'Chocolate wafer bars 45 g', ordered: 2, received: 2, unit: 'pallet' },
        { itemId: 'b', name: 'Instant coffee 200 g jar', ordered: 1, received: 1, unit: 'pallet' },
    ],
    findings: [
        { type: 'DATE', itemId: 'b', name: 'Instant coffee 200 g jar', note: 'Best-before 03/2027 on 4 sampled cartons; the offer stated at least 12 months remaining.' },
        { type: 'CONDITION', itemId: 'a', name: 'Chocolate wafer bars 45 g', note: 'Two cartons crushed on the top layer of pallet 2 (photographed).' },
    ],
    photos: [], resolution: 'ACCEPTED_WITH_DISCOUNT', resolutionNote: 'Buyer accepted both pallets; the two damaged cartons were deducted on the invoice.',
    createdAt: '2026-09-14T09:00:00.000Z', updatedAt: '2026-09-14T09:00:00.000Z',
};

export default function GoodsInspectionClient() {
    return (
        <main className="min-h-screen bg-surface text-start">
            {/* Hero */}
            <Section className="border-b border-line">
                <Container className="grid gap-10 lg:gap-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center">
                    <Reveal hero><ScanHero /></Reveal>
                    <Reveal hero delay={0.08}>
                        <Eyebrow pill>Goods inspection</Eyebrow>
                        <h1 className="mt-5 font-sans text-display-sm sm:text-display text-heading">Checking every box</h1>
                        <p className="mt-5 max-w-xl text-body sm:text-lead text-ink-2">When Atlantis arranges an inspection for your order, the goods are checked against the confirmed order — quantity, barcodes, dates and condition — and documented before the order moves on.</p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <ButtonLink href="#sample-report" arrow={false}>See a sample report</ButtonLink>
                            <ButtonLink href="/contact" variant="secondary">Ask about an inspection</ButtonLink>
                        </div>
                    </Reveal>
                </Container>
                <Container className="mt-14 sm:mt-16">
                    <ul className="grid gap-8 sm:grid-cols-3">
                        {[
                            { t: 'Checked against your order', d: 'Barcodes, quantities, dates and condition — against the confirmed terms, line by line.' },
                            { t: 'Clear outcomes', d: 'If something doesn’t match, you decide with Atlantis: accept, adjust or reject. Nothing is decided for you.' },
                            { t: 'Everything documented', d: 'Findings, photos, the date and the inspector are recorded on the order itself.' },
                        ].map((b, i) => (
                            <Reveal as="li" key={b.t} delay={i * 0.08} className="text-center">
                                <span className="mx-auto w-7 h-7 rounded-full bg-[#10B981] text-white flex items-center justify-center"><Check size={15} aria-hidden /></span>
                                <h2 className="font-sans mt-3 text-subtitle text-heading">{b.t}</h2>
                                <p className="mt-1.5 mx-auto max-w-xs text-body text-ink-2">{b.d}</p>
                            </Reveal>
                        ))}
                    </ul>
                </Container>
            </Section>

            <Section>
                <Container size="prose">
                    <p className="flex gap-3 rounded-2xl ring-1 ring-line bg-teal-soft/50 p-5 text-body text-ink-2">
                        <Info size={18} className="text-teal shrink-0 mt-0.5" aria-hidden />
                        <span>Inspection is arranged per order — it isn’t included automatically. Ask before you order: the team confirms whether it’s possible for your route, where it would happen and what it costs, before anything is booked.</span>
                    </p>
                </Container>
            </Section>

            {/* What you'd find later */}
            <Section tone="muted" labelledBy="later-title">
                <Container>
                    <SectionHeader id="later-title" title="Without an inspection, you’d find this later" lead="You open the pallet. You count the cartons. You find the problem — after it has arrived." />
                    <ul className="mt-10 sm:mt-12 grid gap-4 md:grid-cols-2">
                        {ISSUES.map((it, i) => (
                            <Reveal as="li" key={it.key} delay={(i % 2) * 0.08} className="rounded-3xl ring-1 ring-line bg-surface overflow-hidden">
                                <div className="flex items-center justify-center bg-surface-2 px-6 py-10 sm:py-12">{ILLUSTRATIONS[it.key]}</div>
                                <div className="p-6 border-t border-line">
                                    <h3 className="font-sans text-subtitle text-heading">{it.title}</h3>
                                    <p className="mt-2 text-body text-ink-2">{it.desc}</p>
                                </div>
                            </Reveal>
                        ))}
                    </ul>
                </Container>
            </Section>

            <Section size="lg">
                <Container size="content">
                    <Statement text="Where an inspection is arranged, every line is counted, every barcode is read, and every finding is written down — before the order moves on. If the goods don’t match what you confirmed, you decide what happens next." />
                </Container>
            </Section>

            {/* Outcomes */}
            <Section tone="muted" labelledBy="outcomes-title">
                <Container size="content">
                    <SectionHeader id="outcomes-title" eyebrow="Resolution" title="Accept, adjust or reject" lead="If an order doesn’t match what you confirmed, you choose how to resolve it with Atlantis and the supplier. The outcome is recorded on the order; refunds and adjustments are arranged by the team, not automatically." />
                    <Outcomes />
                </Container>
            </Section>

            {/* Checklist */}
            <Section labelledBy="check-title">
                <Container size="content">
                    <SectionHeader id="check-title" eyebrow="The checklist" title="What is checked, and how it’s recorded" />
                    <Reveal className="mt-10 overflow-x-auto rounded-2xl ring-1 ring-line">
                        <table className="w-full min-w-[600px] text-[14.5px]">
                            <thead><tr className="border-b border-line text-small text-ink-3"><th className="text-start font-medium px-5 py-3">Check</th><th className="text-start font-medium px-5 py-3">What the inspector does</th><th className="text-start font-medium px-5 py-3">On the report</th></tr></thead>
                            <tbody>
                                {[
                                    ['EAN and variant', 'Scans units and cartons; compares flavour, size and language version with the confirmed line', 'Finding: barcode / variant'],
                                    ['Quantities and cartons', 'Counts cartons per line and layer; checks units per carton', 'Ordered vs received, per line'],
                                    ['Best-before dates', 'Reads dates on sampled cartons across the pallet', 'Finding: date, with what was found'],
                                    ['Packaging condition', 'Notes crushed, wet or opened cartons and damaged pallets', 'Finding: condition, with photos'],
                                ].map(([a, b, c]) => (
                                    <tr key={a} className="border-b border-line last:border-0 align-top">
                                        <th scope="row" className="text-start px-5 py-3.5 font-semibold text-heading">{a}</th>
                                        <td className="px-5 py-3.5 text-ink-2">{b}</td>
                                        <td className="px-5 py-3.5 text-ink-2">{c}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Reveal>
                </Container>
            </Section>

            {/* Sample report */}
            <Section id="sample-report" tone="muted" labelledBy="report-title">
                <Container className="grid gap-10 lg:grid-cols-2 items-center">
                    <Reveal>
                        <p className="text-small text-ink-3 italic">FMCG <span className="not-italic">/ˌɛf ɛm siː ˈdʒiː/</span></p>
                        <h2 id="report-title" className="mt-2 font-sans text-title-sm sm:text-title text-heading">Fast-moving, <mark className="bg-[#2EC4B6]/25 text-heading rounded px-1">checked</mark> goods.</h2>
                        <p className="mt-4 max-w-xl text-body sm:text-lead text-ink-2">The report sits on the order itself, so you, the supplier and Atlantis work from the same facts. You get a notification when it’s added.</p>
                        <ul className="mt-6 space-y-2.5 text-body text-ink-2">
                            {['Ordered and received quantity for every line', 'Each finding by type — barcode, quantity, date or condition', 'Photos, the inspection date and who inspected', 'The agreed outcome and a note explaining it'].map((t) => (
                                <li key={t} className="flex gap-2.5"><Check size={17} className="text-teal shrink-0 mt-1" aria-hidden /> {t}</li>
                            ))}
                        </ul>
                        <div className="mt-8"><ButtonLink href="/contact">Request an inspection</ButtonLink></div>
                    </Reveal>
                    <Reveal delay={0.08} className="relative">
                        <span className="absolute -top-3 start-5 z-10"><Pill className="bg-heading text-white ring-heading">Example — illustrative, not a real order</Pill></span>
                        <div className="shadow-float rounded-2xl"><InspectionReport inspection={SAMPLE} /></div>
                    </Reveal>
                </Container>
            </Section>

            <Section labelledBy="faq-title">
                <Container>
                    <SectionHeader id="faq-title" align="center" title="Questions about inspection" />
                    <Faq className="mt-10" items={[
                        { q: 'Is every order inspected?', a: 'No. An inspection is arranged for an order when you ask for it and the team confirms it can be done for that route. Orders without one show no report.' },
                        { q: 'Who carries out the inspection?', a: 'The inspector’s name is recorded on the report. Whether it is the Atlantis team or an inspection partner is confirmed with you when it is arranged.' },
                        { q: 'Where does it happen?', a: <>It’s agreed per order — for example at the supplier’s dispatch location before collection, or at an Atlantis hub that offers inspection. See <Link href="/warehouses" className="font-medium text-teal hover:underline">Warehouses</Link>.</> },
                        { q: 'What does it cost?', a: 'If an inspection has a cost, it is agreed with you before it is booked. It is never added to an order without your agreement.' },
                        { q: 'Does an inspection guarantee every unit?', a: 'No. It records what was checked on the day, usually on sampled cartons. It is the evidence for resolving an issue, not a guarantee.' },
                        { q: 'I found a problem and there was no inspection. What now?', a: <>Don’t confirm delivery; report the issue with photos from your order page or via <Link href="/contact" className="font-medium text-teal hover:underline">Contact</Link>, and the team works it out with the supplier.</> },
                    ]} />
                </Container>
            </Section>

            <CtaBand eyebrow="Before it ships" title="Want an order inspected?" lead="Tell us the products, quantities and route. We’ll confirm what’s possible before you order.">
                <ButtonLink href="/contact">Contact the team</ButtonLink>
                <ButtonLink href="/protected-payments" variant="secondary">How orders are confirmed</ButtonLink>
            </CtaBand>
            <TrustNav current="inspection" />
        </main>
    );
}
