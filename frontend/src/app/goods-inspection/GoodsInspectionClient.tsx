'use client';

import * as React from 'react';
import Link from 'next/link';
import { Barcode, Boxes, CalendarClock, PackageX, ScanLine, CheckCircle2, Percent, SplitSquareHorizontal, XCircle, Undo2, Info } from 'lucide-react';
import { Faq, PrimaryLink, SecondaryLink, SectionHead, TrustCta, TrustHero, TrustNav } from '@/components/trust/TrustBlocks';
import { InspectionReport } from '@/components/orders/InspectionReport';
import type { Inspection } from '@/lib/order-workflow';

const CHECKS = [
    { icon: Barcode, title: 'EAN & variant', desc: 'The barcode on units and cartons matches the listing, and the flavour, size or language version is the one you ordered.' },
    { icon: Boxes, title: 'Quantities & cartons', desc: 'Cartons, units per carton and pallets are counted against the confirmed order.' },
    { icon: CalendarClock, title: 'Best-before dates', desc: 'Dates are read from a sample of cartons and compared with the remaining shelf life you were offered.' },
    { icon: ScanLine, title: 'Packaging condition', desc: 'Crushed, wet or open cartons, broken shrink-wrap and damaged pallets are noted and photographed.' },
];

const EXAMPLES = [
    { icon: Barcode, title: 'Barcode mismatch', found: 'Cartons carry a different EAN from the listing — for example an export version for another market.', next: 'The line is held while Atlantis checks with the supplier whether it is the same product. You decide whether to accept it.' },
    { icon: CalendarClock, title: 'Short-dated goods', found: 'Best-before dates are earlier than the shelf life stated when the order was confirmed.', next: 'A price adjustment, a partial acceptance or a rejection of that line is discussed with you and the supplier.' },
    { icon: Boxes, title: 'Missing cartons', found: 'Fewer cartons than the confirmed quantity — counted per line.', next: 'The shortfall is recorded per line. You agree with Atlantis whether you pay only for what arrived or the missing cartons follow later.' },
    { icon: PackageX, title: 'Damaged packaging', found: 'Crushed or open cartons, with photos of each affected pallet.', next: 'Damaged units are separated where possible; the outcome for them is agreed before the rest is released.' },
];

const OUTCOMES = [
    { icon: CheckCircle2, title: 'Accept', desc: 'Everything matches the confirmed order. The order continues as agreed.' },
    { icon: Percent, title: 'Accept with a price adjustment', desc: 'You keep goods with a minor issue (for example shorter dates) at a price agreed with you and the supplier.' },
    { icon: SplitSquareHorizontal, title: 'Partial acceptance', desc: 'You keep the lines or cartons that pass and aren’t charged for the rest. What happens to those goods is settled with the supplier.' },
    { icon: XCircle, title: 'Rejection', desc: 'Goods that don’t match the order are rejected. The order or the affected line is cancelled.' },
    { icon: Undo2, title: 'Refunds', desc: 'If you already paid for goods you don’t accept, the Atlantis team arranges the refund under the confirmed terms. Refunds are handled by the team — not automatically.' },
];

/** Illustrative only — rendered with the same component as real reports, clearly labelled. */
const SAMPLE: Inspection = {
    id: 'sample', status: 'PASSED_WITH_FINDINGS', inspectedAt: '2026-09-14T09:00:00.000Z', inspectorName: 'Inspector name', hubId: null,
    lines: [
        { itemId: 'a', name: 'Chocolate wafer bars 45 g', ordered: 2, received: 2, unit: 'pallet' },
        { itemId: 'b', name: 'Instant coffee 200 g jar', ordered: 1, received: 1, unit: 'pallet' },
    ],
    findings: [
        { type: 'DATE', itemId: 'b', name: 'Instant coffee 200 g jar', note: 'Best-before 03/2027 on 4 sampled cartons; offer stated at least 12 months remaining.' },
        { type: 'CONDITION', itemId: 'a', name: 'Chocolate wafer bars 45 g', note: 'Two cartons crushed on the top layer of pallet 2 (photographed).' },
    ],
    photos: [], resolution: 'ACCEPTED_WITH_DISCOUNT', resolutionNote: 'Buyer accepted both pallets; price of the two damaged cartons deducted on the invoice.',
    createdAt: '2026-09-14T09:00:00.000Z', updatedAt: '2026-09-14T09:00:00.000Z',
};

