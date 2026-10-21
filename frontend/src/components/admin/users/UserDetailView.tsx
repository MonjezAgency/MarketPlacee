'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileText, Mail, MessageSquare, Package, Phone, ShieldCheck, ShoppingCart, Star, Tag, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, Card, ConfirmProvider, EmptyState, ErrorState, PRODUCT_STATUS, Skeleton, Thumb } from '@/components/supplier/ui';
import { statusLabel as productStatusLabel } from '@/components/supplier/import/types';
import { adminUsersApi, type AccountMoney, type Paged, type ReviewDecision, type UserDetail } from '@/lib/admin-users-api';
import { AccountActions, Avatar, InfoTip, KycBadge, Pager, RoleBadge, StatusBadge, kycLabel, useRowNav, useTu } from './userUi';

/**
 * Admin → Users → one account (/admin/users/[id]).
 * A compact summary (identity, company, status, KYC, email verification,
 * registration, contact and account actions) and tabs, so the page no longer
 * scrolls through every list at once:
 *  Supplier — Overview · Products · Offers · Orders · Reviews
 *  Buyer    — Overview · Orders · Target prices · Reviews
 *  Staff    — profile only.
 * Overview and money come from GET /admin/users/:id; every other tab is
 * server-paginated, 14 per page (GET /admin/users/:id/<tab>). Money figures
 * are defined in backend/src/admin/admin-users-activity.ts; nothing here
 * claims money received. Account actions are the existing ones.
 */
type TabKey = 'overview' | 'products' | 'offers' | 'orders' | 'targets' | 'reviews';
const PRODUCT_FILTERS = ['', 'APPROVED', 'PENDING', 'NEEDS_CHANGES', 'DRAFT', 'REJECTED'];
const ORDER_STATUS = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

export default function UserDetailView({ id }: { id: string }) {
    return <React.Suspense fallback={null}><ConfirmProvider><Detail id={id} /></ConfirmProvider></React.Suspense>;
}

/** Shared formatting for this page. */
function useFmt() {
    const { fmt } = useLanguage();
    const tu = useTu();
    return React.useMemo(() => ({
        int: (n: number) => fmt.number(n),
        eur: (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })),
        date: (d: string) => fmt.date(d),
        known: (key: string, raw: string) => tu(key) || raw,
        shortId: (oid: string) => `#${oid.slice(-8).toUpperCase()}`,
    }), [fmt, tu]);
}

function Detail({ id }: { id: string }) {
    const tu = useTu();
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [data, setData] = React.useState<UserDetail | null>(null);
    const [error, setError] = React.useState<{ message: string; status?: number } | null>(null);
    const load = React.useCallback(() => {
        setError(null);
        adminUsersApi.detail(id).then(setData).catch((e) => setError({ message: e.message, status: e.status }));
    }, [id]);
    React.useEffect(() => { load(); }, [load]);

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
        <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-5 w-24" /><Skeleton className="h-28" /><Skeleton className="h-9 w-96" /><Skeleton className="h-64" />
        </div>
    );

    const u = data.user;
    const s = data.supplier;
    const b = data.buyer;
    const tabs: { key: TabKey; label: string; count?: number }[] = s ? [
        { key: 'overview', label: tu('tabOverview') },
        { key: 'products', label: tu('productsTitle'), count: s.products.total },
        { key: 'offers', label: tu('tabOffers'), count: s.offers.total },
        { key: 'orders', label: tu('buyerOrdersTitle'), count: s.orders.total },
        { key: 'reviews', label: tu('tabReviews'), count: s.reviews.total },
    ] : b ? [
        { key: 'overview', label: tu('tabOverview') },
        { key: 'orders', label: tu('buyerOrdersTitle'), count: b.orders.total },
        { key: 'targets', label: tu('targetPricesTitle'), count: b.targetPrices.total },
        { key: 'reviews', label: tu('tabReviews'), count: b.reviews.total },
    ] : [];
    const requested = (params.get('tab') || 'overview') as TabKey;
    const tab: TabKey = tabs.some((t) => t.key === requested) ? requested : 'overview';
    const setTab = (k: TabKey) => {
        const q = new URLSearchParams(params.toString());
        if (k === 'overview') q.delete('tab'); else q.set('tab', k);
        router.replace(q.toString() ? `${pathname}?${q}` : pathname, { scroll: false });
    };

    return (
        <div data-no-translate className="text-start -mt-2 space-y-3">
            {back}
            <Summary data={data} onChanged={load} />
            {u.status === 'PENDING_APPROVAL' && (u.role === 'SUPPLIER' || u.role === 'CUSTOMER') && (
                <p className="rounded-lg bg-amber-50 ring-1 ring-inset ring-amber-200 px-4 py-2.5 text-[13px] text-amber-900">{tu('pendingNote')}</p>
            )}

            {tabs.length > 0 ? (
                <>
                    <Tabs tabs={tabs} value={tab} onChange={setTab} />
                    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                        {tab === 'overview' && <Overview data={data} onTab={setTab} />}
                        {tab === 'products' && s && <ProductsTab id={id} byStatus={s.products.byStatus} total={s.products.total} />}
                        {tab === 'offers' && s && <OffersTab id={id} />}
                        {tab === 'orders' && <OrdersTab id={id} supplierView={!!s} />}
                        {tab === 'targets' && b && <TargetsTab id={id} />}
                        {tab === 'reviews' && <ReviewsTab id={id} supplierView={!!s} />}
                    </div>
                </>
            ) : (
                <div className="grid gap-3 lg:grid-cols-2 items-start">
                    <ProfileCard data={data} />
                    <Card><EmptyState icon={<ShieldCheck size={20} />} title={tu('staffTitle')}>{tu('staffBody')}</EmptyState></Card>
                </div>
            )}
        </div>
    );
}

