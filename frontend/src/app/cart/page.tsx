'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Minus, Plus, Trash2, ShoppingBag, ArrowRight, AlertTriangle, Barcode, CalendarDays, Package, Truck, Layers,
    Loader2, MapPin, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { useCart, type CartItem } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { formatPrice } from '@/lib/currency';
import { useCurrency } from '@/contexts/CurrencyContext';
import { fetchProductPage } from '@/lib/api';
import type { Product } from '@/lib/types';
import { cn, prettifyVariantSignature } from '@/lib/utils';
import {
    quoteCart, listLoads, updateLoad, deleteLoad, addToLoad, loadLabel, ApiError,
    type CartQuote, type QuoteLine, type MixedLoad,
} from '@/lib/wholesale';

/* ── helpers ─────────────────────────────────────────────────────────── */
const UNIT_SHORT: Record<string, string> = { carton: 'cs', pallet: 'pal.', truck: 'trk' };
const UNIT_WORD: Record<string, [string, string]> = { carton: ['case', 'cases'], pallet: ['pallet', 'pallets'], truck: ['truckload', 'truckloads'] };
const unitWord = (tier: string | undefined, n: number) => (UNIT_WORD[tier || 'carton'] ?? UNIT_WORD.carton)[n === 1 ? 0 : 1];
const fmtDate = (s?: string | null) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
/** Dispatch line from real product data only: ready stock, or the longest supplier lead time. */
function dispatchStrip(rows: { leadTime?: number | null; readyForDispatch?: boolean; exwLocation?: string | null }[]) {
    if (!rows.length) return undefined;
    const lead = Math.max(0, ...rows.filter((r) => !r.readyForDispatch).map((r) => Number(r.leadTime) || 0));
    const allReady = rows.every((r) => r.readyForDispatch);
    const unknown = rows.some((r) => !r.readyForDispatch && !r.leadTime);
    const left = allReady ? 'Ready for dispatch' : unknown ? null : `Dispatch lead time up to ${lead} days`;
    const locs = Array.from(new Set(rows.map((r) => r.exwLocation).filter(Boolean))) as string[];
    return { left, right: locs.length === 1 ? `Ships from ${locs[0]}` : null };
}
const UNAVAILABLE = new Set(['PRODUCT_NOT_FOUND', 'PRODUCT_NOT_AVAILABLE', 'LOAD_NOT_FOUND', 'LOAD_ALREADY_ORDERED']);

function Stepper({ value, onChange, min = 1, max, unit, disabled }: { value: number; onChange: (n: number) => void; min?: number; max?: number; unit: string; disabled?: boolean }) {
    const [draft, setDraft] = React.useState(String(value));
    React.useEffect(() => setDraft(String(value)), [value]);
    const commit = () => {
        const n = parseInt(draft.replace(/\D/g, ''), 10);
        const v = Number.isFinite(n) ? Math.max(min, max ? Math.min(max, n) : n) : value;
        setDraft(String(v));
        if (v !== value) onChange(v);
    };
    const btn = 'w-9 h-9 rounded-lg ring-1 ring-line bg-surface flex items-center justify-center text-ink-2 hover:ring-line-strong disabled:opacity-35 transition-shadow';
    return (
        <div className={cn('flex items-center gap-2', disabled && 'opacity-50 pointer-events-none')}>
            <button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className={btn}><Minus size={14} /></button>
            <label className="flex items-center justify-between w-[104px] h-9 rounded-lg ring-1 ring-line bg-surface ps-3 pe-2.5 focus-within:ring-2 focus-within:ring-[#2EC4B6]">
                <input value={draft} inputMode="numeric" aria-label={`Quantity (${unit})`} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}
                    className="w-12 bg-transparent text-center text-[14px] font-semibold tabular-nums text-ink outline-none" />
                <span className="text-[12.5px] text-ink-4">{unit}</span>
            </label>
            <button type="button" aria-label="Increase" onClick={() => onChange(max ? Math.min(max, value + 1) : value + 1)} disabled={!!max && value >= max} className={btn}><Plus size={14} /></button>
        </div>
    );
}

function Thumb({ src, alt }: { src?: string | null; alt: string }) {
    return (
        <span className="relative w-[60px] h-[60px] shrink-0 rounded-xl bg-media ring-1 ring-line overflow-hidden">
            {src
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={src} alt={alt} className="absolute inset-0 m-auto max-w-[80%] max-h-[80%] object-contain mix-blend-multiply" />
                : <span className="absolute inset-0 flex items-center justify-center text-ink-4"><Package size={20} strokeWidth={1.4} /></span>}
        </span>
    );
}

