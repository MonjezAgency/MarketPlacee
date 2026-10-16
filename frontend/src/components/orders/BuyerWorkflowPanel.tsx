'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Circle, X, Loader2, FileCheck2, ShieldCheck, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { acceptTerms, workflowSteps, type BuyerTerms, type BuyerWorkflow, type Inspection } from '@/lib/order-workflow';
import { DeliveryBreakdown } from './DeliveryBreakdown';
import { InspectionReport } from './InspectionReport';

const UNIT: Record<string, string> = { carton: 'unitCarton', pallet: 'unitPallet', truck: 'unitTruck' };
const NOTE: Record<string, string> = { AWAITING_SUPPLIER: 'noteAwaitingSupplier', AWAITING_APPROVAL: 'noteSupplierConfirmed', SUPPLIER_REJECTED: 'noteInReview', AWAITING_BUYER: 'noteAcceptance', CANCELLED: 'noteCancelled' };

/** Confirmed terms are always in EUR (the currency orders are charged in). */
const eur = (n: number, intl: string) => formatPrice(n, 'EUR', intl);

function TermsTable({ terms, title }: { terms: BuyerTerms; title: string }) {
    const { t, meta } = useLanguage();
    const freight = terms.freight;
    return (
        <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">{title} · {t('workflow', 'version', { n: terms.version })}</p>
            <ul className="mt-2 divide-y divide-line rounded-xl ring-1 ring-line bg-surface">
                {terms.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 px-3 py-2 text-[13px]">
                        <span className="min-w-0 text-ink">{l.name}<span className="text-ink-3"> · {t('workflow', 'line', { quantity: l.quantity, unit: t('workflow', UNIT[l.tier || ''] || 'unitOther'), price: eur(l.unitPrice, meta.intl) })}</span></span>
                        <span className="tabular-nums text-ink shrink-0">{eur(l.lineTotal, meta.intl)}</span>
                    </li>
                ))}
                <li className="flex justify-between px-3 py-2 text-[13px]"><span className="text-ink-2">{t('workflow', 'goods')}</span><span className="tabular-nums font-semibold text-ink">{eur(terms.goodsTotal, meta.intl)}</span></li>
                <li className="flex justify-between px-3 py-2 text-[13px]">
                    <span className="text-ink-2">{t('workflow', 'delivery')}{freight.carrier ? ` · ${freight.carrier}` : ''}</span>
                    <span className="tabular-nums text-ink">{freight.amount != null ? eur(freight.amount, meta.intl) : t('workflow', 'quotedByAtlantis')}</span>
                </li>
            </ul>
            <p className="mt-1.5 text-[12px] text-ink-3">{t('workflow', 'vatNote')}</p>
        </div>
    );
}

/**
 * The buyer's view of the confirmation workflow: where the order is, who acts
 * next, the confirmed terms, and any inspection report. All state is read from
 * the server; the one action (accepting changed terms) is checked there again.
 */