// ─── Summary ───────────────────────────────────────────────────────────

const actionCls = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-semibold bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal';

function Summary({ data, onChanged }: { data: UserDetail; onChanged: () => void }) {
    const tu = useTu();
    const f = useFmt();
    const u = data.user;
    const telHref = u.phone ? `tel:${u.phone.replace(/[^\d+]/g, '')}` : null;
    const fact = (label: string, value: React.ReactNode) => (
        <div className="min-w-0">
            <dt className="text-[12px] text-ink-3">{label}</dt>
            <dd className="mt-0.5 text-[13px] text-ink truncate">{value ?? <span className="text-ink-4">—</span>}</dd>
        </div>
    );
    return (
        <section aria-labelledby="account-name" className="rounded-xl ring-1 ring-line bg-surface p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                    <Avatar name={u.name} src={u.avatar} size={44} />
                    <div className="min-w-0">
                        <h1 id="account-name" className="font-sans text-[20px] leading-tight font-semibold text-heading tracking-tight break-words">{u.name}</h1>
                        <p className="mt-0.5 text-[13px] text-ink-3 break-words">{u.companyName || tu('noCompany')}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <RoleBadge role={u.role} /><StatusBadge status={u.status} /><KycBadge status={u.kycStatus} />
                            <Badge tone={u.emailVerified ? 'success' : 'warning'}>{tu(u.emailVerified ? 'emailVerifiedBadge' : 'emailNotVerifiedBadge')}</Badge>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link href={`/admin/support?view=chat&user=${encodeURIComponent(u.id)}`} className={actionCls}><MessageSquare size={15} />{tu('sendMessage')}</Link>
                    <a href={`mailto:${u.email}`} className={actionCls}><Mail size={15} />{tu('emailAction')}</a>
                    {telHref && <a href={telHref} className={actionCls}><Phone size={15} />{tu('callAction')}</a>}
                    <AccountActions user={u} onDone={onChanged} size="sm" />
                </div>
            </div>
            <dl className="mt-3 pt-3 border-t border-line grid gap-x-4 gap-y-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {fact(tu('email'), <bdi dir="ltr" title={u.email}>{u.email}</bdi>)}
                {fact(tu('phone'), u.phone ? <bdi dir="ltr">{u.phone}</bdi> : null)}
                {fact(tu('country'), [u.businessCity, u.country].filter(Boolean).join(', ') || null)}
                {fact(tu('businessType'), u.businessType)}
                {fact(tu('colRegistered'), <span className="tabular-nums">{f.date(u.createdAt)}</span>)}
                {fact(tu('lastUpdated'), <span className="tabular-nums">{f.date(u.updatedAt)}</span>)}
            </dl>
        </section>
    );
}

