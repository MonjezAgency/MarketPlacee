'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, Eye, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, Card, ConfirmProvider, EmptyState, ErrorState, PageHeader, Skeleton, inputCls, selectCls, useConfirm } from '@/components/supplier/ui';
import { adminUsersApi, isMarketAccount, KYC_STATUSES, ROLES, STATUSES, USER_SORTS, type UserPage, type UserRow } from '@/lib/admin-users-api';
import { Avatar, KycBadge, RoleBadge, StatusBadge, kycLabel, roleLabel, statusLabel, useTu } from './userUi';

/**
 * Admin → Users (/admin/users): every account in one directory — buyers,
 * suppliers and staff — with search, filters, sorting and server-side pages
 * (GET /admin/users/list). Old /admin/buyers and /admin/suppliers links
 * redirect here with the role filter set.
 */
const STATUS_TABS = ['', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'BLOCKED'];

export default function UsersDirectory() {
    return <React.Suspense fallback={null}><ConfirmProvider><Directory /></ConfirmProvider></React.Suspense>;
}

function Directory() {
    const router = useRouter();
    const params = useSearchParams();
    const confirm = useConfirm();
    const { fmt } = useLanguage();
    const tu = useTu();
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n));

    const initialRole = (params.get('role') || '').toUpperCase();
    const [q, setQ] = React.useState(params.get('q') || '');
    const [debouncedQ, setDebouncedQ] = React.useState(q);
    const [role, setRole] = React.useState(initialRole === 'BUYER' ? 'CUSTOMER' : (ROLES as readonly string[]).includes(initialRole) ? initialRole : '');
    const [status, setStatus] = React.useState((STATUSES as string[]).includes(params.get('status') || '') ? (params.get('status') as string) : '');
    const [country, setCountry] = React.useState(params.get('country') || '');
    const [kyc, setKyc] = React.useState((KYC_STATUSES as readonly string[]).includes(params.get('kyc') || '') ? (params.get('kyc') as string) : '');
    const [sort, setSort] = React.useState((USER_SORTS as readonly string[]).includes(params.get('sort') || '') ? (params.get('sort') as string) : 'newest');
    const [page, setPage] = React.useState(Number(params.get('page')) || 1);
    const [data, setData] = React.useState<UserPage | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => { const h = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(h); }, [q]);
    const first = React.useRef(true);
    React.useEffect(() => { if (first.current) { first.current = false; return; } setPage(1); }, [debouncedQ, role, status, country, kyc, sort]);
    React.useEffect(() => {
        const u = new URLSearchParams();
        if (debouncedQ) u.set('q', debouncedQ); if (role) u.set('role', role); if (status) u.set('status', status); if (country) u.set('country', country);
        if (kyc) u.set('kyc', kyc); if (sort !== 'newest') u.set('sort', sort); if (page > 1) u.set('page', String(page));
        router.replace(u.toString() ? `/admin/users?${u}` : '/admin/users', { scroll: false });
    }, [debouncedQ, role, status, country, kyc, sort, page, router]);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        adminUsersApi.list({ q: debouncedQ, role, status, country, kyc, sort, page, limit: 25 })
            .then((d) => { setData(d); setSelected(new Set()); })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [debouncedQ, role, status, country, kyc, sort, page]);
    React.useEffect(() => { load(); }, [load]);

    const clearFilters = () => { setQ(''); setRole(''); setStatus(''); setCountry(''); setKyc(''); };
    const rows = data?.data ?? [];
    const selectable = rows.filter((r) => isMarketAccount(r.role));
    const allOnPage = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
    const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(selectable.map((r) => r.id)));
    const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const chosen = rows.filter((r) => selected.has(r.id));
    const approvable = chosen.filter((r) => r.status === 'PENDING_APPROVAL');
    const blockable = chosen.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'ACTIVE');

    const bulk = async (kind: 'approve' | 'block') => {
        const list = kind === 'approve' ? approvable : blockable;
        if (!(await confirm({ title: tu(kind === 'approve' ? 'bulkApproveTitle' : 'bulkBlockTitle', { count: list.length }), body: tu(kind === 'approve' ? 'bulkApproveBody' : 'bulkBlockBody'), confirm: tu(kind === 'approve' ? 'act_approve' : 'act_block'), tone: kind === 'block' ? 'danger' : 'primary' }))) return;
        setBusy(true);
        try {
            const r = await (kind === 'approve' ? adminUsersApi.bulkApprove : adminUsersApi.bulkBlock)(list.map((u) => u.id));
            toast.success(tu(kind === 'approve' ? 'bulkApproved' : 'bulkBlocked', { count: r.updated }));
            if (r.failed) toast.error(tu('bulkFailed', { count: r.failed }));
            load();
        } catch (e: any) { toast.error(e?.message || tu('actionFailed')); } finally { setBusy(false); }
    };

    const c = data?.counts;
    const statusCount = (s: string) => (s ? c?.byStatus[s] ?? 0 : Object.values(c?.byStatus ?? {}).reduce((a, b) => a + b, 0));
    const roleCount = (r: string) => c?.byRole[r] ?? 0;

    const activity = (u: UserRow) => {
        if (u.role === 'CUSTOMER') return (
            <span className="block">
                <span className="block tabular-nums text-ink-2">{tu('ordersCount', { count: u.activity.orders ?? 0 })}</span>
                {!!u.activity.targetPrices && <span className="block text-[12px] text-ink-3 tabular-nums">{tu('targetPricesCount', { count: u.activity.targetPrices })}</span>}
            </span>
        );
        if (u.role === 'SUPPLIER') return (
            <span className="block">
                <span className="block tabular-nums text-ink-2">{tu('productsCount', { count: u.activity.products ?? 0 })}</span>
                <span className="block text-[12px] text-ink-3 tabular-nums">{tu('liveCount', { count: u.activity.liveProducts ?? 0 })}</span>
            </span>
        );
        return <span className="text-ink-4">—</span>;
    };

    return (
        <div data-no-translate className="text-start -mt-2">
            <PageHeader title={tu('title')} description={tu('desc')} />

            <Card bodyClassName="p-0">
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-line">
                    <div role="tablist" aria-label={tu('statusAria')} className="flex gap-1 overflow-x-auto -mx-1 px-1">
                        {STATUS_TABS.map((s) => (
                            <button key={s || 'all'} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
                                className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                    status === s ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                                {s ? statusLabel(tu, s) : tu('all')}
                                {c && <span className={cn('ms-1.5 tabular-nums', status === s ? 'text-white/70' : 'text-ink-4')}>{int(statusCount(s))}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_170px_170px_170px]">
                        <label className="relative sm:col-span-2 xl:col-span-1">
                            <span className="sr-only">{tu('search')}</span>
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tu('searchPh')} className={cn(inputCls, 'ps-9')} />
                        </label>
                        <select aria-label={tu('role')} value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
                            <option value="">{tu('allRoles')}</option>
                            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(tu, r)}{c ? ` (${int(roleCount(r))})` : ''}</option>)}
                        </select>
                        <select aria-label={tu('country')} value={country} onChange={(e) => setCountry(e.target.value)} className={selectCls}>
                            <option value="">{tu('allCountries')}</option>
                            {country && !(data?.facets.countries ?? []).some((x) => x.value.toLowerCase() === country.toLowerCase()) && <option value={country}>{country}</option>}
                            {(data?.facets.countries ?? []).map((x) => <option key={x.value} value={x.value}>{x.value} ({int(x.count)})</option>)}
                        </select>
                        <select aria-label={tu('kyc')} value={kyc} onChange={(e) => setKyc(e.target.value)} className={selectCls}>
                            <option value="">{tu('allKyc')}</option>
                            {KYC_STATUSES.map((k) => <option key={k} value={k}>{kycLabel(tu, k)}</option>)}
                        </select>
                        <select aria-label={tu('sort')} value={sort} onChange={(e) => setSort(e.target.value)} className={selectCls}>
                            {USER_SORTS.map((o) => <option key={o} value={o}>{tu(`sort_${o}`)}</option>)}
                        </select>
                    </div>
                </div>

                {selected.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-teal-soft border-b border-line text-[13px]">
                        <span className="font-medium text-heading">{tu('selectedCount', { count: selected.size })}</span>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{tu('clear')}</Button>
                        <span className="flex-1" />
                        {approvable.length > 0 && <Button size="sm" variant="primary" icon={<CheckCircle2 size={13} />} loading={busy} onClick={() => bulk('approve')}>{tu('approveN', { count: approvable.length })}</Button>}
                        {blockable.length > 0 && <Button size="sm" variant="secondary" icon={<Ban size={13} />} disabled={busy} onClick={() => bulk('block')}>{tu('blockN', { count: blockable.length })}</Button>}
                    </div>
                )}

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}

                {loading && !data ? (
                    <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : rows.length === 0 && !error ? (
                    debouncedQ || role || status || country || kyc ? (
                        <EmptyState icon={<Search size={20} />} title={tu('noMatchTitle')} action={<Button onClick={clearFilters}>{tu('clearFilters')}</Button>}>{tu('noMatchBody')}</EmptyState>
                    ) : (
                        <EmptyState icon={<Users size={20} />} title={tu('emptyTitle')}>{tu('emptyBody')}</EmptyState>
                    )
                ) : (
                    <>
                        <div className="hidden lg:block overflow-x-auto">
                            <table className={cn('w-full text-[13.5px]', loading && 'opacity-60')}>
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                        <th className="w-10 ps-4 py-2"><input type="checkbox" aria-label={tu('selectAllOnPage')} checked={allOnPage} disabled={!selectable.length} onChange={toggleAll} className="w-4 h-4 accent-[#0E7C74]" /></th>
                                        <th className="text-start font-medium px-2 py-2">{tu('colUser')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tu('colCompany')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tu('role')}</th>
                                        <th className="text-start font-medium px-2 py-2 hidden xl:table-cell">{tu('country')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tu('colStatus')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tu('kyc')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tu('colActivity')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tu('colRegistered')}</th>
                                        <th className="text-end font-medium pe-4 py-2"><span className="sr-only">{tu('actions')}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((u) => (
                                        <tr key={u.id} className={cn('border-b border-line last:border-0 hover:bg-surface-2/40', selected.has(u.id) && 'bg-teal-soft/50')}>
                                            <td className="ps-4 py-2.5">
                                                {isMarketAccount(u.role) && <input type="checkbox" aria-label={tu('selectName', { name: u.name })} checked={selected.has(u.id)} onChange={() => toggle(u.id)} className="w-4 h-4 accent-[#0E7C74]" />}
                                            </td>
                                            <td className="px-2 py-2.5 max-w-[280px]">
                                                <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5 min-w-0 group">
                                                    <Avatar name={u.name} src={u.avatar} />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-ink group-hover:underline">{u.name}</span>
                                                        <bdi dir="ltr" className="block truncate text-[12px] text-ink-3">{u.email}</bdi>
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="px-2 py-2.5 max-w-[200px] truncate text-ink-2">{u.companyName || <span className="text-ink-4">—</span>}</td>
                                            <td className="px-2 py-2.5"><RoleBadge role={u.role} /></td>
                                            <td className="px-2 py-2.5 hidden xl:table-cell text-ink-2">{u.country || <span className="text-ink-4">—</span>}</td>
                                            <td className="px-2 py-2.5"><StatusBadge status={u.status} /></td>
                                            <td className="px-2 py-2.5"><KycBadge status={u.kycStatus} /></td>
                                            <td className="px-2 py-2.5">{activity(u)}</td>
                                            <td className="px-2 py-2.5 text-[12.5px] text-ink-3 whitespace-nowrap tabular-nums">{fmt.date(u.createdAt)}</td>
                                            <td className="pe-4 py-2.5">
                                                <div className="flex justify-end">
                                                    <Link href={`/admin/users/${u.id}`} title={tu('view')} aria-label={tu('viewName', { name: u.name })} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Eye size={15} /></Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <ul className="lg:hidden divide-y divide-line">
                            {rows.map((u) => (
                                <li key={u.id} className="flex gap-3 p-3">
                                    {isMarketAccount(u.role)
                                        ? <input type="checkbox" aria-label={tu('selectName', { name: u.name })} checked={selected.has(u.id)} onChange={() => toggle(u.id)} className="mt-2.5 w-4 h-4 accent-[#0E7C74]" />
                                        : <span className="w-4 shrink-0" aria-hidden />}
                                    <Link href={`/admin/users/${u.id}`} className="flex gap-3 min-w-0 flex-1">
                                        <Avatar name={u.name} src={u.avatar} size={36} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-medium text-ink truncate">{u.name}</span>
                                            <span className="block text-[12px] text-ink-3 truncate"><bdi dir="ltr">{u.email}</bdi>{u.companyName ? ` · ${u.companyName}` : ''}</span>
                                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                <RoleBadge role={u.role} /><StatusBadge status={u.status} /><KycBadge status={u.kycStatus} />
                                            </span>
                                            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-ink-3">
                                                {u.role === 'CUSTOMER' && <span className="tabular-nums">{tu('ordersCount', { count: u.activity.orders ?? 0 })}</span>}
                                                {u.role === 'SUPPLIER' && <span className="tabular-nums">{tu('productsCount', { count: u.activity.products ?? 0 })} · {tu('liveCount', { count: u.activity.liveProducts ?? 0 })}</span>}
                                                {u.country && <span>{u.country}</span>}
                                                <span className="tabular-nums">{tu('registeredOn', { date: fmt.date(u.createdAt) })}</span>
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {data && data.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line text-[13px] text-ink-3">
                        <span>{tu('rangeOf', { from: int((data.page - 1) * data.limit + 1), to: int(Math.min(data.page * data.limit, data.total)), total: int(data.total) })}</span>
                        <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} className="rtl:rotate-180" />} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>{tu('previous')}</Button>
                            <span className="px-2 tabular-nums">{tu('pageOf', { page: int(data.page), pages: int(data.pages) })}</span>
                            <Button size="sm" variant="ghost" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>{tu('next')} <ChevronRight size={15} className="rtl:rotate-180" /></Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}