export function BuyerWorkflowPanel({ order, onChange }: { order: { id: string; status: string; workflow: BuyerWorkflow | null; inspections?: Inspection[] }; onChange: () => void }) {
    const { t } = useLanguage();
    const w = order.workflow;
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState('');
    const steps = workflowSteps(order);
    if (!w || !steps) return null;

    const accept = async () => {
        setBusy(true); setErr('');
        try { await acceptTerms(order.id, w.termsVersion); onChange(); }
        catch { setErr(t('workflow', 'acceptFailed')); }
        finally { setBusy(false); }
    };
    const shownTerms = w.approvedTerms || w.submittedTerms;
    const changed = !!(w.approvedTerms && w.submittedTerms && w.approvedTerms.version !== w.submittedTerms.version);
    const ref = `#${order.id.slice(-8).toUpperCase()}`;
    const summary = w.party && NOTE[w.party.key] ? t('orders', NOTE[w.party.key])
        : order.status === 'CANCELLED' ? t('orders', 'noteCancelled')
        : w.reviewStatus === 'APPROVED' ? t('workflow', 'approved') : t('workflow', 'inReview');

    return (
        <section aria-labelledby="wf-heading" className="rounded-2xl ring-1 ring-line bg-surface p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="wf-heading" className="font-sans text-[17px] font-semibold text-heading">{t('workflow', 'title')}</h3>
                    <p className="text-[13.5px] text-ink-2 mt-0.5">{summary}</p>
                </div>
                <Link href="/protected-payments" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal hover:underline"><ShieldCheck size={14} aria-hidden /> {t('workflow', 'howItWorks')}</Link>
            </div>

            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {steps.map((s, i) => (
                    <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined}
                        className={cn('rounded-xl p-3.5 ring-1', s.state === 'current' ? 'ring-[#2EC4B6] bg-teal-soft/40' : s.state === 'stopped' ? 'ring-[#FCA5A5] bg-[#FEF2F2] dark:bg-red-500/10' : 'ring-line')}>
                        <div className="flex items-center gap-2">
                            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                                s.state === 'done' ? 'bg-[#0E7C74] text-white' : s.state === 'stopped' ? 'bg-[#B91C1C] text-white' : s.state === 'current' ? 'bg-cta text-cta-fg' : 'bg-surface-3 text-ink-3')}>
                                {s.state === 'done' ? <Check size={13} aria-hidden /> : s.state === 'stopped' ? <X size={13} aria-hidden /> : s.state === 'current' ? <Circle size={8} fill="currentColor" aria-hidden /> : i + 1}
                            </span>
                            <p className={cn('text-[13.5px] font-semibold', s.state === 'todo' ? 'text-ink-3' : 'text-ink')}>{t('workflow', s.title)}</p>
                        </div>
                        <p className="mt-1.5 text-[12.5px] text-ink-2 leading-relaxed">{t('workflow', s.detail, s.vars)}</p>
                        <p className="mt-1 text-[11.5px] font-medium text-ink-3">{t('workflow', 'acts', { who: t('workflow', s.who) })}</p>
                    </li>
                ))}
            </ol>

            {w.buyerMustAccept && w.approvedTerms && (
                <div className="rounded-2xl ring-1 ring-[#F59E0B]/40 bg-[#FFFBEB] dark:bg-amber-500/10 p-4 space-y-3">
                    <div className="flex gap-2.5">
                        <FileCheck2 size={18} className="text-[#B45309] shrink-0 mt-0.5" aria-hidden />
                        <div>
                            <p className="text-[14px] font-semibold text-ink">{t('workflow', 'changedTitle')}</p>
                            <p className="text-[13px] text-ink-2">{t('workflow', 'changedBody')}</p>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {w.submittedTerms && <TermsTable terms={w.submittedTerms} title={t('workflow', 'youSubmitted')} />}
                        <TermsTable terms={w.approvedTerms} title={t('workflow', 'confirmedTerms')} />
                    </div>
                    {err && <p role="alert" className="text-[13px] text-[#B91C1C]">{err}</p>}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={accept} disabled={busy} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:opacity-60">
                            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />} {t('workflow', 'accept', { version: w.termsVersion })}
                        </button>
                        <a href={`mailto:Info@atlantisfmcg.com?subject=${encodeURIComponent(t('workflow', 'contactSubject', { ref }))}`} className="h-10 px-5 inline-flex items-center rounded-xl ring-1 ring-line-strong text-[14px] font-semibold text-ink hover:bg-surface-2">{t('workflow', 'contact')}</a>
                    </div>
                </div>
            )}

            {!w.buyerMustAccept && shownTerms && (
                <details className="group rounded-xl ring-1 ring-line">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] rounded-xl">
                        <span>{w.approvedTerms ? t('workflow', 'confirmedTerms') : t('workflow', 'termsSubmitted')}{changed ? ` (${t('workflow', 'updated')})` : ''}</span>
                        <ChevronDown size={16} className="text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="px-4 pb-4"><TermsTable terms={shownTerms} title={w.approvedTerms ? t('workflow', 'confirmedTerms') : t('workflow', 'termsSubmitted')} /></div>
                </details>
            )}

            {(w.approvedTerms?.fulfillment || w.fulfillment) && (
                <div>
                    <p className="text-[13.5px] font-semibold text-ink mb-2">{t('workflow', 'deliveryTitle')}</p>
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
