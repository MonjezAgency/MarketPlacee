'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Search, Target } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { Button, Dialog, EmptyState, ErrorState, Field, inputCls, selectCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

const TABS = ['OPEN', 'RESPONDED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', ''] as const;
const LABEL: Record<string, string> = { OPEN: 'Open', RESPONDED: 'Answered', ACCEPTED: 'Accepted', DECLINED: 'Declined', WITHDRAWN: 'Withdrawn', '': 'All' };

/** Atlantis sourcing desk: buyers' target prices. Answering never changes listings or creates orders. */
export default function AdminTargetPricesPage() {
    const [status, setStatus] = React.useState<string>('OPEN');
    const [q, setQ] = React.useState('');
    const [data, setData] = React.useState<any | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [answer, setAnswer] = React.useState<any | null>(null);
    const load = React.useCallback(() => {
        setError(null);
        apiFetch(`/target-prices?status=${status}&q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
            .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || 'Couldn’t load target prices'); return r.json(); })
            .then(setData).catch((e) => setError(e.message));
    }, [status, q]);
    React.useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

    return (
        <div className="max-w-[1200px] mx-auto p-6 text-start">
            <h1 className="text-[24px] font-semibold text-heading">Target prices</h1>
            <p className="text-[14px] text-ink-3">Prices buyers asked for on product pages. Compare with the listed price, then answer. Answering notifies the buyer; it doesn’t change the listing or create an order.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="flex gap-1">{TABS.map((t) => <button key={t || 'all'} onClick={() => setStatus(t)} className={cn('h-8 px-3 rounded-md text-[13px] font-medium', status === t ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>{LABEL[t]}</button>)}</div>
                <label className="relative ms-auto w-full sm:w-[300px]"><span className="sr-only">Search</span><Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ref, product, barcode or buyer email" className={cn(inputCls, 'ps-9')} /></label>
            </div>
            {error && <div className="mt-4"><ErrorState message={error} onRetry={load} /></div>}
            <div className="mt-4 rounded-xl ring-1 ring-line bg-surface overflow-x-auto">
                {!data ? <div className="p-6 text-ink-3 text-[13.5px]">Loading…</div> : !data.data.length ? <EmptyState icon={<Target size={20} />} title="Nothing here">No target prices with this status.</EmptyState> : (
                    <table className="w-full text-[13.5px]">
                        <thead><tr className="text-[12px] text-ink-3 bg-surface-2/60">{['Ref', 'Product', 'Buyer', 'Target / case', 'Listed / case', 'Quantity', 'Status', ''].map((h) => <th key={h} className="text-start font-medium px-3 py-2">{h}</th>)}</tr></thead>
                        <tbody>
                            {data.data.map((r: any) => {
                                const gap = r.listedCasePrice ? ((r.targetCasePrice - r.listedCasePrice) / r.listedCasePrice) * 100 : null;
                                return (
                                    <tr key={r.id} className="border-t border-line align-top">
                                        <td className="px-3 py-2.5 font-mono text-[12.5px]">{r.ref}<span className="block font-sans text-ink-4">{new Date(r.createdAt).toLocaleDateString()}</span></td>
                                        <td className="px-3 py-2.5 max-w-[240px]"><Link href={`/products/${r.product?.id}`} className="hover:underline">{r.product?.name}</Link><span className="block text-[12px] text-ink-3 font-mono">{r.product?.ean}</span>{r.message && <span className="block text-[12px] text-ink-3 mt-1">“{r.message}”</span>}</td>
                                        <td className="px-3 py-2.5">{r.buyer?.companyName || r.buyer?.name}<span className="block text-[12px] text-ink-3">{r.buyer?.email}</span></td>
                                        <td className="px-3 py-2.5 tabular-nums font-semibold">{formatPrice(r.targetCasePrice)}{(r.currency !== 'EUR' || r.enteredBasis === 'PIECE') && <span className="block text-[12px] font-normal text-ink-3">entered {r.enteredPrice} {r.currency}/{r.enteredBasis.toLowerCase()}</span>}</td>
                                        <td className="px-3 py-2.5 tabular-nums">{r.listedCasePrice ? formatPrice(r.listedCasePrice) : '—'}{gap !== null && <span className={cn('block text-[12px]', gap < 0 ? 'text-amber-800' : 'text-emerald-700')}>{gap > 0 ? '+' : ''}{gap.toFixed(1)}%</span>}</td>
                                        <td className="px-3 py-2.5 tabular-nums">{r.quantity} {r.quantityUnit.toLowerCase()}<span className="block text-[12px] text-ink-3">{r.quantityCases} cases</span></td>
                                        <td className="px-3 py-2.5">{LABEL[r.status] || r.status}{r.response && <span className="block text-[12px] text-ink-3 max-w-[200px]">{r.response}</span>}</td>
                                        <td className="px-3 py-2.5">{['OPEN', 'RESPONDED'].includes(r.status) && <Button size="sm" variant="primary" onClick={() => setAnswer(r)}>Answer</Button>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            <AnswerDialog req={answer} onClose={() => setAnswer(null)} onDone={() => { setAnswer(null); load(); }} />
        </div>
    );
}

function AnswerDialog({ req, onClose, onDone }: { req: any | null; onClose: () => void; onDone: () => void }) {
    const [status, setStatus] = React.useState('RESPONDED');
    const [response, setResponse] = React.useState('');
    const [counter, setCounter] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    React.useEffect(() => { setStatus('RESPONDED'); setResponse(''); setCounter(''); }, [req]);
    if (!req) return null;
    const send = async () => {
        setBusy(true);
        try {
            const r = await apiFetch(`/target-prices/${req.id}/respond`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, response, counterCasePrice: counter ? Number(counter) : null }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.message || 'Couldn’t send the answer');
            toast.success('Answer sent to the buyer'); onDone();
        } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    return (
        <Dialog open={!!req} onClose={onClose} title={`Answer ${req.ref}`} description={`${req.product?.name} — target ${formatPrice(req.targetCasePrice)} per case`}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={send}>Send answer</Button></>}>
            <div className="space-y-3">
                <Field label="Outcome" htmlFor="ans-status"><select id="ans-status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}><option value="RESPONDED">Answer / counter-offer (keeps it open)</option><option value="ACCEPTED">Accept</option><option value="DECLINED">Decline</option></select></Field>
                <Field label="Message to the buyer" htmlFor="ans-msg" required><textarea id="ans-msg" rows={3} value={response} onChange={(e) => setResponse(e.target.value)} className={cn(inputCls, 'h-auto py-2')} /></Field>
                <Field label="Counter price per case (EUR)" htmlFor="ans-counter" optional><input id="ans-counter" inputMode="decimal" value={counter} onChange={(e) => setCounter(e.target.value.replace(/[^\d.]/g, ''))} className={inputCls} /></Field>
                <p className="text-[12px] text-ink-3">Accepting doesn’t change the listed price or create an order — follow up with the buyer to place it.</p>
            </div>
        </Dialog>
    );
}
