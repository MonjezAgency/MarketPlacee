'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Target } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trans } from '@/components/i18n/Trans';
import { Badge, Button, Dialog, Field, Notice, inputCls, type Tone } from '@/components/supplier/ui';

const STAGE_TONE: Record<string, Tone> = {
    AWAITING_DESK: 'warning', REVISED: 'warning', COUNTER_OFFERED: 'info', DESK_REPLIED: 'info',
    AGREED_DESK: 'success', AGREED_BUYER: 'success', ACCEPTED_LEGACY: 'success', DECLINED_DESK: 'danger', DECLINED_BUYER: 'danger', WITHDRAWN: 'neutral',
};
const ACTIONS = ['SUBMITTED', 'DESK_COUNTER', 'DESK_REPLY', 'DESK_ACCEPT', 'DESK_DECLINE', 'BUYER_ACCEPT', 'BUYER_DECLINE', 'BUYER_REVISE', 'WITHDRAWN'];
type Act = 'ACCEPT' | 'DECLINE' | 'REVISE' | 'WITHDRAW';

/**
 * The buyer's own target prices (GET /target-prices/mine — only theirs). Every
 * status is explained, with the next action the server allows: accept / decline
 * a counter-offer, send a new target, withdraw. Agreements are shown honestly:
 * checkout prices from the catalog and does not apply an agreed price.
 */
