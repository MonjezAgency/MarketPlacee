'use client';

import * as React from 'react';
import Link from 'next/link';
import { Send, ClipboardList, Handshake, FileCheck2, Truck, Scale, Check, X, RefreshCw, Clock, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Faq, PrimaryLink, SecondaryLink, SectionHead, TrustCta, TrustHero, TrustNav } from '@/components/trust/TrustBlocks';

/**
 * Every step below is enforced by the order workflow on the server
 * (backend/src/orders/order-workflow.ts): an order is confirmed only after
 * every supplier accepted the exact terms and Atlantis approved them.
 * Atlantis does not hold buyer funds; this page never says it does.
 */
const STEPS = [
    {
        icon: Send, who: 'You', title: 'You submit the order',
        desc: 'Your cart becomes an order request with the exact lines, quantities and prices you saw. Nothing is charged and nothing is confirmed yet.',
        status: 'Waiting for supplier confirmation', ifNot: 'You can still contact Atlantis to change or withdraw the request.',
    },
    {
        icon: ClipboardList, who: 'Atlantis', title: 'Atlantis reviews and asks the supplier',
        desc: 'Every supplier on the order is asked to confirm their own part, with a deadline (72 hours unless Atlantis sets another). Atlantis follows the request and can correct or reject it before anything is confirmed.',
        status: 'Waiting for supplier confirmation', ifNot: 'If a supplier doesn’t answer in time, Atlantis asks again or cancels the request and tells you.',
    },
    {
        icon: Handshake, who: 'Supplier', title: 'The supplier explicitly accepts or rejects',
        desc: 'The supplier confirms availability, quantities, their price and that they can dispatch within the lead time on the listing — or rejects with a reason. Silence is never treated as a yes.',
        status: 'Supplier confirmed — Atlantis is approving', ifNot: 'A rejection on a single-supplier order cancels it and returns the stock; on a shared order Atlantis proposes changed terms or cancels.',
    },
    {
        icon: FileCheck2, who: 'Atlantis, then you', title: 'You receive the confirmed terms',
        desc: 'Atlantis approves only once every supplier has accepted. The terms are frozen as a numbered version and the Atlantis team sends you payment details. If they differ from what you submitted, you accept them first.',
        status: 'Confirmed — or “Updated terms — your acceptance is needed”', ifNot: 'If you don’t accept changed terms, the order doesn’t ship and can be cancelled.',
    },
    {
        icon: Truck, who: 'Atlantis & supplier', title: 'Fulfilment and inspection',
        desc: 'Goods are collected or delivered under the confirmed delivery method. Where an inspection is arranged, its report is added to your order.',
        status: 'Shipped', ifNot: 'An order can’t be marked shipped before approval, or while changed terms are waiting for your acceptance.',
    },
    {
        icon: Scale, who: 'Atlantis', title: 'Payment settled under the terms',
        desc: 'Payment is settled according to the confirmed terms and, where there was an inspection, its agreed outcome — such as a price adjustment or a partial acceptance.',
        status: 'Delivered', ifNot: 'Issues are resolved with you and the supplier and recorded on the order; refunds, where due, are arranged by the team.',
    },
];

const STATUSES = [
    { you: 'Waiting for supplier confirmation', supplier: 'Your confirmation is needed', means: 'The request is with the supplier(s). Nothing is confirmed.' },
    { you: 'Supplier confirmed — Atlantis is approving', supplier: 'Accepted — awaiting Atlantis approval', means: 'Every supplier accepted the exact terms; Atlantis is doing its final review.' },
    { you: 'Being reviewed by Atlantis', supplier: 'You rejected these terms', means: 'A supplier couldn’t supply as requested. Atlantis proposes changed terms or cancels.' },
    { you: 'Confirmed', supplier: 'Approved by Atlantis', means: 'Approved terms are fixed. Payment details are sent; preparation starts.' },
    { you: 'Updated terms — your acceptance is needed', supplier: 'Approved — waiting for the buyer', means: 'The terms changed (e.g. a delivery charge was set). Nothing ships until you accept.' },
    { you: 'Shipped / Delivered', supplier: 'Shipped / Delivered', means: 'Goods are on their way / arrived.' },
    { you: 'Cancelled', supplier: 'Cancelled', means: 'Rejected or cancelled; reserved stock is released.' },
];