export default function GoodsInspectionClient() {
    return (
        <main className="min-h-screen bg-surface text-start">
            <TrustHero eyebrow="Goods inspection" title="Know what arrived before you accept it"
                lead="When Atlantis arranges an inspection for your order, the goods are checked against the confirmed order — barcodes, quantities, dates and condition — and the report is added to your order page.">
                <PrimaryLink href="/contact">Ask about inspection for an order</PrimaryLink>
                <SecondaryLink href="/protected-payments">How orders are confirmed</SecondaryLink>
            </TrustHero>

            <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10">
                <p className="max-w-3xl mx-auto flex gap-2.5 rounded-2xl bg-teal-soft/50 ring-1 ring-line p-4 text-[14px] text-ink-2">
                    <Info size={17} className="text-teal shrink-0 mt-0.5" />
                    <span>Inspection is arranged per order, not included automatically. Ask before you order: the team confirms whether an inspection is possible for your route, where it would happen and what it costs — before anything is booked.</span>
                </p>
            </section>

            <section aria-labelledby="checks" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
                <SectionHead id="checks" eyebrow="The checklist" title="What an inspection checks" lead="Each check is recorded line by line against the order you and the supplier confirmed." />
                <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {CHECKS.map((c) => (
                        <div key={c.title} className="rounded-2xl ring-1 ring-line p-5">
                            <span className="w-11 h-11 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><c.icon size={20} /></span>
                            <h3 className="font-sans mt-4 text-[16px] font-bold text-heading">{c.title}</h3>
                            <p className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">{c.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section aria-labelledby="examples" className="bg-[#F6F8FA]">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
                    <SectionHead id="examples" eyebrow="Real situations" title="What inspections catch" lead="Typical issues in FMCG wholesale, and how they are handled." />
                    <div className="mt-10 grid gap-4 md:grid-cols-2">
                        {EXAMPLES.map((e) => (
                            <article key={e.title} className="rounded-2xl bg-surface ring-1 ring-line p-5 sm:p-6">
                                <div className="flex items-center gap-3">
                                    <span className="w-10 h-10 rounded-xl bg-[#FFFBEB] text-[#B45309] flex items-center justify-center"><e.icon size={18} /></span>
                                    <h3 className="font-sans text-[17px] font-bold text-heading">{e.title}</h3>
                                </div>
                                <dl className="mt-4 space-y-3 text-[14px]">
                                    <div><dt className="font-semibold text-ink">What the inspector records</dt><dd className="mt-0.5 text-ink-2 leading-relaxed">{e.found}</dd></div>
                                    <div><dt className="font-semibold text-ink">What happens next</dt><dd className="mt-0.5 text-ink-2 leading-relaxed">{e.next}</dd></div>
                                </dl>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section aria-labelledby="report" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
                <div className="grid gap-10 lg:grid-cols-2 items-center">
                    <div>
                        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">The report</p>
                        <h2 id="report" className="font-sans mt-2 text-[24px] sm:text-[30px] font-bold tracking-tight text-heading">One report, on your order</h2>
                        <p className="mt-3 text-[15px] text-ink-2 leading-relaxed">The inspection is recorded on the order itself, so you, the supplier and Atlantis all work from the same facts:</p>
                        <ul className="mt-4 space-y-2 text-[14px] text-ink-2">
                            <li className="flex gap-2"><CheckCircle2 size={16} className="text-teal shrink-0 mt-0.5" /> Ordered and received quantity for every line</li>
                            <li className="flex gap-2"><CheckCircle2 size={16} className="text-teal shrink-0 mt-0.5" /> Each finding by type — barcode, quantity, date or condition</li>
                            <li className="flex gap-2"><CheckCircle2 size={16} className="text-teal shrink-0 mt-0.5" /> Photos, the inspection date and who inspected</li>
                            <li className="flex gap-2"><CheckCircle2 size={16} className="text-teal shrink-0 mt-0.5" /> The agreed outcome and a note explaining it</li>
                        </ul>
                        <p className="mt-4 text-[13.5px] text-ink-3">You get a notification when a report is added. It appears under <strong className="text-ink-2">Orders &amp; tracking → your order</strong>.</p>
                    </div>
                    <div className="relative">
                        <span className="absolute -top-3 start-4 z-10 px-2.5 py-1 rounded-full bg-heading text-white text-[11.5px] font-semibold">Example — illustrative, not a real order</span>
                        <InspectionReport inspection={SAMPLE} />
                    </div>
                </div>
            </section>

            <section aria-labelledby="outcomes" className="bg-[#F6F8FA]">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
                    <SectionHead id="outcomes" eyebrow="Resolution" title="When something doesn’t match" lead="The outcome is agreed with you and the supplier, then recorded on the order. Nothing is decided for you automatically." />
                    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        {OUTCOMES.map((o) => (
                            <div key={o.title} className="rounded-2xl bg-surface ring-1 ring-line p-5">
                                <span className="w-10 h-10 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><o.icon size={18} /></span>
                                <h3 className="font-sans mt-3 text-[15px] font-bold text-heading">{o.title}</h3>
                                <p className="mt-1.5 text-[13.5px] text-ink-2 leading-relaxed">{o.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section aria-labelledby="faq" className="px-4 sm:px-6 py-14 sm:py-20">
                <SectionHead id="faq" title="Questions about inspection" />
                <div className="mt-8">
                    <Faq items={[
                        { q: 'Is every order inspected?', a: 'No. Inspection is arranged for an order when you ask for it and the team confirms it can be done for that route. Orders without an inspection show no report.' },
                        { q: 'Who carries out the inspection?', a: 'The inspector’s name is recorded on the report. Whether it is the Atlantis team or an inspection partner is confirmed with you when the inspection is arranged.' },
                        { q: 'Where does it happen?', a: <>It is agreed per order — for example at the supplier’s dispatch location before collection, or at an Atlantis hub that offers inspection. See <Link href="/warehouses" className="text-teal font-medium hover:underline">Warehouses</Link> for verified hubs.</> },
                        { q: 'What does it cost?', a: 'If an inspection has a cost, it is agreed with you before it is booked. It is never added to an order without your agreement.' },
                        { q: 'Does an inspection guarantee the goods?', a: 'An inspection records what was checked on the day, usually on a sample of cartons. It is evidence for resolving issues, not a guarantee of every unit.' },
                        { q: 'What if I find a problem after delivery without an inspection?', a: <>Don’t confirm delivery on your order page; report the issue with photos from the order page or via <Link href="/contact" className="text-teal font-medium hover:underline">Contact</Link> and the team works it out with the supplier.</> },
                    ]} />
                </div>
            </section>

            <TrustCta title="Want an order inspected?" lead="Tell us the products, quantities and route — we’ll confirm what’s possible before you order.">
                <PrimaryLink href="/contact">Contact the team</PrimaryLink>
                <SecondaryLink href="/categories">Browse products</SecondaryLink>
            </TrustCta>
            <TrustNav current="inspection" />
        </main>
    );
}
