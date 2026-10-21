'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Power, Search, Ticket, Trash2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, Card, ConfirmProvider, EmptyState, ErrorState, PageHeader, Skeleton, Stat, inputCls, selectCls, useConfirm } from '@/components/supplier/ui';
import { adminCouponsApi, COUPON_STATUSES, type CouponList, type CouponRow } from '@/lib/admin-coupons-api';
import { CouponStatusBadge, InfoTip, scopeText, useCopy, useDiscountLabel, useMoney, useTc, useWhen } from './couponUi';
import { CreateCouponDialog } from './CreateCouponDialog';

/**
 * Admin → Coupons & Codes (/admin/coupons). Every figure comes from GET /coupons/admin/list
 * (backend/src/coupons, OWNER/ADMIN): status is computed on the server clock, redemptions are
 * orders created with the code. Filters run on the loaded list (coupons are a short list).
 */
export default function CouponsWorkspace() {
    return <React.Suspense fallback={null}><ConfirmProvider><Workspace /></ConfirmProvider></React.Suspense>;
}

const VALIDITY = ['', 'ending7', 'ending30', 'notStarted', 'ended'] as const;
const PAGE_SIZE = 25;
type Validity = (typeof VALIDITY)[number];

function Workspace() {
    const router = useRouter();
    const params = useSearchParams();
    const tc = useTc();
    const { fmt } = useLanguage();
    const confirm = useConfirm();
    const copy = useCopy();
    const discountLabel = useDiscountLabel();
    const money = useMoney();
    const when = useWhen();
    const int = (n: number) => fmt.number(n);

    const [data, setData] = React.useState<CouponList | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [q, setQ] = React.useState('');
    const [status, setStatus] = React.useState('');
    const [type, setType] = React.useState('');
    const [scope, setScope] = React.useState('');
    const [validity, setValidity] = React.useState<Validity>('');
    const [creating, setCreating] = React.useState(params.get('create') === '1');
    const [editing, setEditing] = React.useState<CouponRow | null>(null);
    const [page, setPage] = React.useState(1);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        adminCouponsApi.list().then(setData).catch((e) => setError(e?.message || tc('loadFailed'))).finally(() => setLoading(false));
    }, [tc]);
    React.useEffect(() => { load(); }, [load]);

    const closeForm = () => { setCreating(false); setEditing(null); if (params.get('create')) router.replace('/admin/coupons', { scroll: false }); };

    const rows = React.useMemo(() => {
        const all = data?.rows ?? [];
        const now = data ? new Date(data.serverTime).getTime() : Date.now();
        const term = q.trim().toLowerCase();
        return all.filter((r) => {
            if (term && !r.code.toLowerCase().includes(term) && !(r.description || '').toLowerCase().includes(term) && !r.categories.some((c) => c.toLowerCase().includes(term)) && !r.products.some((p) => p.name.toLowerCase().includes(term) || (p.ean || '').includes(term))) return false;
            if (status && r.status !== status) return false;
            if (type && r.discountType !== type) return false;
            if (scope && (scope === 'PRODUCTS' ? !(r.scope === 'PRODUCTS' || r.scope === 'LEGACY') : r.scope !== scope)) return false;
            const end = new Date(r.expirationDate).getTime();
            const start = r.startsAt ? new Date(r.startsAt).getTime() : null;
            if (validity === 'ending7' && !(end >= now && end - now <= 7 * 864e5)) return false;
            if (validity === 'ending30' && !(end >= now && end - now <= 30 * 864e5)) return false;
            if (validity === 'notStarted' && !(start !== null && start > now)) return false;
            if (validity === 'ended' && !(end < now)) return false;
            return true;
        });
    }, [data, q, status, type, scope, validity]);
    const filtered = !!(q || status || type || scope || validity);
    React.useEffect(() => { setPage(1); }, [q, status, type, scope, validity]);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
    const clear = () => { setQ(''); setStatus(''); setType(''); setScope(''); setValidity(''); };

    const setActive = async (r: CouponRow, isActive: boolean) => {
        if (!isActive && !(await confirm({ title: tc('disableTitle', { code: r.code }), body: tc('disableBody'), confirm: tc('actDisable'), tone: 'danger' }))) return;
        setBusy(r.id);
        try {
            const updated = await adminCouponsApi.setActive(r.id, isActive);
            setData((d) => d && { ...d, rows: d.rows.map((x) => (x.id === r.id ? updated : x)) });
            toast.success(tc(isActive ? 'enabledToast' : 'disabledToast', { code: r.code }));
            load();
        } catch (e: any) { toast.error(e?.message || tc('actionFailed')); } finally { setBusy(null); }
    };
    const remove = async (r: CouponRow) => {
        if (!(await confirm({ title: tc('deleteTitle', { code: r.code }), body: tc('deleteBody'), confirm: tc('actDelete'), tone: 'danger' }))) return;
        setBusy(r.id);
        try {
            await adminCouponsApi.remove(r.id);
            toast.success(tc('deletedToast', { code: r.code }));
            load();
        } catch (e: any) { toast.error(e?.message || tc('actionFailed')); } finally { setBusy(null); }
    };

    const s = data?.summary;
    const usage = (r: CouponRow) => (
        <span className="block min-w-[7rem]">
            <span className="block tabular-nums text-ink-2">
                {r.usageLimit ? tc('usedOfLimit', { used: int(r.redemptions), limit: int(r.usageLimit) }) : tc('usedNoLimit', { used: int(r.redemptions) })}
            </span>
            {r.usageLimit ? (
                <span className="mt-1 block h-1.5 w-full max-w-[8rem] rounded-full bg-surface-3 overflow-hidden" aria-hidden>
                    <span className={cn('block h-full rounded-full', r.redemptions >= r.usageLimit ? 'bg-amber-500' : 'bg-teal')} style={{ width: `${Math.min(100, (r.redemptions / r.usageLimit) * 100)}%` }} />
                </span>
            ) : null}
            {r.perCustomerLimit ? <span className="mt-0.5 block text-[12px] text-ink-3">{tc('perBuyerShort', { count: r.perCustomerLimit })}</span> : null}
        </span>
    );
    const validityCell = (r: CouponRow) => (
        <span className="block text-[12.5px] tabular-nums whitespace-nowrap" title={tc('utcTitle', { start: r.startsAt ? when.utc(r.startsAt) : when.utc(r.createdAt), end: when.utc(r.expirationDate) })}>
            <span className="block text-ink-2">{tc('fromDate', { date: when.local(r.startsAt || r.createdAt) })}</span>
            <span className="block text-ink-3">{tc('untilDate', { date: when.local(r.expirationDate) })}</span>
        </span>
    );
    const actions = (r: CouponRow) => (
        <span className="flex items-center justify-end gap-1">
            <button type="button" onClick={() => copy(r.code)} aria-label={tc('copyCodeAria', { code: r.code })} title={tc('copyCode')}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Copy size={15} /></button>
            <button type="button" onClick={() => setEditing(r)} disabled={busy === r.id} aria-label={tc('editAria', { code: r.code })} title={tc('actEdit')}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Pencil size={15} /></button>
            <Button size="sm" variant="secondary" disabled={busy === r.id} icon={r.isActive ? <Power size={13} /> : <CheckCircle2 size={13} />} onClick={() => setActive(r, !r.isActive)}>
                {r.isActive ? tc('actDisable') : tc('actEnable')}
            </Button>
            <button type="button" onClick={() => remove(r)} disabled={busy === r.id || r.redemptions > 0}
                aria-label={tc('deleteAria', { code: r.code })} title={r.redemptions > 0 ? tc('deleteUsedHint') : tc('actDelete')}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-ink-3 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-3 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Trash2 size={15} /></button>
        </span>
    );

    return (
        <div data-no-translate className="text-start -mt-2">
            <PageHeader title={tc('title')} description={tc('desc')}
                actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>{tc('create')}</Button>} />

            <section aria-label={tc('summaryAria')} className="grid gap-3 grid-cols-1 sm:grid-cols-3 mb-4">
                <Stat label={tc('cardActive')} value={s ? int(s.active) : '—'} loading={loading && !data} icon={<Ticket size={17} />} tone="success"
                    hint={s ? tc('cardActiveHint', { scheduled: int(s.scheduled) }) : undefined} />
                <Stat label={tc('cardExpired')} value={s ? int(s.expired) : '—'} loading={loading && !data} icon={<CalendarClock size={17} />}
                    hint={s ? tc('cardExpiredHint', { disabled: int(s.disabled), exhausted: int(s.exhausted) }) : undefined} />
                <Stat label={tc('cardRedemptions')} value={s ? int(s.redemptions) : '—'} loading={loading && !data} icon={<TrendingUp size={17} />} tone="brand"
                    hint={<span className="inline-flex items-center gap-1.5">{tc('cardRedemptionsHint')}<InfoTip label={tc('redemptionsInfoLabel')}>{tc('redemptionsInfo')}</InfoTip></span>} />
            </section>

            <Card bodyClassName="p-0">
                <div className="grid gap-2 p-3 sm:p-4 border-b border-line grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_170px_170px_190px]">
                    <label className="relative sm:col-span-2 xl:col-span-1">
                        <span className="sr-only">{tc('search')}</span>
                        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tc('searchPh')} className={cn(inputCls, 'ps-9')} />
                    </label>
                    <select aria-label={tc('filterStatus')} value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                        <option value="">{tc('allStatuses')}</option>
                        {COUPON_STATUSES.map((x) => <option key={x} value={x}>{tc(`status_${x}`)}{s ? ` (${int((s as any)[x.toLowerCase()] ?? 0)})` : ''}</option>)}
                    </select>
                    <select aria-label={tc('filterType')} value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
                        <option value="">{tc('allTypes')}</option>
                        <option value="PERCENT">{tc('typePercent')}</option>
                        <option value="FIXED">{tc('typeFixed')}</option>
                    </select>
                    <select aria-label={tc('filterScope')} value={scope} onChange={(e) => setScope(e.target.value)} className={selectCls}>
                        <option value="">{tc('allScopes')}</option>
                        <option value="ALL">{tc('scopeAllShort')}</option>
                        <option value="CATEGORY">{tc('scopeCategory')}</option>
                        <option value="PRODUCTS">{tc('scopeProducts')}</option>
                    </select>
                    <select aria-label={tc('filterValidity')} value={validity} onChange={(e) => setValidity(e.target.value as Validity)} className={selectCls}>
                        {VALIDITY.map((v) => <option key={v || 'any'} value={v}>{tc(v ? `validity_${v}` : 'validityAny')}</option>)}
                    </select>
                </div>

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}

                {loading && !data ? (
                    <div className="p-4 space-y-3" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : !data ? null : rows.length === 0 ? (
                    filtered ? (
                        <EmptyState icon={<Search size={20} />} title={tc('noMatchTitle')} action={<Button onClick={clear}>{tc('clearFilters')}</Button>}>{tc('noMatchBody')}</EmptyState>
                    ) : (
                        <EmptyState icon={<Ticket size={20} />} title={tc('emptyTitle')} action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>{tc('create')}</Button>}>{tc('emptyBody')}</EmptyState>
                    )
                ) : (
                    <>
                        <p className="sr-only" aria-live="polite">{tc('resultCount', { count: rows.length })}</p>
                        <div className="hidden lg:block overflow-x-auto">
                            <table className={cn('w-full min-w-[980px] text-[13.5px]', loading && 'opacity-60')}>
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                        <th className="text-start font-medium ps-4 pe-2 py-2">{tc('colCode')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tc('colDiscount')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tc('colScope')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tc('colUsage')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tc('colValidity')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tc('colStatus')}</th>
                                        <th className="text-end font-medium pe-4 ps-2 py-2">{tc('colActions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.map((r) => (
                                        <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/50 align-top">
                                            <td className="ps-4 pe-2 py-2.5 max-w-[220px]">
                                                <bdi dir="ltr" className="block font-mono font-semibold text-ink tracking-wide">{r.code}</bdi>
                                                {r.description && <span className="block text-[12px] text-ink-3 truncate" title={r.description}>{r.description}</span>}
                                            </td>
                                            <td className="px-2 py-2.5">
                                                <span className="block font-semibold text-ink tabular-nums">{discountLabel(r.discountType, r.discountPercent, r.amountOff)}</span>
                                                <span className="block text-[12px] text-ink-3">{r.discountType === 'FIXED' ? tc('typeFixed') : tc('typePercent')}{r.minOrderAmount ? ` · ${tc('minShort', { amount: money(r.minOrderAmount) })}` : ''}</span>
                                            </td>
                                            <td className="px-2 py-2.5 max-w-[240px]">
                                                <span className="block text-ink-2">{scopeText(tc, r)}</span>
                                                {r.products.length > 0 && <span className="block text-[12px] text-ink-3 truncate">{r.products.map((p) => (p.missing ? tc('productRemoved') : p.name)).join(', ')}</span>}
                                            </td>
                                            <td className="px-2 py-2.5">{usage(r)}</td>
                                            <td className="px-2 py-2.5">{validityCell(r)}</td>
                                            <td className="px-2 py-2.5"><CouponStatusBadge status={r.status} /></td>
                                            <td className="pe-4 ps-2 py-2">{actions(r)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <ul className="lg:hidden divide-y divide-line">
                            {shown.map((r) => (
                                <li key={r.id} className="p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <bdi dir="ltr" className="block font-mono font-semibold text-ink tracking-wide">{r.code}</bdi>
                                            {r.description && <span className="block text-[12px] text-ink-3">{r.description}</span>}
                                            <span className="block text-[13px] text-ink-2">{discountLabel(r.discountType, r.discountPercent, r.amountOff)} · {scopeText(tc, r)}</span>
                                        </div>
                                        <CouponStatusBadge status={r.status} />
                                    </div>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
                                        {usage(r)}
                                        {validityCell(r)}
                                    </div>
                                    {actions(r)}
                                </li>
                            ))}
                        </ul>
                        {pages > 1 && (
                            <nav aria-label={tc('pagination')} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-line text-[13px] text-ink-3">
                                <span className="tabular-nums">{tc('pageRange', { from: int((current - 1) * PAGE_SIZE + 1), to: int(Math.min(current * PAGE_SIZE, rows.length)), total: int(rows.length) })}</span>
                                <span className="flex items-center gap-1">
                                    <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} className="rtl:rotate-180" />} disabled={current <= 1} onClick={() => setPage(current - 1)}>{tc('prev')}</Button>
                                    <span className="tabular-nums px-1">{tc('pageOf', { page: int(current), pages: int(pages) })}</span>
                                    <Button size="sm" variant="ghost" disabled={current >= pages} onClick={() => setPage(current + 1)}>{tc('next')}<ChevronRight size={14} className="rtl:rotate-180" /></Button>
                                </span>
                            </nav>
                        )}
                    </>
                )}
            </Card>
            <p className="mt-3 text-[12.5px] text-ink-3 max-w-[90ch]">{tc('howItWorks')}</p>

            <CreateCouponDialog open={creating || !!editing} editing={editing} onClose={closeForm}
                onSaved={(row) => { setData((d) => d && { ...d, rows: d.rows.some((x) => x.id === row.id) ? d.rows.map((x) => (x.id === row.id ? row : x)) : [row, ...d.rows] }); load(); }} />
        </div>
    );
}
