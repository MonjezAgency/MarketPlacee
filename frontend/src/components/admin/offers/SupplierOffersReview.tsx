'use client';

/**
 * Admin → Offers → Supplier offers: the review queue for wholesale offers
 * (backend model Offer, backend/src/offers). Data: GET /offers (staff roles;
 * every row carries `postedByStaff`, computed on the server with the same staff
 * rule as the Products scopes). Approve / reject: PATCH /offers/:id/approve|reject,
 * allowed for OWNER, ADMIN and MODERATOR (offers.controller.ts) — other staff
 * see the queue read-only. Each decision replaces the row with the record the server
 * returns; approval also reports how many offer emails were actually delivered.
 * Only fields that are recorded on the offer (or its product) are shown.
 */
import * as React from 'react';
import Link from 'next/link';
import { Check, Inbox, Search, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { canDo } from '@/lib/admin-access';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import {
    Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Notice, Skeleton, Thumb,
    errorMessage, inputCls, selectCls, type Tone,
} from '@/components/supplier/ui';

type OfferStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type StatusFilter = OfferStatus | 'ALL';
export type SourceFilter = 'all' | 'suppliers' | 'staff';

interface AdminOffer {
    id: string;
    pricePerUnit: number;
    unit: string;
    quantity: number;
    validUntil?: string | null;
    notes?: string | null;
    status: string;
    adminNotes?: string | null;
    approvedAt?: string | null;
    createdAt: string;
    productNameSnap?: string | null;
    bbd?: string | null;
    eanCode?: string | null;
    unitsPerCase?: number | null;
    casesPerPallet?: number | null;
    exwLocation?: string | null;
    leadTime?: string | null;
    origin?: string | null;
    offerImageUrl?: string | null;
    discountPercent?: number | null;
    postedByStaff?: boolean;
    product?: { id: string; name: string; brand?: string | null; images?: string[]; ean?: string | null; exwLocation?: string | null; unitsPerCase?: number | null; casesPerPallet?: number | null; origin?: string | null; shelfLife?: string | null } | null;
    supplier?: { id: string; name?: string | null; email?: string | null; companyName?: string | null; role?: string | null } | null;
}

const S = 'adminOffers';
export const STATUS_FILTERS: StatusFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'ALL'];
export const SOURCE_FILTERS: SourceFilter[] = ['all', 'suppliers', 'staff'];
const STATUS_META: Record<OfferStatus, { key: string; tone: Tone }> = {
    PENDING: { key: 'stPending', tone: 'warning' },
    APPROVED: { key: 'stApproved', tone: 'success' },
    REJECTED: { key: 'stRejected', tone: 'danger' },
    EXPIRED: { key: 'stExpired', tone: 'neutral' },
};
const STATUS_TAB_KEY: Record<StatusFilter, string> = { PENDING: 'stPending', APPROVED: 'stApproved', REJECTED: 'stRejected', EXPIRED: 'stExpired', ALL: 'stAll' };
const SOURCE_KEY: Record<SourceFilter, string> = { all: 'sourceAll', suppliers: 'sourceSuppliers', staff: 'sourceStaff' };
const UNIT_KEYS: Record<string, { price: string; qty: string }> = {
    truck: { price: 'priceTruck', qty: 'qtyTruck' },
    pallet: { price: 'pricePallet', qty: 'qtyPallet' },
    carton: { price: 'priceCarton', qty: 'qtyCarton' },
};
/** Roles allowed to approve / reject (offers.controller.ts; MODERATOR per the owner's role matrix). */
const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MODERATOR'];

const asArray = (raw: any): AdminOffer[] => (Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []);
const present = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';

