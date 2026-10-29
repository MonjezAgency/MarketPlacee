'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, X, Clock, FileCheck2, Handshake, Send, ClipboardList, Truck, Scale, ShieldCheck, Layers, UserCheck, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ButtonLink, Container, CtaBand, Eyebrow, Faq, Pill, Reveal, Section, SectionHeader, TrustNav } from '@/components/ds';

/**
 * Every step on this page is enforced by the order workflow on the server
 * (backend/src/orders/order-workflow.ts). Ali FMCG does not hold buyer funds,
 * and the page says so plainly.
 */

/** The hero's rising stack — an illustrative order, labelled as an example. */
function OrderStack() {
    const Card = ({ title, meta, children }: { title: string; meta: string; children?: React.ReactNode }) => (
        <div className="mx-auto w-full max-w-[25rem] rounded-2xl bg-surface ring-1 ring-line shadow-float px-4 py-3.5">
            <div className="flex items-center justify-between gap-3"><p className="text-[14px] font-semibold text-heading">{title}</p><p className="text-small text-ink-4 tabular-nums">{meta}</p></div>
            {children}
        </div>
    );
    const Link_ = ({ children }: { children: React.ReactNode }) => (
        <div className="flex flex-col items-center py-3 text-small text-ink-3"><span className="h-4 w-px bg-line-strong" aria-hidden /><span className="my-1.5 inline-flex items-center gap-1.5"><Clock size={12} aria-hidden /> {children}</span><span className="h-4 w-px bg-line-strong" aria-hidden /></div>
    );
    const sequence = (
        <div className="pb-3">
            <Card title="Order request sent" meta="ATL-7K3M9P"><p className="mt-2 text-small text-ink-3">2 lines · 3 pallets · nothing charged</p></Card>
            <Link_>Suppliers have 72 hours to answer</Link_>
            <Card title="Supplier confirmation" meta="Today">
                <div className="mt-2.5 flex items-center justify-between"><span className="text-small text-ink-3">2 / 2 suppliers accepted</span><Pill tone="success" icon={<Check size={12} aria-hidden />} className="h-6">Accepted</Pill></div>
            </Card>
            <Link_>Ali FMCG review</Link_>
            <Card title="Terms confirmed" meta="Version 1"><p className="mt-2 text-small text-ink-3">Approved by Ali FMCG · payment details sent</p></Card>
            <Link_>Before anything ships</Link_>
            <Card title="Goods inspection" meta="Where arranged">
                <div className="mt-2.5 flex items-center justify-between"><span className="text-small text-ink-3">12 / 12 pallets checked</span><Pill tone="success" icon={<Check size={12} aria-hidden />} className="h-6">Pass</Pill></div>
            </Card>
            <Link_>After collection</Link_>
            <div className="mx-auto w-fit rounded-full bg-surface ring-1 ring-line shadow-float ps-2 pe-4 py-2 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-[#10B981] text-white flex items-center justify-center"><Check size={15} aria-hidden /></span>
                <span className="text-[14.5px] font-semibold text-heading">Settled under the confirmed terms</span>
            </div>
        </div>
    );
    return (
        <div className="relative h-[340px] sm:h-[400px] overflow-hidden" aria-hidden
            style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)' }}>
            <div className="animate-atl-rise motion-reduce:translate-y-0">{sequence}{sequence}</div>
        </div>
    );
}

const JOURNEY = [
    { icon: Send, title: 'You send the order request', who: 'You', status: 'Waiting for supplier confirmation', desc: 'Your cart becomes a request with the exact lines, quantities and prices you saw. Nothing is charged and nothing is confirmed yet.' },
    { icon: ClipboardList, title: 'Ali FMCG asks every supplier', who: 'Ali FMCG', status: 'Waiting for supplier confirmation', desc: 'Each supplier on the order is asked to confirm their own part before a deadline (72 hours unless Ali FMCG sets another). Ali FMCG can correct or reject the request at any point.' },
    { icon: Handshake, title: 'Each supplier explicitly accepts or rejects', who: 'Supplier', status: 'Supplier confirmed — Ali FMCG is approving', desc: 'Availability, quantities, their price and dispatch within the listed lead time — or a rejection with a reason. Silence is never treated as a yes; an expired request has to be asked again.' },
    { icon: FileCheck2, title: 'Ali FMCG approves the confirmed terms', who: 'Ali FMCG, then you', status: 'Confirmed', desc: 'Approval is possible only after every supplier accepted. The terms are frozen as a numbered version and the Ali FMCG team sends you payment details. If they differ from what you submitted, you accept them first.' },
    { icon: Truck, title: 'Fulfilment and, where arranged, inspection', who: 'Ali FMCG & supplier', status: 'Shipped', desc: 'Goods move under the confirmed delivery method. An order can’t be marked shipped before approval, or while changed terms are waiting for your acceptance.' },
    { icon: Scale, title: 'Settlement under the terms', who: 'Ali FMCG', status: 'Delivered', desc: 'Payment is settled according to the confirmed terms and any inspection outcome, such as a price adjustment or partial acceptance. Refunds, where due, are arranged by the team.' },
];

