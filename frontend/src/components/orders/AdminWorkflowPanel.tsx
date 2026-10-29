'use client';

import * as React from 'react';
import { toast } from 'react-hot-toast';
import { CheckCircle2, XCircle, RefreshCw, PencilLine, ClipboardCheck, Loader2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { eur } from '@/lib/fulfillment';
import {
    CONFIRMATION_LABEL, CONFIRMATION_TONE, FINDING_TYPE, INSPECTION_STATUS, RESOLUTION,
    amendOrder, approveOrder, rejectOrder, requestConfirmation, saveInspection,
    type AdminWorkflow, type Inspection, type InspectionFinding, type Resolution,
} from '@/lib/order-workflow';
import { InspectionReport } from './InspectionReport';

type Item = { id: string; quantity: number; unitPrice: number; product?: { name?: string } | null };
const field = 'w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13.5px] focus:outline-none focus:ring-2 focus:ring-teal-500/40';
const btn = 'h-10 px-4 inline-flex items-center gap-1.5 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-50';

/**
 * Ali FMCG staff controls for the confirmation workflow. Buttons mirror what
 * the server allows; the server checks every action again (approval is refused
 * until every supplier accepted the current terms version).
 */
export function AdminWorkflowPanel({ orderId, status, workflow, items, inspections, onChange }: {
    orderId: string; status: string; workflow: AdminWorkflow; items: Item[]; inspections: Inspection[]; onChange: () => void;
}) {
    const w = workflow;
    const [busy, setBusy] = React.useState<string | null>(null);
    const [mode, setMode] = React.useState<'none' | 'approve' | 'reject' | 'amend' | 'inspect'>('none');
    const [note, setNote] = React.useState('');
    const [amend, setAmend] = React.useState<Record<string, { quantity: string; unitPrice: string }>>({});
    const [editing, setEditing] = React.useState<Inspection | null>(null);
    const awaiting = w.reviewStatus === 'PENDING_REVIEW' && ['PENDING', 'PAID'].includes(status);

    const run = async (key: string, fn: () => Promise<any>, ok: string) => {
        setBusy(key);
        try { await fn(); toast.success(ok); setMode('none'); setNote(''); onChange(); }
        catch (e: any) { toast.error(e?.message || 'That didn’t work.'); }
        finally { setBusy(null); }
    };

    const startAmend = () => {
        setAmend(Object.fromEntries(items.map((i) => [i.id, { quantity: String(i.quantity), unitPrice: String(i.unitPrice) }])));
        setNote(''); setMode('amend');
    };
    const amendLines = items.flatMap((i) => {
        const d = amend[i.id]; if (!d) return [];
        const q = Number(d.quantity), p = Number(d.unitPrice);
        const line: { itemId: string; quantity?: number; unitPrice?: number } = { itemId: i.id };
        if (Number.isFinite(q) && q !== i.quantity) line.quantity = q;
        if (Number.isFinite(p) && p !== i.unitPrice) line.unitPrice = p;
        return line.quantity != null || line.unitPrice != null ? [line] : [];
    });

    return (
        <section className="text-start bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-[15px] font-semibold text-slate-900">Confirmation workflow</h2>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                        Terms version {w.termsVersion} · {w.reviewStatus === 'APPROVED' ? `approved${w.reviewedAt ? ` ${new Date(w.reviewedAt).toLocaleString()}` : ''}` : w.reviewStatus === 'REJECTED' ? 'rejected' : 'awaiting approval'}
                        {w.buyerMustAccept ? ' · buyer must accept the changed terms before shipping' : w.buyerAcceptedVersion ? ` · buyer accepted v${w.buyerAcceptedVersion}` : ''}
                    </p>
                </div>
                {w.party && <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[12px] font-semibold">{w.party.buyer}</span>}
            </div>

            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {w.suppliers.map((s) => (
                    <li key={s.supplierId} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[13px]">
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{s.name}</p>
                            <p className="text-slate-500">
                                {s.decidedAt ? `Answered ${new Date(s.decidedAt).toLocaleString()}` : s.deadline ? `Answer due ${new Date(s.deadline).toLocaleString()}` : ''}
                                {s.note ? ` · “${s.note}”` : ''}
                            </p>
                        </div>
                        <span className={cn('px-2 py-0.5 rounded-md text-[12px] font-semibold', CONFIRMATION_TONE[s.status])}>{CONFIRMATION_LABEL[s.status]}</span>
                    </li>
                ))}
                {w.suppliers.length === 0 && <li className="px-3.5 py-2.5 text-[13px] text-slate-500">No supplier confirmations recorded.</li>}
            </ul>

            {w.approvalBlocker && awaiting && (
                <p className="flex gap-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {w.approvalBlocker}</p>
            )}

            {awaiting && mode === 'none' && (
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={cn(btn, 'bg-teal-600 text-white hover:bg-teal-700')} disabled={!!w.approvalBlocker} title={w.approvalBlocker || undefined} onClick={() => { setNote(''); setMode('approve'); }}><CheckCircle2 size={15} /> Approve order</button>
                    <button type="button" className={cn(btn, 'border border-slate-200 text-slate-700 hover:bg-slate-50')} onClick={startAmend}><PencilLine size={15} /> Amend terms</button>
                    {w.suppliers.some((s) => s.status === 'PENDING' || s.status === 'EXPIRED') && (
                        <button type="button" className={cn(btn, 'border border-slate-200 text-slate-700 hover:bg-slate-50')} disabled={busy === 'ask'} onClick={() => run('ask', () => requestConfirmation(orderId), 'Suppliers asked again with a new deadline')}>
                            {busy === 'ask' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Ask suppliers again
                        </button>
                    )}
                    <button type="button" className={cn(btn, 'border border-red-200 text-red-700 hover:bg-red-50')} onClick={() => { setNote(''); setMode('reject'); }}><XCircle size={15} /> Reject order</button>
                </div>
            )}

            {mode === 'approve' && (
                <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
                    <p className="text-[13.5px] font-semibold text-slate-900">Approve terms v{w.termsVersion}</p>
                    <p className="text-[13px] text-slate-600">The terms are frozen as the confirmed order, the order moves to “Confirmed”, and the buyer is told. Send payment details to the buyer as usual.</p>
                    <label className="block text-[12.5px] font-medium text-slate-600" htmlFor="wf-note">Internal note (optional)</label>
                    <input id="wf-note" className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Stock and pricing checked with both suppliers" />
                    <div className="flex gap-2 pt-1">
                        <button type="button" className={cn(btn, 'bg-teal-600 text-white hover:bg-teal-700')} disabled={busy === 'approve'} onClick={() => run('approve', () => approveOrder(orderId, note.trim() || undefined), 'Order approved')}>
                            {busy === 'approve' && <Loader2 size={15} className="animate-spin" />} Approve
                        </button>
                        <button type="button" className={cn(btn, 'text-slate-600 hover:bg-slate-100')} onClick={() => setMode('none')}>Cancel</button>
                    </div>
                </div>
            )}

            {mode === 'reject' && (
                <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-4">
                    <p className="text-[13.5px] font-semibold text-slate-900">Reject this order</p>
                    <p className="text-[13px] text-slate-600">The order is cancelled, reserved stock is returned, and the buyer sees your reason.</p>
                    <label className="block text-[12.5px] font-medium text-slate-600" htmlFor="wf-reason">Reason for the buyer</label>
                    <textarea id="wf-reason" className={cn(field, 'h-auto py-2')} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                    <div className="flex gap-2 pt-1">
                        <button type="button" className={cn(btn, 'bg-red-600 text-white hover:bg-red-700')} disabled={busy === 'reject' || note.trim().length < 5} onClick={() => run('reject', () => rejectOrder(orderId, note.trim()), 'Order rejected')}>
                            {busy === 'reject' && <Loader2 size={15} className="animate-spin" />} Reject order
                        </button>
                        <button type="button" className={cn(btn, 'text-slate-600 hover:bg-slate-100')} onClick={() => setMode('none')}>Cancel</button>
                    </div>
                </div>
            )}

            {mode === 'amend' && (
                <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                    <div>
                        <p className="text-[13.5px] font-semibold text-slate-900">Amend terms (creates version {w.termsVersion + 1})</p>
                        <p className="text-[13px] text-slate-600">Quantities can only go down (the stock difference is returned). Suppliers whose lines change must accept again; the buyer must accept the new terms before shipping.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead><tr className="text-slate-500"><th className="text-start font-medium py-1.5">Line</th><th className="text-end font-medium py-1.5 w-28">Quantity</th><th className="text-end font-medium py-1.5 w-32">Buyer unit price €</th></tr></thead>
                            <tbody>
                                {items.map((i) => (
                                    <tr key={i.id} className="border-t border-slate-100">
                                        <td className="py-2 pe-2 text-slate-800">{i.product?.name || 'Line'}<span className="text-slate-400"> · was {i.quantity} at {eur(i.unitPrice)}</span></td>
                                        <td className="py-2 ps-2"><input aria-label={`Quantity for ${i.product?.name || 'line'}`} type="number" min={1} max={i.quantity} step={1} className={cn(field, 'text-end')} value={amend[i.id]?.quantity ?? ''} onChange={(e) => setAmend((a) => ({ ...a, [i.id]: { ...a[i.id], quantity: e.target.value } }))} /></td>
                                        <td className="py-2 ps-2"><input aria-label={`Unit price for ${i.product?.name || 'line'}`} type="number" min={0} step={0.01} className={cn(field, 'text-end')} value={amend[i.id]?.unitPrice ?? ''} onChange={(e) => setAmend((a) => ({ ...a, [i.id]: { ...a[i.id], unitPrice: e.target.value } }))} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <label className="block text-[12.5px] font-medium text-slate-600" htmlFor="wf-amend-reason">What changed and why (suppliers and the buyer see this)</label>
                    <input id="wf-amend-reason" className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Supplier has only 1 pallet of this flavour" />
                    <div className="flex gap-2">
                        <button type="button" className={cn(btn, 'bg-slate-900 text-white hover:bg-slate-800')} disabled={busy === 'amend' || !amendLines.length || note.trim().length < 5} onClick={() => run('amend', () => amendOrder(orderId, { lines: amendLines, reason: note.trim() }), `Terms amended to version ${w.termsVersion + 1}`)}>
                            {busy === 'amend' && <Loader2 size={15} className="animate-spin" />} Save as version {w.termsVersion + 1}
                        </button>
                        <button type="button" className={cn(btn, 'text-slate-600 hover:bg-slate-100')} onClick={() => setMode('none')}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Inspections — records of inspections actually performed */}
            <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[13.5px] font-semibold text-slate-900">Inspections</p>
                    {status !== 'CANCELLED' && mode !== 'inspect' && (
                        <button type="button" className={cn(btn, 'h-9 border border-slate-200 text-slate-700 hover:bg-slate-50')} onClick={() => { setEditing(null); setMode('inspect'); }}><ClipboardCheck size={15} /> Record inspection</button>
                    )}
                </div>
                {mode === 'inspect' && <InspectionForm orderId={orderId} items={items} initial={editing} onCancel={() => setMode('none')} onSaved={() => { setMode('none'); onChange(); }} />}
                {inspections.length === 0 && mode !== 'inspect' && <p className="text-[13px] text-slate-500">No inspection recorded. Record one only when an inspection actually took place or is booked.</p>}
                {inspections.map((i) => (
                    <div key={i.id} className="space-y-1.5">
                        <InspectionReport inspection={i} />
                        {status !== 'CANCELLED' && <button type="button" className="text-[12.5px] font-semibold text-teal-700 hover:underline" onClick={() => { setEditing(i); setMode('inspect'); }}>Update this inspection</button>}
                    </div>
                ))}
            </div>
        </section>
    );
}

function InspectionForm({ orderId, items, initial, onCancel, onSaved }: { orderId: string; items: Item[]; initial: Inspection | null; onCancel: () => void; onSaved: () => void }) {
    const [status, setStatus] = React.useState<Inspection['status']>(initial?.status || 'SCHEDULED');
    const [date, setDate] = React.useState(initial?.inspectedAt ? initial.inspectedAt.slice(0, 10) : '');
    const [inspector, setInspector] = React.useState(initial?.inspectorName || '');
    const [received, setReceived] = React.useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, String(initial?.lines.find((l) => l.itemId === i.id)?.received ?? '')])));
    const [findings, setFindings] = React.useState<{ type: InspectionFinding['type']; itemId: string; note: string }[]>(initial?.findings.map((f) => ({ type: f.type, itemId: f.itemId || '', note: f.note })) || []);
    const [photos, setPhotos] = React.useState((initial?.photos || []).join('\n'));
    const [resolution, setResolution] = React.useState<Resolution>(initial?.resolution || 'PENDING');
    const [resolutionNote, setResolutionNote] = React.useState(initial?.resolutionNote || '');
    const [busy, setBusy] = React.useState(false);
    const done = status !== 'SCHEDULED';

    const submit = async () => {
        setBusy(true);
        try {
            await saveInspection(orderId, {
                status, inspectedAt: date || undefined, inspectorName: inspector.trim() || undefined,
                lines: items.filter((i) => received[i.id] !== '' && received[i.id] != null).map((i) => ({ itemId: i.id, received: Number(received[i.id]) })),
                findings: findings.filter((f) => f.note.trim()).map((f) => ({ type: f.type, itemId: f.itemId || null, note: f.note.trim() })),
                photos: photos.split(/\s+/).filter(Boolean), resolution, resolutionNote: resolutionNote.trim() || undefined,
            }, initial?.id);
            toast.success('Inspection saved — the buyer can see it on their order');
            onSaved();
        } catch (e: any) { toast.error(e?.message || 'Could not save the inspection.'); }
        finally { setBusy(false); }
    };

    return (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-[12.5px] font-medium text-slate-600">Status
                    <select className={cn(field, 'mt-1')} value={status} onChange={(e) => setStatus(e.target.value as Inspection['status'])}>
                        {Object.entries(INSPECTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </label>
                <label className="text-[12.5px] font-medium text-slate-600">Inspection date{done && ' *'}
                    <input type="date" className={cn(field, 'mt-1')} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="text-[12.5px] font-medium text-slate-600">Inspector{done && ' *'}
                    <input className={cn(field, 'mt-1')} value={inspector} onChange={(e) => setInspector(e.target.value)} maxLength={120} placeholder="Name or company" />
                </label>
            </div>
            {done && (
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead><tr className="text-slate-500"><th className="text-start font-medium py-1.5">Line</th><th className="text-end font-medium py-1.5 w-24">Ordered</th><th className="text-end font-medium py-1.5 w-28">Received</th></tr></thead>
                        <tbody>{items.map((i) => (
                            <tr key={i.id} className="border-t border-slate-100">
                                <td className="py-2 text-slate-800">{i.product?.name || 'Line'}</td>
                                <td className="py-2 text-end tabular-nums text-slate-500">{i.quantity}</td>
                                <td className="py-2 ps-2"><input aria-label={`Received for ${i.product?.name || 'line'}`} type="number" min={0} step={1} className={cn(field, 'text-end')} value={received[i.id] ?? ''} onChange={(e) => setReceived((r) => ({ ...r, [i.id]: e.target.value }))} /></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            {done && (
                <div className="space-y-2">
                    <p className="text-[12.5px] font-medium text-slate-600">Findings{status !== 'PASSED' && ' *'}</p>
                    {findings.map((f, n) => (
                        <div key={n} className="grid gap-2 sm:grid-cols-[160px_1fr_1.4fr_auto] items-center">
                            <select aria-label="Finding type" className={field} value={f.type} onChange={(e) => setFindings((fs) => fs.map((x, j) => j === n ? { ...x, type: e.target.value as InspectionFinding['type'] } : x))}>
                                {Object.entries(FINDING_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <select aria-label="Line" className={field} value={f.itemId} onChange={(e) => setFindings((fs) => fs.map((x, j) => j === n ? { ...x, itemId: e.target.value } : x))}>
                                <option value="">Whole order</option>
                                {items.map((i) => <option key={i.id} value={i.id}>{i.product?.name || 'Line'}</option>)}
                            </select>
                            <input aria-label="What was found" className={field} value={f.note} maxLength={500} onChange={(e) => setFindings((fs) => fs.map((x, j) => j === n ? { ...x, note: e.target.value } : x))} placeholder="e.g. EAN on cartons differs from listing" />
                            <button type="button" aria-label="Remove finding" className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" onClick={() => setFindings((fs) => fs.filter((_, j) => j !== n))}><Trash2 size={15} /></button>
                        </div>
                    ))}
                    <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-teal-700 hover:underline" onClick={() => setFindings((fs) => [...fs, { type: 'CONDITION', itemId: '', note: '' }])}><Plus size={13} /> Add finding</button>
                </div>
            )}
            {done && (
                <label className="block text-[12.5px] font-medium text-slate-600">Photo links (https, one per line)
                    <textarea className={cn(field, 'mt-1 h-auto py-2 font-mono text-[12px]')} rows={2} value={photos} onChange={(e) => setPhotos(e.target.value)} />
                </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[12.5px] font-medium text-slate-600">Outcome
                    <select className={cn(field, 'mt-1')} value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}>
                        {Object.entries(RESOLUTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </label>
                <label className="text-[12.5px] font-medium text-slate-600">Outcome note (buyer sees this)
                    <input className={cn(field, 'mt-1')} value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} maxLength={1000} placeholder="e.g. 5% price adjustment agreed with the supplier" />
                </label>
            </div>
            <p className="text-[12px] text-slate-500">Recording an outcome doesn’t move money. Any refund or price adjustment is arranged separately and should be described in the note.</p>
            <div className="flex gap-2">
                <button type="button" className={cn(btn, 'bg-slate-900 text-white hover:bg-slate-800')} disabled={busy} onClick={submit}>{busy && <Loader2 size={15} className="animate-spin" />} Save inspection</button>
                <button type="button" className={cn(btn, 'text-slate-600 hover:bg-slate-100')} onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
}
