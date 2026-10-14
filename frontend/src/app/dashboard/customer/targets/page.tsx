'use client';

import * as React from 'react';
import Link from 'next/link';
import { Target, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { label: string; cls: string }> = {
    OPEN: { label: 'Under review', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
    RESPONDED: { label: 'Answered', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
    ACCEPTED: { label: 'Accepted', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    DECLINED: { label: 'Declined', cls: 'bg-red-50 text-red-700 ring-red-200' },
    WITHDRAWN: { label: 'Withdrawn', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

/** The buyer's own target-price requests (only theirs; private). */
export default function TargetPricesPage() {
    const [rows, setRows] = React.useState<any[] | null>(null);
    const [error, setError] = React.useState(false);
    const [busy, setBusy] = React.useState<string | null>(null);
    const load = React.useCallback(() => apiFetch('/target-prices/mine', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setRows(d); setError(false); }).catch(() => { setRows((x) => x ?? []); setError(true); }), []);
    React.useEffect(() => { load(); }, [load]);

    const withdraw = async (id: string) => {
        if (!confirm('Withdraw this target price?')) return;
        setBusy(id);
        const r = await apiFetch(`/target-prices/${id}/withdraw`, { method: 'PATCH' }).catch(() => null);
        setBusy(null);
        if (!r?.ok) { alert('Couldn’t withdraw — it may already be closed.'); }
        load();
    };

    return (
        <div>
            <p className="text-[13.5px] text-ink-3 mb-4">Prices you asked for on product pages. The Atlantis sourcing desk replies here and in your notifications; we also tell you if a listed price drops to your target. Nothing is ordered automatically.</p>
            {error && <p role="alert" className="mb-4 flex items-center gap-2 text-[13.5px] text-[#B91C1C]"><AlertTriangle size={15} /> We couldn’t load your target prices. Refresh to try again.</p>}
            {rows === null ? <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
                : rows.length === 0 ? (
                    <div className="rounded-2xl ring-1 ring-line px-5 py-10 text-center">
                        <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Target size={22} /></span>
                        <p className="mt-3 text-[15px] font-semibold text-ink">No target prices yet</p>
                        <p className="mt-1 text-[13.5px] text-ink-3">Open a product and choose “Set target price” to tell us what you’d pay.</p>
                        <Link href="/categories" className="mt-4 inline-flex h-10 items-center px-4 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">Browse catalog</Link>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {rows.map((r) => {
                            const st = STATUS[r.status] || { label: r.status, cls: 'bg-slate-100 text-slate-600 ring-slate-200' };
                            return (
                                <li key={r.id} className="rounded-2xl ring-1 ring-line bg-surface p-4 sm:p-5">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <Link href={`/products/${r.product?.id}`} className="font-semibold text-heading hover:underline">{r.product?.name || 'Product'}</Link>
                                        <span className={cn('text-[12px] font-semibold px-2.5 py-0.5 rounded-full ring-1 ring-inset', st.cls)}>{st.label}</span>
                                        <span className="ms-auto text-[12.5px] text-ink-3">{r.ref} · {new Date(r.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <p className="mt-1.5 text-[13.5px] text-ink-2">Target <b>{formatPrice(r.targetCasePrice)}</b> per case{r.currency !== 'EUR' || r.enteredBasis === 'PIECE' ? ` (you entered ${r.enteredPrice} ${r.currency} per ${r.enteredBasis.toLowerCase()})` : ''} · {r.quantity.toLocaleString()} {r.quantityUnit.toLowerCase()}{r.quantity === 1 ? '' : 's'} ({r.quantityCases.toLocaleString()} cases)</p>
                                    {r.response && <p className="mt-2 rounded-lg bg-surface-2 ring-1 ring-line px-3 py-2 text-[13.5px] text-ink-2"><b className="text-ink">Atlantis:</b> {r.response}{r.counterCasePrice ? ` — offer ${formatPrice(r.counterCasePrice)} per case.` : ''}</p>}
                                    {['OPEN', 'RESPONDED'].includes(r.status) && (
                                        <button type="button" disabled={busy === r.id} onClick={() => withdraw(r.id)} className="mt-3 h-8 px-3 rounded-lg ring-1 ring-line-strong text-[12.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">Withdraw</button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
        </div>
    );
}
