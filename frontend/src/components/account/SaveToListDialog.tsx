'use client';

import * as React from 'react';
import Link from 'next/link';
import { X, ListPlus, Check, Loader2 } from 'lucide-react';
import { getLists, saveOrderToList, type ShoppingList } from '@/lib/lists';
import { ApiError } from '@/lib/wholesale';
import { cn } from '@/lib/utils';

/**
 * "Save these items to a list for next time." Copies the order's real product
 * lines into an existing or new list. Saving twice updates quantities — it
 * never creates duplicate rows (enforced by the server).
 */
export function SaveToListDialog({ orderId, open, onClose }: { orderId: string; open: boolean; onClose: () => void }) {
    const [lists, setLists] = React.useState<ShoppingList[] | null>(null);
    const [target, setTarget] = React.useState<string>('new');
    const [name, setName] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const [done, setDone] = React.useState<{ listId: string; saved: number; skipped: number } | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setDone(null); setError('');
        getLists().then((l) => { setLists(l); setTarget(l[0]?.id ?? 'new'); }).catch(() => setLists([]));
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;
    const save = async () => {
        if (target === 'new' && !name.trim()) { setError('Name your new list.'); return; }
        setBusy(true); setError('');
        try { setDone(await saveOrderToList(orderId, target === 'new' ? { name: name.trim() } : { listId: target })); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save the list. Try again.'); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4 text-start" role="dialog" aria-modal="true" aria-labelledby="stl-title">
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgba(15,23,42,0.45)]" />
            <div className="relative w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl bg-surface ring-1 ring-line shadow-[0_24px_60px_rgba(15,23,42,0.2)] p-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
                <div className="flex items-start gap-3">
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><ListPlus size={19} /></span>
                    <div className="flex-1 min-w-0">
                        <h2 id="stl-title" className="text-[16px] font-semibold text-heading">Save these items to a list</h2>
                        <p className="text-[13px] text-ink-3">Reorder them next time without searching the catalog.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-2"><X size={16} /></button>
                </div>

                {done ? (
                    <div className="mt-5">
                        <p className="flex items-center gap-2 text-[14px] text-ink"><Check size={16} className="text-teal" /> Saved {done.saved} {done.saved === 1 ? 'item' : 'items'}{done.skipped ? ` (${done.skipped} no longer listed)` : ''}.</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl ring-1 ring-line-strong text-[13.5px] font-medium text-ink">Close</button>
                            <Link href="/dashboard/customer/lists" className="h-10 px-4 inline-flex items-center rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">Open My lists</Link>
                        </div>
                    </div>
                ) : (
                    <>
                        <fieldset className="mt-5 space-y-2" disabled={busy}>
                            <legend className="sr-only">Choose a list</legend>
                            {lists === null ? <p className="text-[13px] text-ink-3 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading your lists…</p> : lists.map((l) => (
                                <label key={l.id} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 cursor-pointer', target === l.id ? 'ring-2 ring-[#2EC4B6] bg-teal-soft/50' : 'ring-line hover:ring-line-strong')}>
                                    <input type="radio" name="stl" checked={target === l.id} onChange={() => setTarget(l.id)} className="accent-[#0E7C74]" />
                                    <span className="flex-1 min-w-0 text-[14px] text-ink truncate">{l.name}</span>
                                    <span className="text-[12px] text-ink-3">{l.items.length} items</span>
                                </label>
                            ))}
                            <label className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 cursor-pointer', target === 'new' ? 'ring-2 ring-[#2EC4B6] bg-teal-soft/50' : 'ring-line hover:ring-line-strong')}>
                                <input type="radio" name="stl" checked={target === 'new'} onChange={() => setTarget('new')} className="accent-[#0E7C74]" />
                                <input value={name} onChange={(e) => { setName(e.target.value); setTarget('new'); }} maxLength={80} placeholder="New list name, e.g. Weekly drinks"
                                    className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-4" />
                            </label>
                        </fieldset>
                        {error && <p role="alert" className="mt-3 text-[13px] text-[#B91C1C]">{error}</p>}
                        <div className="mt-5 flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl text-[13.5px] font-medium text-ink-2 hover:text-ink">Not now</button>
                            <button type="button" onClick={save} disabled={busy || lists === null} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">
                                {busy && <Loader2 size={14} className="animate-spin" />} Save to list
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