/** One product row — identical anatomy for standard and mixed orders. */
function LineRow(props: {
    href: string; image?: string | null; name: string; ean?: string | null; meta: (string | null | undefined)[]; bbd?: string | null;
    error?: string | null; unavailable?: boolean;
    stepper: React.ReactNode; price: string; units?: string | null; onRemove: () => void; removeDisabled?: boolean;
}) {
    return (
        <li className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5 px-5 py-4">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <Thumb src={props.image} alt={props.name} />
                <div className="min-w-0">
                    <Link href={props.href} className="text-[14.5px] font-medium text-ink hover:text-teal line-clamp-2">{props.name}</Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-[13px] text-ink-3 tabular-nums">
                        {props.ean && <span className="inline-flex items-center gap-1.5"><Barcode size={14} className="text-ink-4" />{props.ean}</span>}
                        {props.meta.filter(Boolean).map((m) => <span key={m as string}>{m}</span>)}
                        {props.bbd && <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} className="text-ink-4" />BBD {props.bbd}</span>}
                    </p>
                    {props.error && (
                        <p className={cn('mt-1.5 inline-flex items-start gap-1.5 text-[13px]', props.unavailable ? 'text-[#DC2626]' : 'text-[#B45309]')}>
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />{props.error}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6 ps-[74px] md:ps-0">
                {props.stepper}
                <div className="w-[120px] text-end">
                    <p className="text-[15.5px] font-semibold text-ink tabular-nums">{props.price}</p>
                    {props.units && <p className="text-[12.5px] text-ink-4 tabular-nums">{props.units}</p>}
                </div>
                <button type="button" onClick={props.onRemove} disabled={props.removeDisabled} aria-label={`Remove ${props.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-[#DC2626] hover:bg-surface-3 disabled:opacity-40"><Trash2 size={16} /></button>
            </div>
        </li>
    );
}

/** Order card shell: header (type · destination · status), optional progress, lines, suggestions, footer. */
function OrderCard({ icon, title, destination, status, progress, children, suggestions, total, totalNote, action, error, strip }: {
    icon: React.ReactNode; title: React.ReactNode; destination?: string | null; strip?: { left?: string | null; right?: string | null };
    status: { tone: 'ok' | 'warn' | 'err'; label: string };
    progress?: { label: React.ReactNode; right?: React.ReactNode; value: number; ok: boolean };
    children: React.ReactNode; suggestions?: React.ReactNode; total: string; totalNote?: string; action: React.ReactNode; error?: string | null;
}) {
    return (
        <section className="rounded-2xl ring-1 ring-line bg-surface overflow-hidden">
            {strip && (strip.left || strip.right) && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5 bg-surface-2 border-b border-line text-[13.5px] text-ink-2">
                    {strip.left && <span className="inline-flex items-center gap-2"><Truck size={15} className="text-ink-3" />{strip.left}</span>}
                    {strip.right && <span className="inline-flex items-center gap-2"><MapPin size={14} className="text-ink-3" />{strip.right}</span>}
                </div>
            )}
            <div className="px-5 pt-4 pb-3.5 border-b border-line">
                <div className="flex items-center gap-2 text-[14.5px]">
                    <span className="text-ink-3">{icon}</span>
                    <span className="font-medium text-ink">{title}</span>
                    {destination && <><span className="text-ink-4">·</span><MapPin size={14} className="text-ink-4" /><span className="text-ink-2 truncate max-w-[200px]">{destination}</span></>}
                    <span className={cn('ms-auto inline-flex items-center gap-1.5 text-[13.5px] font-medium',
                        status.tone === 'ok' ? 'text-[#047857]' : status.tone === 'warn' ? 'text-[#B45309]' : 'text-[#DC2626]')}>
                        {status.tone === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{status.label}
                    </span>
                </div>
                {progress && (
                    <>
                        <div className="mt-2.5 flex items-center justify-between text-[13px]">
                            <span className="text-ink-3">{progress.label}</span>
                            {progress.right && <span className="font-medium text-[#B45309]">{progress.right}</span>}
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all duration-300', progress.ok ? 'bg-[#10B981]' : 'bg-[#F59E0B]')} style={{ width: `${Math.max(2, Math.min(100, progress.value * 100))}%` }} />
                        </div>
                    </>
                )}
            </div>
            <ul className="divide-y divide-line">{children}</ul>
            {suggestions}
            {error && <p className="px-5 py-2 text-[13px] text-[#DC2626]">{error}</p>}
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-t border-line">
                <p className="text-[13.5px] text-ink-3">Order total <span className="ms-1.5 text-[16px] font-semibold text-ink tabular-nums">{total}</span>
                    {totalNote && <span className="ms-2 text-[12px] text-ink-4">{totalNote}</span>}
                </p>
                <div className="ms-auto">{action}</div>
            </div>
        </section>
    );
}

export default function CartPage() {
    const { items, removeItem, updateQuantity, clearCart, addItem } = useCart();
    const { isLoggedIn } = useAuth();
    const router = useRouter();
    useCurrency(); // re-render on currency change

    const [quote, setQuote] = React.useState<CartQuote | null>(null);
    const [quoteState, setQuoteState] = React.useState<'idle' | 'loading' | 'error' | 'auth' | 'legacy'>('idle');
    const [quoteError, setQuoteError] = React.useState('');
    const [loads, setLoads] = React.useState<MixedLoad[] | null>(null);
    const [loadBusy, setLoadBusy] = React.useState<string | null>(null);
    const [loadError, setLoadError] = React.useState<Record<string, string>>({});
    const [catalog, setCatalog] = React.useState<Product[]>([]);
    const [destination, setDestination] = React.useState<string | null>(null);

    React.useEffect(() => { try { setDestination(localStorage.getItem('atl_delivery_address')); } catch { /* none */ } }, []);

    // Server quote for every cart line (debounced) — totals shown are the server's.
    const sig = JSON.stringify(items.map((i) => [i.id, i.quantity, i.tier, i.mixedLoadId]));
    React.useEffect(() => {
        if (!items.length) { setQuote(null); setQuoteState('idle'); return; }
        if (!isLoggedIn) { setQuoteState('auth'); return; }
        setQuoteState('loading');
        const t = setTimeout(() => {
            quoteCart(items)
                .then((q) => { setQuote(q); setQuoteState('idle'); })
                .catch((e) => { setQuoteState(e instanceof ApiError && e.status === 401 ? 'auth' : e instanceof ApiError && e.code === 'NOT_DEPLOYED' ? 'legacy' : 'error'); setQuoteError(e?.message || 'Could not price your cart.'); });
        }, 250);
        return () => clearTimeout(t);
    }, [sig, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    const refreshLoads = React.useCallback(() => {
        if (!isLoggedIn) { setLoads([]); return; }
        listLoads().then(setLoads).catch(() => setLoads([]));
    }, [isLoggedIn]);
    React.useEffect(() => { refreshLoads(); }, [refreshLoads]);

    // Real catalog for "Add more to reach the minimum" (only needed when a load is under capacity).
    const needSuggestions = !!loads?.some((l) => l.quote && !l.quote.ready);
    React.useEffect(() => {
        if (!needSuggestions || catalog.length) return;
        fetchProductPage({ limit: 100, sort: 'newest' }).then((r) => setCatalog(r.items)).catch(() => {});
    }, [needSuggestions, catalog.length]);

    const lineFor = (i: CartItem): QuoteLine | undefined => quote?.lines[items.indexOf(i)];
    const singles = items.filter((i) => !i.mixedLoadId);
    const legacy = quoteState === 'legacy';

    const editLoad = async (load: MixedLoad, lines: { productId: string; variant?: string | null; quantity: number }[]) => {
        setLoadBusy(load.id); setLoadError((m) => ({ ...m, [load.id]: '' }));
        try {
            if (lines.length === 0) { await deleteLoad(load.id); items.filter((i) => i.mixedLoadId === load.id).forEach((i) => removeItem(i.id)); }
            else await updateLoad(load.id, lines, load.version);
            refreshLoads();
        } catch (e) {
            setLoadError((m) => ({ ...m, [load.id]: e instanceof ApiError ? e.message : 'Could not update this order.' }));
            if (e instanceof ApiError && e.code === 'STALE_VERSION') refreshLoads();
        } finally { setLoadBusy(null); }
    };
    const addSuggestion = async (load: MixedLoad, productId: string) => {
        setLoadBusy(load.id); setLoadError((m) => ({ ...m, [load.id]: '' }));
        try { await addToLoad(load.kind, productId, 1, null, load.id); refreshLoads(); }
        catch (e) { setLoadError((m) => ({ ...m, [load.id]: e instanceof ApiError ? e.message : 'Could not add that product.' })); }
        finally { setLoadBusy(null); }
    };
    // Mixed loads live on the server; a cart line is created when the buyer checks it out.
    const ensureLoadInCart = (load: MixedLoad) => {
        const lines = load.quote?.lines ?? [];
        if (!items.some((i) => i.mixedLoadId === load.id)) {
            addItem({ id: `mixload:${load.id}`, mixedLoadId: load.id, name: `${loadLabel(load.kind)} (${lines.length} products)`, brand: 'Mixed', price: load.quote!.total, image: load.products[lines[0]?.productId]?.image || '', unit: load.kind === 'PALLET' ? 'Pallet' : 'Truck', tier: load.kind === 'PALLET' ? 'pallet' : 'truck' }, 1);
        }
    };

    // Order readiness
    const standardErrors = singles.map(lineFor).filter((q) => q?.error);
    const standardReady = singles.length > 0 && (legacy || (quoteState === 'idle' && !!quote && standardErrors.length === 0));
    const standardTotal = legacy ? singles.reduce((s, i) => s + i.price * i.quantity, 0) : singles.reduce((s, i) => s + (lineFor(i)?.lineTotal ?? 0), 0);
    const readyLoads = (loads ?? []).filter((l) => l.quote?.ready);
    const orders = (singles.length ? 1 : 0) + (loads?.length ?? 0);
    const notReady = (singles.length && !standardReady ? 1 : 0) + (loads ?? []).filter((l) => !l.quote?.ready).length;
    const readyTotal = (standardReady ? standardTotal : 0) + readyLoads.reduce((s, l) => s + (l.quote?.total ?? 0), 0);
    const unavailableIds = singles.filter((i) => { const e = lineFor(i)?.error; return e && UNAVAILABLE.has(e.code); }).map((i) => i.id);
    const flagged = standardErrors.length + (loads ?? []).filter((l) => l.quote && !l.quote.ready).length;

    const checkoutAll = () => { readyLoads.forEach(ensureLoadInCart); router.push(standardReady || !singles.length ? (singles.length ? '/checkout' : '/checkout?scope=loads') : '/checkout?scope=loads'); };

    if (items.length === 0 && (!loads || loads.length === 0)) {
        return (
            <main className="min-h-[70vh] bg-surface flex items-center justify-center px-6 text-start">
                <div className="text-center max-w-md">
                    <span className="mx-auto w-14 h-14 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><ShoppingBag size={26} /></span>
                    <h1 className="mt-5 text-[22px] font-bold text-heading">Your cart is empty</h1>
                    <p className="mt-2 text-[14px] text-ink-3">Order by the case, pallet or truckload — or combine products into a mixed pallet or truckload.</p>
                    <Link href="/categories" className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">Browse catalog <ArrowRight size={15} /></Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-surface text-start pb-20">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-7">
                {/* Title */}
                <div className="flex items-center justify-between gap-4">
                    <h1 className="text-[26px] font-semibold tracking-tight text-heading">Cart <span className="font-normal text-ink-3">({orders} {orders === 1 ? 'order' : 'orders'})</span></h1>
                    {(items.length > 0 || (loads?.length ?? 0) > 0) && (
                        <button type="button" onClick={() => { if (confirm('Empty your cart? Mixed loads you’re building are kept.')) clearCart(); }} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#DC2626] hover:underline"><Trash2 size={15} /> Empty</button>
                    )}
                </div>

                {/* Attention banner */}
                {flagged > 0 && (
                    <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl ring-1 ring-[#FCD34D] bg-[#FFFBEB] dark:bg-amber-500/10 px-5 py-3.5">
                        <AlertTriangle size={18} className="text-[#D97706] shrink-0" />
                        <div className="text-[14px] text-[#92400E] dark:text-amber-200">
                            <p className="font-medium">Some items need attention before checkout.</p>
                            <p className="text-[13.5px] opacity-90">
                                {unavailableIds.length > 0 && `${unavailableIds.length} ${unavailableIds.length === 1 ? 'item is' : 'items are'} no longer available. `}
                                {flagged - unavailableIds.length > 0 && `${flagged - unavailableIds.length} ${flagged - unavailableIds.length === 1 ? 'order or line needs' : 'orders or lines need'} a change.`}
                            </p>
                        </div>
                        {unavailableIds.length > 0 && (
                            <button type="button" onClick={() => unavailableIds.forEach(removeItem)} className="ms-auto h-9 px-4 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-white text-[13.5px] font-semibold">Remove unavailable</button>
                        )}
                    </div>
                )}

                <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
                    <div className="space-y-5 min-w-0">
                        {/* Standard order */}
                        {singles.length > 0 && (
                            <OrderCard
                                icon={<Package size={16} />}
                                strip={dispatchStrip(singles.map((i) => lineFor(i)?.info).filter(Boolean) as any)}
                                title="Standard order"
                                destination={destination}
                                status={quoteState === 'auth' ? { tone: 'warn', label: 'Sign in to price' } : standardReady ? { tone: 'ok', label: 'Ready' } : quoteState === 'loading' ? { tone: 'warn', label: 'Pricing…' } : { tone: standardErrors.some((q) => UNAVAILABLE.has(q!.error!.code)) ? 'err' : 'warn', label: standardErrors.some((q) => q!.error!.code === 'BELOW_MOQ') ? 'Below minimum' : 'Needs attention' }}
                                total={standardTotal ? formatPrice(standardTotal) : '—'}
                                totalNote={legacy ? 'estimate' : undefined}
                                action={
                                    <button type="button" disabled={!standardReady} onClick={() => router.push('/checkout?scope=standard')}
                                        className="h-10 px-5 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:bg-surface-3 disabled:text-ink-4 disabled:cursor-not-allowed">
                                        Checkout this order
                                    </button>
                                }
                            >
                                {singles.map((i) => {
                                    const q = lineFor(i);
                                    const upc = q?.info?.unitsPerCase;
                                    const casesPerUnit = q?.casesTotal && q.quantity ? q.casesTotal / q.quantity : null;
                                    const locked = !!i.mixComposition?.length;
                                    return (
                                        <LineRow
                                            key={i.id}
                                            href={`/products/${i.productId || i.id.split('::')[0]}`}
                                            image={i.image}
                                            name={i.name + (i.selectedVariants && Object.keys(i.selectedVariants).length ? ` — ${Object.values(i.selectedVariants).join(', ')}` : '')}
                                            ean={q?.info?.ean}
                                            meta={[
                                                casesPerUnit && i.tier !== 'carton' ? `${casesPerUnit.toLocaleString()} ctn` : null,
                                                upc && i.tier === 'carton' ? `${upc} units/ctn` : null,
                                                q?.perCase && upc ? `${formatPrice(q.perCase / upc)} per unit` : null,
                                                locked ? i.mixComposition!.map((c) => `${prettifyVariantSignature(c.signature) || c.signature} × ${c.quantity}`).join(' · ') : null,
                                            ]}
                                            bbd={fmtDate(q?.info?.shelfLife)}
                                            error={q?.error?.message ?? null}
                                            unavailable={!!q?.error && UNAVAILABLE.has(q.error.code)}
                                            stepper={locked
                                                ? <span className="w-[190px] text-center text-[13px] text-ink-3">1 mixed {unitWord(i.tier, 1)}</span>
                                                : <Stepper value={i.quantity} unit={UNIT_SHORT[i.tier || 'carton']} min={1} onChange={(n) => updateQuantity(i.id, n)} />}
                                            price={q && !q.error ? formatPrice(q.lineTotal) : legacy ? formatPrice(i.price * i.quantity) : quoteState === 'loading' ? '…' : '—'}
                                            units={q?.unitsTotal ? `${q.unitsTotal.toLocaleString()} units` : null}
                                            onRemove={() => removeItem(i.id)}
                                        />
                                    );
                                })}
                            </OrderCard>
                        )}

                        {/* Mixed orders */}
                        {loads?.map((load) => {
                            const q = load.quote;
                            const lines = q?.lines ?? [];
                            const busy = loadBusy === load.id;
                            const capWord = load.kind === 'PALLET' ? 'cases' : 'pallets';
                            const remaining = q ? Math.max(0, q.requiredFill - q.fill) : 1;
                            const setLineQty = (pid: string, variant: string | null | undefined, n: number) =>
                                editLoad(load, lines.map((l) => ({ productId: l.productId, variant: l.variant ?? null, quantity: l.productId === pid && (l.variant ?? null) === (variant ?? null) ? n : l.quantity })).filter((l) => l.quantity > 0));
                            // Real catalog products this load can accept: same supplier, pack data present, not already in it.
                            const inLoad = new Set(lines.map((l) => l.productId));
                            const candidates = q && !q.ready ? catalog.filter((p: any) =>
                                !inLoad.has(p.id) && p.unitsPerCase && p.casesPerPallet && (load.kind === 'PALLET' || p.palletsPerShipment)
                            ).slice(0, 12) : [];
                            return (
                                <OrderCard
                                    key={load.id}
                                    icon={load.kind === 'TRUCK' ? <Truck size={16} /> : <Layers size={16} />}
                                    title={<>{loadLabel(load.kind)}<span className="ms-2 text-[12.5px] font-medium text-ink-3">{q?.origin?.status === 'VERIFIED' && q.origin.label ? `Ships from ${q.origin.label}` : lines.length && new Set(lines.map((l) => l.productId)).size > 1 ? 'Dispatch location to be verified' : load.products[lines[0]?.productId]?.dispatch ? `Ships from ${load.products[lines[0].productId].dispatch}` : 'Dispatch location to be verified'}</span></>}
                                    strip={dispatchStrip(lines.map((l) => load.products[l.productId]).filter(Boolean) as any)}
                                    destination={destination}
                                    status={load.error ? { tone: 'err', label: 'Unavailable' } : q?.ready ? { tone: 'ok', label: 'Ready' } : { tone: 'warn', label: q && q.requiredFill > 0 ? 'Below minimum' : 'Needs attention' }}
                                    progress={q ? {
                                        label: q.requiredFill > 0
                                            ? <>Mixed load · <span className="font-semibold text-ink tabular-nums">{Math.round(q.fill * 100)}%</span> / {Math.round(q.requiredFill * 100)}% minimum of the {load.kind === 'PALLET' ? 'pallet' : 'truck'}</>
                                            : <>Capacity used · <span className="font-semibold text-ink tabular-nums">{Math.round(q.fill * 100)}%</span> of the {load.kind === 'PALLET' ? 'pallet' : 'truck'}</>,
                                        right: q.ready ? undefined : `${Math.round(remaining * 100)}% to go`,
                                        value: q.requiredFill > 0 ? q.fill / q.requiredFill : q.fill,
                                        ok: q.ready,
                                    } : undefined}
                                    error={loadError[load.id] || load.error?.message || (q && !q.ready ? q.issues.join(' ') : null) || null}
                                    total={q ? formatPrice(q.total) : '—'}
                                    totalNote={q ? 'incl. mixed-load handling' : undefined}
                                    suggestions={candidates.length > 0 ? (
                                        <div className="px-5 py-4 border-t border-line">
                                            <p className="text-[13.5px] text-ink-3">Add more to reach the minimum:</p>
                                            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                                {candidates.map((p) => (
                                                    <button key={p.id} type="button" disabled={busy} onClick={() => addSuggestion(load, p.id)} title={p.name}
                                                        className="flex items-center gap-2 h-10 px-3.5 rounded-xl ring-1 ring-line hover:ring-line-strong text-[13.5px] text-ink-2 text-start disabled:opacity-50">
                                                        <Plus size={14} className="shrink-0 text-ink-3" /><span className="truncate">{p.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    action={
                                        <div className="flex items-center gap-2">
                                            <button type="button" disabled={busy} onClick={() => { if (confirm('Discard this mixed load?')) editLoad(load, []); }} className="h-10 px-3 rounded-xl text-[13.5px] font-medium text-ink-3 hover:text-[#DC2626]">Discard</button>
                                            <button type="button" disabled={!q?.ready || busy} onClick={() => { ensureLoadInCart(load); router.push(`/checkout?scope=load:${load.id}`); }}
                                                className="h-10 px-5 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:bg-surface-3 disabled:text-ink-4 disabled:cursor-not-allowed">
                                                Checkout this order
                                            </button>
                                        </div>
                                    }
                                >
                                    {lines.map((l) => {
                                        const p = load.products[l.productId];
                                        const cap = load.kind === 'PALLET' ? p?.casesPerPallet : p?.palletsPerShipment;
                                        return (
                                            <LineRow
                                                key={l.productId + (l.variant || '')}
                                                href={`/products/${l.productId}`}
                                                image={p?.image}
                                                name={l.name + (l.variant ? ` — ${prettifyVariantSignature(l.variant) || l.variant}` : '')}
                                                ean={p?.ean}
                                                meta={[
                                                    load.kind === 'TRUCK' && p?.casesPerPallet ? `${p.casesPerPallet} ctn/pal.` : `${l.cases.toLocaleString()} ctn`,
                                                    p?.unitsPerCase ? `${formatPrice(l.casePrice / p.unitsPerCase)} per unit` : null,
                                                    `${Math.round(l.share * 100)}% of load`,
                                                    p?.dispatch ? `Ships from ${p.dispatch}` : 'Dispatch location not verified',
                                                ]}
                                                stepper={<Stepper value={l.quantity} unit={load.kind === 'PALLET' ? 'cs' : 'pal.'} min={1} max={cap ?? undefined} disabled={busy} onChange={(n) => setLineQty(l.productId, l.variant, n)} />}
                                                price={formatPrice(l.lineSubtotal)}
                                                units={`${l.units.toLocaleString()} units`}
                                                onRemove={() => setLineQty(l.productId, l.variant, 0)}
                                                removeDisabled={busy}
                                            />
                                        );
                                    })}
                                    {busy && <li className="px-5 py-2 text-[12.5px] text-ink-4 inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Updating…</li>}
                                </OrderCard>
                            );
                        })}
                    </div>

                    {/* Cart summary */}
                    <aside className="lg:sticky lg:top-[108px] rounded-2xl ring-1 ring-line bg-surface p-6">
                        <h2 className="text-[18px] font-semibold text-heading">Cart summary</h2>
                        {quoteState === 'auth' ? (
                            <div className="mt-4">
                                <p className="text-[14px] text-ink-3">Sign in to see your wholesale prices and check out.</p>
                                <Link href="/auth/login?redirect=/cart" className="mt-5 flex items-center justify-center h-12 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[15px] font-semibold">Sign in</Link>
                            </div>
                        ) : (
                            <>
                                {notReady > 0 && (
                                    <div className="mt-4 flex items-start gap-3 pb-5 border-b border-line">
                                        <AlertTriangle size={18} className="text-[#D97706] shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[14.5px] font-medium text-ink">{notReady} {notReady === 1 ? 'order' : 'orders'} not ready</p>
                                            <p className="mt-0.5 text-[13.5px] text-ink-3">Fix the flagged lines or top up mixed loads to reach their minimum.</p>
                                        </div>
                                    </div>
                                )}
                                <div className="mt-5 flex items-baseline justify-between">
                                    <span className="text-[15px] font-medium text-ink">Total ready for checkout</span>
                                    <span className="text-[22px] font-semibold text-heading tabular-nums">{formatPrice(readyTotal)}</span>
                                </div>
                                <div className="mt-4 rounded-xl ring-1 ring-line p-4 flex gap-3">
                                    <ShieldCheck size={18} className="text-teal shrink-0 mt-0.5" />
                                    <p className="text-[13.5px] text-ink-2"><span className="font-medium text-ink">Priced by Atlantis.</span> Totals are calculated on our server from current pack sizes and rates, and confirmed again when you place the order.</p>
                                </div>
                                <dl className="mt-5 space-y-3 text-[14px]">
                                    <div className="flex justify-between"><dt className="text-ink-3">Subtotal</dt><dd className="text-ink tabular-nums">{formatPrice(readyTotal)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-ink-3">Delivery</dt><dd className="text-ink-2">Quoted at checkout</dd></div>
                                    <div className="flex justify-between"><dt className="text-ink-3">VAT</dt><dd className="text-ink-2">Added on invoice</dd></div>
                                </dl>
                                {quoteState === 'error' && <p className="mt-3 text-[13px] text-[#DC2626]">{quoteError}</p>}
                                {legacy && <p className="mt-3 text-[12.5px] text-ink-3">Estimated from product-page prices; the final total is confirmed when you place the order.</p>}
                                <button type="button" disabled={readyTotal <= 0} onClick={checkoutAll}
                                    className="mt-6 w-full h-12 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[15px] font-semibold disabled:bg-surface-3 disabled:text-ink-4 disabled:cursor-not-allowed">
                                    {readyTotal > 0 ? `Checkout ${orders - notReady === 1 ? 'ready order' : `${orders - notReady} ready orders`}` : 'No orders ready'}
                                </button>
                            </>
                        )}
                    </aside>
                </div>
            </div>
        </main>
    );
}