const COMPARE = [
    { row: 'Who confirms the order', usual: 'Often the seller’s word in an email', atl: 'Every supplier on it, explicitly — then Ali FMCG approves' },
    { row: 'When you pay', usual: 'Often up front, on a pro forma', atl: 'After the terms are confirmed and payment details are sent' },
    { row: 'If quantities, prices or freight change', usual: 'A new invoice arrives', atl: 'A new terms version you see side by side and accept before shipping' },
    { row: 'Proof when it matters', usual: 'Email threads', atl: 'Numbered terms on the order, plus the inspection report where one was done' },
    { row: 'Where your money sits', usual: 'With the seller', atl: 'Ali FMCG doesn’t hold funds — you pay under the confirmed terms' },
];

const STATUSES = [
    { you: 'Waiting for supplier confirmation', supplier: 'Your confirmation is needed', means: 'The request is with the supplier(s). Nothing is confirmed.' },
    { you: 'Supplier confirmed — Ali FMCG is approving', supplier: 'Accepted — awaiting Ali FMCG approval', means: 'Every supplier accepted the exact terms; Ali FMCG does a final review.' },
    { you: 'Being reviewed by Ali FMCG', supplier: 'You rejected these terms', means: 'A supplier couldn’t supply as requested. Ali FMCG proposes changed terms or cancels.' },
    { you: 'Confirmed', supplier: 'Approved by Ali FMCG', means: 'Terms are fixed; payment details are sent and goods are prepared.' },
    { you: 'Your acceptance needed', supplier: 'Approved — waiting for the buyer', means: 'The terms changed (for example a delivery charge was set). Nothing ships until you accept.' },
    { you: 'Shipped · Delivered', supplier: 'Shipped · Delivered', means: 'On the way · arrived and confirmed.' },
    { you: 'Cancelled', supplier: 'Cancelled', means: 'Rejected or cancelled; reserved stock is released.' },
];

