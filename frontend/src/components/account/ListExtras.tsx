'use client';

import * as React from 'react';
import { Search, Plus, Check, Loader2, BellRing, Package } from 'lucide-react';
import { fetchProductPage } from '@/lib/api';
import type { Product } from '@/lib/types';
import { addListItems, updateList, type ShoppingList } from '@/lib/lists';
import { ApiError } from '@/lib/wholesale';
import { cn } from '@/lib/utils';

const toLocalInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Description + reorder reminder (we notify on the date; nothing is ordered automatically). */
export function ListDetails({ list, reload }: { list: ShoppingList; reload: () => Promise<unknown> }) {
    const [desc, setDesc] = React.useState(list.description || '');
    const [when, setWhen] = React.useState(toLocalInput(list.nextReminderAt));
    const [repeat, setRepeat] = React.useState(list.reminderRepeat || 'none');
    const [busy, setBusy] = React.useState(false);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    const dirty = desc !== (list.description || '') || when !== toLocalInput(list.nextReminderAt) || repeat !== (list.reminderRepeat || 'none');
    const save = async () => {
        setBusy(true); setMsg(null);
        try {
            await updateList(list.id, { description: desc, nextReminderAt: when ? new Date(when).toISOString() : null, reminderRepeat: repeat });
            await reload();
            setMsg({ ok: true, text: when ? `Saved. We’ll remind you on ${new Date(when).toLocaleString()}${repeat !== 'none' ? `, then ${repeat}` : ''}.` : 'Saved.' });
        } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' }); }
        finally { setBusy(false); }
    };
    const field = 'h-10 px-3 rounded-lg ring-1 ring-line bg-surface text-[13.5px] text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6]';
    return (
        <div className="px-4 sm:px-5 py-4 border-b border-line space-y-3">
            <label className="block">
                <span className="block text-[12.5px] font-medium text-ink-2 mb-1">Description</span>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Monthly drinks restock for the Rotterdam warehouse"
                    className="w-full px-3 py-2 rounded-lg ring-1 ring-line bg-surface text-[13.5px] text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6] resize-y" />
            </label>
            <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 mb-1"><BellRing size={13} /> Remind me to reorder</span>
                    <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
                </label>
                <label className="block">
                    <span className="block text-[12.5px] font-medium text-ink-2 mb-1">Repeat</span>
                    <select value={repeat} onChange={(e) => setRepeat(e.target.value as any)} className={cn(field, 'pe-8')}>
                        <option value="none">Once</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
                    </select>
                </label>
                {when && <button type="button" onClick={() => setWhen('')} className="h-10 px-2 text-[12.5px] font-medium text-ink-3 hover:text-ink">Clear reminder</button>}
                <button type="button" onClick={save} disabled={busy || !dirty} className="ms-auto h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold disabled:bg-surface-3 disabled:text-ink-4">
                    {busy && <Loader2 size={13} className="animate-spin" />} Save
                </button>
            </div>
            <p className="text-[12px] text-ink-4">On the date you’ll get a notification to review this list — nothing is ordered for you.</p>
            {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('text-[13px]', msg.ok ? 'text-teal' : 'text-[#B91C1C]')}>{msg.text}</p>}
        </div>
    );
}

/** Search the catalog and tap products to add them to this list (same chip style as brand preferences). */
export function ProductPicker({ list, reload }: { list: ShoppingList; reload: () => Promise<unknown> }) {
    const [open, setOpen] = React.useState(list.items.length === 0);
    const [q, setQ] = React.useState('');
    const [items, setItems] = React.useState<Product[] | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [err, setErr] = React.useState('');
    const inList = new Set(list.items.map((i) => i.productId));

    React.useEffect(() => {
        if (!open) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => {
            fetchProductPage({ q: q.trim() || undefined, limit: 30, sort: q.trim() ? 'relevance' : 'newest' } as any, ctrl.signal)
                .then((r) => setItems(r.items)).catch((e) => { if (e?.name !== 'AbortError') setItems([]); });
        }, 250);
        return () => { clearTimeout(t); ctrl.abort(); };
    }, [q, open]);

    const add = async (p: Product) => {
        setBusy(p.id); setErr('');
        try { await addListItems(list.id, [{ productId: p.id, tier: 'carton', quantity: 1 }]); await reload(); }
        catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not add that product.'); }
        finally { setBusy(null); }
    };

    if (!open) {
        return (
            <div className="px-4 sm:px-5 py-3 border-b border-line">
                <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface-2"><Plus size={14} /> Add products</button>
            </div>
        );
    }
    return (
        <div className="px-4 sm:px-5 py-4 border-b border-line space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-semibold text-ink">Choose products</p>
                <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] font-medium text-ink-3 hover:text-ink">Done</button>
            </div>
            <label className="flex items-center gap-2 h-11 px-3.5 rounded-xl ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6] bg-surface">
                <Search size={16} className="text-ink-4 shrink-0" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product name, brand or EAN" className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-4" />
            </label>
            <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto pe-1">
                {items === null && <span className="text-[13px] text-ink-3 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading products…</span>}
                {items?.length === 0 && <p className="text-[13px] text-ink-3">No products match “{q}”.</p>}
                {items?.map((p) => {
                    const added = inList.has(p.id);
                    return (
                        <button key={p.id} type="button" disabled={added || busy === p.id} onClick={() => add(p)} aria-pressed={added}
                            className={cn('inline-flex items-center gap-2 h-11 ps-1.5 pe-3 rounded-full ring-1 text-[13px] font-medium max-w-full transition-colors',
                                added ? 'bg-heading text-surface ring-heading' : 'bg-surface text-ink ring-line hover:ring-line-strong')}>
                            <span className="relative w-8 h-8 shrink-0 rounded-full bg-white ring-1 ring-line overflow-clip">
                                {p.image
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={p.image} alt="" className="absolute inset-0 m-auto max-w-[78%] max-h-[78%] object-contain" />
                                    : <Package size={14} className="absolute inset-0 m-auto text-ink-4" />}
                            </span>
                            <span className="truncate max-w-[240px]">{p.name}</span>
                            {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : added ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} />}
                        </button>
                    );
                })}
            </div>
            {err && <p role="alert" className="text-[13px] text-[#B91C1C]">{err}</p>}
        </div>
    );
}