function Tabs({ tabs, value, onChange }: { tabs: { key: TabKey; label: string; count?: number }[]; value: TabKey; onChange: (k: TabKey) => void }) {
    const tu = useTu();
    const f = useFmt();
    const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
    const onKey = (e: React.KeyboardEvent, i: number) => {
        const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
        let n = -1;
        if (e.key === 'ArrowRight') n = i + dir; else if (e.key === 'ArrowLeft') n = i - dir;
        else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1;
        if (n === -1) return;
        e.preventDefault();
        const k = tabs[(n + tabs.length) % tabs.length].key;
        onChange(k);
        refs.current[k]?.focus();
    };
    return (
        <div role="tablist" aria-label={tu('tabsAria')} className="flex gap-1 overflow-x-auto border-b border-line">
            {tabs.map((t, i) => (
                <button key={t.key} id={`tab-${t.key}`} ref={(el) => { refs.current[t.key] = el; }} role="tab" type="button"
                    aria-selected={value === t.key} aria-controls={`panel-${t.key}`} tabIndex={value === t.key ? 0 : -1}
                    onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}
                    className={cn('relative h-9 px-3 -mb-px whitespace-nowrap text-[13.5px] font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal',
                        value === t.key ? 'border-heading text-heading' : 'border-transparent text-ink-3 hover:text-ink')}>
                    {t.label}
                    {t.count !== undefined && <span className={cn('ms-1.5 tabular-nums text-[12px]', value === t.key ? 'text-ink-2' : 'text-ink-4')}>{f.int(t.count)}</span>}
                </button>
            ))}
        </div>
    );
}

// ─── Overview ──────────────────────────────────────────────────────────

function Tile({ label, value, hint, onClick }: { label: string; value: React.ReactNode; hint?: React.ReactNode; onClick?: () => void }) {
    const body = (
        <>
            <span className="block text-[12px] text-ink-3">{label}</span>
            <span className="mt-0.5 block text-[20px] leading-tight font-semibold text-heading tabular-nums">{value}</span>
            {hint && <span className="mt-0.5 block text-[12px] text-ink-3 truncate">{hint}</span>}
        </>
    );
    const cls = 'block w-full text-start rounded-xl ring-1 ring-line bg-surface px-3.5 py-3';
    return onClick
        ? <button type="button" onClick={onClick} className={cn(cls, 'hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal')}>{body}</button>
        : <div className={cls}>{body}</div>;
}

function Overview({ data, onTab }: { data: UserDetail; onTab: (k: TabKey) => void }) {
    const tu = useTu();
    const f = useFmt();
    const s = data.supplier;
    const b = data.buyer;
    return (
        <div className="space-y-3 pt-1">
            {s && (
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                    <Tile label={tu('productsTitle')} value={f.int(s.products.total)} hint={tu('liveCount', { count: s.products.byStatus.APPROVED ?? 0 })} onClick={() => onTab('products')} />
                    <Tile label={tu('tabOffers')} value={f.int(s.offers.total)} hint={tu('offersApproved', { count: s.offers.byStatus.APPROVED ?? 0 })} onClick={() => onTab('offers')} />
                    <Tile label={tu('supplierOrdersTitle')} value={f.int(s.orders.total)} onClick={() => onTab('orders')} />
                    <Tile label={tu('tabReviews')} value={f.int(s.reviews.total)}
                        hint={s.reviews.average != null && s.reviews.total > 0 ? tu('avgRating', { rating: f.int(Math.round(s.reviews.average * 10) / 10) }) : undefined} onClick={() => onTab('reviews')} />
                </div>
            )}
            {b && (
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                    <Tile label={tu('buyerOrdersTitle')} value={f.int(b.orders.total)} onClick={() => onTab('orders')} />
                    <Tile label={tu('awaitingReview')} value={f.int(b.orders.awaitingReview)} />
                    <Tile label={tu('targetPricesTitle')} value={f.int(b.targetPrices.total)} hint={b.targetPrices.byStatus.OPEN ? tu('openCount', { count: b.targetPrices.byStatus.OPEN }) : undefined} onClick={() => onTab('targets')} />
                    <Tile label={tu('reviewsWritten')} value={f.int(b.reviews.total)} onClick={() => onTab('reviews')} />
                </div>
            )}

            <div className="grid gap-3 lg:grid-cols-2 items-start">
                <div className="space-y-3 min-w-0">
                    <MoneyCard money={(s ?? b)!.money} supplier={!!s} />
                    {b && b.orders.total > 0 && (
                        <Card title={tu('ordersByStatus')}>
                            <div className="flex flex-wrap gap-1.5">
                                {ORDER_STATUS.filter((k) => b.orders.byStatus[k]).map((k) => (
                                    <span key={k} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md ring-1 ring-inset ring-line text-[12.5px] text-ink-2">{f.known(`order_${k}`, k)}<span className="tabular-nums text-ink-4">{f.int(b.orders.byStatus[k])}</span></span>
                                ))}
                            </div>
                        </Card>
                    )}
                    {s && <DecisionsCard decisions={s.reviewDecisions} />}
                </div>
                <div className="space-y-3 min-w-0">
                    <ProfileCard data={data} />
                </div>
            </div>
        </div>
    );
}

