'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trans } from '@/components/i18n/Trans';
import { Badge, Button, Dialog, ErrorState, Field, Notice, Skeleton, inputCls, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

type TL = (k: string, v?: Record<string, string | number>) => string;

const STAGE_TONE: Record<string, Tone> = {
    AWAITING_DESK: 'warning', REVISED: 'warning', COUNTER_OFFERED: 'info', DESK_REPLIED: 'info',
    AGREED_DESK: 'success', AGREED_BUYER: 'success', ACCEPTED_LEGACY: 'success', DECLINED_DESK: 'danger', DECLINED_BUYER: 'danger', WITHDRAWN: 'neutral',
};
const KNOWN_STAGES = Object.keys(STAGE_TONE);
const ACTIONS = ['SUBMITTED', 'DESK_COUNTER', 'DESK_REPLY', 'DESK_ACCEPT', 'DESK_DECLINE', 'BUYER_ACCEPT', 'BUYER_DECLINE', 'BUYER_REVISE', 'WITHDRAWN'];

/** The request's meaning (server-derived stage), always as text, never colour alone. */
export function StageBadge({ stage, tl }: { stage: string; tl: TL }) {
    return <Badge tone={STAGE_TONE[stage] || 'neutral'} dot>{KNOWN_STAGES.includes(stage) ? tl(`stage_${stage}`) : <bdi dir="ltr">{stage}</bdi>}</Badge>;
}

export function qtyText(tl: TL, qty: number, unit: string) {
    return tl(unit === 'PALLET' ? 'pallets' : unit === 'TRUCK' ? 'trucks' : 'cases', { count: qty });
}

type Outcome = 'ACCEPTED' | 'RESPONDED' | 'DECLINED';

/**
 * One target price for staff: everything the buyer asked, the listed buyer price
 * for reference, the supplier (staff only), the negotiation history with who
 * acted, and — for OWNER/ADMIN while the request is open — the answer form with
 * a review step. The confirmation shows the status the server saved.
 */
export default function TargetDetailDialog({ id, mayAnswer, onClose, onChanged }: { id: string | null; mayAnswer: boolean; onClose: () => void; onChanged: () => void }) {
    const { t, fmt, meta } = useLanguage();
    const tl: TL = React.useCallback((k, v) => t('adminTargets', k, v), [t]);
    const money = (n: number | null | undefined) => (n == null ? '—' : formatPrice(n, undefined, meta.intl));
    const when = (d: string) => fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const [r, setR] = React.useState<any | null>(null);
    const [error, setError] = React.useState(false);
    const [step, setStep] = React.useState<'form' | 'review'>('form');
    const [outcome, setOutcome] = React.useState<Outcome>('RESPONDED');
    const [counter, setCounter] = React.useState('');
    const [cases, setCases] = React.useState('');
    const [message, setMessage] = React.useState('');
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [saved, setSaved] = React.useState<string | null>(null);

    const load = React.useCallback(() => {
        if (!id) return;
        setError(false);
        apiFetch(`/target-prices/${id}`, { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then(setR).catch(() => setError(true));
    }, [id]);
    React.useEffect(() => {
        setR(null); setStep('form'); setOutcome('RESPONDED'); setCounter(''); setCases(''); setMessage(''); setFormError(null); setSaved(null); setBusy(false);
        load();
    }, [id, load]);

    if (!id) return null;
    const canAnswer = mayAnswer && !!r?.actions?.deskMayAnswer;
    const counterN = Number(counter.replace(',', '.'));
    const casesN = cases.trim() ? Number(cases) : null;

    const toReview = () => {
        setFormError(null);
        if (outcome === 'RESPONDED') {
            if (!(counterN > 0) || Math.round(counterN * 100) / 100 <= r.targetCasePrice) { setFormError(tl('fErrCounter')); return; }
            if (casesN !== null && (!Number.isInteger(casesN) || casesN < 1 || (r.moqCases && casesN < r.moqCases))) { setFormError(tl('fErrCases')); return; }
        }
        setStep('review');
    };

    const send = async () => {
        if (busy) return;
        setBusy(true); setFormError(null);
        try {
            const body: any = { status: outcome, response: message.trim() || undefined };
            if (outcome === 'RESPONDED') { body.counterCasePrice = counterN; if (casesN !== null) body.counterQuantityCases = casesN; }
            const res = await apiFetch(`/target-prices/${r.id}/respond`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : tl('sendError'));
            setSaved(String(d.stage || ''));
            onChanged();
            load();
            setStep('form');
        } catch (e: any) { setFormError(e.message || tl('sendError')); setStep('form'); }
        finally { setBusy(false); }
    };

    const outcomePrice = outcome === 'ACCEPTED' ? r?.targetCasePrice : outcome === 'RESPONDED' ? counterN : null;
    const outcomeCases = outcome === 'ACCEPTED' ? r?.quantityCases : outcome === 'RESPONDED' ? casesN ?? r?.quantityCases : null;
    const outcomeLabel = outcome === 'ACCEPTED' ? tl('oAccept') : outcome === 'RESPONDED' ? tl('oCounter') : tl('oDecline');

    const footer = !r ? <Button variant="secondary" onClick={onClose}>{tl('close')}</Button>
        : canAnswer && !saved
            ? step === 'review'
                ? <><Button variant="secondary" onClick={() => setStep('form')} disabled={busy}>{tl('fBack')}</Button><Button variant="primary" loading={busy} onClick={send}>{tl('fSend')}</Button></>
                : <><Button variant="secondary" onClick={onClose}>{tl('fCancel')}</Button><Button variant="primary" onClick={toReview}>{tl('fReview')}</Button></>
            : <Button variant="secondary" onClick={onClose}>{tl('close')}</Button>;

    const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
        <><dt className="text-ink-3">{label}</dt><dd className="text-ink-2 min-w-0 break-words">{children}</dd></>
    );

    return (
        <Dialog open={!!id} onClose={onClose} size="xl" footer={footer} title={r ? tl('detailTitle', { ref: r.ref }) : tl('detailLoading')} description={r?.product?.name}>
            <div data-no-translate className="space-y-5 text-[13.5px]">
                {error ? <ErrorState message={tl('detailError')} onRetry={load} />
                    : !r ? <div className="space-y-2" aria-busy="true"><span className="sr-only">{tl('detailLoading')}</span><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div>
                    : (
                        <>
                            <div className="flex flex-wrap items-center gap-2"><StageBadge stage={r.stage} tl={tl} /><span className="text-[12.5px] text-ink-3">{tl('dUpdated')} {when(r.updatedAt)}</span></div>
                            {saved && <Notice tone="success" title={<span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} aria-hidden /> {tl('sent', { status: KNOWN_STAGES.includes(saved) ? tl(`stage_${saved}`) : saved })}</span>} />}

                            <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2 rounded-lg bg-surface-2 ring-1 ring-line px-4 py-3">
                                <Row label={tl('dProduct')}>{r.product ? <Link href={`/admin/products/${r.product.id}`} className="text-teal font-medium hover:underline">{r.product.name}</Link> : '—'}{r.product?.ean && <> · <bdi dir="ltr" className="font-mono">{r.product.ean}</bdi></>}</Row>
                                <Row label={tl('dBuyer')}>{r.buyer ? <><Link href={`/admin/users/${r.buyer.id}`} className="text-teal font-medium hover:underline">{r.buyer.companyName || r.buyer.name}</Link> · <bdi dir="ltr">{r.buyer.email}</bdi></> : '—'}</Row>
                                <Row label={tl('dSupplier')}>{r.supplier ? <Link href={`/admin/users/${r.supplier.id}`} className="hover:underline">{r.supplier.companyName || r.supplier.name}</Link> : '—'} <span className="block text-[12px] text-ink-3">{tl('dSupplierNote')}</span></Row>
                                <Row label={tl('dTarget')}>
                                    <b className="text-ink tabular-nums">{tl('perCase', { price: money(r.targetCasePrice) })}</b>
                                    {r.originalTargetCasePrice == null && (r.currency !== 'EUR' || r.enteredBasis === 'PIECE') && <span className="block text-[12px] text-ink-3">{tl(r.enteredBasis === 'PIECE' ? 'dEnteredPiece' : 'dEnteredCase', { amount: fmt.number(Number(r.enteredPrice)), currency: r.currency })}</span>}
                                </Row>
                                {r.originalTargetCasePrice != null && <Row label={tl('dOriginal')}><span className="tabular-nums">{tl('perCase', { price: money(r.originalTargetCasePrice) })}</span></Row>}
                                <Row label={tl('dListedAtRequest')}><span className="tabular-nums">{r.listedCasePriceAtRequest != null ? tl('perCase', { price: money(r.listedCasePriceAtRequest) }) : tl('notRecorded')}</span></Row>
                                <Row label={tl('dListedNow')}><span className="tabular-nums">{r.listedCasePrice != null ? tl('perCase', { price: money(r.listedCasePrice) }) : tl('notRecorded')}</span></Row>
                                <Row label={tl('dQty')}><span className="tabular-nums">{qtyText(tl, r.quantity, r.quantityUnit)}{r.quantityUnit !== 'CASE' && <> · {tl('cases', { count: r.quantityCases })}</>}</span></Row>
                                {r.moqCases ? <Row label={tl('dMoq')}><span className="tabular-nums">{tl('cases', { count: r.moqCases })}</span></Row> : null}
                                <Row label={tl('dCountry')}>{r.deliveryCountry ? <bdi dir="ltr">{r.deliveryCountry}</bdi> : tl('notRecorded')}</Row>
                                {r.message && <Row label={tl('dMessage')}>“{r.message}”</Row>}
                                <Row label={tl('dCreated')}>{when(r.createdAt)}</Row>
                            </dl>

                            {(r.response || r.counterCasePrice) && (
                                <section aria-label={tl('dDeskReply')} className="rounded-lg ring-1 ring-line px-4 py-3">
                                    <h3 className="font-sans text-[13px] font-semibold text-ink">{tl('dDeskReply')}{r.respondedAt && <span className="ms-2 font-normal text-ink-3">{when(r.respondedAt)}</span>}</h3>
                                    {r.counterCasePrice != null && <p className="mt-1 tabular-nums"><Trans text={tl('dCounter', { price: money(r.counterCasePrice), count: r.counterQuantityCases ?? r.quantityCases })} tags={{ b: (c) => <b>{c}</b> }} /></p>}
                                    {r.response && <p className="mt-1 text-ink-2 whitespace-pre-line">{r.response}</p>}
                                </section>
                            )}

                            {r.agreedCasePrice != null && (
                                <Notice tone="success" title={<Trans text={tl('dAgreed', { price: money(r.agreedCasePrice), count: r.agreedQuantityCases ?? r.quantityCases })} tags={{ b: (c) => <b>{c}</b> }} />}>{tl('dAgreedNote')}</Notice>
                            )}

                            <section aria-labelledby="tp-history">
                                <h3 id="tp-history" className="font-sans text-[13px] font-semibold text-ink">{tl('dHistory')}</h3>
                                <ol className="mt-2 space-y-2 border-s border-line ps-4">
                                    {(r.history || []).map((h: any, i: number) => (
                                        <li key={i} className="relative">
                                            <span aria-hidden className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-line-strong" />
                                            <p className="text-ink"><b className="font-medium">{h.action && ACTIONS.includes(h.action) ? tl(`h_${h.action}`) : <bdi dir="ltr">{h.status}</bdi>}</b>
                                                {h.price != null && <span className="tabular-nums"> · {tl('perCase', { price: money(h.price) })}</span>}
                                                {h.cases != null && <span className="tabular-nums"> · {tl('cases', { count: h.cases })}</span>}</p>
                                            <p className="text-[12px] text-ink-3">{when(h.at)} · {h.actor?.kind === 'BUYER' ? tl('actorBuyer') : h.actor?.kind === 'STAFF' ? h.actor.name : tl('actorUnknown')}</p>
                                            {h.note && !['Submitted', 'Withdrawn by buyer'].includes(h.note) && <p className="mt-0.5 text-[12.5px] text-ink-2 whitespace-pre-line">{h.note}</p>}
                                        </li>
                                    ))}
                                </ol>
                            </section>

                            {canAnswer && !saved && (
                                <section aria-labelledby="tp-answer" className="rounded-lg ring-1 ring-line-strong px-4 py-4">
                                    <h3 id="tp-answer" className="font-sans text-[14px] font-semibold text-heading">{step === 'review' ? tl('rvTitle') : tl('fTitle')}</h3>
                                    {step === 'review' ? (
                                        <div className="mt-3 space-y-3">
                                            <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2">
                                                <Row label={tl('rvOutcome')}><b className="text-ink">{outcomeLabel}</b></Row>
                                                {outcomePrice != null && <Row label={tl('rvPrice')}><span className="tabular-nums">{money(outcomePrice)}</span></Row>}
                                                {outcomeCases != null && <Row label={tl('rvCases')}><span className="tabular-nums">{tl('cases', { count: outcomeCases })}</span></Row>}
                                                <Row label={tl('rvMessage')}>{message.trim() ? <span className="whitespace-pre-line">{message.trim()}</span> : <span className="text-ink-3">{tl('rvNoMessage')}</span>}</Row>
                                            </dl>
                                            <p className="text-[12.5px] text-ink-3">{tl('rvNotify')}</p>
                                        </div>
                                    ) : (
                                        <div className="mt-3 space-y-4">
                                            <fieldset>
                                                <legend className="text-[13px] font-medium text-ink mb-2">{tl('fOutcome')}</legend>
                                                <div className="grid gap-2 sm:grid-cols-3">
                                                    {(['ACCEPTED', 'RESPONDED', 'DECLINED'] as Outcome[]).map((o) => (
                                                        <label key={o} className={cn('flex gap-2 rounded-lg ring-1 px-3 py-2.5 cursor-pointer', outcome === o ? 'ring-2 ring-teal bg-teal-soft/40' : 'ring-line-strong hover:bg-surface-2')}>
                                                            <input type="radio" name="tp-outcome" value={o} checked={outcome === o} onChange={() => { setOutcome(o); setFormError(null); }} className="mt-0.5 accent-[#0E7C74]" />
                                                            <span><span className="block font-medium text-ink">{o === 'ACCEPTED' ? tl('oAccept') : o === 'RESPONDED' ? tl('oCounter') : tl('oDecline')}</span>
                                                                <span className="block text-[12px] text-ink-3">{o === 'ACCEPTED' ? tl('oAcceptHint', { price: money(r.targetCasePrice), count: r.quantityCases }) : o === 'RESPONDED' ? tl('oCounterHint') : tl('oDeclineHint')}</span></span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </fieldset>
                                            {outcome === 'RESPONDED' && (
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <Field label={tl('fCounterPrice')} htmlFor="tp-counter" required hint={<>{tl('fCounterPriceHint', { price: money(r.targetCasePrice) })}{counterN > 0 && r.unitsPerCase > 0 && <span className="block tabular-nums">{tl('fPerPiece', { price: money(Math.round((counterN / r.unitsPerCase) * 10000) / 10000), units: r.unitsPerCase })}</span>}</>}>
                                                        <input id="tp-counter" inputMode="decimal" value={counter} onChange={(e) => setCounter(e.target.value.replace(/[^\d.,]/g, ''))} className={cn(inputCls, 'tabular-nums')} placeholder="0.00" />
                                                    </Field>
                                                    <Field label={tl('fCounterCases')} htmlFor="tp-cases" optional hint={tl('fCounterCasesHint', { count: r.quantityCases })}>
                                                        <input id="tp-cases" inputMode="numeric" value={cases} onChange={(e) => setCases(e.target.value.replace(/\D/g, ''))} className={cn(inputCls, 'tabular-nums')} />
                                                    </Field>
                                                </div>
                                            )}
                                            <Field label={tl('fMessage')} htmlFor="tp-msg" optional>
                                                <textarea id="tp-msg" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tl('fMessagePh')} className={cn(inputCls, 'h-auto py-2')} />
                                            </Field>
                                        </div>
                                    )}
                                    {formError && <div className="mt-3"><Notice tone="danger">{formError}</Notice></div>}
                                </section>
                            )}
                        </>
                    )}
            </div>
        </Dialog>
    );
}