/** Offer value, falling back to the linked product where the supplier left it empty (as the backend does). */
function view(o: AdminOffer) {
    const positive = (n?: number | null) => (typeof n === 'number' && n > 0 ? n : null);
    return {
        name: o.productNameSnap || o.product?.name || '',
        brand: o.product?.brand || '',
        image: o.offerImageUrl || o.product?.images?.[0] || '',
        ean: o.eanCode || o.product?.ean || '',
        unitsPerCase: positive(o.unitsPerCase) ?? positive(o.product?.unitsPerCase),
        casesPerPallet: positive(o.casesPerPallet) ?? positive(o.product?.casesPerPallet),
        exw: o.exwLocation || o.product?.exwLocation || '',
        origin: o.origin || o.product?.origin || '',
        bbd: o.bbd || o.product?.shelfLife || '',
    };
}

export default function SupplierOffersReview({ status, q, source, focusId, onChange, onPendingCount }: {
    status: StatusFilter; q: string; source: SourceFilter; focusId: string | null;
    onChange: (patch: { status?: StatusFilter; q?: string; source?: SourceFilter; id?: null }) => void;
    onPendingCount?: (n: number | null) => void;
}) {
    const { t, fmt } = useLanguage();
    const tl = React.useCallback((k: string, v?: Record<string, string | number>) => t(S, k, v), [t]);
    const { user } = useAuth();
    const canDecide = canDo(user?.role, 'reviewOffers');
    const eur = (n: number) => fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const [offers, setOffers] = React.useState<AdminOffer[] | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [search, setSearch] = React.useState(q);
    const [result, setResult] = React.useState<{ tone: Tone; text: string } | null>(null);
    /** Rows decided in this visit stay visible under the current filter until it changes. */
    const [touched, setTouched] = React.useState<Set<string>>(new Set());
    const [approving, setApproving] = React.useState<AdminOffer | null>(null);
    const [rejecting, setRejecting] = React.useState<AdminOffer | null>(null);

    React.useEffect(() => { setSearch(q); }, [q]);
    React.useEffect(() => {
        const h = setTimeout(() => { if (search.trim() !== q) onChange({ q: search.trim() }); }, 300);
        return () => clearTimeout(h);
    }, [search, q, onChange]);
    React.useEffect(() => { setTouched(new Set()); }, [status, source, q]);

    const load = React.useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await apiFetch('/offers', { cache: 'no-store' });
            if (!res.ok) throw new Error(await errorMessage(res));
            setOffers(asArray(await res.json()));
        } catch (e: any) { setError(e?.message || null); } finally { setLoading(false); }
    }, []);
    React.useEffect(() => { load(); }, [load]);

    const bySource = React.useMemo(() => (offers ?? []).filter((o) =>
        source === 'all' ? true : source === 'staff' ? !!o.postedByStaff : !o.postedByStaff), [offers, source]);
    const counts = React.useMemo(() => {
        const c: Record<string, number> = { ALL: bySource.length, PENDING: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0 };
        for (const o of bySource) c[o.status] = (c[o.status] || 0) + 1;
        return c;
    }, [bySource]);
    React.useEffect(() => {
        onPendingCount?.(offers ? offers.filter((o) => o.status === 'PENDING' && !o.postedByStaff).length : null);
    }, [offers, onPendingCount]);

    const rows = React.useMemo(() => {
        const needle = q.toLowerCase();
        return bySource.filter((o) => {
            if (status !== 'ALL' && o.status !== status && !touched.has(o.id) && o.id !== focusId) return false;
            if (!needle) return true;
            const v = view(o);
            return [v.name, v.brand, v.ean, o.supplier?.companyName, o.supplier?.name, o.supplier?.email]
                .some((x) => String(x || '').toLowerCase().includes(needle));
        });
    }, [bySource, status, q, touched, focusId]);

    // Scroll to an offer opened by id (e.g. from a link or a notification).
    React.useEffect(() => {
        if (!focusId || !offers) return;
        const el = document.getElementById(`offer-${focusId}`);
        el?.scrollIntoView({ block: 'center' });
    }, [focusId, offers]);

    const replaceRow = (next: AdminOffer) => {
        setOffers((list) => (list ?? []).map((o) => (o.id === next.id ? { ...o, ...next } : o)));
        setTouched((s) => new Set(s).add(next.id));
    };
    const closeApprove = React.useCallback(() => setApproving(null), []);
    const closeReject = React.useCallback(() => setRejecting(null), []);
    const clearFilters = () => { setSearch(''); onChange({ q: '', source: 'all', status: 'PENDING', id: null }); };

    const statusBadge = (o: AdminOffer) => {
        const m = STATUS_META[o.status as OfferStatus];
        return <Badge tone={m?.tone ?? 'neutral'} dot>{m ? tl(m.key) : o.status}</Badge>;
    };
    const supplierName = (o: AdminOffer) => o.supplier?.companyName || o.supplier?.name || tl('unknownSupplier');
    const priceText = (o: AdminOffer) => (UNIT_KEYS[o.unit] ? tl(UNIT_KEYS[o.unit].price, { price: eur(o.pricePerUnit) }) : `${eur(o.pricePerUnit)} · ${o.unit}`);
    const qtyText = (o: AdminOffer) => (UNIT_KEYS[o.unit] ? tl(UNIT_KEYS[o.unit].qty, { count: o.quantity }) : `${fmt.number(o.quantity)} · ${o.unit}`);

    const terms = (o: AdminOffer) => {
        const v = view(o);
        const items: string[] = [];
        items.push(o.validUntil ? tl('validUntil', { date: fmt.date(o.validUntil) }) : tl('noValidity'));
        if (present(v.bbd)) items.push(tl('bbd', { value: v.bbd }));
        if (present(v.exw)) items.push(tl('exw', { value: v.exw }));
        if (present(v.origin)) items.push(tl('origin', { value: v.origin }));
        if (present(o.leadTime)) items.push(tl('leadTime', { value: String(o.leadTime) }));
        if (typeof o.discountPercent === 'number' && o.discountPercent > 0) items.push(tl('discount', { pct: fmt.number(o.discountPercent) }));
        return items;
    };
    const packaging = (o: AdminOffer) => {
        const v = view(o);
        return [
            v.unitsPerCase ? tl('pcsPerCase', { count: fmt.number(v.unitsPerCase) }) : null,
            v.casesPerPallet ? tl('casesPerPallet', { count: fmt.number(v.casesPerPallet) }) : null,
        ].filter(Boolean) as string[];
    };
    const decision = (o: AdminOffer) => (
        <>
            {o.status === 'REJECTED' && present(o.adminNotes) && <span className="mt-1 block text-[12px] text-ink-3 break-words">{tl('reason', { reason: String(o.adminNotes) })}</span>}
            {(o.status === 'REJECTED' || o.status === 'APPROVED') && o.approvedAt && <span className="mt-0.5 block text-[12px] text-ink-4">{tl('decidedOn', { date: fmt.date(o.approvedAt) })}</span>}
        </>
    );
    const actions = (o: AdminOffer, name: string) => (canDecide && o.status === 'PENDING' ? (
        <span className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" icon={<Check size={14} />} aria-label={tl('approveAria', { name })} onClick={() => setApproving(o)}>{tl('approve')}</Button>
            <Button size="sm" variant="secondary" icon={<X size={14} />} aria-label={tl('rejectAria', { name })} onClick={() => setRejecting(o)}>{tl('reject')}</Button>
        </span>
    ) : null);

    return (
        <div>
            {result && <div className="mb-3" aria-live="polite"><Notice tone={result.tone} onClose={() => setResult(null)}>{result.text}</Notice></div>}
            {!canDecide && user && <div className="mb-3"><Notice tone="info">{tl('readOnly')}</Notice></div>}

            <Card bodyClassName="p-0">
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-line lg:flex-row lg:items-center lg:justify-between">
                    <div role="group" aria-label={tl('statusAria')} className="flex flex-wrap gap-1.5">
                        {STATUS_FILTERS.map((k) => (
                            <button key={k} type="button" aria-pressed={status === k} onClick={() => onChange({ status: k, id: null })}
                                className={cn('h-8 px-3 rounded-lg text-[13px] font-medium ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                    status === k ? 'bg-teal-soft text-teal ring-teal/30' : 'text-ink-2 ring-line hover:bg-surface-2')}>
                                {tl(STATUS_TAB_KEY[k])}{offers && <span className="ms-1.5 tabular-nums text-ink-3">{fmt.number(counts[k] || 0)}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row lg:w-[560px]">
                        <label className="relative block flex-1">
                            <span className="sr-only">{tl('searchLabel')}</span>
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tl('searchPh')} className={cn(inputCls, 'ps-9')} />
                        </label>
                        <select aria-label={tl('sourceLabel')} value={source} onChange={(e) => onChange({ source: e.target.value as SourceFilter })} className={cn(selectCls, 'sm:w-[210px]')}>
                            {SOURCE_FILTERS.map((s) => <option key={s} value={s}>{tl(SOURCE_KEY[s])}</option>)}
                        </select>
                    </div>
                </div>

                {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div>
                    : loading && !offers ? (
                        <div className="p-4 space-y-3" aria-busy="true" aria-label={tl('loading')}>
                            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                        </div>
                    ) : rows.length === 0 ? (
                        (offers?.length ?? 0) === 0 ? (
                            <EmptyState icon={<Inbox size={20} />} title={tl('emptyTitle')}>{tl('emptyBody')}</EmptyState>
                        ) : status === 'PENDING' && !q && source === 'all' ? (
                            <EmptyState icon={<Inbox size={20} />} title={tl('emptyPendingTitle')}>{tl('emptyPendingBody')}</EmptyState>
                        ) : (
                            <EmptyState icon={<Search size={20} />} title={tl('noMatchTitle')} action={<Button onClick={clearFilters}>{tl('clearFilters')}</Button>} />
                        )
                    ) : (
                        <>
                            <div className={cn('hidden lg:block overflow-x-auto', loading && 'opacity-60')}>
                                <table className="w-full min-w-[1120px] text-[13.5px]">
                                    <thead>
                                        <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                            <th scope="col" className="text-start font-medium ps-4 pe-2 py-2">{tl('colProduct')}</th>
                                            <th scope="col" className="text-start font-medium px-2 py-2">{tl('colSupplier')}</th>
                                            <th scope="col" className="text-end font-medium px-2 py-2">{tl('colPrice')}</th>
                                            <th scope="col" className="text-start font-medium px-2 py-2">{tl('colQuantity')}</th>
                                            <th scope="col" className="text-start font-medium px-2 py-2">{tl('colTerms')}</th>
                                            <th scope="col" className="text-start font-medium px-2 py-2">{tl('colSubmitted')}</th>
                                            <th scope="col" className="text-start font-medium px-2 py-2">{tl('colStatus')}</th>
                                            <th scope="col" className="text-start font-medium px-2 pe-4 py-2">{canDecide ? tl('colActions') : <span className="sr-only">{tl('colActions')}</span>}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((o) => {
                                            const v = view(o);
                                            const name = v.name || tl('unnamedProduct');
                                            return (
                                                <tr key={o.id} id={`offer-${o.id}`} className={cn('border-b border-line last:border-0 align-top hover:bg-surface-2/40', o.id === focusId && 'bg-teal-soft/50')}>
                                                    <td className="ps-4 pe-2 py-2.5 max-w-[280px]">
                                                        <div className="flex items-start gap-2.5">
                                                            <Thumb src={v.image} alt="" size={44} />
                                                            <div className="min-w-0">
                                                                {o.product?.id ? (
                                                                    <Link href={`/admin/products/${o.product.id}`} aria-label={tl('openProductAria', { name })} className="font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded break-words">{name}</Link>
                                                                ) : <span className="font-medium text-ink break-words">{name}</span>}
                                                                {v.brand && <span className="block text-[12px] text-ink-3 truncate">{v.brand}</span>}
                                                                {v.ean && <span className="block text-[12px] text-ink-3">{tl('ean')} <bdi dir="ltr" className="font-mono">{v.ean}</bdi></span>}
                                                                {o.postedByStaff && <span className="mt-1 inline-block"><Badge tone="brand">{tl('staffBadge')}</Badge></span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2.5 max-w-[200px]">
                                                        {o.supplier?.id ? (
                                                            <Link href={`/admin/users/${o.supplier.id}`} aria-label={tl('openSupplierAria', { name: supplierName(o) })} className="text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded break-words">{supplierName(o)}</Link>
                                                        ) : <span className="text-ink-3">{supplierName(o)}</span>}
                                                        {o.supplier?.email && <bdi dir="ltr" className="block text-[12px] text-ink-3 truncate">{o.supplier.email}</bdi>}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-end tabular-nums whitespace-nowrap font-medium text-ink">{priceText(o)}</td>
                                                    <td className="px-2 py-2.5 text-[12.5px] text-ink-2">
                                                        <span className="block tabular-nums text-[13.5px] text-ink">{qtyText(o)}</span>
                                                        {packaging(o).map((p) => <span key={p} className="block text-ink-3 tabular-nums">{p}</span>)}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-[12.5px] text-ink-2 max-w-[260px]">
                                                        {terms(o).map((p) => <span key={p} className="block break-words">{p}</span>)}
                                                        {present(o.notes) && <span className="mt-0.5 block text-ink-3 line-clamp-2 break-words" title={String(o.notes)}>{tl('supplierNote', { note: String(o.notes) })}</span>}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-[12.5px] text-ink-2 whitespace-nowrap tabular-nums">{fmt.date(o.createdAt)}</td>
                                                    <td className="px-2 py-2.5 max-w-[200px]">{statusBadge(o)}{decision(o)}</td>
                                                    <td className="px-2 pe-4 py-2.5">{actions(o, name)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <ul className="lg:hidden divide-y divide-line">
                                {rows.map((o) => {
                                    const v = view(o);
                                    const name = v.name || tl('unnamedProduct');
                                    return (
                                        <li key={o.id} id={`offer-${o.id}`} className={cn('p-3', o.id === focusId && 'bg-teal-soft/50')}>
                                            <div className="flex items-start gap-3">
                                                <Thumb src={v.image} alt="" size={48} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        {o.product?.id ? (
                                                            <Link href={`/admin/products/${o.product.id}`} aria-label={tl('openProductAria', { name })} className="font-medium text-ink hover:underline break-words">{name}</Link>
                                                        ) : <span className="font-medium text-ink break-words">{name}</span>}
                                                        {statusBadge(o)}
                                                    </div>
                                                    <span className="block text-[12.5px] text-ink-3 break-words">
                                                        {supplierName(o)}{v.ean && <> · {tl('ean')} <bdi dir="ltr" className="font-mono">{v.ean}</bdi></>}
                                                    </span>
                                                    <span className="mt-1 block tabular-nums text-[13.5px] font-medium text-ink">{priceText(o)} · {qtyText(o)}</span>
                                                    <span className="block text-[12.5px] text-ink-3">{[...packaging(o), ...terms(o)].join(' · ')}</span>
                                                    {present(o.notes) && <span className="block text-[12.5px] text-ink-3 line-clamp-2 break-words">{tl('supplierNote', { note: String(o.notes) })}</span>}
                                                    <span className="block text-[12px] text-ink-4">{tl('submittedOn', { date: fmt.date(o.createdAt) })}</span>
                                                    {o.postedByStaff && <span className="mt-1 inline-block"><Badge tone="brand">{tl('staffBadge')}</Badge></span>}
                                                    {decision(o)}
                                                    {actions(o, name) && <div className="mt-2">{actions(o, name)}</div>}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className="px-4 py-3 border-t border-line text-[12.5px] text-ink-3">
                                {tl('showing', { shown: fmt.number(rows.length), total: fmt.number(offers?.length ?? 0) })} · {tl('priceNote')}
                            </p>
                        </>
                    )}
            </Card>

            <ApproveDialog offer={approving} tl={tl} onClose={closeApprove} onDone={(next, text, tone) => { replaceRow(next); setApproving(null); setResult({ text, tone }); }} />
            <RejectDialog offer={rejecting} tl={tl} onClose={closeReject} onDone={(next, text) => { replaceRow(next); setRejecting(null); setResult({ text, tone: 'success' }); }} />
        </div>
    );
}

type Tl = (k: string, v?: Record<string, string | number>) => string;

/** A close handler that keeps its identity (Dialog re-focuses when it changes) and does nothing while a request runs. */
function useGuardedClose(busy: boolean, onClose: () => void) {
    const ref = React.useRef({ busy, onClose });
    ref.current = { busy, onClose };
    return React.useCallback(() => { if (!ref.current.busy) ref.current.onClose(); }, []);
}

function ApproveDialog({ offer, tl, onClose, onDone }: { offer: AdminOffer | null; tl: Tl; onClose: () => void; onDone: (next: AdminOffer, text: string, tone: Tone) => void }) {
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const close = useGuardedClose(busy, onClose);
    React.useEffect(() => { setErr(null); setBusy(false); }, [offer]);
    if (!offer) return null;
    const name = view(offer).name || tl('unnamedProduct');
    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const res = await apiFetch(`/offers/${offer.id}/approve`, { method: 'PATCH' });
            if (!res.ok) throw new Error(await errorMessage(res));
            const body = await res.json();
            const { emailBlast, ...next } = body || {};
            const text = !emailBlast ? tl('approvedEmailFailed', { name })
                : emailBlast.total === 0 ? tl('approvedNoRecipients', { name })
                    : tl('approvedSent', { name, sent: emailBlast.successCount, total: emailBlast.total });
            const tone: Tone = !emailBlast || (emailBlast.total > 0 && emailBlast.successCount < emailBlast.total) ? 'warning' : 'success';
            onDone(next as AdminOffer, text, tone);
        } catch (e: any) { setErr(tl('actionFailed', { message: e?.message || '' })); setBusy(false); }
    };
    return (
        <Dialog open onClose={close} dismissable={!busy} size="sm" title={tl('approveTitle')}
            footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>{tl('cancel')}</Button><Button data-autofocus variant="primary" loading={busy} onClick={submit}>{tl('approveConfirm')}</Button></>}>
            <p className="text-[14px] text-ink-2">{tl('approveBody', { name })}</p>
            {err && <div className="mt-3"><ErrorState message={err} /></div>}
        </Dialog>
    );
}

function RejectDialog({ offer, tl, onClose, onDone }: { offer: AdminOffer | null; tl: Tl; onClose: () => void; onDone: (next: AdminOffer, text: string) => void }) {
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const close = useGuardedClose(busy, onClose);
    const [reason, setReason] = React.useState('');
    const [touched, setTouched] = React.useState(false);
    React.useEffect(() => { setErr(null); setBusy(false); setReason(''); setTouched(false); }, [offer]);
    if (!offer) return null;
    const name = view(offer).name || tl('unnamedProduct');
    const invalid = reason.trim().length < 3;
    const submit = async () => {
        setTouched(true);
        if (invalid) return;
        setBusy(true); setErr(null);
        try {
            const res = await apiFetch(`/offers/${offer.id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason: reason.trim() }) });
            if (!res.ok) throw new Error(await errorMessage(res));
            onDone((await res.json()) as AdminOffer, tl('rejectedDone', { name }));
        } catch (e: any) { setErr(tl('actionFailed', { message: e?.message || '' })); setBusy(false); }
    };
    return (
        <Dialog open onClose={close} dismissable={!busy} size="sm" title={tl('rejectTitle')} description={tl('rejectBody', { name })}
            footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>{tl('cancel')}</Button><Button variant="danger" loading={busy} onClick={submit}>{tl('rejectConfirm')}</Button></>}>
            <Field label={tl('reasonLabel')} htmlFor="offer-reject-reason" required hint={tl('reasonHint')} error={touched && invalid ? tl('reasonRequired') : null}>
                <textarea id="offer-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
                    aria-invalid={touched && invalid ? true : undefined} className={cn(inputCls, 'h-auto py-2 resize-y')} />
            </Field>
            {err && <div className="mt-3"><ErrorState message={err} /></div>}
        </Dialog>
    );
}