export default function ProtectedPaymentsClient() {
    return (
        <main className="min-h-screen bg-surface text-start">
            {/* Hero */}
            <Section size="sm" className="relative overflow-hidden border-b border-line">
                <div aria-hidden className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_50%_60%_at_50%_30%,rgb(var(--atl-teal-soft)),transparent_70%)]" />
                <Container size="content" className="relative">
                    <OrderStack />
                    <p className="text-center mt-1 text-small text-ink-4">Example order — illustrative</p>
                    <Reveal hero delay={0.1} className="mt-8 text-center max-w-2xl mx-auto">
                        <Eyebrow pill>Protected payments</Eyebrow>
                        <h1 className="mt-5 font-sans text-display-sm sm:text-display text-heading">Trade with greater confidence</h1>
                        <p className="mt-5 text-body sm:text-lead text-ink-2">Know what happens before money moves. An Ali FMCG order is confirmed only when every supplier has accepted the exact terms and Ali FMCG has approved them — and you see each step.</p>
                        <div className="mt-8 flex flex-wrap justify-center gap-3">
                            <ButtonLink href="/categories">Start sourcing</ButtonLink>
                            <ButtonLink href="#journey" variant="secondary">See how an order moves</ButtonLink>
                        </div>
                    </Reveal>
                </Container>
            </Section>

            {/* Journey */}
            <Section id="journey" labelledBy="journey-title">
                <Container size="content">
                    <SectionHeader id="journey-title" eyebrow="Six steps" title="How every order moves" lead="The same steps on every order, one pallet or forty. Who acts, the status you see, and what happens next." />
                    <ol className="relative mt-12 space-y-10">
                        <span aria-hidden className="absolute start-[19px] top-3 bottom-3 w-px bg-line" />
                        {JOURNEY.map((s, i) => {
                            const last = i === JOURNEY.length - 1;
                            return (
                                <Reveal as="li" key={s.title} delay={0.04 * i} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-5">
                                    <span className={cn('relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-semibold tabular-nums ring-1', last ? 'bg-[#10B981] text-white ring-[#10B981]' : 'bg-surface text-heading ring-line-strong')}>
                                        {last ? <Check size={18} aria-hidden /> : i + 1}
                                    </span>
                                    <div className="pt-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-sans text-subtitle text-heading me-1">{s.title}</h3>
                                            <Pill icon={<UserCheck size={13} aria-hidden />}>Acts: {s.who}</Pill>
                                            <Pill tone={last ? 'success' : 'teal'}>{s.status}</Pill>
                                        </div>
                                        <p className="mt-2 max-w-prose text-body text-ink-2">{s.desc}</p>
                                    </div>
                                </Reveal>
                            );
                        })}
                    </ol>
                </Container>
            </Section>

            {/* Comparison on a dark band */}
            <Section size="sm" labelledBy="compare-title">
                <Container size="content">
                    <Reveal className="rounded-3xl bg-heading text-white p-6 sm:p-10">
                        <p className="text-eyebrow uppercase text-[#7FE3D9]">Plainly</p>
                        <h2 id="compare-title" className="mt-3 font-sans text-title-sm sm:text-title">Where the risk sits, compared</h2>
                        <p className="mt-3 max-w-2xl text-body sm:text-lead text-white/75">Wholesale trade often runs on trust and pro formas. Ali FMCG puts confirmation in the process instead — and is clear about what it doesn’t do.</p>
                        <div className="mt-8 overflow-x-auto -mx-2 px-2">
                            <table className="w-full min-w-[620px] text-[14.5px]">
                                <thead><tr className="text-small text-white/60"><th className="text-start font-medium py-3 pe-4 w-[28%]"><span className="sr-only">Question</span></th><th className="text-start font-medium py-3 pe-4">Typical direct trade</th><th className="text-start font-medium py-3">Ali FMCG today</th></tr></thead>
                                <tbody>
                                    {COMPARE.map((c) => (
                                        <tr key={c.row} className="border-t border-white/10 align-top">
                                            <th scope="row" className="text-start font-medium py-4 pe-4">{c.row}</th>
                                            <td className="py-4 pe-4 text-white/65"><span className="inline-flex gap-2"><X size={16} className="shrink-0 mt-0.5 text-white/40" aria-hidden />{c.usual}</span></td>
                                            <td className="py-4"><span className="inline-flex gap-2"><Check size={16} className="shrink-0 mt-0.5 text-[#7FE3D9]" aria-hidden />{c.atl}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Reveal>
                </Container>
            </Section>

            {/* Principles */}
            <Section size="md">
                <Container size="content">
                    <ul className="grid gap-10 sm:grid-cols-3">
                        {[
                            { icon: ShieldCheck, t: 'Nothing on one word alone', d: 'A buyer’s submit doesn’t confirm an order, and neither does one supplier. Every party answers explicitly.' },
                            { icon: Layers, t: 'Numbered, frozen terms', d: 'Approved terms are stored as a version on the order. A change is a new version, never an edit.' },
                            { icon: FileCheck2, t: 'Changes need your yes', d: 'Quantity, price or delivery charge changed? Nothing ships until you accept the new version.' },
                        ].map((p, i) => (
                            <Reveal as="li" key={p.t} delay={i * 0.08} className="text-center">
                                <span className="mx-auto w-11 h-11 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><p.icon size={20} aria-hidden /></span>
                                <h3 className="font-sans mt-4 text-subtitle text-heading">{p.t}</h3>
                                <p className="mt-2 text-body text-ink-2">{p.d}</p>
                            </Reveal>
                        ))}
                    </ul>
                </Container>
            </Section>

            {/* Statuses */}
            <Section tone="muted" labelledBy="status-title">
                <Container size="content">
                    <SectionHeader id="status-title" eyebrow="Statuses" title="What each status means" lead="You and the supplier see the same order, each from your own side." />
                    <Reveal className="mt-10 overflow-x-auto rounded-2xl ring-1 ring-line bg-surface">
                        <table className="w-full min-w-[640px] text-[14.5px]">
                            <thead><tr className="border-b border-line text-small text-ink-3"><th className="text-start font-medium px-5 py-3">You see</th><th className="text-start font-medium px-5 py-3">The supplier sees</th><th className="text-start font-medium px-5 py-3">What it means</th></tr></thead>
                            <tbody>
                                {STATUSES.map((r) => (
                                    <tr key={r.you} className="border-b border-line last:border-0 align-top">
                                        <th scope="row" className="text-start px-5 py-3.5 font-semibold text-heading">{r.you}</th>
                                        <td className="px-5 py-3.5 text-ink-2">{r.supplier}</td>
                                        <td className="px-5 py-3.5 text-ink-2">{r.means}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Reveal>
                </Container>
            </Section>

            {/* Changes */}
            <Section labelledBy="changes-title">
                <Container size="content">
                    <SectionHeader id="changes-title" eyebrow="When something changes" title="Rejections, deadlines and new terms" />
                    <ul className="mt-10 grid gap-4 sm:grid-cols-2">
                        {[
                            { t: 'A supplier rejects', d: 'You’re told why. A single-supplier order is cancelled and its stock released; on a shared order Ali FMCG proposes changed terms or cancels.' },
                            { t: 'A supplier doesn’t answer', d: 'After the deadline the confirmation expires. Ali FMCG asks again with a new deadline, or cancels the request.' },
                            { t: 'Quantities or prices change', d: 'A new terms version is created. Suppliers whose part changed confirm again, and you accept before anything ships.' },
                            { t: 'A delivery charge is set', d: 'When Ali FMCG quotes freight after the order, it becomes a new version you accept before shipping.' },
                        ].map((c, i) => (
                            <Reveal as="li" key={c.t} delay={i * 0.06} className="rounded-2xl ring-1 ring-line p-6">
                                <h3 className="font-sans text-subtitle text-heading">{c.t}</h3>
                                <p className="mt-2 text-body text-ink-2">{c.d}</p>
                            </Reveal>
                        ))}
                    </ul>
                </Container>
            </Section>

            {/* Inspection teaser */}
            <Section size="sm">
                <Container size="content">
                    <Reveal className="rounded-3xl ring-1 ring-line bg-surface-2 p-6 sm:p-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem] items-center">
                        <div>
                            <h2 className="font-sans text-title-sm sm:text-title text-heading">How goods get checked</h2>
                            <p className="mt-3 max-w-xl text-body sm:text-lead text-ink-2">Where an inspection is arranged, barcodes, cartons, dates and condition are checked against the confirmed order, and the report is added to it.</p>
                            <div className="mt-6"><ButtonLink href="/goods-inspection" size="md">How inspection works</ButtonLink></div>
                        </div>
                        <div aria-hidden className="rotate-2 rounded-2xl bg-surface ring-1 ring-line shadow-float p-4">
                            <div className="flex items-center justify-between"><p className="text-[14px] font-semibold text-heading inline-flex items-center gap-1.5"><ClipboardCheck size={15} className="text-teal" /> Inspection</p><Pill tone="success" className="h-6"><Check size={12} /> Pass</Pill></div>
                            <div className="mt-3 space-y-2"><div className="h-2 rounded-full bg-surface-3 w-4/5" /><div className="h-2 rounded-full bg-surface-3 w-3/5" /></div>
                            <p className="mt-3 text-small text-ink-3">12 / 12 pallets · barcodes, dates, condition</p>
                        </div>
                    </Reveal>
                </Container>
            </Section>

            <Section tone="muted" labelledBy="faq-title">
                <Container>
                    <SectionHeader id="faq-title" align="center" title="Questions about payments" />
                    <Faq className="mt-10" items={[
                        { q: 'Does Ali FMCG hold my payment until delivery?', a: 'No. Ali FMCG doesn’t hold buyer funds in escrow or a holding account. The protection is in the process: you pay only after every supplier confirmed and Ali FMCG approved the terms, and any change needs your acceptance.' },
                        { q: 'When do I pay?', a: 'After approval. The Ali FMCG team sends payment details with the confirmed terms. Placing an order charges nothing.' },
                        { q: 'Is my order confirmed when I place it?', a: 'No. Placing an order sends a request. It becomes “Confirmed” only after every supplier on it accepted and Ali FMCG approved.' },
                        { q: 'Can the price change after I order?', a: 'Only through a new terms version, shown side by side with what you submitted — and nothing ships until you accept it.' },
                        { q: 'What if the goods aren’t right?', a: <>Don’t confirm delivery; report it from your order page. Where an inspection took place, its report is the basis for the outcome. See <Link href="/goods-inspection" className="font-medium text-teal hover:underline">Goods Inspection</Link>.</> },
                        { q: 'How is VAT handled?', a: 'Prices are shown excluding VAT. VAT is calculated on the invoice.' },
                    ]} />
                </Container>
            </Section>

            <CtaBand eyebrow="Confirmed before you pay" title="Order with terms you can see" lead="Place a request, watch the supplier and Ali FMCG confirm it, and pay only under the confirmed terms.">
                <ButtonLink href="/auth/register?role=customer">Open a buyer account</ButtonLink>
                <ButtonLink href="/categories" variant="secondary">Browse the catalog</ButtonLink>
            </CtaBand>
            <TrustNav current="payments" />
        </main>
    );
}