export default function ProtectedPaymentsClient() {
    const [active, setActive] = React.useState(0);
    return (
        <main className="min-h-screen bg-surface text-start">
            <TrustHero eyebrow="Protected payments" title="Trade with greater confidence"
                lead="Know what happens before money moves. On Atlantis an order is confirmed only when the supplier has accepted the exact terms and Atlantis has approved them — and you see every step.">
                <PrimaryLink href="/categories">Start sourcing</PrimaryLink>
                <SecondaryLink href="/contact">Talk to the team</SecondaryLink>
            </TrustHero>

            {/* Plain facts about money — what is and isn't true today */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-12">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl ring-1 ring-line p-5">
                        <p className="text-[14px] font-semibold text-heading">What protects you</p>
                        <ul className="mt-3 space-y-2 text-[14px] text-ink-2">
                            {['Nothing is charged when you place an order.', 'You pay only after the supplier confirmed and Atlantis approved the terms.', 'Confirmed terms are saved as a numbered version you can see on your order.', 'Any change — quantity, price or delivery charge — needs your acceptance before shipping.'].map((t) => (
                                <li key={t} className="flex gap-2"><Check size={16} className="text-teal shrink-0 mt-0.5" /> {t}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="rounded-2xl ring-1 ring-line bg-[#F6F8FA] p-5">
                        <p className="text-[14px] font-semibold text-heading">What Atlantis doesn’t do today</p>
                        <ul className="mt-3 space-y-2 text-[14px] text-ink-2">
                            {['Atlantis doesn’t hold your money in escrow or a holding account.', 'There is no card payment at checkout — payment details come with the confirmed terms.', 'Refunds and price adjustments aren’t automatic; the team arranges them under the terms.'].map((t) => (
                                <li key={t} className="flex gap-2"><X size={16} className="text-ink-3 shrink-0 mt-0.5" /> {t}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <section aria-labelledby="journey" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
                <SectionHead id="journey" eyebrow="Six steps" title="From request to settlement" lead="Who acts at each step, the status you’ll see, and what happens if the step doesn’t go through." />
                <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    <ol className="space-y-2" aria-label="Order steps">
                        {STEPS.map((s, i) => (
                            <li key={s.title}>
                                <button type="button" onClick={() => setActive(i)} aria-pressed={active === i}
                                    className={cn('w-full text-start flex items-center gap-4 rounded-2xl p-3.5 ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                        active === i ? 'ring-[#2EC4B6] bg-teal-soft/40' : 'ring-line hover:ring-line-strong')}>
                                    <span className={cn('relative w-11 h-11 rounded-full flex items-center justify-center shrink-0', active === i ? 'bg-cta text-[#7FE3D9]' : 'bg-surface ring-1 ring-[#DCE3EA] text-teal')}>
                                        <s.icon size={19} />
                                        <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-[#2EC4B6] text-heading text-[10.5px] font-bold flex items-center justify-center ring-2 ring-white">{i + 1}</span>
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[15px] font-semibold text-heading">{s.title}</span>
                                        <span className="block text-[12.5px] text-ink-3">Acts: {s.who}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ol>
                    <div aria-live="polite" className="rounded-3xl ring-1 ring-line p-6 sm:p-8 lg:sticky lg:top-24 self-start">
                        {(() => {
                            const s = STEPS[active];
                            return (
                                <>
                                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">Step {active + 1} of 6 · {s.who}</p>
                                    <h3 className="font-sans mt-2 text-[22px] font-bold text-heading">{s.title}</h3>
                                    <p className="mt-3 text-[15px] text-ink-2 leading-relaxed">{s.desc}</p>
                                    <dl className="mt-6 space-y-4 text-[14px]">
                                        <div className="flex gap-3"><UserCheck size={18} className="text-teal shrink-0 mt-0.5" /><div><dt className="font-semibold text-ink">Who approves</dt><dd className="text-ink-2">{s.who}</dd></div></div>
                                        <div className="flex gap-3"><Clock size={18} className="text-teal shrink-0 mt-0.5" /><div><dt className="font-semibold text-ink">Status you’ll see</dt><dd className="text-ink-2">{s.status}</dd></div></div>
                                        <div className="flex gap-3"><RefreshCw size={18} className="text-teal shrink-0 mt-0.5" /><div><dt className="font-semibold text-ink">If it doesn’t go through</dt><dd className="text-ink-2">{s.ifNot}</dd></div></div>
                                    </dl>
                                    <div className="mt-6 flex gap-2">
                                        <button type="button" disabled={active === 0} onClick={() => setActive((a) => a - 1)} className="h-10 px-4 rounded-xl ring-1 ring-line-strong text-[14px] font-semibold text-ink disabled:opacity-40">Previous</button>
                                        <button type="button" disabled={active === STEPS.length - 1} onClick={() => setActive((a) => a + 1)} className="h-10 px-4 rounded-xl bg-cta text-cta-fg text-[14px] font-semibold disabled:opacity-40">Next step</button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            </section>

            <section aria-labelledby="statuses" className="bg-[#F6F8FA]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
                    <SectionHead id="statuses" eyebrow="Statuses" title="What each status means" lead="You and the supplier see the same order from your own side." />
                    <div className="mt-8 overflow-x-auto rounded-2xl ring-1 ring-line bg-surface">
                        <table className="w-full text-[14px] min-w-[640px]">
                            <thead><tr className="border-b border-line text-ink-3 text-[12.5px]"><th className="text-start font-semibold px-4 py-3">You see</th><th className="text-start font-semibold px-4 py-3">The supplier sees</th><th className="text-start font-semibold px-4 py-3">What it means</th></tr></thead>
                            <tbody>
                                {STATUSES.map((r) => (
                                    <tr key={r.you} className="border-b border-line last:border-0 align-top">
                                        <td className="px-4 py-3 font-semibold text-ink">{r.you}</td>
                                        <td className="px-4 py-3 text-ink-2">{r.supplier}</td>
                                        <td className="px-4 py-3 text-ink-2">{r.means}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section aria-labelledby="changes" className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
                <SectionHead id="changes" eyebrow="Changes" title="When something changes" />
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    {[
                        { t: 'A supplier rejects', d: 'You’re told why. A single-supplier order is cancelled and its stock released; on a shared order Atlantis proposes changed terms or cancels.' },
                        { t: 'A supplier doesn’t answer', d: 'After the deadline the confirmation expires. Atlantis asks again with a new deadline, or cancels the request.' },
                        { t: 'Quantities or prices change', d: 'Atlantis creates a new terms version. Suppliers whose part changed confirm again, and you accept the new version before anything ships.' },
                        { t: 'A delivery charge is set', d: 'When Atlantis quotes freight after the order, it becomes a new terms version that you accept before shipping.' },
                    ].map((c) => (
                        <div key={c.t} className="rounded-2xl ring-1 ring-line p-5">
                            <h3 className="font-sans text-[16px] font-bold text-heading">{c.t}</h3>
                            <p className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">{c.d}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section aria-labelledby="faq" className="px-4 sm:px-6 pb-14 sm:pb-20">
                <SectionHead id="faq" title="Questions about payments" />
                <div className="mt-8">
                    <Faq items={[
                        { q: 'Does Atlantis hold my payment until delivery?', a: 'No. Atlantis doesn’t hold buyer funds in escrow. The protection is in the order process: you pay only after the supplier confirmed and Atlantis approved the terms, and changes need your acceptance.' },
                        { q: 'When do I pay?', a: 'After approval. The Atlantis team sends payment details with the confirmed terms. Placing an order charges nothing.' },
                        { q: 'Is my order confirmed when I place it?', a: 'No. Placing an order sends a request. It becomes “Confirmed” only after every supplier on it accepted and Atlantis approved.' },
                        { q: 'Can the price change after I order?', a: 'Only through a new terms version that you see side by side with what you submitted — and nothing ships until you accept it.' },
                        { q: 'How is VAT handled?', a: 'Prices are shown excluding VAT. VAT is calculated on the invoice.' },
                        { q: 'What if the goods aren’t right?', a: <>Don’t confirm delivery; report it from your order page. Where an inspection took place, its report is the basis for the outcome. See <Link href="/goods-inspection" className="text-teal font-medium hover:underline">Goods Inspection</Link>.</> },
                    ]} />
                </div>
            </section>

            <TrustCta title="Order with confirmed terms" lead="See prices, place a request, and confirm nothing until the supplier and Atlantis have.">
                <PrimaryLink href="/auth/register?role=CUSTOMER">Open a buyer account</PrimaryLink>
                <SecondaryLink href="/how-it-works">How Atlantis works</SecondaryLink>
            </TrustCta>
            <TrustNav current="payments" />
        </main>
    );
}
