'use client';

import * as React from 'react';
import Link from 'next/link';
import { Target, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trans } from '@/components/i18n/Trans';

/** Display keys (buyerAccount section) for the server's status enum. */
const STATUS: Record<string, { key: string; cls: string }> = {
    OPEN: { key: 'tgStatusOpen', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
    RESPONDED: { key: 'tgStatusResponded', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
    ACCEPTED: { key: 'tgStatusAccepted', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    DECLINED: { key: 'tgStatusDeclined', cls: 'bg-red-50 text-red-700 ring-red-200' },
    WITHDRAWN: { key: 'tgStatusWithdrawn', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
};
const QTY_KEY: Record<string, string> = { CASE: 'tgQtyCase', PALLET: 'tgQtyPallet', TRUCK: 'tgQtyTruck' };

/** The buyer's own target-price requests (only theirs; private). */
export default function TargetPricesPage() {
    const { t, fmt, meta } = useLanguage();
    const money = (n: number) => formatPrice(n, undefined, meta.intl);
    const [rows, setRows] = React.useState<any[] | null>(null);
    const [error, setError] = React.useState(false);
    const [busy, setBusy] = React.useState<string | null>(null);
    const load = React.useCallback(() => apiFetch('/target-prices/mine', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setRows(d); setError(false); }).catch(() => { setRows((x) => x ?? []); setError(true); }), []);
    React.useEffect(() => { load(); }, [load]);

    const withdraw = async (id: string) => {
        if (!confirm(t('buyerAccount', 'tgWithdrawConfirm'))) return;
        setBusy(id);
        const r = await apiFetch(`/target-prices/${id}/withdraw`, { method: 'PATCH' }).catch(() => null);
        setBusy(null);
        if (!r?.ok) { alert(t('buyerAccount', 'tgWithdrawError')); }
        load();
    };

    return (
        <div data-no-translate>
            <p className="text-[13.5px] text-ink-3 mb-4">{t('buyerAccount', 'tgIntro')}</p>
            {error && <p role="alert" className="mb-4 flex items-center gap-2 text-[13.5px] text-[#B91C1C]"><AlertTriangle size={15} /> {t('buyerAccount', 'tgLoadError')}</p>}
            {rows === null ? <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
                : rows.length === 0 ? (
                    <div className="rounded-2xl ring-1 ring-line px-5 py-10 text-center">
                        <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Target size={22} /></span>
                        <p className="mt-3 text-[15px] font-semibold text-ink">{t('buyerAccount', 'tgEmptyTitle')}</p>
                        <p className="mt-1 text-[13.5px] text-ink-3">{t('buyerAccount', 'tgEmptyText')}</p>
                        <Link href="/categories" className="mt-4 inline-flex h-10 items-center px-4 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">{t('buyerAccount', 'browseCatalog')}</Link>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {rows.map((r) => {
                            const st = STATUS[r.status];
                            const stCls = st?.cls || 'bg-slate-100 text-slate-600 ring-slate-200';
                            const qtyKey = QTY_KEY[r.quantityUnit] || 'tgQtyCase';
                            return (
                                <li key={r.id} className="rounded-2xl ring-1 ring-line bg-surface p-4 sm:p-5">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <Link href={`/products/${r.product?.id}`} className="font-semibold text-heading hover:underline">{r.product?.name || t('buyerAccount', 'tgProduct')}</Link>
                                        <span className={cn('text-[12px] font-semibold px-2.5 py-0.5 rounded-full ring-1 ring-inset', stCls)}>{st ? t('buyerAccount', st.key) : <bdi dir="ltr">{r.status}</bdi>}</span>
                                        <span className="ms-auto text-[12.5px] text-ink-3"><bdi dir="ltr">{r.ref}</bdi> · {fmt.date(r.createdAt)}</span>
                                    </div>
                                    <p className="mt-1.5 text-[13.5px] text-ink-2"><Trans text={t('buyerAccount', 'tgTarget', { price: money(r.targetCasePrice) })} tags={{ b: (c) => <b>{c}</b> }} />{r.currency !== 'EUR' || r.enteredBasis === 'PIECE' ? <> {t('buyerAccount', r.enteredBasis === 'PIECE' ? 'tgEnteredPiece' : 'tgEnteredCase', { amount: fmt.number(Number(r.enteredPrice)), currency: r.currency })}</> : null} · {t('buyerAccount', qtyKey, { count: r.quantity })} ({t('buyerAccount', 'tgQtyCase', { count: r.quantityCases })})</p>
                                    {r.response && <p className="mt-2 rounded-lg bg-surface-2 ring-1 ring-line px-3 py-2 text-[13.5px] text-ink-2"><b className="text-ink">{t('buyerAccount', 'tgReply')}</b> {r.response}{r.counterCasePrice ? <> — {t('buyerAccount', 'tgCounter', { price: money(r.counterCasePrice) })}</> : null}</p>}
                                    {['OPEN', 'RESPONDED'].includes(r.status) && (
                                        <button type="button" disabled={busy === r.id} onClick={() => withdraw(r.id)} className="mt-3 h-8 px-3 rounded-lg ring-1 ring-line-strong text-[12.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">{t('buyerAccount', 'tgWithdraw')}</button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
        </div>
    );
}
