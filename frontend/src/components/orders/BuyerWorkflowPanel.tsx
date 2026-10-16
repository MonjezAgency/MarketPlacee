'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Circle, X, Loader2, FileCheck2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { eur } from '@/lib/fulfillment';
import { acceptTerms, workflowSteps, type BuyerTerms, type BuyerWorkflow, type Inspection } from '@/lib/order-workflow';
import { DeliveryBreakdown } from './DeliveryBreakdown';
import { InspectionReport } from './InspectionReport';

const TIER: Record<string, string> = { carton: 'case', pallet: 'pallet', truck: 'truck' };

function TermsTable({ terms, title }: { terms: BuyerTerms; title: string }) {
    const freight = terms.freight;
    return (
        <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">{title} · version {terms.version}</p>
            <ul className="mt-2 divide-y divide-line rounded-xl ring-1 ring-line">
                {terms.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 px-3 py-2 text-[13px]">
                        <span className="min-w-0 text-ink">{l.name}<span className="text-ink-3"> · {l.quantity} × {TIER[l.tier || ''] || l.tier || 'unit'} at {eur(l.unitPrice)}</span></span>
                        <span className="tabular-nums text-ink shrink-0">{eur(l.lineTotal)}</span>
                    </li>
                ))}
                <li className="flex justify-between px-3 py-2 text-[13px]"><span className="text-ink-2">Goods</span><span className="tabular-nums font-semibold text-ink">{eur(terms.goodsTotal)}</span></li>
                <li className="flex justify-between px-3 py-2 text-[13px]">
                    <span className="text-ink-2">Delivery{freight.carrier ? ` · ${freight.carrier}` : ''}</span>
                    <span className="tabular-nums text-ink">{freight.amount != null ? eur(freight.amount) : 'Quoted by Atlantis'}</span>
                </li>
            </ul>
            <p className="mt-1.5 text-[12px] text-ink-3">Prices exclude VAT, which is shown on the invoice.</p>
        </div>
    );
}

/**
 * The buyer's view of the confirmation workflow: where the order is, who acts
 * next, the confirmed terms, and any inspection report. All state is read from
 * the server; the one action (accepting changed terms) is checked there again.
 */
export function BuyerWorkflowPanel({ order, onChange }: { order: { id: string; status: string; workflow: BuyerWorkflow | null; inspections?: Inspection[] }; onChange: () => void }) {
    const w = order.workflow;
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState('');
    const steps = workflowSteps(order);
    if (!w || !steps) return null;

    const accept = async () => {
        setBusy(true); setErr('');
        try { await acceptTerms(order.id, w.termsVersion); onChange(); }
        catch (e: any) { setErr(e?.message || 'Could not accept the terms. Please try again.'); }
        finally { setBusy(false); }
    };
    const shownTerms = w.approvedTerms || w.submittedTerms;
    const changed = !!(w.approvedTerms && w.submittedTerms && w.approvedTerms.version !== w.submittedTerms.version);

    return (
        <section aria-labelledby="wf-heading" className="rounded-3xl ring-1 ring-line bg-surface p-5 sm:p-7 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="wf-heading" className="text-[17px] font-semibold text-heading">Order confirmation</h2>
                    <p className="text-[13.5px] text-ink-2 mt-0.5">{w.party?.buyer || (order.status === 'CANCELLED' ? 'This order was cancelled.' : w.reviewStatus === 'APPROVED' ? 'Confirmed by the supplier and approved by Atlantis.' : 'In review.')}</p>
                </div>
                <Link href="/protected-payments" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal hover:underline"><ShieldCheck size={14} /> How confirmation works</Link>
            </div>

            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {steps.map((s, i) => (
                    <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined}
                        className={cn('rounded-2xl p-3.5 ring-1', s.state === 'current' ? 'ring-[#2EC4B6] bg-teal-soft/40' : s.state === 'stopped' ? 'ring-[#FCA5A5] bg-[#FEF2F2]' : 'ring-line')}>
                        <div className="flex items-center gap-2">
                            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                                s.state === 'done' ? 'bg-[#2EC4B6] text-heading' : s.state === 'stopped' ? 'bg-[#B91C1C] text-white' : s.state === 'current' ? 'bg-cta text-cta-fg' : 'bg-surface-3 text-ink-3')}>
                                {s.state === 'done' ? <Check size={13} /> : s.state === 'stopped' ? <X size={13} /> : s.state === 'current' ? <Circle size={8} fill="currentColor" /> : i + 1}
                            </span>
                            <p className={cn('text-[13.5px] font-semibold', s.state === 'todo' ? 'text-ink-3' : 'text-ink')}>{s.title}</p>
                        </div>
                        <p className="mt-1.5 text-[12.5px] text-ink-2 leading-relaxed">{s.detail}</p>
                        <p className="mt-1 text-[11.5px] font-medium text-ink-3">Acts: {s.who}</p>
                    </li>
                ))}
            </ol>

            {w.buyerMustAccept && w.approvedTerms && (
                <div className="rounded-2xl ring-1 ring-[#F59E0B]/40 bg-[#FFFBEB] p-4 space-y-3">
                    <div className="flex gap-2.5">
                        <FileCheck2 size={18} className="text-[#B45309] shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[14px] font-semibold text-ink">The confirmed terms differ from your order</p>
                            <p className="text-[13px] text-ink-2">Nothing ships until you accept them. If you don’t agree, contact Atlantis and the order can be cancelled.</p>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {w.submittedTerms && <TermsTable terms={w.submittedTerms} title="You submitted" />}
                        <TermsTable terms={w.approvedTerms} title="Confirmed terms" />
                    </div>
                    {err && <p role="alert" className="text-[13px] text-[#B91C1C]">{err}</p>}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={accept} disabled={busy} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:opacity-60">
                            {busy && <Loader2 size={14} className="animate-spin" />} Accept terms v{w.termsVersion}
                        </button>
                        <a href={`mailto:Info@atlantisfmcg.com?subject=${encodeURIComponent(`Order #${order.id.slice(-8).toUpperCase()} – changed terms`)}`} className="h-10 px-5 inline-flex items-center rounded-xl ring-1 ring-line-strong text-[14px] font-semibold text-ink hover:bg-surface-2">Contact Atlantis</a>
                    </div>
                </div>
            )}

            {!w.buyerMustAccept && shownTerms && (
                <details className="group">
                    <summary className="cursor-pointer text-[13.5px] font-semibold text-ink">{w.approvedTerms ? 'Confirmed terms' : 'Terms you submitted'}{changed ? ' (updated)' : ''}</summary>
                    <div className="mt-3"><TermsTable terms={shownTerms} title={w.approvedTerms ? 'Confirmed terms' : 'Submitted'} /></div>
                </details>
            )}

            {(w.approvedTerms?.fulfillment || w.fulfillment) && (
                <div>
                    <p className="text-[13.5px] font-semibold text-ink mb-2">Delivery</p>
                    <DeliveryBreakdown quote={w.approvedTerms?.fulfillment || w.fulfillment} setByAtlantis={shownTerms?.freight.amount != null && shownTerms.freight.status === 'set_by_atlantis' ? { amount: shownTerms.freight.amount, carrier: shownTerms.freight.carrier } : null} />
                </div>
            )}

            {(order.inspections || []).length > 0 && (
                <div className="space-y-3">
                    {(order.inspections || []).map((i) => <InspectionReport key={i.id} inspection={i} />)}
                </div>
            )}
        </section>
    );
}