function MoneyCard({ money, supplier }: { money: AccountMoney; supplier: boolean }) {
    const tu = useTu();
    const f = useFmt();
    const row = (label: string, tip: string, value: string | null, note?: string | null) => (
        <div className="flex items-start justify-between gap-3 py-2 border-b border-line last:border-0">
            <dt className="flex items-center gap-1 text-[13px] text-ink-2 min-w-0">{label}<InfoTip label={label}>{tip}</InfoTip></dt>
            <dd className="text-end">
                <span className={cn('block text-[14px] font-semibold tabular-nums', value ? 'text-heading' : 'text-ink-4 font-normal text-[13px]')}>{value ?? tu('notRecorded')}</span>
                {note && <span className="block text-[11.5px] text-ink-3">{note}</span>}
            </dd>
        </div>
    );
    const partial = money.linesWithoutNet > 0 ? tu('partialNet', { count: money.linesWithoutNet }) : null;
    return (
        <Card title={tu('moneyTitle')} description={tu('countedOrders', { count: money.countedOrders })}>
            <dl>
                {row(tu('grossValue'), tu(supplier ? 'grossTipSupplier' : 'grossTipBuyer'), money.countedOrders ? f.eur(money.grossValue) : null)}
                {supplier && money.netVisible && row(tu('supplierNet'), tu('supplierNetTip'), f.eur(money.supplierNet), money.supplierNet != null ? partial : null)}
                {money.netVisible && row(tu('margin'), tu('marginTip'), f.eur(money.margin), money.margin != null ? partial : null)}
            </dl>
            <p className="mt-2 text-[12px] text-ink-3">{tu('noPaymentsNote')}</p>
        </Card>
    );
}

