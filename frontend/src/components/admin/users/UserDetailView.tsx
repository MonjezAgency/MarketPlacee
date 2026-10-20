'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileText, Mail, Package, Phone, ShieldCheck, ShoppingCart, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, Card, ConfirmProvider, EmptyState, ErrorState, PRODUCT_STATUS, Skeleton, Thumb } from '@/components/supplier/ui';
import { statusLabel as productStatusLabel } from '@/components/supplier/import/types';
import { adminUsersApi, type UserDetail } from '@/lib/admin-users-api';
import { AccountActions, Avatar, KycBadge, RoleBadge, StatusBadge, kycLabel, useTu } from './userUi';

/**
 * Admin → Users → one account (/admin/users/[id]), from GET /admin/users/:id.
 * Suppliers: products, Atlantis review decisions and orders containing their
 * products. Buyers: orders and target prices. Staff: profile only.
 * Account actions use the existing status endpoint, each with a confirmation.
 */
const PRODUCT_TABS = ['APPROVED', 'PENDING', 'NEEDS_CHANGES', 'DRAFT', 'REJECTED'];
const ORDER_STATUS = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

export default function UserDetailView({ id }: { id: string }) {
    return <ConfirmProvider><Detail id={id} /></ConfirmProvider>;
}

function Detail({ id }: { id: string }) {
    const { t, fmt } = useLanguage();
    const tu = useTu();
    const [data, setData] = React.useState<UserDetail | null>(null);
    const [error, setError] = React.useState<{ message: string; status?: number } | null>(null);
    const load = React.useCallback(() => {
        setError(null);
        adminUsersApi.detail(id).then(setData).catch((e) => setError({ message: e.message, status: e.status }));
    }, [id]);
    React.useEffect(() => { load(); }, [load]);

    const int = (n: number) => fmt.number(n);
    const eur = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const known = (key: string, raw: string) => tu(key) || raw;
    const orderBadges = (o: { status: string; reviewStatus: string }) => (
        <span className="flex flex-wrap gap-1">
            {o.reviewStatus === 'PENDING_REVIEW' ? <Badge tone="warning" dot>{tu('orderRequestPending')}</Badge>
                : o.reviewStatus === 'REJECTED' ? <Badge tone="danger" dot>{tu('orderRequestRejected')}</Badge>
                    : <Badge tone={o.status === 'CANCELLED' ? 'danger' : o.status === 'DELIVERED' ? 'success' : 'neutral'} dot>{known(`order_${o.status}`, o.status)}</Badge>}
        </span>
    );
    const shortId = (oid: string) => `#${oid.slice(-8).toUpperCase()}`;

    const back = (
        <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
            <ArrowLeft size={14} className="rtl:rotate-180" />{tu('backToUsers')}
        </Link>
    );

    if (error) return (
        <div data-no-translate className="text-start space-y-4">
            {back}
            {error.status === 404
                ? <Card><EmptyState title={tu('notFoundTitle')}>{tu('notFoundBody')}</EmptyState></Card>
                : <ErrorState message={error.message} onRetry={load} />}
        </div>
    );
    if (!data) return (
        <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-5 w-24" /><Skeleton className="h-16" />
            <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64 lg:col-span-2" /></div>
        </div>
    );

    const u = data.user;
    const telHref = u.phone ? `tel:${u.phone.replace(/[^\d+]/g, '')}` : null;
    const site = u.website && /^https?:\/\//i.test(u.website) ? u.website : null;
    const row = (label: string, value: React.ReactNode) => (
        <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 py-2 border-b border-line last:border-0 text-[13.5px]">
            <dt className="text-ink-3">{label}</dt>
            <dd className="text-ink min-w-0 break-words">{value ?? <span className="text-ink-4">—</span>}</dd>
        </div>
    );

    return (
        <div data-no-translate className="text-start -mt-2 space-y-4">
            {back}

            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                    <Avatar name={u.name} src={u.avatar} size={48} />
                    <div className="min-w-0">
                        <h1 className="font-sans text-[22px] leading-tight font-semibold text-heading tracking-tight break-words">{u.name}</h1>
                        <p className="mt-0.5 text-[13.5px] text-ink-3 break-words">{u.companyName || tu('noCompany')}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5"><RoleBadge role={u.role} /><StatusBadge status={u.status} /><KycBadge status={u.kycStatus} /></div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a href={`mailto:${u.email}`} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[13.5px] font-semibold bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Mail size={15} />{tu('emailAction')}</a>
                    {telHref && <a href={telHref} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[13.5px] font-semibold bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Phone size={15} />{tu('callAction')}</a>}
                    <AccountActions user={u} onDone={load} />
                </div>
            </header>

            {u.status === 'PENDING_APPROVAL' && (u.role === 'SUPPLIER' || u.role === 'CUSTOMER') && (
                <p className="rounded-lg bg-amber-50 ring-1 ring-inset ring-amber-200 px-4 py-3 text-[13.5px] text-amber-900">{tu('pendingNote')}</p>
            )}

            <div className="grid gap-4 lg:grid-cols-3 items-start">
                <div className="space-y-4 min-w-0">
                    <Card title={tu('profileTitle')}>
                        <dl>
                            {row(tu('email'), <span className="flex flex-wrap items-center gap-1.5"><bdi dir="ltr">{u.email}</bdi><Badge tone={u.emailVerified ? 'success' : 'warning'}>{tu(u.emailVerified ? 'emailVerified' : 'emailNotVerified')}</Badge></span>)}
                            {row(tu('phone'), u.phone ? <bdi dir="ltr">{u.phone}</bdi> : null)}
                            {row(tu('colCompany'), u.companyName)}
                            {row(tu('businessType'), u.businessType)}
                            {row(tu('city'), u.businessCity)}
                            {row(tu('country'), u.country)}
                            {row(tu('website'), u.website ? (site ? <a href={site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal font-medium hover:underline"><bdi dir="ltr" className="break-all">{u.website}</bdi><ExternalLink size={12} /></a> : <bdi dir="ltr">{u.website}</bdi>) : null)}
                            {row(tu('brands'), u.preferredBrands.length ? u.preferredBrands.join(', ') : null)}
                        </dl>
                        <p className="mt-2 text-[12px] text-ink-3">{tu('selfDeclared')}</p>
                    </Card>
                    <Card title={tu('accountTitle')}>
                        <dl>
                            {row(tu('role'), <RoleBadge role={u.role} />)}
                            {row(tu('colStatus'), <StatusBadge status={u.status} />)}
                            {row(tu('colRegistered'), <span className="tabular-nums">{fmt.date(u.createdAt)}</span>)}
                            {row(tu('lastUpdated'), <span className="tabular-nums">{fmt.date(u.updatedAt)}</span>)}
                            {row(tu('profileComplete'), tu(u.onboardingCompleted ? 'yes' : 'no'))}
                            {row(tu('twoFactor'), tu(u.twoFactorEnabled ? 'on' : 'off'))}
                        </dl>
                    </Card>
                    <Card title={tu('kycTitle')} actions={<Link href="/admin/kyc" className="text-[12.5px] font-medium text-teal hover:underline">{tu('openKyc')}</Link>}>
                        <div className="flex items-center gap-2 text-[13.5px]"><ShieldCheck size={15} className="text-ink-4" /><KycBadge status={u.kycStatus} /></div>
                        {data.kycDocuments.length ? (
                            <ul className="mt-3 divide-y divide-line">
                                {data.kycDocuments.map((d) => (
                                    <li key={d.id} className="py-2 flex items-start gap-2 text-[13px]">
                                        <FileText size={14} className="mt-0.5 text-ink-4 shrink-0" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-ink">{known(`doc_${d.documentType}`, d.documentType)}</span>
                                            <span className="block text-[12px] text-ink-3 tabular-nums">{tu('submittedOn', { date: fmt.date(d.createdAt) })}</span>
                                            {d.adminNotes && <span className="block mt-0.5 text-[12px] text-ink-2">{d.adminNotes}</span>}
                                        </span>
                                        <span className="shrink-0"><Badge tone={d.status === 'VERIFIED' ? 'success' : d.status === 'REJECTED' ? 'danger' : d.status === 'PENDING' ? 'warning' : 'neutral'}>{kycLabel(tu, d.status)}</Badge></span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="mt-2 text-[13px] text-ink-3">{tu('noKycDocs')}</p>}
                    </Card>
                </div>

                <div className="space-y-4 min-w-0 lg:col-span-2">
                    {data.supplier && (
                        <>
                            <Card title={tu('productsTitle')} description={tu('productsDesc', { count: data.supplier.products.total })}
                                actions={<Link href={`/admin/products/submissions?supplier=${u.id}`} className="text-[12.5px] font-medium text-teal hover:underline">{tu('allProducts')}</Link>}>
                                <div className="flex flex-wrap gap-1.5">
                                    {PRODUCT_TABS.map((s) => (
                                        <Link key={s} href={`/admin/products/submissions?supplier=${u.id}&status=${s}`} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md ring-1 ring-inset ring-line text-[13px] text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                                            <span className={cn('w-1.5 h-1.5 rounded-full', s === 'APPROVED' ? 'bg-emerald-500' : s === 'REJECTED' ? 'bg-red-500' : s === 'DRAFT' ? 'bg-slate-400' : 'bg-amber-500')} aria-hidden />
                                            {productStatusLabel(s, t)}<span className="tabular-nums text-ink-4">{int(data.supplier!.products.byStatus[s] ?? 0)}</span>
                                        </Link>
                                    ))}
                                </div>
                                {data.supplier.products.recent.length ? (
                                    <>
                                        <p className="mt-4 mb-1 text-[12px] font-medium text-ink-3">{tu('recentlyUpdated')}</p>
                                        <ul className="divide-y divide-line">
                                            {data.supplier.products.recent.map((p) => (
                                                <li key={p.id}>
                                                    <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 py-2 group">
                                                        <Thumb src={p.image} size={36} />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-[13.5px] font-medium text-ink group-hover:underline">{p.name}</span>
                                                            <span className="block truncate text-[12px] text-ink-3">{p.brand || tu('noBrand')} · <span className="tabular-nums">{tu('stockCases', { count: p.stock })}</span> · <span className="tabular-nums">{fmt.date(p.updatedAt)}</span></span>
                                                        </span>
                                                        <Badge tone={PRODUCT_STATUS[p.status]?.tone ?? 'neutral'} dot>{productStatusLabel(p.status, t)}</Badge>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                ) : <EmptyState icon={<Package size={20} />} title={tu('noProductsTitle')}>{tu('noProductsBody')}</EmptyState>}
                            </Card>

                            <Card title={tu('decisionsTitle')} description={tu('decisionsDesc')}>
                                {data.supplier.reviewDecisions.length ? (
                                    <ul className="divide-y divide-line">
                                        {data.supplier.reviewDecisions.map((e) => (
                                            <li key={e.id} className="py-2 text-[13px]">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <Badge tone={e.action === 'APPROVED' ? 'success' : e.action === 'REJECTED' ? 'danger' : 'warning'}>{known(`decision_${e.action}`, e.action)}</Badge>
                                                    <Link href={`/admin/products/${e.product.id}`} className="font-medium text-ink hover:underline min-w-0 truncate">{e.product.name}</Link>
                                                    <span className="text-[12px] text-ink-3 tabular-nums ms-auto">{fmt.date(e.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <p className="mt-0.5 text-[12px] text-ink-3">{e.by === 'system' ? tu('bySystem') : e.actorName ? tu('byName', { name: e.actorName }) : tu('byAtlantis')}</p>
                                                {e.message && <p className="mt-1 text-[13px] text-ink-2 whitespace-pre-line">{e.message}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-[13px] text-ink-3">{tu('noDecisions')}</p>}
                            </Card>

                            <Card title={tu('supplierOrdersTitle')} description={tu('supplierOrdersDesc', { count: data.supplier.orders.total })}>
                                {data.supplier.orders.recent.length ? (
                                    <div className="overflow-x-auto -mx-4 sm:-mx-5">
                                        <table className="w-full min-w-[560px] text-[13px]">
                                            <thead><tr className="text-[12px] text-ink-3 border-b border-line">
                                                <th className="text-start font-medium ps-4 sm:ps-5 pe-2 py-2">{tu('colOrder')}</th>
                                                <th className="text-start font-medium px-2 py-2">{tu('colDate')}</th>
                                                <th className="text-start font-medium px-2 py-2">{tu('colBuyer')}</th>
                                                <th className="text-start font-medium px-2 py-2">{tu('colStatus')}</th>
                                                <th className="text-end font-medium pe-4 sm:pe-5 ps-2 py-2">{tu('colTheirLines')}</th>
                                            </tr></thead>
                                            <tbody>
                                                {data.supplier.orders.recent.map((o) => (
                                                    <tr key={o.id} className="border-b border-line last:border-0">
                                                        <td className="ps-4 sm:ps-5 pe-2 py-2"><Link href={`/admin/orders/${o.id}`} className="font-mono text-[12.5px] text-teal hover:underline"><bdi dir="ltr">{shortId(o.id)}</bdi></Link></td>
                                                        <td className="px-2 py-2 tabular-nums text-ink-3 whitespace-nowrap">{fmt.date(o.createdAt)}</td>
                                                        <td className="px-2 py-2 max-w-[200px] truncate">{o.buyer ? <Link href={`/admin/users/${o.buyer.id}`} className="text-ink-2 hover:underline">{o.buyer.name}</Link> : '—'}</td>
                                                        <td className="px-2 py-2">{orderBadges(o)}</td>
                                                        <td className="pe-4 sm:pe-5 ps-2 py-2 text-end tabular-nums">{int(o.supplierLines)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : <EmptyState icon={<ShoppingCart size={20} />} title={tu('noOrdersTitle')}>{tu('noSupplierOrdersBody')}</EmptyState>}
                            </Card>
                        </>
                    )}

                    {data.buyer && (
                        <>
                            <Card title={tu('buyerOrdersTitle')} description={tu('buyerOrdersDesc', { count: data.buyer.orders.total })}>
                                {data.buyer.orders.total > 0 && (
                                    <div className="mb-3 flex flex-wrap gap-1.5">
                                        {ORDER_STATUS.filter((s) => data.buyer!.orders.byStatus[s]).map((s) => (
                                            <span key={s} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md ring-1 ring-inset ring-line text-[12.5px] text-ink-2">{known(`order_${s}`, s)}<span className="tabular-nums text-ink-4">{int(data.buyer!.orders.byStatus[s])}</span></span>
                                        ))}
                                    </div>
                                )}
                                {data.buyer.orders.recent.length ? (
                                    <div className="overflow-x-auto -mx-4 sm:-mx-5">
                                        <table className="w-full min-w-[560px] text-[13px]">
                                            <thead><tr className="text-[12px] text-ink-3 border-b border-line">
                                                <th className="text-start font-medium ps-4 sm:ps-5 pe-2 py-2">{tu('colOrder')}</th>
                                                <th className="text-start font-medium px-2 py-2">{tu('colDate')}</th>
                                                <th className="text-start font-medium px-2 py-2">{tu('colStatus')}</th>
                                                <th className="text-end font-medium px-2 py-2">{tu('colLines')}</th>
                                                <th className="text-end font-medium pe-4 sm:pe-5 ps-2 py-2">{tu('colTotal')}</th>
                                            </tr></thead>
                                            <tbody>
                                                {data.buyer.orders.recent.map((o) => (
                                                    <tr key={o.id} className="border-b border-line last:border-0">
                                                        <td className="ps-4 sm:ps-5 pe-2 py-2"><Link href={`/admin/orders/${o.id}`} className="font-mono text-[12.5px] text-teal hover:underline"><bdi dir="ltr">{shortId(o.id)}</bdi></Link></td>
                                                        <td className="px-2 py-2 tabular-nums text-ink-3 whitespace-nowrap">{fmt.date(o.createdAt)}</td>
                                                        <td className="px-2 py-2">{orderBadges(o)}</td>
                                                        <td className="px-2 py-2 text-end tabular-nums">{int(o.lines)}</td>
                                                        <td className="pe-4 sm:pe-5 ps-2 py-2 text-end tabular-nums">{eur(o.totalAmount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : <EmptyState icon={<ShoppingCart size={20} />} title={tu('noOrdersTitle')}>{tu('noBuyerOrdersBody')}</EmptyState>}
                            </Card>

                            <Card title={tu('targetPricesTitle')} description={tu('targetPricesDesc', { count: data.buyer.targetPrices.total })}
                                actions={<Link href="/admin/target-prices" className="text-[12.5px] font-medium text-teal hover:underline">{tu('openTargetPrices')}</Link>}>
                                {data.buyer.targetPrices.recent.length ? (
                                    <ul className="divide-y divide-line">
                                        {data.buyer.targetPrices.recent.map((r) => (
                                            <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                                                <bdi dir="ltr" className="font-mono text-[12.5px] text-ink-3">{r.ref}</bdi>
                                                {r.product ? <Link href={`/admin/products/${r.product.id}`} className="font-medium text-ink hover:underline min-w-0 truncate">{r.product.name}</Link> : <span className="text-ink-4">—</span>}
                                                <span className="tabular-nums text-ink-2">{tu('targetLine', { price: eur(r.targetCasePrice), qty: tu(`qty_${r.quantityUnit}`, { count: r.quantity }) || `${int(r.quantity)} ${r.quantityUnit}` })}</span>
                                                <span className="ms-auto flex items-center gap-2">
                                                    <Badge tone={r.status === 'ACCEPTED' ? 'success' : r.status === 'DECLINED' ? 'danger' : r.status === 'OPEN' ? 'warning' : 'neutral'}>{known(`tp_${r.status}`, r.status)}</Badge>
                                                    <span className="text-[12px] text-ink-3 tabular-nums">{fmt.date(r.createdAt)}</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <EmptyState icon={<Target size={20} />} title={tu('noTargetsTitle')}>{tu('noTargetsBody')}</EmptyState>}
                            </Card>
                        </>
                    )}

                    {!data.supplier && !data.buyer && (
                        <Card><EmptyState icon={<ShieldCheck size={20} />} title={tu('staffTitle')}>{tu('staffBody')}</EmptyState></Card>
                    )}
                </div>
            </div>
        </div>
    );
}
