'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, EyeOff, MessageSquare, Pencil, Trash2, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { adminApi, type AdminProductReview } from '@/lib/admin-api';
import { Badge, Button, Card, ConfirmProvider, Dialog, ErrorState, Field, Notice, PRODUCT_STATUS, Skeleton, inputCls, useConfirm } from '@/components/supplier/ui';
import { categoryLabel, statusLabel } from '@/components/supplier/import/types';
import { ReviewTrail } from '@/components/products/ReviewTrail';

/**
 * Admin → product review (/admin/products/[id]). One record, read from
 * GET /products/admin/:id/review: identity, information, pricing, the publish
 * checklist (the same rule approval enforces), the review trail and the
 * actions that fit the record's scope. Missing data is shown as missing.
 */
const FIELD_ANCHORS: Record<string, string> = { images: 'media', price: 'priceInput', weight: 'weightValue', exwLocation: 'exw' };

export default function AdminProductReviewPage({ params }: { params: { id: string } }) {
    // The admin layout has no ConfirmProvider (the supplier layout does), so confirmations are mounted here.
    return <ConfirmProvider><ReviewView params={params} /></ConfirmProvider>;
}

function ReviewView({ params }: { params: { id: string } }) {
    const router = useRouter();
    const confirm = useConfirm();
    const { t, fmt } = useLanguage();
    const tp = (k: string, v?: Record<string, string | number>) => t('adminProducts', k, v);
    const [data, setData] = React.useState<AdminProductReview | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [dialog, setDialog] = React.useState<null | 'reject' | 'changes'>(null);
    const [text, setText] = React.useState('');
    const [lightbox, setLightbox] = React.useState<string | null>(null);

    const load = React.useCallback(() => {
        setError(null);
        adminApi.review(params.id).then(setData).catch((e) => setError(e.status === 404 ? tp('notFound') : e.message));
    }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { load(); }, [load]);

    const eur = (n: number | null | undefined) => (n === null || n === undefined || !(Number(n) > 0) ? null : fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const int = (n: number | null | undefined) => (n === null || n === undefined ? null : fmt.number(n));
    const when = (d: string) => fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const p = data?.product;
    const isCatalog = data?.scope === 'catalog';
    const status = String(p?.status || '');
    const editHref = `/admin/products/${params.id}/edit`;

    /** What actually reached the supplier, as reported by the server (never assumed). */
    const deliveryNotice = (d?: { inApp?: boolean; email?: boolean | null }) => {
        if (!d) return;
        if (d.inApp === false) toast.error(tp('deliveryInAppFailed'), { duration: 8000 });
        else toast.success(tp(d.email === true ? 'deliveryBoth' : d.email === false ? 'deliveryInAppOnly' : 'deliveryInApp'));
        if (d.email === false) toast.error(tp('deliveryEmailFailed'), { duration: 8000 });
    };

    const act = async (kind: 'approve' | 'reject' | 'changes' | 'offline' | 'delete') => {
        if (!p) return;
        const msg = text.trim();
        if ((kind === 'reject' || kind === 'changes') && msg.length < 10) { toast.error(tp('reasonTooShort')); return; }
        if (kind === 'approve' && !(await confirm({ title: tp(isCatalog ? 'confirmPublishTitle' : 'confirmApproveTitle', { name: p.name }), body: tp(isCatalog ? 'confirmPublishBody' : 'confirmApproveBody'), confirm: tp(isCatalog ? 'publish' : 'approve') }))) return;
        if (kind === 'offline' && !(await confirm({ title: tp('confirmOfflineTitle', { name: p.name }), body: tp('confirmOfflineBody'), confirm: tp('takeOffline'), tone: 'danger' }))) return;
        if (kind === 'delete' && !(await confirm({ title: tp('confirmDeleteTitle', { name: p.name }), body: tp('confirmDeleteBody'), confirm: tp('deleteProduct'), tone: 'danger' }))) return;
        setBusy(kind);
        try {
            if (kind === 'approve') { const r = await adminApi.approve(p.id); toast.success(tp(isCatalog ? 'toastPublished' : 'toastApprovedSaved')); if (!isCatalog) deliveryNotice(r?.delivery); }
            else if (kind === 'reject') { const r = await adminApi.reject(p.id, msg); toast.success(tp('toastRejectedSaved')); deliveryNotice(r?.delivery); }
            else if (kind === 'changes') { const r = await adminApi.requestChanges(p.id, msg); toast.success(tp('toastChangesSaved')); deliveryNotice(r?.delivery); }
            else if (kind === 'offline') { await adminApi.setStatus(p.id, 'DRAFT'); toast.success(tp('toastOffline')); }
            else if (kind === 'delete') { await adminApi.remove(p.id); toast.success(tp('toastDeleted')); router.push(`/admin/products/${data?.scope ?? 'submissions'}`); return; }
            setDialog(null); setText(''); load();
        } catch (e: any) {
            const m = e?.body?.message; toast.error(Array.isArray(m) ? m.join(' ') : m || e.message);
        } finally { setBusy(null); }
    };

    if (error) return <div className="text-start"><BackLink href="/admin/products/submissions" label={tp('backToProducts')} /><ErrorState message={error} onRetry={load} /></div>;
    if (!data || !p) return <div className="space-y-4 text-start"><Skeleton className="h-9 w-72" /><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><Skeleton className="h-96" /><Skeleton className="h-64" /></div></div>;

    const missingByField = new Set(data.missing.map((m) => m.field));
    const checklist: { field: string; label: string }[] = [
        { field: 'name', label: tp('ckName') }, { field: 'brand', label: tp('ckBrand') }, { field: 'category', label: tp('ckCategory') }, { field: 'ean', label: tp('ckBarcode') },
        { field: 'origin', label: tp('ckOrigin') }, { field: 'exwLocation', label: tp('ckExw') }, { field: 'weight', label: tp('ckWeight') }, { field: 'price', label: tp('ckPrice') },
        { field: 'stock', label: tp('ckStock') }, { field: 'unitsPerCase', label: tp('ckUnitsPerCase') }, { field: 'casesPerPallet', label: tp('ckCasesPerPallet') }, { field: 'unit', label: tp('ckUnit') },
        { field: 'moq', label: tp('ckMoq') }, { field: 'moqUnit', label: tp('ckMoqUnit') }, { field: 'images', label: tp('ckImages') },
    ];
    const value = (v: unknown, fmtFn?: (x: any) => React.ReactNode) => (v === null || v === undefined || v === '' ? <span className="text-ink-4">{tp('notProvided')}</span> : fmtFn ? fmtFn(v) : String(v));
    const canPublish = status !== 'APPROVED' && status !== 'REJECTED';
    // Photo checks from stored facts only (count, generated placeholder, borrowed database photo); nothing is inferred from pixels.
    const credits = (p.imageCredits || {}) as Record<string, { source?: string }>;
    const imageWarnings = [
        ...(p.images?.length === 0 ? [tp(p.placeholderOnly ? 'imgPlaceholder' : 'imgNone')] : []),
        ...(p.images?.length === 1 ? [tp('imgOnlyOne')] : []),
        ...(p.images?.some((u: string) => credits[u]) ? [tp('imgFromDatabase', { source: Object.values(credits).map((c) => c?.source).filter(Boolean)[0] || '—' })] : []),
    ];
    const supplier = p.supplier;

    return (
        <div data-no-translate className="text-start -mt-2">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <BackLink href={`/admin/products/${data.scope}`} label={tp('backToProducts')} iconOnly />
                <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-ink-3">{tp(isCatalog ? 'tabCatalog' : 'tabSubmissions')} · <bdi dir="ltr" className="font-mono text-[11.5px]">{p.id}</bdi></p>
                    <h1 className="font-sans text-[22px] leading-tight font-semibold text-heading truncate">{p.name}</h1>
                </div>
                <Badge tone={PRODUCT_STATUS[status]?.tone ?? 'neutral'} dot>{statusLabel(status, t)}</Badge>
                {status === 'APPROVED' && <Link href={`/products/${p.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-teal hover:underline"><ExternalLink size={13} />{tp('viewOnMarketplace')}</Link>}
            </div>

            {status === 'NEEDS_CHANGES' && p.adminNotes && <div className="mb-4"><Notice tone="warning" title={tp('currentFeedback')}>{p.adminNotes}</Notice></div>}
            {status === 'REJECTED' && <div className="mb-4"><Notice tone="danger" title={tp('rejectedNotice')}>{p.adminNotes || tp('noReason')}</Notice></div>}
            {status === 'PENDING' && isCatalog && p.adminNotes && <div className="mb-4"><Notice tone="info" title={tp('catalogPendingNote')}>{p.adminNotes}</Notice></div>}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
                <div className="space-y-4 min-w-0">
                    {/* Identity */}
                    <Card title={tp('identityTitle')}>
                        <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                            <div>
                                {p.images?.[0] ? (
                                    <button type="button" onClick={() => setLightbox(p.images[0])} className="block w-full aspect-square rounded-xl bg-white ring-1 ring-line overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={p.images[0]} alt={p.name} className="w-full h-full object-contain p-2" />
                                    </button>
                                ) : (
                                    <div className="aspect-square rounded-xl bg-surface-2 ring-1 ring-inset ring-line flex flex-col items-center justify-center text-center p-3 text-[12.5px] text-ink-3"><AlertCircle size={18} className="text-amber-700 mb-1" />{tp(p.placeholderOnly ? 'placeholderOnly' : 'noPhoto')}</div>
                                )}
                                {p.images?.length > 1 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {p.images.slice(1, 6).map((u: string) => (
                                            <button key={u} type="button" onClick={() => setLightbox(u)} className="w-10 h-10 rounded-lg bg-white ring-1 ring-line overflow-hidden">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={u} alt="" className="w-full h-full object-contain" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 text-[13.5px]">
                                <Row k={tp('brand')} v={value(p.brandDisplay || p.brand)} />
                                <Row k={tp('category')} v={value(p.category, (c) => categoryLabel(c, t))} />
                                <Row k={tp('barcode')} v={value(p.ean, (e) => <bdi dir="ltr" className="font-mono">{e}</bdi>)} />
                                <Row k={tp('origin')} v={value(p.origin)} />
                                <Row k={tp('exw')} v={value(p.exwLocation)} />
                                <Row k={tp('supplierCountry')} v={value(p.supplier?.country)} />
                                <Row k={tp('weight')} v={value(p.weight)} />
                                <Row k={tp('created')} v={when(p.createdAt)} />
                                <Row k={tp('updated')} v={when(p.updatedAt)} />
                            </dl>
                        </div>
                        {imageWarnings.length > 0 && (
                            <ul className="mt-3 space-y-1 text-[12.5px] text-amber-800">{imageWarnings.map((w) => <li key={w} className="flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" />{w}</li>)}</ul>
                        )}
                        {p.description ? <p className="mt-4 pt-3 border-t border-line text-[13.5px] text-ink-2 whitespace-pre-line max-w-prose">{p.description}</p> : <p className="mt-4 pt-3 border-t border-line text-[13px] text-ink-4">{tp('noDescription')}</p>}
                    </Card>

                    {/* Packaging + pricing */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card title={tp('packagingTitle')}>
                            <dl className="grid gap-y-2 text-[13.5px]">
                                <Row k={tp('unitType')} v={value(p.unit)} />
                                <Row k={tp('piecesPerCase')} v={value(p.unitsPerCase, int)} />
                                <Row k={tp('casesPerPallet')} v={value(p.casesPerPallet, int)} />
                                <Row k={tp('palletsPerTruck')} v={value(p.palletsPerShipment, int)} />
                                <Row k={tp('shelfLife')} v={value(p.shelfLife)} />
                                <Row k={tp('leadTime')} v={p.leadTime == null ? value(null) : tp('leadTimeDays', { count: p.leadTime })} />
                            </dl>
                        </Card>
                        <Card title={tp('pricingTitle')} description={tp('pricingDesc')}>
                            <dl className="grid gap-y-2 text-[13.5px]">
                                <Row k={tp('netPerCase')} v={eur(p.basePrice) ?? value(null)} hint={p.supplierCurrency && p.supplierCurrency !== 'EUR' && p.supplierPrice ? tp('enteredAs', { price: fmt.number(p.supplierPrice, { style: 'currency', currency: p.supplierCurrency }) }) : undefined} />
                                <Row k={tp('buyerPerCase')} v={eur(p.price) ?? value(null)} />
                                <Row k={tp('moq')} v={p.moq ? `${int(p.moq)} ${String(p.moqUnit || '').toLowerCase()}` : value(null)} />
                                <Row k={tp('stockCases')} v={p.stock == null ? value(null) : <span className={cn(status === 'APPROVED' && p.stock <= 0 && 'text-red-700 font-medium')}>{int(p.stock)}</span>} />
                                <Row k={tp('usage')} v={tp('usageLine', { orders: int(data.usage.orderLines) || '0', watching: int(data.usage.buyersWatching) || '0', offers: int(data.usage.approvedOffers) || '0', promos: int(data.usage.activePromotions) || '0' })} />
                            </dl>
                        </Card>
                    </div>

                    {/* Review trail */}
                    <Card title={tp('trailTitle')} description={tp('trailDesc')} bodyClassName="p-0">
                        <ReviewTrail events={data.history} viewer="staff" />
                    </Card>

                    {/* Recent changes */}
                    {data.changes.length > 0 && (
                        <Card title={tp('changesTitle')} bodyClassName="p-0">
                            <ul className="divide-y divide-line text-[13px]">
                                {data.changes.map((c) => (
                                    <li key={c.id} className="px-4 sm:px-5 py-2 flex flex-wrap gap-x-3 gap-y-0.5">
                                        <span className="text-ink-3 w-[9.5rem] shrink-0 tabular-nums">{when(c.createdAt)}</span>
                                        <span className="font-medium text-ink">{c.field}</span>
                                        <span className="text-ink-2 min-w-0 truncate max-w-[40ch]"><bdi dir="ltr">{c.oldValue ?? '—'}</bdi> → <bdi dir="ltr">{c.newValue ?? '—'}</bdi></span>
                                        {c.actor?.name && <span className="text-ink-4">{c.actor.name}</span>}
                                        {c.reason && <span className="text-ink-4 basis-full ps-[10.25rem]">{c.reason}</span>}
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}
                </div>

                <aside className="lg:sticky lg:top-4 space-y-3">
                    {/* Actions */}
                    <Card title={tp('actionsTitle')}>
                        <div className="flex flex-col gap-2">
                            {canPublish && <Button variant="primary" icon={<CheckCircle2 size={15} />} loading={busy === 'approve'} disabled={!!busy || !data.canApprove} title={!data.canApprove ? tp('approveBlocked') : undefined} onClick={() => act('approve')}>{tp(isCatalog ? 'publish' : 'approve')}</Button>}
                            {!isCatalog && status !== 'REJECTED' && <Button icon={<MessageSquare size={15} />} disabled={!!busy} onClick={() => { setText(''); setDialog('changes'); }}>{tp('requestChanges')}</Button>}
                            {!isCatalog && status !== 'REJECTED' && <Button variant="danger" icon={<XCircle size={15} />} disabled={!!busy} onClick={() => { setText(''); setDialog('reject'); }}>{tp('reject')}</Button>}
                            {isCatalog && status === 'APPROVED' && <Button icon={<EyeOff size={15} />} loading={busy === 'offline'} disabled={!!busy} onClick={() => act('offline')}>{tp('takeOffline')}</Button>}
                            {isCatalog && <Link href={editHref}><Button className="w-full" icon={<Pencil size={15} />}>{tp('editDetails')}</Button></Link>}
                            {!data.canApprove && canPublish && <p className="text-[12.5px] text-amber-800">{tp('approveBlocked')}</p>}
                            {status === 'REJECTED' && <p className="text-[12.5px] text-ink-3">{tp('rejectedFinal')}</p>}
                        </div>
                        {isCatalog && <p className="mt-3 pt-3 border-t border-line text-[12px] text-ink-3">{tp('catalogLifecycle')}</p>}
                        {!isCatalog && <p className="mt-3 pt-3 border-t border-line text-[12px] text-ink-3">{tp('submissionLifecycle')} {tp('supplierOwnsData')}</p>}
                    </Card>

                    {/* Completeness */}
                    <Card title={tp('checklistTitle')} description={tp('checklistDesc')}>
                        <ul className="space-y-1 text-[13px]">
                            {checklist.map((c) => {
                                const miss = data.missing.find((m) => m.field === c.field);
                                return (
                                    <li key={c.field} className="flex items-start gap-2">
                                        {miss ? <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-700" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />}
                                        <span className={cn('min-w-0', miss ? 'text-amber-900' : 'text-ink-2')}>
                                            {c.label}
                                            {miss && <>{isCatalog ? <> — <Link href={`${editHref}#${FIELD_ANCHORS[c.field] || c.field}`} className="text-teal hover:underline">{tp('fixIt')}</Link></> : <> — <button type="button" onClick={() => { setText(tp('feedbackMissing', { field: c.label })); setDialog('changes'); }} className="text-teal hover:underline">{tp('askSupplier')}</button></>}{miss.reason && miss.reason !== `${miss.label} is required.` && <span className="block text-[12px] text-ink-3">{miss.reason}</span>}</>}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                        {data.invalid.length > 0 && <ul className="mt-3 pt-3 border-t border-line space-y-1 text-[12.5px] text-red-700">{data.invalid.map((m) => <li key={m.field}>{m.reason}</li>)}</ul>}
                        <p className="mt-3 pt-3 border-t border-line text-[12px] text-ink-3">{missingByField.size === 0 ? tp('checklistComplete') : tp('checklistMissing', { count: missingByField.size })}</p>
                    </Card>

                    {/* Owner */}
                    <Card title={tp(isCatalog ? 'ownerTitle' : 'supplierTitle')}>
                        {supplier ? (
                            <dl className="grid gap-y-1.5 text-[13px]">
                                <Row k={tp('company')} v={supplier.companyName || supplier.name} />
                                <Row k={tp('contact')} v={<><span className="block truncate">{supplier.name}</span><span className="block truncate text-ink-3">{supplier.email}</span></>} />
                                <Row k={tp('country')} v={value(supplier.country)} />
                                <Row k={tp('accountStatus')} v={`${supplier.status}${supplier.kycStatus && supplier.kycStatus !== 'UNVERIFIED' ? ` · KYC ${supplier.kycStatus}` : ''}`} />
                                <Row k={tp('memberSince')} v={fmt.date(supplier.createdAt)} />
                                <Row k={tp('theirCatalog')} v={tp('theirCatalogLine', { total: int(data.supplierCatalog.total) || '0', live: int(data.supplierCatalog.byStatus.APPROVED || 0) || '0', pending: int(data.supplierCatalog.byStatus.PENDING || 0) || '0' })} />
                            </dl>
                        ) : <p className="text-[13px] text-ink-3">{tp('noOwner')}</p>}
                        {!isCatalog && supplier && <Link href={`/admin/products/submissions?supplier=${supplier.id}`} className="mt-3 inline-block text-[12.5px] font-medium text-teal hover:underline">{tp('allFromSupplier')}</Link>}
                    </Card>

                    <Card>
                        <Button variant="ghost" className="w-full text-red-700 hover:bg-red-50" icon={<Trash2 size={15} />} loading={busy === 'delete'} disabled={!!busy} onClick={() => act('delete')}>{tp('deleteProduct')}</Button>
                        <p className="mt-2 text-[12px] text-ink-3">{tp('deleteHint')}</p>
                    </Card>
                </aside>
            </div>

            <Dialog open={dialog === 'changes'} onClose={() => setDialog(null)} title={tp('changesDialogTitle')} description={tp('changesDialogDesc', { supplier: supplier?.companyName || supplier?.name || '' })} size="md"
                footer={<><Button onClick={() => setDialog(null)} disabled={!!busy}>{tp('cancel')}</Button><Button variant="primary" icon={<Upload size={14} />} loading={busy === 'changes'} onClick={() => act('changes')}>{tp('sendFeedback')}</Button></>}>
                <Field label={tp('feedbackLabel')} htmlFor="rv-changes" required hint={tp('feedbackHint')}>
                    <textarea id="rv-changes" data-autofocus value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} className={cn(inputCls, 'h-auto py-2')} placeholder={tp('feedbackPh')} />
                </Field>
                <p className="mt-2 text-[12px] text-ink-3">{tp('feedbackEffect')}</p>
            </Dialog>
            <Dialog open={dialog === 'reject'} onClose={() => setDialog(null)} title={tp('rejectOneTitle', { name: p.name })} description={tp('rejectOneDesc')} size="md"
                footer={<><Button onClick={() => setDialog(null)} disabled={!!busy}>{tp('cancel')}</Button><Button variant="danger" icon={<XCircle size={14} />} loading={busy === 'reject'} onClick={() => act('reject')}>{tp('reject')}</Button></>}>
                <Field label={tp('reasonLabel')} htmlFor="rv-reject" required hint={tp('reasonHint')}>
                    <textarea id="rv-reject" data-autofocus value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} className={cn(inputCls, 'h-auto py-2')} />
                </Field>
            </Dialog>
            <Dialog open={!!lightbox} onClose={() => setLightbox(null)} title={p.name} size="lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {lightbox && <img src={lightbox} alt={p.name} className="max-h-[70vh] w-full object-contain" />}
            </Dialog>
        </div>
    );
}

function Row({ k, v, hint }: { k: string; v: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className="text-ink break-words">{v}{hint && <span className="block text-[12px] text-ink-3">{hint}</span>}</dd>
        </div>
    );
}

function BackLink({ href, label, iconOnly }: { href: string; label: string; iconOnly?: boolean }) {
    return (
        <Link href={href} aria-label={label} className={cn('inline-flex items-center gap-1 text-[13px] text-teal hover:underline', iconOnly && 'w-9 h-9 justify-center rounded-lg ring-1 ring-line text-ink-2 hover:bg-surface-2 hover:no-underline')}>
            <ArrowLeft size={iconOnly ? 17 : 14} className="rtl:rotate-180" />{!iconOnly && label}
        </Link>
    );
}