export default function TargetPricesPage() {
    const { t, fmt, meta } = useLanguage();
    const tt = React.useCallback((k: string, v?: Record<string, string | number>) => t('targetPrice', k, v), [t]);
    const money = (n: number) => formatPrice(n, undefined, meta.intl);
    const [rows, setRows] = React.useState<any[] | null>(null);
    const [error, setError] = React.useState(false);
    const [focus, setFocus] = React.useState<string | null>(null);
    const [act, setAct] = React.useState<{ kind: Act; r: any } | null>(null);
    const [done, setDone] = React.useState<{ id: string; key: string } | null>(null);

    const load = React.useCallback(() => apiFetch('/target-prices/mine', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => { setRows(d); setError(false); })
        .catch(() => { setRows((x) => x ?? []); setError(true); }), []);
    React.useEffect(() => { load(); }, [load]);
    // Opened from a notification or email (?ref=TP-…): bring that request into view.
    React.useEffect(() => { const ref = new URLSearchParams(window.location.search).get('ref'); if (ref) setFocus(ref.slice(0, 20)); }, []);
    React.useEffect(() => {
        if (!focus || !rows?.length) return;
        document.getElementById(`tp-${focus}`)?.scrollIntoView({ block: 'center' });
    }, [focus, rows]);

    const qty = (n: number, unit: string) => tt(unit === 'PALLET' ? 'qtyPallets' : unit === 'TRUCK' ? 'qtyTrucks' : 'casesCount', { count: n });

    return (
        <div data-no-translate className="text-start">
            <p className="text-[13.5px] text-ink-3 mb-4 max-w-prose">{tt('bIntro')}</p>
            {error && <div className="mb-4"><Notice tone="danger" action={<Button size="sm" variant="secondary" onClick={load}>{tt('bRetry')}</Button>}>{tt('bLoadError')}</Notice></div>}
            {rows === null ? <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-28 rounded-2xl bg-surface-2 animate-pulse motion-reduce:animate-none" />)}</div>
                : rows.length === 0 && !error ? (
                    <div className="rounded-2xl ring-1 ring-line px-5 py-10 text-center">
                        <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Target size={22} aria-hidden /></span>
                        <p className="mt-3 text-[15px] font-semibold text-ink">{tt('bEmptyTitle')}</p>
                        <p className="mt-1 text-[13.5px] text-ink-3">{tt('bEmptyText')}</p>
                        <Link href="/categories" className="mt-4 inline-flex h-10 items-center px-4 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">{tt('bBrowse')}</Link>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {rows.map((r) => {
                            const a = r.actions || {};
                            const counterCases = r.counterQuantityCases ?? r.quantityCases;
                            return (
                                <li key={r.id} id={`tp-${r.ref}`} className={cn('rounded-2xl ring-1 bg-surface p-4 sm:p-5 scroll-mt-24', focus === r.ref ? 'ring-2 ring-teal' : 'ring-line')}>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        {r.product ? <Link href={`/products/${r.product.id}`} className="font-semibold text-heading hover:underline">{r.product.name}</Link> : <span className="font-semibold text-heading">{tt('bProduct')}</span>}
                                        <Badge tone={STAGE_TONE[r.stage] || 'neutral'} dot>{STAGE_TONE[r.stage] ? tt(`st_${r.stage}`) : <bdi dir="ltr">{r.status}</bdi>}</Badge>
                                        <span className="ms-auto text-[12.5px] text-ink-3"><bdi dir="ltr">{r.ref}</bdi> · {fmt.date(r.createdAt)}</span>
                                    </div>
                                    <p className="mt-1 text-[12.5px] text-ink-3">{tt(`next_${r.stage}`)}</p>

                                    <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[13px]">
                                        <div><dt className="text-ink-3">{tt('bYourTarget')}</dt><dd className="font-semibold text-ink tabular-nums">{tt('bPerCase', { price: money(r.targetCasePrice) })}</dd>
                                            {r.originalTargetCasePrice == null && (r.currency !== 'EUR' || r.enteredBasis === 'PIECE') && <dd className="text-[12px] text-ink-3">{tt(r.enteredBasis === 'PIECE' ? 'bEnteredPiece' : 'bEnteredCase', { amount: fmt.number(Number(r.enteredPrice)), currency: r.currency })}</dd>}
                                            {r.originalTargetCasePrice != null && <dd className="text-[12px] text-ink-3 tabular-nums">{tt('bOriginal', { price: money(r.originalTargetCasePrice) })}</dd>}
                                        </div>
                                        <div><dt className="text-ink-3">{tt('bListedAtRequest')}</dt><dd className="text-ink-2 tabular-nums">{r.listedCasePriceAtRequest != null ? tt('bPerCase', { price: money(r.listedCasePriceAtRequest) }) : tt('bNotRecorded')}</dd></div>
                                        <div><dt className="text-ink-3">{tt('bListedNow')}</dt><dd className="text-ink-2 tabular-nums">{r.listedCasePrice != null ? tt('bPerCase', { price: money(r.listedCasePrice) }) : tt('bNotRecorded')}</dd></div>
                                        <div><dt className="text-ink-3">{tt('quantity')}</dt><dd className="text-ink-2 tabular-nums">{qty(r.quantity, r.quantityUnit)}{r.quantityUnit !== 'CASE' && <span className="block text-[12px] text-ink-3">{tt('casesCount', { count: r.quantityCases })}</span>}</dd></div>
                                        {r.deliveryCountry && <div><dt className="text-ink-3">{tt('country')}</dt><dd className="text-ink-2"><bdi dir="ltr">{r.deliveryCountry}</bdi></dd></div>}
                                        {r.message && <div className="col-span-2 sm:col-span-3"><dt className="text-ink-3">{tt('bYourMessage')}</dt><dd className="text-ink-2 break-words">{r.message}</dd></div>}
                                    </dl>
                                    <p className="mt-2 text-[12px] text-ink-3">{tt('bUnitNote')}</p>

                                    {(r.response || r.counterCasePrice != null) && (
                                        <div className="mt-3 rounded-lg bg-surface-2 ring-1 ring-line px-3 py-2.5 text-[13.5px] text-ink-2">
                                            <p className="text-[12.5px] font-semibold text-ink">{tt('bDesk')}{r.respondedAt && <span className="ms-2 font-normal text-ink-3">{fmt.date(r.respondedAt)}</span>}</p>
                                            {r.counterCasePrice != null && <p className="mt-1 tabular-nums"><Trans text={tt('bCounter', { price: money(r.counterCasePrice), count: counterCases })} tags={{ b: (c) => <b className="text-ink">{c}</b> }} /></p>}
                                            {r.response && <p className="mt-1 whitespace-pre-line">{r.response}</p>}
                                        </div>
                                    )}

                                    {r.agreedCasePrice != null && (
                                        <div className="mt-3 space-y-2">
                                            <Notice tone="success" title={<Trans text={tt('bAgreed', { price: money(r.agreedCasePrice), count: r.agreedQuantityCases ?? r.quantityCases })} tags={{ b: (c) => <b>{c}</b> }} />} />
                                            <Notice tone="warning" title={tt('bOrderTitle')}>
                                                {tt('bOrderBody')}
                                                <span className="mt-2 flex flex-wrap gap-2">
                                                    {r.product && <Link href={`/products/${r.product.id}`} className="inline-flex h-9 items-center px-3 rounded-lg ring-1 ring-line-strong bg-surface text-[13px] font-semibold text-ink hover:bg-surface-2">{tt('bOpenProduct')}</Link>}
                                                    <Link href="/dashboard/customer/support" className="inline-flex h-9 items-center px-3 rounded-lg ring-1 ring-line-strong bg-surface text-[13px] font-semibold text-ink hover:bg-surface-2">{tt('bContactSupport')}</Link>
                                                </span>
                                            </Notice>
                                        </div>
                                    )}
                                    {r.stage === 'ACCEPTED_LEGACY' && <div className="mt-3"><Notice tone="info">{tt('bAgreedLegacy')}</Notice></div>}

                                    {done && done.id === r.id && <p role="status" className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700"><CheckCircle2 size={15} aria-hidden /> {tt(done.key)}</p>}

                                    {(a.buyerMayAcceptCounter || a.buyerMayDeclineCounter || a.buyerMayRevise || a.buyerMayWithdraw) && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {a.buyerMayAcceptCounter && <Button size="sm" variant="primary" onClick={() => setAct({ kind: 'ACCEPT', r })}>{tt('bAccept')}</Button>}
                                            {a.buyerMayDeclineCounter && <Button size="sm" variant="secondary" onClick={() => setAct({ kind: 'DECLINE', r })}>{tt('bDecline')}</Button>}
                                            {a.buyerMayRevise && <Button size="sm" variant="secondary" onClick={() => setAct({ kind: 'REVISE', r })}>{tt('bRevise')}</Button>}
                                            {a.buyerMayWithdraw && <Button size="sm" variant="ghost" onClick={() => setAct({ kind: 'WITHDRAW', r })}>{tt('bWithdraw')}</Button>}
                                        </div>
                                    )}

                                    {(r.history || []).length > 0 && (
                                        <details className="mt-3 group">
                                            <summary className="inline-flex items-center gap-1 cursor-pointer text-[12.5px] font-medium text-ink-2 hover:text-heading list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded">
                                                <ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180 motion-reduce:transition-none" /> {tt('bHistory')}
                                            </summary>
                                            <ol className="mt-2 space-y-1.5 border-s border-line ps-3 text-[12.5px]">
                                                {r.history.map((h: any, i: number) => (
                                                    <li key={i}>
                                                        <span className="text-ink">{h.action && ACTIONS.includes(h.action) ? tt(`h_${h.action}`) : <bdi dir="ltr">{h.status}</bdi>}</span>
                                                        {h.price != null && <span className="tabular-nums text-ink-2"> · {tt('bPerCase', { price: money(h.price) })}</span>}
                                                        <span className="text-ink-3"> · {fmt.date(h.at)}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </details>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            <ActionDialog act={act} onClose={() => setAct(null)} onDone={(id, key) => { setAct(null); setDone({ id, key }); load(); }} />
        </div>
    );
}

/** Confirm step for every buyer action; the result shown is the server's. One request in flight at a time. */
function ActionDialog({ act, onClose, onDone }: { act: { kind: Act; r: any } | null; onClose: () => void; onDone: (id: string, key: string) => void }) {
    const { t, meta } = useLanguage();
    const tt = (k: string, v?: Record<string, string | number>) => t('targetPrice', k, v);
    const money = (n: number) => formatPrice(n, undefined, meta.intl);
    const [price, setPrice] = React.useState('');
    const [message, setMessage] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    React.useEffect(() => { setPrice(''); setMessage(''); setBusy(false); setError(null); }, [act]);
    if (!act) return null;
    const { kind, r } = act;
    const counterCases = r.counterQuantityCases ?? r.quantityCases;
    const p = Number(price.replace(',', '.'));

    const submit = async () => {
        if (busy) return;
        setError(null);
        if (kind === 'REVISE') {
            if (!(p > 0)) { setError(tt('bNewTargetErr')); return; }
            if (r.counterCasePrice != null && Math.round(p * 100) / 100 >= r.counterCasePrice) { setError(tt('bNewTargetHigh')); return; }
        }
        setBusy(true);
        try {
            const res = kind === 'WITHDRAW'
                ? await apiFetch(`/target-prices/${r.id}/withdraw`, { method: 'PATCH' })
                : await apiFetch(`/target-prices/${r.id}/decision`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: kind, counterCasePrice: kind === 'ACCEPT' ? r.counterCasePrice : undefined, targetCasePrice: kind === 'REVISE' ? p : undefined, message: message.trim() || undefined }),
                });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : tt('bActionError'));
            onDone(r.id, kind === 'ACCEPT' ? 'bDoneAccepted' : kind === 'DECLINE' ? 'bDoneDeclined' : kind === 'REVISE' ? 'bDoneRevised' : 'bDoneWithdrawn');
        } catch (e: any) { setError(e.message || tt('bActionError')); }
        finally { setBusy(false); }
    };

    const title = tt(kind === 'ACCEPT' ? 'bAcceptTitle' : kind === 'DECLINE' ? 'bDeclineTitle' : kind === 'REVISE' ? 'bReviseTitle' : 'bWithdrawTitle');
    const confirm = tt(kind === 'ACCEPT' ? 'bConfirmAccept' : kind === 'DECLINE' ? 'bConfirmDecline' : kind === 'REVISE' ? 'bConfirmRevise' : 'bConfirmWithdraw');
    return (
        <Dialog open onClose={onClose} title={title} description={r.product?.name} size="sm"
            footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>{tt('cancel')}</Button><Button variant={kind === 'WITHDRAW' || kind === 'DECLINE' ? 'danger' : 'primary'} loading={busy} onClick={submit}>{confirm}</Button></>}>
            <div className="space-y-3 text-[13.5px] text-ink-2" data-no-translate>
                {kind === 'ACCEPT' && <p><Trans text={tt('bAcceptBody', { price: money(r.counterCasePrice), count: counterCases })} tags={{ b: (c) => <b className="text-ink">{c}</b> }} /></p>}
                {kind === 'DECLINE' && <p>{tt('bDeclineBody')}</p>}
                {kind === 'WITHDRAW' && <p>{tt('bWithdrawBody')}</p>}
                {kind === 'REVISE' && (
                    <>
                        <p>{tt('bReviseBody')}</p>
                        <Field label={tt('bNewTarget')} htmlFor="tp-new" required hint={r.counterCasePrice != null ? tt('bReviseHint', { price: money(r.counterCasePrice) }) : undefined}>
                            <input id="tp-new" data-autofocus inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0.00" className={cn(inputCls, 'tabular-nums')} />
                        </Field>
                    </>
                )}
                {kind !== 'WITHDRAW' && (
                    <Field label={tt('bOptionalMsg')} htmlFor="tp-dmsg" optional>
                        <textarea id="tp-dmsg" rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} className={cn(inputCls, 'h-auto py-2')} />
                    </Field>
                )}
                {error && <p role="alert" className="flex items-start gap-1.5 text-[13px] text-[#B91C1C]"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden /> {error}</p>}
            </div>
        </Dialog>
    );
}
