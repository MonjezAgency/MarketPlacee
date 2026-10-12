'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListChecks, Plus, Trash2, Pencil, Package, Minus, ShoppingCart, AlertTriangle, Loader2, Check } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { getLists, createList, renameList, deleteList, setListQty, removeListItem, tierLabel, type ShoppingList, type ListItem } from '@/lib/lists';
import { ApiError } from '@/lib/wholesale';
import { cn } from '@/lib/utils';

/**
 * My lists. Lists store products, tiers and quantities only — never prices.
 * "Add to cart" re-prices everything on the server (the cart quote), so the
 * buyer always reviews today's prices and availability before ordering.
 */
export default function ListsPage() {
    const [lists, setLists] = React.useState<ShoppingList[] | null>(null);
    const [error, setError] = React.useState('');
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [newName, setNewName] = React.useState('');
    const [busy, setBusy] = React.useState(false);

    const load = React.useCallback(() => getLists()
        .then((l) => { setLists(l); setActiveId((cur) => (cur && l.some((x) => x.id === cur) ? cur : l[0]?.id ?? null)); })
        .catch((e) => { setLists([]); setError(e instanceof ApiError ? e.message : 'Could not load your lists.'); }), []);
    React.useEffect(() => { load(); }, [load]);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setBusy(true); setError('');
        try { const l = await createList(newName.trim()); setNewName(''); setActiveId(l.id); await load(); }
        catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the list.'); }
        finally { setBusy(false); }
    };

    const active = lists?.find((l) => l.id === activeId) ?? null;

    return (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-3">
                <form onSubmit={create} className="flex items-center gap-2">
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="New list name" aria-label="New list name"
                        className="flex-1 min-w-0 h-10 px-3 rounded-xl ring-1 ring-line focus:ring-2 focus:ring-[#2EC4B6] outline-none bg-surface text-[13.5px] text-ink placeholder:text-ink-4" />
                    <button type="submit" disabled={busy || !newName.trim()} className="h-10 px-3 inline-flex items-center gap-1.5 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold disabled:opacity-50"><Plus size={15} /> Create</button>
                </form>
                {error && <p role="alert" className="text-[13px] text-[#B91C1C] flex items-center gap-1.5"><AlertTriangle size={14} /> {error}</p>}
                {lists === null ? (
                    <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-surface-2 animate-pulse" />)}</div>
                ) : lists.length === 0 ? (
                    <div className="rounded-2xl ring-1 ring-line p-5 text-[13.5px] text-ink-3">
                        <ListChecks size={20} className="text-teal mb-2" />
                        No lists yet. Create one above, or after an order choose <span className="font-medium text-ink">“Save these items to a list”</span>.
                    </div>
                ) : (
                    <ul className="flex lg:flex-col gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
                        {lists.map((l) => (
                            <li key={l.id} className="shrink-0">
                                <button type="button" onClick={() => setActiveId(l.id)} aria-pressed={l.id === activeId}
                                    className={cn('w-[200px] lg:w-full text-start rounded-xl px-3.5 py-2.5 ring-1 transition-colors',
                                        l.id === activeId ? 'ring-2 ring-[#2EC4B6] bg-teal-soft/50' : 'ring-line hover:ring-line-strong')}>
                                    <span className="block text-[14px] font-semibold text-ink truncate">{l.name}</span>
                                    <span className="block text-[12px] text-ink-3">{l.items.length} {l.items.length === 1 ? 'item' : 'items'} · updated {new Date(l.updatedAt).toLocaleDateString()}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </aside>

            <section aria-live="polite">
                {active ? <ListDetail key={active.id} list={active} reload={load} /> : lists && lists.length > 0 ? null : (
                    <div className="rounded-2xl ring-1 ring-line px-6 py-12 text-center">
                        <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><ListChecks size={22} /></span>
                        <p className="mt-3 text-[15px] font-semibold text-ink">Reorder without searching</p>
                        <p className="mt-1 text-[13.5px] text-ink-3 max-w-md mx-auto">Keep the products you buy regularly in a list, adjust quantities, and send them to your cart in one step. Prices are always refreshed before you order.</p>
                    </div>
                )}
            </section>
        </div>
    );
}

function ListDetail({ list, reload }: { list: ShoppingList; reload: () => Promise<unknown> }) {
    const router = useRouter();
    const { items: cart, addItem } = useCart();
    const [name, setName] = React.useState(list.name);
    const [editing, setEditing] = React.useState(false);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

    const run = async (key: string, fn: () => Promise<unknown>) => {
        setBusy(key); setMsg(null);
        try { await fn(); await reload(); }
        catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong. Try again.' }); }
        finally { setBusy(null); }
    };

    const orderable = list.items.filter((i) => i.product?.available);
    const unavailable = list.items.length - orderable.length;

    const lineId = (i: ListItem) => (i.variantKey ? `${i.productId}::${i.variantKey}` : i.productId);
    const addAll = () => {
        let added = 0; const conflicts: string[] = [];
        for (const i of orderable) {
            const id = lineId(i);
            // The cart keeps one tier per product line; never silently change a tier already in the cart.
            const clash = cart.find((c) => (c.productId || c.id.split('::')[0]) === i.productId && c.id === id && c.tier && c.tier !== i.tier);
            if (clash) { conflicts.push(i.product!.name); continue; }
            addItem({
                id, productId: i.productId, name: i.product!.name, brand: i.product!.brand || '', price: 0,
                image: i.product!.image || '', unit: tierLabel(i.tier, 1).replace(/^./, (c) => c.toUpperCase()), tier: i.tier,
                selectedVariants: i.selectedVariants ?? undefined,
            }, i.quantity);
            added++;
        }
        setMsg({ ok: true, text: `${added} ${added === 1 ? 'line' : 'lines'} added to your cart at today’s prices.${conflicts.length ? ` Skipped (already in cart at another unit): ${conflicts.join(', ')}.` : ''}${unavailable ? ` ${unavailable} unavailable item${unavailable === 1 ? '' : 's'} left out.` : ''}` });
    };

    return (
        <div className="rounded-2xl ring-1 ring-line bg-surface">
            <header className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-4 border-b border-line">
                {editing ? (
                    <form className="flex-1 flex items-center gap-2 min-w-0" onSubmit={(e) => { e.preventDefault(); run('rename', () => renameList(list.id, name)).then(() => setEditing(false)); }}>
                        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="List name" className="flex-1 min-w-0 h-9 px-3 rounded-lg ring-1 ring-line focus:ring-2 focus:ring-[#2EC4B6] outline-none bg-surface text-[15px] text-ink" />
                        <button type="submit" className="h-9 px-3 rounded-lg bg-heading text-surface text-[13px] font-semibold">Save</button>
                    </form>
                ) : (
                    <h2 className="flex-1 min-w-0 text-[17px] font-semibold text-heading truncate">{list.name}</h2>
                )}
                {!editing && <button type="button" onClick={() => setEditing(true)} aria-label="Rename list" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-2"><Pencil size={15} /></button>}
                <button type="button" onClick={() => { if (confirm(`Delete “${list.name}”? This can’t be undone.`)) run('delete', () => deleteList(list.id)); }} aria-label="Delete list" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-3 hover:text-[#B91C1C] hover:bg-surface-2"><Trash2 size={15} /></button>
            </header>

            {list.items.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13.5px] text-ink-3">
                    <Package size={22} className="mx-auto text-ink-4 mb-2" />
                    This list is empty. Save items from an order, or <Link href="/categories" className="text-teal font-semibold hover:underline">browse the catalog</Link>.
                </div>
            ) : (
                <ul className="divide-y divide-line">
                    {list.items.map((i) => {
                        const p = i.product;
                        const off = !p?.available;
                        return (
                            <li key={i.id} className={cn('flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 sm:px-5 py-3', off && 'opacity-70')}>
                                <span className="relative w-11 h-11 shrink-0 rounded-full bg-media ring-1 ring-line overflow-clip">
                                    {p?.image
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={p.image} alt="" className="absolute inset-0 m-auto max-w-[78%] max-h-[78%] object-contain mix-blend-multiply" />
                                        : <span className="absolute inset-0 flex items-center justify-center text-ink-4"><Package size={15} /></span>}
                                </span>
                                <span className="min-w-0 flex-1">
                                    {p ? <Link href={`/products/${p.id}`} className="block text-[14px] font-medium text-ink truncate hover:text-teal">{p.name}</Link> : <span className="block text-[14px] font-medium text-ink-3">Product no longer listed</span>}
                                    <span className="block text-[12px] text-ink-3 truncate">
                                        {i.variantKey ? i.variantKey.replace(/\|/g, ' · ').replace(/=/g, ': ') + ' · ' : ''}
                                        {off ? <span className="text-[#B91C1C] font-medium">Currently unavailable</span> : p?.ean ? `EAN ${p.ean}` : `By the ${tierLabel(i.tier, 1)}`}
                                    </span>
                                </span>
                                <span className="flex items-center gap-2 ms-auto">
                                    <span className="flex items-center h-9 rounded-lg ring-1 ring-line">
                                        <button type="button" aria-label="Decrease" disabled={!!busy || i.quantity <= 1} onClick={() => run(i.id, () => setListQty(list.id, i.id, i.quantity - 1))} className="w-8 h-full flex items-center justify-center text-ink-2 disabled:opacity-30"><Minus size={14} /></button>
                                        <span className="min-w-[2.5rem] text-center text-[13.5px] font-semibold tabular-nums">{busy === i.id ? <Loader2 size={13} className="inline animate-spin" /> : i.quantity}</span>
                                        <button type="button" aria-label="Increase" disabled={!!busy} onClick={() => run(i.id, () => setListQty(list.id, i.id, i.quantity + 1))} className="w-8 h-full flex items-center justify-center text-ink-2 disabled:opacity-30"><Plus size={14} /></button>
                                    </span>
                                    <span className="w-14 text-[12.5px] text-ink-3">{tierLabel(i.tier, i.quantity)}</span>
                                    <button type="button" aria-label={`Remove ${p?.name ?? 'item'}`} disabled={!!busy} onClick={() => run('rm' + i.id, () => removeListItem(list.id, i.id))} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-[#B91C1C]"><Trash2 size={14} /></button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            <footer className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-4 border-t border-line">
                <p className="text-[12.5px] text-ink-3 flex-1 min-w-[200px]">Prices and availability are checked again in your cart — nothing is ordered until you check out.</p>
                {orderable.length > 0 && (
                    <>
                        <button type="button" onClick={addAll} disabled={!!busy} className="h-10 px-4 inline-flex items-center gap-2 rounded-xl ring-1 ring-line-strong text-[13.5px] font-semibold text-ink hover:bg-surface-2"><ShoppingCart size={15} /> Add all to cart</button>
                        <button type="button" onClick={() => { addAll(); router.push('/cart'); }} disabled={!!busy} className="h-10 px-4 inline-flex items-center rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">Review &amp; reorder</button>
                    </>
                )}
                {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('w-full text-[13px] flex items-start gap-1.5', msg.ok ? 'text-ink-2' : 'text-[#B91C1C]')}>{msg.ok ? <Check size={14} className="text-teal mt-0.5" /> : <AlertTriangle size={14} className="mt-0.5" />}{msg.text}</p>}
            </footer>
        </div>
    );
}