function DecisionsCard({ decisions }: { decisions: ReviewDecision[] }) {
    const tu = useTu();
    const { fmt } = useLanguage();
    const f = useFmt();
    return (
        <Card title={tu('decisionsTitle')} description={tu('decisionsDescRecent')}>
            {decisions.length ? (
                <ul className="divide-y divide-line">
                    {decisions.map((e) => (
                        <li key={e.id} className="py-2 text-[13px]">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <Badge tone={e.action === 'APPROVED' ? 'success' : e.action === 'REJECTED' ? 'danger' : 'warning'}>{f.known(`decision_${e.action}`, e.action)}</Badge>
                                <Link href={`/admin/products/${e.product.id}`} className="font-medium text-ink hover:underline min-w-0 truncate">{e.product.name}</Link>
                                <span className="text-[12px] text-ink-3 tabular-nums ms-auto">{fmt.date(e.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="mt-0.5 text-[12px] text-ink-3">{e.by === 'system' ? tu('bySystem') : e.actorName ? tu('byName', { name: e.actorName }) : tu('byAtlantis')}</p>
                            {e.message && <p className="mt-1 text-[13px] text-ink-2 whitespace-pre-line line-clamp-3">{e.message}</p>}
                        </li>
                    ))}
                </ul>
            ) : <p className="text-[13px] text-ink-3">{tu('noDecisions')}</p>}
        </Card>
    );
}

function ProfileCard({ data }: { data: UserDetail }) {
    const tu = useTu();
    const f = useFmt();
    const u = data.user;
    const site = u.website && /^https?:\/\//i.test(u.website) ? u.website : null;
    const row = (label: string, value: React.ReactNode) => (
        <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 py-1.5 border-b border-line last:border-0 text-[13px]">
            <dt className="text-ink-3">{label}</dt>
            <dd className="text-ink min-w-0 break-words">{value ?? <span className="text-ink-4">—</span>}</dd>
        </div>
    );
    return (
        <Card title={tu('profileTitle')} actions={<Link href={`/admin/support?view=kyc&user=${encodeURIComponent(String(data.user.id))}`} className="text-[12.5px] font-medium text-teal hover:underline">{tu('openKyc')}</Link>}>
            <dl>
                {row(tu('colCompany'), u.companyName)}
                {row(tu('website'), u.website ? (site ? <a href={site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal font-medium hover:underline"><bdi dir="ltr" className="break-all">{u.website}</bdi><ExternalLink size={12} /></a> : <bdi dir="ltr">{u.website}</bdi>) : null)}
                {row(tu('brands'), u.preferredBrands.length ? u.preferredBrands.join(', ') : null)}
                {row(tu('profileComplete'), tu(u.onboardingCompleted ? 'yes' : 'no'))}
                {row(tu('twoFactor'), tu(u.twoFactorEnabled ? 'on' : 'off'))}
                {row(tu('kycTitle'), <KycBadge status={u.kycStatus} />)}
            </dl>
            {data.kycDocuments.length ? (
                <ul className="mt-2 divide-y divide-line">
                    {data.kycDocuments.map((d) => (
                        <li key={d.id} className="py-1.5 flex items-start gap-2 text-[13px]">
                            <FileText size={14} className="mt-0.5 text-ink-4 shrink-0" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-ink">{f.known(`doc_${d.documentType}`, d.documentType)}</span>
                                <span className="block text-[12px] text-ink-3 tabular-nums">{tu('submittedOn', { date: f.date(d.createdAt) })}</span>
                                {d.adminNotes && <span className="block mt-0.5 text-[12px] text-ink-2">{d.adminNotes}</span>}
                            </span>
                            <Badge tone={d.status === 'VERIFIED' ? 'success' : d.status === 'REJECTED' ? 'danger' : d.status === 'PENDING' ? 'warning' : 'neutral'}>{kycLabel(tu, d.status)}</Badge>
                        </li>
                    ))}
                </ul>
            ) : <p className="mt-2 text-[12.5px] text-ink-3">{tu('noKycDocs')}</p>}
            <p className="mt-2 text-[12px] text-ink-3">{tu('selfDeclared')}</p>
        </Card>
    );
}

// ─── Paginated tabs ────────────────────────────────────────────────────

/** One server page of a tab. Resets to page 1 when `key` changes. */
interface PagedState<T> { page: number; setPage: (p: number) => void; data: Paged<T> | null; error: string | null; loading: boolean; load: () => void }

type PageFetcher<T> = (page: number) => Promise<Paged<T>>; // i18n-ignore: type, not text

function usePaged<T>(fetcher: PageFetcher<T>, key: string): PagedState<T> {
    const [page, setPage] = React.useState(1);
    const [data, setData] = React.useState<Paged<T> | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const fetchRef = React.useRef(fetcher);
    fetchRef.current = fetcher;
    React.useEffect(() => { setPage(1); }, [key]);
    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        fetchRef.current(page).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }, [page, key]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { load(); }, [load]);
    return { page, setPage, data, error, loading, load };
}

function TabFrame<T>({ state, empty, children, toolbar }: { state: PagedState<T>; empty: React.ReactNode; children: (rows: T[]) => React.ReactNode; toolbar?: React.ReactNode }) {
    const { data, error, loading, load, setPage } = state;
    return (
        <Card className="mt-1" bodyClassName="p-0">
            {toolbar}
            {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div>
                : !data ? <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                    : data.data.length === 0 ? <div className="p-2">{empty}</div>
                        : <div className={cn('overflow-x-auto', loading && 'opacity-60')}>{children(data.data)}</div>}
            {data && <Pager page={data.page} pages={data.pages} total={data.total} loading={loading} onPage={setPage}
                from={(data.page - 1) * data.limit + 1} to={Math.min(data.page * data.limit, data.total)} />}
        </Card>
    );
}

const th = 'text-start font-medium px-2 py-2 first:ps-4 last:pe-4';
const td = 'px-2 py-2 first:ps-4 last:pe-4';
const headRow = 'text-[12px] text-ink-3 bg-surface-2/60 border-b border-line';
const bodyRow = 'border-b border-line last:border-0 hover:bg-surface-2/50';

function orderBadge(tu: (k: string) => string, known: (k: string, r: string) => string, o: { status: string; reviewStatus: string }) {
    if (o.reviewStatus === 'PENDING_REVIEW') return <Badge tone="warning" dot>{tu('orderRequestPending')}</Badge>;
    if (o.reviewStatus === 'REJECTED') return <Badge tone="danger" dot>{tu('orderRequestRejected')}</Badge>;
    return <Badge tone={o.status === 'CANCELLED' ? 'danger' : o.status === 'DELIVERED' ? 'success' : 'neutral'} dot>{known(`order_${o.status}`, o.status)}</Badge>;
}

function ProductsTab({ id, byStatus, total }: { id: string; byStatus: Record<string, number>; total: number }) {
    const tu = useTu();
    const f = useFmt();
    const { t } = useLanguage();
    const rowNav = useRowNav();
    const [status, setStatus] = React.useState('');
    const [netVisible, setNetVisible] = React.useState(false);
    const state = usePaged((page) => adminUsersApi.products(id, { page, status: status || undefined }).then((r) => { setNetVisible(r.netVisible); return r; }), status);
    const toolbar = (
        <div className="flex flex-wrap items-center gap-1.5 p-3 border-b border-line">
            {PRODUCT_FILTERS.map((k) => (
                <button key={k || 'all'} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}
                    className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                        status === k ? 'bg-heading text-white' : 'ring-1 ring-inset ring-line text-ink-2 hover:bg-surface-2')}>
                    {k ? productStatusLabel(k, t) : tu('all')}
                    <span className={cn('tabular-nums', status === k ? 'text-white/70' : 'text-ink-4')}>{f.int(k ? byStatus[k] ?? 0 : total)}</span>
                </button>
            ))}
            <Link href={`/admin/products/submissions?supplier=${id}`} className="ms-auto text-[12.5px] font-medium text-teal hover:underline">{tu('allProducts')}</Link>
        </div>
    );
    return (
        <TabFrame state={state} toolbar={toolbar} empty={<EmptyState icon={<Package size={20} />} title={tu('noProductsTitle')}>{tu('noProductsBody')}</EmptyState>}>
            {(rows) => (
                <table className="w-full min-w-[720px] text-[13px]">
                    <thead><tr className={headRow}>
                        <th className={th}>{tu('colProduct')}</th>
                        <th className={th}>{tu('colEan')}</th>
                        <th className={th}>{tu('colStatus')}</th>
                        {netVisible && <th className={cn(th, 'text-end')}><span className="inline-flex items-center gap-1">{tu('colNetPrice')}<InfoTip label={tu('colNetPrice')}>{tu('netPriceTip')}</InfoTip></span></th>}
                        <th className={cn(th, 'text-end')}>{tu('colStock')}</th>
                        <th className={th}>{tu('lastUpdated')}</th>
                    </tr></thead>
                    <tbody>
                        {rows.map((p) => {
                            const nav = rowNav(`/admin/products/${p.id}`, tu('openProduct', { name: p.name }));
                            return (
                                <tr key={p.id} {...nav} className={cn(nav.className, bodyRow)}>
                                    <td className={cn(td, 'max-w-[320px]')}>
                                        <span className="flex items-center gap-2.5 min-w-0">
                                            <Thumb src={p.image} size={32} />
                                            <span className="min-w-0">
                                                <Link href={`/admin/products/${p.id}`} tabIndex={-1} className="block truncate font-medium text-ink hover:underline">{p.name}</Link>
                                                <span className="block truncate text-[12px] text-ink-3">{p.brand || tu('noBrand')}</span>
                                            </span>
                                        </span>
                                    </td>
                                    <td className={cn(td, 'font-mono text-[12px] text-ink-2')}>{p.ean ? <bdi dir="ltr">{p.ean}</bdi> : <span className="text-ink-4">—</span>}</td>
                                    <td className={td}><Badge tone={PRODUCT_STATUS[p.status]?.tone ?? 'neutral'} dot>{productStatusLabel(p.status, t)}</Badge></td>
                                    {netVisible && <td className={cn(td, 'text-end tabular-nums')}>{f.eur(p.netPrice) ?? <span className="text-ink-4">—</span>}</td>}
                                    <td className={cn(td, 'text-end tabular-nums')}>{tu('stockCasesShort', { count: p.stock })}</td>
                                    <td className={cn(td, 'tabular-nums text-ink-3 whitespace-nowrap')}>{f.date(p.updatedAt)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </TabFrame>
    );
}

function OffersTab({ id }: { id: string }) {
    const tu = useTu();
    const f = useFmt();
    const [netVisible, setNetVisible] = React.useState(false);
    const state = usePaged((page) => adminUsersApi.offers(id, { page }).then((r) => { setNetVisible(r.netVisible); return r; }), 'offers');
    const toolbar = (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-line text-[12.5px] text-ink-3">
            <span>{tu('offersDesc')}</span>
            <Link href="/admin/offers" className="ms-auto font-medium text-teal hover:underline">{tu('openOffers')}</Link>
        </div>
    );
    return (
        <TabFrame state={state} toolbar={toolbar} empty={<EmptyState icon={<Tag size={20} />} title={tu('noOffersTitle')}>{tu('noOffersBody')}</EmptyState>}>
            {(rows) => (
                <table className="w-full min-w-[680px] text-[13px]">
                    <thead><tr className={headRow}>
                        <th className={th}>{tu('colProduct')}</th>
                        <th className={cn(th, 'text-end')}>{tu('colQuantity')}</th>
                        {netVisible && <th className={cn(th, 'text-end')}>{tu('colOfferPrice')}</th>}
                        <th className={th}>{tu('colValidUntil')}</th>
                        <th className={th}>{tu('colStatus')}</th>
                        <th className={th}>{tu('colCreated')}</th>
                    </tr></thead>
                    <tbody>
                        {rows.map((o) => (
                            <tr key={o.id} className={bodyRow}>
                                <td className={cn(td, 'max-w-[300px] truncate')}>{o.product ? <Link href={`/admin/products/${o.product.id}`} className="font-medium text-ink hover:underline">{o.product.name}</Link> : <span className="text-ink-4">{tu('deletedProduct')}</span>}</td>
                                <td className={cn(td, 'text-end tabular-nums')}>{tu(`qty_${o.unit.toUpperCase() === 'CARTON' ? 'CASE' : o.unit.toUpperCase()}`, { count: o.quantity }) || `${f.int(o.quantity)} ${o.unit}`}</td>
                                {netVisible && <td className={cn(td, 'text-end tabular-nums')}>{f.eur(o.pricePerUnit) ?? '—'}</td>}
                                <td className={cn(td, 'tabular-nums text-ink-3 whitespace-nowrap')}>{o.validUntil ? f.date(o.validUntil) : <span className="text-ink-4">—</span>}</td>
                                <td className={td}><Badge tone={o.status === 'APPROVED' ? 'success' : o.status === 'REJECTED' ? 'danger' : o.status === 'PENDING' ? 'warning' : 'neutral'} dot>{f.known(`offer_${o.status}`, o.status)}</Badge></td>
                                <td className={cn(td, 'tabular-nums text-ink-3 whitespace-nowrap')}>{f.date(o.createdAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </TabFrame>
    );
}

function OrdersTab({ id, supplierView }: { id: string; supplierView: boolean }) {
    const tu = useTu();
    const f = useFmt();
    const rowNav = useRowNav();
    const state = usePaged((page) => adminUsersApi.orders(id, { page }), 'orders');
    return (
        <TabFrame state={state} empty={<EmptyState icon={<ShoppingCart size={20} />} title={tu('noOrdersTitle')}>{tu(supplierView ? 'noSupplierOrdersBody' : 'noBuyerOrdersBody')}</EmptyState>}>
            {(rows) => (
                <table className="w-full min-w-[600px] text-[13px]">
                    <thead><tr className={headRow}>
                        <th className={th}>{tu('colOrder')}</th>
                        <th className={th}>{tu('colDate')}</th>
                        {supplierView && <th className={th}>{tu('colBuyer')}</th>}
                        <th className={th}>{tu('colStatus')}</th>
                        <th className={cn(th, 'text-end')}>{tu(supplierView ? 'colTheirLines' : 'colLines')}</th>
                        {!supplierView && <th className={cn(th, 'text-end')}>{tu('colTotal')}</th>}
                    </tr></thead>
                    <tbody>
                        {rows.map((o) => {
                            const nav = rowNav(`/admin/orders/${o.id}`, tu('openOrder', { ref: f.shortId(o.id) }));
                            return (
                                <tr key={o.id} {...nav} className={cn(nav.className, bodyRow)}>
                                    <td className={td}><Link href={`/admin/orders/${o.id}`} tabIndex={-1} className="font-mono text-[12.5px] text-teal hover:underline"><bdi dir="ltr">{f.shortId(o.id)}</bdi></Link></td>
                                    <td className={cn(td, 'tabular-nums text-ink-3 whitespace-nowrap')}>{f.date(o.createdAt)}</td>
                                    {supplierView && <td className={cn(td, 'max-w-[220px] truncate')}>{o.buyer ? <Link href={`/admin/users/${o.buyer.id}`} className="text-ink-2 hover:underline">{o.buyer.name}</Link> : <span className="text-ink-4">—</span>}</td>}
                                    <td className={td}>{orderBadge(tu, f.known, o)}</td>
                                    <td className={cn(td, 'text-end tabular-nums')}>{f.int(o.lines)}</td>
                                    {!supplierView && <td className={cn(td, 'text-end tabular-nums')}>{f.eur(o.totalAmount) ?? '—'}</td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </TabFrame>
    );
}

function TargetsTab({ id }: { id: string }) {
    const tu = useTu();
    const f = useFmt();
    const state = usePaged((page) => adminUsersApi.targetPrices(id, { page }), 'targets');
    const toolbar = (
        <div className="flex items-center px-4 py-2.5 border-b border-line">
            <Link href="/admin/target-prices" className="ms-auto text-[12.5px] font-medium text-teal hover:underline">{tu('openTargetPrices')}</Link>
        </div>
    );
    return (
        <TabFrame state={state} toolbar={toolbar} empty={<EmptyState icon={<Target size={20} />} title={tu('noTargetsTitle')}>{tu('noTargetsBody')}</EmptyState>}>
            {(rows) => (
                <table className="w-full min-w-[640px] text-[13px]">
                    <thead><tr className={headRow}>
                        <th className={th}>{tu('colRef')}</th>
                        <th className={th}>{tu('colProduct')}</th>
                        <th className={cn(th, 'text-end')}>{tu('colTargetPrice')}</th>
                        <th className={cn(th, 'text-end')}>{tu('colQuantity')}</th>
                        <th className={th}>{tu('colStatus')}</th>
                        <th className={th}>{tu('colDate')}</th>
                    </tr></thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id} className={bodyRow}>
                                <td className={cn(td, 'font-mono text-[12.5px] text-ink-3')}><bdi dir="ltr">{r.ref}</bdi></td>
                                <td className={cn(td, 'max-w-[280px] truncate')}>{r.product ? <Link href={`/admin/products/${r.product.id}`} className="font-medium text-ink hover:underline">{r.product.name}</Link> : <span className="text-ink-4">—</span>}</td>
                                <td className={cn(td, 'text-end tabular-nums')}>{tu('perCase', { price: f.eur(r.targetCasePrice) ?? '—' })}</td>
                                <td className={cn(td, 'text-end tabular-nums')}>{tu(`qty_${r.quantityUnit}`, { count: r.quantity }) || `${f.int(r.quantity)} ${r.quantityUnit}`}</td>
                                <td className={td}><Badge tone={r.status === 'ACCEPTED' ? 'success' : r.status === 'DECLINED' ? 'danger' : r.status === 'OPEN' ? 'warning' : 'neutral'}>{f.known(`tp_${r.status}`, r.status)}</Badge></td>
                                <td className={cn(td, 'tabular-nums text-ink-3 whitespace-nowrap')}>{f.date(r.createdAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </TabFrame>
    );
}

function ReviewsTab({ id, supplierView }: { id: string; supplierView: boolean }) {
    const tu = useTu();
    const f = useFmt();
    const state = usePaged((page) => adminUsersApi.reviews(id, { page }), 'reviews');
    return (
        <TabFrame state={state} empty={<EmptyState icon={<Star size={20} />} title={tu('noReviewsTitle')}>{tu(supplierView ? 'noReviewsSupplier' : 'noReviewsBuyer')}</EmptyState>}>
            {(rows) => (
                <ul className="divide-y divide-line">
                    {rows.map((r) => (
                        <li key={r.id} className="px-4 py-2.5 text-[13px]">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="inline-flex items-center gap-1 font-semibold text-heading tabular-nums" aria-label={tu('ratingOf', { rating: r.rating })}>
                                    <Star size={13} className="fill-amber-400 text-amber-400" aria-hidden />{tu('ratingShort', { rating: r.rating })}
                                </span>
                                {r.product ? <Link href={`/admin/products/${r.product.id}`} className="font-medium text-ink hover:underline min-w-0 truncate">{r.product.name}</Link> : <span className="text-ink-4">{tu('deletedProduct')}</span>}
                                {supplierView && r.author && <span className="text-ink-3">· <Link href={`/admin/users/${r.author.id}`} className="hover:underline">{r.author.name}</Link></span>}
                                <span className="ms-auto text-[12px] text-ink-3 tabular-nums">{f.date(r.createdAt)}</span>
                            </div>
                            {r.comment ? <p className="mt-1 text-ink-2 whitespace-pre-line">{r.comment}</p> : <p className="mt-1 text-[12px] text-ink-4">{tu('noComment')}</p>}
                        </li>
                    ))}
                </ul>
            )}
        </TabFrame>
    );
}
