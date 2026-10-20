'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, BellRing, ClipboardList, ExternalLink, FileText, MapPin, MessageSquare, Printer, Trash2, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { AdminWorkflowPanel } from '@/components/orders/AdminWorkflowPanel';
import { DeliveryBreakdown } from '@/components/orders/DeliveryBreakdown';
import { NextActionCell, PaymentBadge } from '@/components/admin/OrderBadges';
import { LoadsSection } from '@/components/admin/orders/LoadsSection';
import {
    Badge, Button, Card, ConfirmProvider, Dialog, EmptyState, ErrorState, Field, Notice, ORDER_STATUS, Skeleton, StatusBadge, inputCls, useConfirm, type Tone,
} from '@/components/supplier/ui';
import { adminOrdersApi, supportChatHref, type AdminOrderDetail, type Party, type TimelineEvent } from '@/lib/admin-orders-api';

/**
 * Admin → Order detail (/admin/orders/[id]). Everything shown is a recorded
 * field from GET /orders/admin/:id/detail; anything the data model doesn't
 * record is labelled as not recorded. Actions call the existing order
 * endpoints, and the server checks every one of them again.
 */
type Tl = (k: string, v?: Record<string, string | number>) => string;

const REVIEW: Record<string, { key: string; tone: Tone }> = {
    LEGACY: { key: 'reviewLegacy', tone: 'neutral' }, PENDING_REVIEW: { key: 'reviewPending', tone: 'warning' },
    APPROVED: { key: 'reviewApproved', tone: 'success' }, REJECTED: { key: 'reviewRejected', tone: 'danger' },
};
const STATUS_ACTION: Record<string, { key: string; confirmKey: string; variant: 'primary' | 'secondary' }> = {
    PAID: { key: 'markPaid', confirmKey: 'confirmPaid', variant: 'secondary' },
    PROCESSING: { key: 'markConfirmed', confirmKey: 'confirmConfirmed', variant: 'primary' },
    SHIPPED: { key: 'markShipped', confirmKey: 'confirmShipped', variant: 'primary' },
    DELIVERED: { key: 'markDelivered', confirmKey: 'confirmDelivered', variant: 'primary' },
};
const CARD_KEY: Record<string, string> = { HOLDING: 'cardHolding', CAPTURED: 'cardCaptured', RELEASED: 'cardReleased', REFUNDED: 'cardRefunded', DISPUTED: 'cardDisputed' };
const INVOICE_KEY: Record<string, string> = { ISSUED: 'invIssued', PAID: 'invPaid', OVERDUE: 'invOverdue', CANCELLED: 'invCancelled' };
const USER_STATUS_KEY: Record<string, string> = { PENDING_APPROVAL: 'accPending', ACTIVE: 'accActive', REJECTED: 'accRejected', BLOCKED: 'accBlocked', DELETED: 'accDeleted' };
const KYC_KEY: Record<string, string> = { UNVERIFIED: 'kycUnverified', PENDING: 'kycPending', VERIFIED: 'kycVerified', REJECTED: 'kycRejected' };
const DISPUTE_KEY: Record<string, string> = { OPEN: 'dispOpen', UNDER_REVIEW: 'dispReview', RESOLVED_REFUND: 'dispRefund', RESOLVED_NO_REFUND: 'dispNoRefund', CLOSED: 'dispClosed' };
const INSPECTION_KEY: Record<string, string> = { SCHEDULED: 'inspScheduled', PASSED: 'inspPassed', PASSED_WITH_FINDINGS: 'inspFindings', FAILED: 'inspFailed' };
const FREIGHT_KEY: Record<string, string> = { priced: 'freightPriced', set_by_atlantis: 'freightSet', quote_required: 'freightQuote' };

export default function AdminOrderDetailPage() {
    return <ConfirmProvider><OrderDetail /></ConfirmProvider>;
}

function OrderDetail() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const confirm = useConfirm();
    const { t, fmt } = useLanguage();
    const tl: Tl = React.useCallback((k, v) => t('adminOrders', k, v), [t]);
    const eur = (n: number | null | undefined) => (n == null ? '—' : fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const money = (n: number, currency: string) => { try { return fmt.number(Number(n), { style: 'currency', currency: (currency || 'EUR').toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch { return `${n} ${currency}`; } };
    const when = (d: string | null | undefined) => (d ? fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);

    const [order, setOrder] = React.useState<AdminOrderDetail | null>(null);
    const [error, setError] = React.useState<{ message: string; status?: number } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [cancelOpen, setCancelOpen] = React.useState(false);
    const [cancelReason, setCancelReason] = React.useState('');

    const load = React.useCallback(() => {
        if (!params?.id) return;
        setLoading(true); setError(null);
        adminOrdersApi.detail(params.id).then(setOrder).catch((e) => setError({ message: e.message, status: e.status })).finally(() => setLoading(false));
    }, [params?.id]);
    React.useEffect(() => { load(); }, [load]);

    const statusLabel = (s: string | null | undefined) => (s && ORDER_STATUS[s] ? t('supplierShell', ORDER_STATUS[s].labelKey) : s || '—');

    const changeStatus = async (to: string, reason?: string) => {
        if (!order) return;
        setBusy(`status-${to}`);
        try {
            await adminOrdersApi.setStatus(order.id, to, reason);
            toast.success(tl('statusChanged', { status: statusLabel(to) }));
            setCancelOpen(false); setCancelReason('');
            load();
        } catch (e: any) { toast.error(e.message || tl('actionFailed')); } finally { setBusy(null); }
    };
    const askStatus = async (to: string) => {
        if (!order) return;
        const a = STATUS_ACTION[to];
        if (!(await confirm({ title: tl(a.key), body: tl(a.confirmKey, { ref: order.ref }), confirm: tl(a.key), tone: 'primary' }))) return;
        changeStatus(to);
    };
    const notifyArrival = async () => {
        if (!order) return;
        if (!(await confirm({ title: tl('notifyArrival'), body: tl('confirmNotify', { ref: order.ref }), confirm: tl('sendEmail') }))) return;
        setBusy('notify');
        try { await adminOrdersApi.notifyDeliveryDay(order.id); toast.success(tl('notifySent')); } catch (e: any) { toast.error(e.message || tl('actionFailed')); } finally { setBusy(null); }
    };
    const removeOrder = async () => {
        if (!order) return;
        if (!(await confirm({ title: tl('deleteTitle', { ref: order.ref }), body: tl('deleteBody'), confirm: tl('deleteOrder'), tone: 'danger' }))) return;
        setBusy('delete');
        try { await adminOrdersApi.remove(order.id); toast.success(tl('deleted')); router.push('/admin/orders'); } catch (e: any) { toast.error(e.message || tl('actionFailed')); setBusy(null); }
    };

    const back = (
        <Link href="/admin/orders" className="no-print inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded">
            <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden />{tl('backToList')}
        </Link>
    );

    if (loading && !order) {
        return (
            <div className="text-start -mt-2 space-y-4" aria-busy="true">
                {back}
                <Skeleton className="h-20" />
                <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
            </div>
        );
    }
    if (!order) {
        return (
            <div className="text-start -mt-2 space-y-4">
                {back}
                {error?.status === 404
                    ? <Card><EmptyState icon={<ClipboardList size={20} />} title={tl('notFoundTitle')}>{tl('notFoundBody')}</EmptyState></Card>
                    : <ErrorState message={error?.message} onRetry={load} />}
            </div>
        );
    }

    const o = order;
    const review = REVIEW[o.reviewStatus] ?? { key: '', tone: 'neutral' as Tone };
    const actionable = o.statusOptions.filter((x) => x.to !== 'CANCELLED' && STATUS_ACTION[x.to] && (!x.blocker || ['SHIPPED', 'DELIVERED'].includes(x.to)));
    const canCancel = o.statusOptions.some((x) => x.to === 'CANCELLED' && !x.blocker);
    const buyerName = o.buyer?.companyName || o.buyer?.name || tl('unknownBuyer');

    return (
        <div data-no-translate className="text-start -mt-2 space-y-4">
            {back}

            {/* Summary block: a section, because the print stylesheet hides header elements */}
            <section aria-labelledby="order-title" className="rounded-xl bg-surface ring-1 ring-line p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <h1 id="order-title" className="font-sans text-[22px] leading-tight font-semibold text-heading tracking-tight">
                            {tl('orderTitle')} <bdi dir="ltr" className="font-mono">#{o.ref}</bdi>
                        </h1>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <StatusBadge kind="order" status={o.status} />
                            {review.key && <Badge tone={review.tone}>{tl(review.key)}</Badge>}
                            <PaymentBadge value={o.payment.status} tl={tl} />
                            {o.termsVersion > 1 && <Badge>{tl('termsVersion', { version: o.termsVersion })}</Badge>}
                        </div>
                        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-2 text-[13px]">
                            <Meta label={tl('created')} value={when(o.createdAt)} />
                            <Meta label={tl('lastUpdated')} value={when(o.updatedAt)} />
                            <Meta label={tl('buyer')} value={o.buyer ? <a href="#buyer" className="text-teal font-medium hover:underline">{buyerName}</a> : buyerName} />
                            <Meta label={tl('suppliersLabel', { count: o.suppliers.length })} value={o.suppliers.length ? <a href="#suppliers" className="text-teal font-medium hover:underline">{o.suppliers.map((s) => s.companyName || s.name || tl('unnamedSupplier')).join(', ')}</a> : tl('noSupplier')} />
                            {o.reviewedAt && <Meta label={o.reviewStatus === 'REJECTED' ? tl('rejectedAt') : tl('approvedAt')} value={<>{when(o.reviewedAt)}{o.reviewedBy ? <span className="text-ink-3"> · {tl('byName', { name: o.reviewedBy })}</span> : null}</>} />}
                            <Meta label={tl('orderId')} value={<bdi dir="ltr" className="font-mono text-[12px] break-all">{o.id}</bdi>} />
                        </dl>
                    </div>
                    <div className="no-print flex flex-wrap items-center gap-2 lg:justify-end lg:max-w-[46%]">
                        <Button size="sm" icon={<Printer size={14} />} onClick={() => window.print()}>{tl('print')}</Button>
                        {o.buyer && <Link href={supportChatHref(o.buyer.id, o.id)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-semibold bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]"><MessageSquare size={14} aria-hidden />{tl('messageBuyer')}</Link>}
                        {o.status === 'SHIPPED' && <Button size="sm" icon={<BellRing size={14} />} loading={busy === 'notify'} onClick={notifyArrival}>{tl('notifyArrival')}</Button>}
                        <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" icon={<Trash2 size={14} />} loading={busy === 'delete'} onClick={removeOrder}>{tl('deleteOrder')}</Button>
                    </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="text-ink-3">{tl('nextStep')}</span>
                        <NextActionCell action={o.nextAction} tl={tl} />
                        {o.nextAction && <span className="text-ink-3">{tl(`next_${o.nextAction}`)}</span>}
                    </div>
                    {(actionable.length > 0 || canCancel) && (
                        <div className="no-print flex flex-wrap items-center gap-2">
                            {actionable.map((x) => (
                                <Button key={x.to} size="sm" variant={STATUS_ACTION[x.to].variant} disabled={!!x.blocker || !!busy} loading={busy === `status-${x.to}`} onClick={() => askStatus(x.to)} title={x.blocker || undefined}>
                                    {tl(STATUS_ACTION[x.to].key)}
                                </Button>
                            ))}
                            {canCancel && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => setCancelOpen(true)}>{tl('cancelOrder')}</Button>}
                        </div>
                    )}
                </div>
                {actionable.filter((x) => x.blocker).map((x) => <p key={x.to} className="mt-2 text-[12.5px] text-amber-800" lang="en">{x.blocker}</p>)}
            </section>

            {o.workflow && (
                <div className="no-print">
                    <AdminWorkflowPanel orderId={o.id} status={o.status} workflow={o.workflow} inspections={o.inspections} onChange={load}
                        items={o.lines.map((l) => ({ id: l.id, quantity: l.quantity, unitPrice: l.unitPrice, product: { name: l.name || undefined } }))} />
                </div>
            )}

            <nav aria-label={tl('sectionsNav')} className="no-print flex flex-wrap gap-1 text-[12.5px]">
                {[['summary', 'summaryTitle'], ['products', 'productsLoadsTitle'], ['buyer', 'buyerInfo'], ['suppliers', 'suppliersTitle'], ['destination', 'destinationTitle'], ['logistics', 'logisticsTitle'], ['payment', 'paymentTitle'], ['documents', 'documentsTitle'], ['activity', 'timelineTitle']].map(([id, key]) => (
                    <a key={id} href={`#${id}`} className="h-7 inline-flex items-center px-2.5 rounded-full ring-1 ring-inset ring-line text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">{tl(key)}</a>
                ))}
            </nav>

            <SummaryCard o={o} tl={tl} eur={eur} />

            <div className="grid gap-4 lg:grid-cols-3 items-start">
                <div className="lg:col-span-2 space-y-4 min-w-0">
                    <LoadsSection o={o} tl={tl} eur={eur} />
                    <DestinationCard o={o} tl={tl} />
                    <LogisticsCard o={o} tl={tl} eur={eur} when={when} onSaved={load} />
                    <TimelineCard events={o.timeline} tl={tl} when={when} statusLabel={statusLabel} />
                </div>

                <div className="space-y-4 min-w-0">
                    <div id="buyer" className="scroll-mt-20"><PartyCard title={tl('buyerInfo')} party={o.buyer} orderId={o.id} tl={tl} when={when} messageLabel={tl('messageBuyer')} /></div>
                    <div id="suppliers" className="scroll-mt-20 space-y-4">
                        {o.suppliers.length === 0
                            ? <Card title={tl('suppliersTitle')}><p className="text-[13px] text-ink-3">{tl('noSupplierRecorded')}</p></Card>
                            : o.suppliers.map((s) => <PartyCard key={s.id} title={tl('supplierInfoN', { count: s.lines })} party={s} orderId={o.id} tl={tl} when={when} messageLabel={tl('messageSupplier')} />)}
                    </div>
                    <PaymentCard o={o} tl={tl} eur={eur} money={money} when={when} />
                    <DocumentsCard o={o} tl={tl} money={money} when={when} />
                    {o.disputes.length > 0 && (
                        <Card title={tl('disputes')} actions={<Link href="/admin/disputes" className="no-print text-[13px] text-teal font-medium hover:underline">{tl('openDisputes')}</Link>}>
                            <ul className="space-y-2.5 text-[13px]">
                                {o.disputes.map((d) => (
                                    <li key={d.id} className="flex flex-col gap-0.5">
                                        <span className="flex flex-wrap items-center gap-2"><Badge tone={['OPEN', 'UNDER_REVIEW'].includes(d.status) ? 'warning' : 'neutral'}>{DISPUTE_KEY[d.status] ? tl(DISPUTE_KEY[d.status]) : d.status}</Badge><span className="text-ink-3">{when(d.createdAt)}</span></span>
                                        <span className="text-ink-2" lang="en">{d.reason}</span>
                                        {d.resolution && <span className="text-ink-3" lang="en">{d.resolution}</span>}
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}
                </div>
            </div>

            <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={tl('cancelTitle', { ref: o.ref })} description={tl('cancelBody')} size="sm"
                footer={<><Button onClick={() => setCancelOpen(false)}>{tl('keepOrder')}</Button><Button variant="danger" loading={busy === 'status-CANCELLED'} onClick={() => changeStatus('CANCELLED', cancelReason.trim() || undefined)}>{tl('cancelOrder')}</Button></>}>
                <Field label={tl('cancelReason')} htmlFor="cancel-reason" optional hint={tl('cancelReasonHint')}>
                    <textarea id="cancel-reason" data-autofocus value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} maxLength={500} className={cn(inputCls, 'h-auto py-2')} />
                </Field>
            </Dialog>
        </div>
    );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[12px] text-ink-3">{label}</dt>
            <dd className="text-ink truncate">{value ?? '—'}</dd>
        </div>
    );
}

function NotRecorded({ tl }: { tl: Tl }) {
    return <span className="text-ink-4">{tl('notRecorded')}</span>;
}

function Row({ label, children, strong }: { label: React.ReactNode; children: React.ReactNode; strong?: boolean }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-3 py-1.5 text-[13px]', strong && 'border-t border-line mt-1 pt-2.5')}>
            <dt className={cn(strong ? 'font-semibold text-heading' : 'text-ink-3')}>{label}</dt>
            <dd className={cn('text-end tabular-nums', strong ? 'font-semibold text-heading text-[14px]' : 'text-ink')}>{children}</dd>
        </div>
    );
}

type Eur = (n: number | null | undefined) => string;
type When = (d: string | null | undefined) => string | null;
type MoneyFmt = (n: number, c: string) => string;

/** Order summary: the recorded money on the order and what it consists of. */
function SummaryCard({ o, tl, eur }: { o: AdminOrderDetail; tl: Tl; eur: Eur }) {
    const m = o.money;
    const t = o.loadTotals;
    const Fig = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) => (
        <div className="min-w-0 rounded-lg bg-surface-2/60 px-3 py-2.5">
            <dt className="text-[12px] text-ink-3">{label}</dt>
            <dd className="mt-0.5 text-[16px] font-semibold text-heading tabular-nums">{children}</dd>
            {hint && <dd className="text-[12px] text-ink-3">{hint}</dd>}
        </div>
    );
    return (
        <Card id="summary" className="scroll-mt-20" title={tl('summaryTitle')} description={tl('moneyDesc')}>
            <dl className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                <Fig label={tl('linesSubtotal')} hint={m.coupon ? <>{tl('coupon')} <bdi dir="ltr" className="font-mono">{m.coupon}</bdi>{m.couponDiscount != null ? ` −${eur(m.couponDiscount)}` : ''}</> : undefined}>{eur(m.linesSubtotal)}</Fig>
                <Fig label={tl('goodsTotal')}>{eur(m.goodsTotal)}</Fig>
                <Fig label={tl('deliveryCharge')} hint={tl(FREIGHT_KEY[m.freightStatus])}>{m.freight != null ? eur(m.freight) : <span className="text-[13px] font-normal text-ink-3">{tl('quotedAfter')}</span>}</Fig>
                <Fig label={tl('totalWithDelivery')} hint={<>{tl('vat')}: {tl('notRecorded')}</>}>{m.totalWithFreight != null ? eur(m.totalWithFreight) : <span className="text-[13px] font-normal text-ink-3">{tl('totalPendingDelivery')}</span>}</Fig>
            </dl>
            <p className="mt-3 text-[12.5px] text-ink-3">
                {tl('summaryComposition', { loads: t.loads, mixed: t.mixedLoads + t.variantMixes, suppliers: o.suppliers.length })} · {tl('currencyEur')}
            </p>
            {m.unexplainedDifference != null && <p className="mt-1 text-[12.5px] text-amber-800">{tl('unexplainedDiff', { amount: eur(m.unexplainedDifference) })}</p>}
            {o.netVisible && (
                <div className="mt-3 border-t border-line pt-3">
                    <p className="text-[12px] font-medium text-ink-3">{tl('netTitle')}</p>
                    <dl className="grid sm:grid-cols-2 gap-x-6">
                        <Row label={tl('supplierNet')}>{m.supplierNet != null ? eur(m.supplierNet) : <NotRecorded tl={tl} />}</Row>
                        <Row label={tl('markup')}>{m.markupOnRecordedLines != null ? eur(m.markupOnRecordedLines) : <NotRecorded tl={tl} />}</Row>
                    </dl>
                    {!!m.linesWithoutNet && <p className="mt-1 text-[12.5px] text-amber-800">{tl('linesWithoutNet', { count: m.linesWithoutNet })}</p>}
                </div>
            )}
        </Card>
    );
}

function PaymentCard({ o, tl, money, when }: { o: AdminOrderDetail; tl: Tl; eur: Eur; money: MoneyFmt; when: When }) {
    const card = o.payment.card;
    return (
        <Card id="payment" className="scroll-mt-20" title={tl('paymentTitle')}>
            <dl>
                <Row label={tl('paymentStatus')}><PaymentBadge value={o.payment.status} tl={tl} /></Row>
                <Row label={tl('paidAt')}>{when(o.payment.paidAt) ?? <NotRecorded tl={tl} />}</Row>
            </dl>
            {card ? (
                <div className="mt-2 rounded-lg ring-1 ring-line p-2.5">
                    <p className="text-[12.5px] font-medium text-ink-2">{tl('cardRecord')}</p>
                    <dl>
                        <Row label={tl('cardStatus')}>{CARD_KEY[card.status] ? tl(CARD_KEY[card.status]) : card.status}</Row>
                        <Row label={tl('cardAmount')}>{money(card.amount, card.currency)}</Row>
                        <Row label={tl('cardCapturedAt')}>{when(card.capturedAt) ?? <NotRecorded tl={tl} />}</Row>
                        <Row label={tl('cardReleasedAt')}>{when(card.releasedAt) ?? <NotRecorded tl={tl} />}</Row>
                        {o.netVisible && card.platformFee != null && <Row label={tl('cardFee')}>{money(card.platformFee, card.currency)}</Row>}
                        {o.netVisible && card.supplierAmount != null && <Row label={tl('cardSupplierAmount')}>{money(card.supplierAmount, card.currency)}</Row>}
                    </dl>
                </div>
            ) : <p className="mt-1 text-[12.5px] text-ink-3">{o.payment.cardPaymentStarted ? tl('cardStartedNoRecord') : tl('noCardRecord')}</p>}
        </Card>
    );
}

function DocumentsCard({ o, tl, money, when }: { o: AdminOrderDetail; tl: Tl; money: MoneyFmt; when: When }) {
    return (
        <Card id="documents" className="scroll-mt-20" title={tl('documentsTitle')}>
            {o.documents.invoices.length === 0 && !o.documents.supplierInvoiceUrl && <p className="text-[12.5px] text-ink-3">{tl('noInvoices')}</p>}
            <ul className="space-y-2.5">
                {o.documents.invoices.map((inv) => (
                    <li key={inv.id} className="text-[13px]">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-ink"><FileText size={14} className="text-ink-4" aria-hidden /><bdi dir="ltr" className="font-mono text-[12.5px]">{inv.invoiceNumber}</bdi></span>
                            <Badge tone={inv.status === 'PAID' ? 'success' : inv.status === 'OVERDUE' ? 'warning' : 'neutral'}>{INVOICE_KEY[inv.status] ? tl(INVOICE_KEY[inv.status]) : inv.status}</Badge>
                        </span>
                        <span className="block text-[12px] text-ink-3">{tl('invoiceLine', { date: when(inv.createdAt) || '—', amount: money(inv.amount, inv.currency), tax: money(inv.tax, inv.currency), total: money(inv.totalAmount, inv.currency) })}</span>
                        {inv.pdfUrl && /^https:\/\//.test(inv.pdfUrl)
                            ? <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="no-print text-[12.5px] text-teal font-medium hover:underline inline-flex items-center gap-1">{tl('openPdf')}<ExternalLink size={12} aria-hidden /></a>
                            : <span className="block text-[12px] text-ink-4">{tl('noPdfStored')}</span>}
                    </li>
                ))}
                {o.documents.supplierInvoiceUrl && (
                    <li className="text-[13px]">
                        <a href={o.documents.supplierInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-teal font-medium hover:underline inline-flex items-center gap-1">{tl('supplierDocument')}<ExternalLink size={12} aria-hidden /></a>
                        <span className="block text-[12px] text-ink-3">{tl('supplierDocumentHint')}</span>
                    </li>
                )}
            </ul>
        </Card>
    );
}

function PartyCard({ title, party, orderId, tl, when, messageLabel }: { title: string; party: (Party & { createdAt?: string; role?: string | null }) | null; orderId: string; tl: Tl; when: When; messageLabel: string }) {
    if (!party) return <Card title={title}><p className="text-[13px] text-ink-3">{tl('accountMissing')}</p></Card>;
    return (
        <Card title={title} actions={<Link href={`/admin/users/${party.id}`} className="no-print text-[13px] text-teal font-medium hover:underline">{tl('openAccount')}</Link>}>
            <dl className="space-y-2 text-[13px]">
                <div>
                    <dt className="sr-only">{tl('name')}</dt>
                    <dd className="font-medium text-ink">{party.companyName || party.name || tl('unnamedSupplier')}</dd>
                    {party.companyName && party.name && <dd className="text-ink-3">{party.name}</dd>}
                </div>
                <div>
                    <dt className="text-[12px] text-ink-3">{tl('email')}</dt>
                    <dd className="flex flex-wrap items-center gap-1.5">
                        {party.email ? <><a href={`mailto:${party.email}`} className="text-ink hover:underline break-all"><bdi dir="ltr">{party.email}</bdi></a><Badge tone={party.emailVerified ? 'success' : 'warning'}>{tl(party.emailVerified ? 'emailVerified' : 'emailUnverified')}</Badge></> : <NotRecorded tl={tl} />}
                    </dd>
                </div>
                <div>
                    <dt className="text-[12px] text-ink-3">{tl('phone')}</dt>
                    <dd>{party.phone ? <><bdi dir="ltr">{party.phone}</bdi> <span className="text-[12px] text-ink-4">{tl('phoneUnverified')}</span></> : <NotRecorded tl={tl} />}</dd>
                </div>
                <div>
                    <dt className="text-[12px] text-ink-3">{tl('country')}</dt>
                    <dd>{party.country || <NotRecorded tl={tl} />}</dd>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {party.status && <Badge tone={party.status === 'ACTIVE' ? 'success' : party.status === 'PENDING_APPROVAL' ? 'warning' : 'danger'}>{USER_STATUS_KEY[party.status] ? tl(USER_STATUS_KEY[party.status]) : party.status}</Badge>}
                    {party.kycStatus && <Badge tone={party.kycStatus === 'VERIFIED' ? 'success' : party.kycStatus === 'REJECTED' ? 'danger' : 'neutral'}>{KYC_KEY[party.kycStatus] ? tl(KYC_KEY[party.kycStatus]) : party.kycStatus}</Badge>}
                </div>
                {party.createdAt && <p className="text-[12px] text-ink-3">{tl('memberSince', { date: when(party.createdAt) || '—' })}</p>}
            </dl>
            <Link href={supportChatHref(party.id, orderId)} className="no-print mt-3 inline-flex items-center gap-1.5 text-[13px] text-teal font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] rounded"><MessageSquare size={14} aria-hidden />{messageLabel}</Link>
        </Card>
    );
}

function DestinationCard({ o, tl }: { o: AdminOrderDetail; tl: Tl }) {
    const lg = o.logistics;
    const a = lg.shippingAddress;
    const addressLines = a ? [a.name, a.company, a.street, [a.postal, a.city].filter(Boolean).join(' '), a.country].filter((x) => x && String(x).trim()) : [];
    return (
        <Card id="destination" className="scroll-mt-20" title={tl('destinationTitle')}>
            <dl className="grid gap-4 sm:grid-cols-2 text-[13px]">
                <div>
                    <dt className="text-[12px] text-ink-3">{tl('deliveryCountry')}</dt>
                    <dd className="flex items-center gap-1.5 text-ink"><MapPin size={14} className="text-ink-4" aria-hidden />{lg.destinationCountry ? <bdi dir="ltr">{lg.destinationCountry}</bdi> : <NotRecorded tl={tl} />}{a?.country && a.country !== lg.destinationCountry ? <span className="text-ink-3"> · {a.country}</span> : null}</dd>
                </div>
                <div>
                    <dt className="text-[12px] text-ink-3">{tl('deliveryAddress')}</dt>
                    <dd className="text-ink">{addressLines.length ? addressLines.map((x, i) => <span key={i} className="block">{x}</span>) : <NotRecorded tl={tl} />}</dd>
                </div>
            </dl>
            <p className="mt-3 text-[12.5px] text-ink-3">{tl('destinationNote')}</p>
        </Card>
    );
}

function LogisticsCard({ o, tl, eur, when, onSaved }: { o: AdminOrderDetail; tl: Tl; eur: (n: number | null | undefined) => string; when: (d: string | null | undefined) => string | null; onSaved: () => void }) {
    const confirm = useConfirm();
    const lg = o.logistics;
    const [carrier, setCarrier] = React.useState(lg.shippingCompany || '');
    const [cost, setCost] = React.useState(lg.shippingCost != null ? String(lg.shippingCost) : '');
    const [tracking, setTracking] = React.useState(lg.shipment?.trackingNumber || '');
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => { setCarrier(lg.shippingCompany || ''); setCost(lg.shippingCost != null ? String(lg.shippingCost) : ''); setTracking(lg.shipment?.trackingNumber || ''); }, [lg.shippingCompany, lg.shippingCost, lg.shipment?.trackingNumber]);

    const locked = ['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(o.status);
    const costNum = cost.trim() === '' ? null : Number(cost);
    const costInvalid = costNum != null && !(Number.isFinite(costNum) && costNum >= 0);
    const costChanged = (costNum ?? null) !== (lg.shippingCost ?? null);
    const dirty = carrier.trim() !== (lg.shippingCompany || '') || costChanged || tracking.trim() !== (lg.shipment?.trackingNumber || '');
    const save = async () => {
        if (costInvalid) return;
        if (costChanged && ['PENDING_REVIEW', 'APPROVED'].includes(o.reviewStatus)) {
            if (!(await confirm({ title: tl('freightChangeTitle'), body: tl('freightChangeBody', { version: o.termsVersion + 1 }), confirm: tl('saveTransport') }))) return;
        }
        setSaving(true);
        try {
            const body: { shippingCompany?: string | null; shippingCost?: number | null; trackingNumber?: string | null } = { shippingCompany: carrier.trim() || null, trackingNumber: tracking.trim() || null };
            if (costChanged) body.shippingCost = costNum;
            await adminOrdersApi.setShipping(o.id, body);
            toast.success(tl('transportSaved'));
            onSaved();
        } catch (e: any) { toast.error(e.message || tl('actionFailed')); } finally { setSaving(false); }
    };

    return (
        <Card id="logistics" className="scroll-mt-20" title={tl('logisticsTitle')} description={tl('logisticsDesc')}>
            <div>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3 text-[13px]">
                    <div>
                        <dt className="text-[12px] text-ink-3">{tl('buyerCarrier')}</dt>
                        <dd>{lg.customerShippingCompany || <NotRecorded tl={tl} />}</dd>
                    </div>
                    <div>
                        <dt className="text-[12px] text-ink-3">{tl('assignedCarrier')}</dt>
                        <dd>{lg.shippingCompany || <NotRecorded tl={tl} />}</dd>
                    </div>
                    <div>
                        <dt className="text-[12px] text-ink-3">{tl('deliveryCharge')}</dt>
                        <dd className="tabular-nums">{lg.shippingCost != null ? eur(lg.shippingCost) : <span className="text-ink-3">{tl('quotedAfter')}</span>}</dd>
                    </div>
                </dl>
            </div>

            {lg.fulfillment?.groups?.length ? (
                <div className="mt-4 border-t border-line pt-3">
                    <p className="mb-2 text-[12px] font-medium text-ink-3">{tl('deliveryAtOrder')}</p>
                    <DeliveryBreakdown quote={lg.fulfillment} setByAtlantis={lg.shippingCost != null && lg.fulfillment.status !== 'priced' ? { amount: lg.shippingCost, carrier: lg.shippingCompany } : null} />
                </div>
            ) : null}

            <div className="mt-4 border-t border-line pt-3">
                <p className="text-[12px] font-medium text-ink-3">{tl('shipmentTitle')}</p>
                {lg.shipment ? (
                    <>
                        <dl className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-[13px]">
                            <Row label={tl('trackingNumber')}><bdi dir="ltr" className="font-mono">{lg.shipment.trackingNumber}</bdi></Row>
                            <Row label={tl('carrier')}>{lg.shipment.carrier || <NotRecorded tl={tl} />}</Row>
                            <Row label={tl('shipmentStatus')}><span lang="en">{lg.shipment.status}</span></Row>
                            <Row label={tl('expectedDelivery')}>{when(lg.shipment.expectedDelivery) ?? <NotRecorded tl={tl} />}</Row>
                        </dl>
                        {lg.shipment.updates.length > 0 && (
                            <ul className="mt-2 space-y-1 text-[12.5px]">
                                {lg.shipment.updates.map((u, i) => <li key={i} className="flex flex-wrap gap-x-2"><span className="text-ink-3 tabular-nums">{when(u.createdAt)}</span><span className="text-ink" lang="en">{u.status} · {u.description}{u.location ? ` · ${u.location}` : ''}</span></li>)}
                            </ul>
                        )}
                    </>
                ) : <p className="mt-1 text-[12.5px] text-ink-3">{tl('noShipment')}</p>}
                <p className="mt-2 flex gap-1.5 text-[12.5px] text-ink-3"><Truck size={14} className="shrink-0 mt-0.5" aria-hidden />{tl('noCarrierIntegration')}</p>
            </div>

            <div className="no-print mt-4 border-t border-line pt-3">
                <p className="text-[13px] font-semibold text-heading">{tl('transportTitle')}</p>
                <p className="text-[12.5px] text-ink-3">{tl('transportDesc')}</p>
                {locked && <div className="mt-2"><Notice tone="neutral">{tl('transportLocked')}</Notice></div>}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label={tl('carrier')} htmlFor="t-carrier">
                        <input id="t-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={120} className={inputCls} disabled={saving} />
                    </Field>
                    <Field label={tl('deliveryChargeEur')} htmlFor="t-cost" hint={tl('deliveryChargeHint')} error={costInvalid ? tl('costInvalid') : null}>
                        <input id="t-cost" type="number" inputMode="decimal" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} className={inputCls} disabled={saving || locked} aria-invalid={costInvalid || undefined} />
                    </Field>
                    <Field label={tl('trackingNumber')} htmlFor="t-tracking" className="sm:col-span-2" hint={tl('trackingHint')}>
                        <input id="t-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={120} className={cn(inputCls, 'font-mono')} disabled={saving} />
                    </Field>
                </div>
                <div className="mt-3 flex justify-end">
                    <Button variant="primary" size="sm" loading={saving} disabled={!dirty || costInvalid} onClick={save}>{tl('saveTransport')}</Button>
                </div>
            </div>
        </Card>
    );
}

function TimelineCard({ events, tl, when, statusLabel }: { events: TimelineEvent[]; tl: Tl; when: (d: string | null | undefined) => string | null; statusLabel: (s: string | null | undefined) => string }) {
    const text = (e: TimelineEvent): string => {
        switch (e.kind) {
            case 'CREATED': return tl('evCreated');
            case 'STATUS': return e.from ? tl('evStatus', { from: statusLabel(e.from), to: statusLabel(e.status) }) : tl('evStatusSet', { to: statusLabel(e.status) });
            case 'NOTE': return tl('evNote');
            case 'CONFIRMATION_REQUESTED': return tl('evConfRequested', { supplier: e.supplier || '—', version: e.version ?? 1 });
            case 'CONFIRMATION_DECIDED': return tl(e.status === 'ACCEPTED' ? 'evConfAccepted' : e.status === 'REJECTED' ? 'evConfRejected' : 'evConfOther', { supplier: e.supplier || '—', version: e.version ?? 1, status: e.status || '' });
            case 'REVIEWED': return tl(e.status === 'APPROVED' ? 'evApproved' : 'evRejected');
            case 'BUYER_ACCEPTED': return tl('evBuyerAccepted', { version: e.version ?? 1 });
            case 'INSPECTION': return tl('evInspection', { status: e.status && INSPECTION_KEY[e.status] ? tl(INSPECTION_KEY[e.status]) : e.status || '' });
            case 'SHIPMENT_CREATED': return tl('evShipment', { tracking: e.ref || '' });
            case 'SHIPMENT_UPDATE': return tl('evShipmentUpdate', { status: e.status || '' });
            case 'PAYMENT_MARKED_PAID': return tl('evMarkedPaid');
            case 'CARD_CAPTURED': return tl('evCardCaptured');
            case 'CARD_RELEASED': return tl('evCardReleased');
            case 'INVOICE_ISSUED': return tl('evInvoiceIssued', { number: e.ref || '' });
            case 'INVOICE_PAID': return tl('evInvoicePaid', { number: e.ref || '' });
            case 'DISPUTE_OPENED': return tl('evDisputeOpened');
            case 'DISPUTE_RESOLVED': return tl('evDisputeResolved', { status: e.status && DISPUTE_KEY[e.status] ? tl(DISPUTE_KEY[e.status]) : e.status || '' });
            default: return e.kind;
        }
    };
    return (
        <Card id="activity" className="scroll-mt-20" title={tl('timelineTitle')} description={tl('timelineDesc')}>
            {events.length === 0 ? <p className="text-[13px] text-ink-3">{tl('timelineEmpty')}</p> : (
                <ol className="relative space-y-3 ms-1.5 border-s border-line ps-4">
                    {events.map((e, i) => (
                        <li key={i} className="relative">
                            <span aria-hidden className={cn('absolute -start-[21.5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface', ['REVIEWED', 'STATUS'].includes(e.kind) ? 'bg-teal' : e.kind.startsWith('DISPUTE') ? 'bg-amber-500' : 'bg-line-strong')} />
                            <p className="text-[13px] text-ink">{text(e)}</p>
                            <p className="text-[12px] text-ink-3 tabular-nums">{when(e.at)}{e.actor ? ` · ${tl('byName', { name: e.actor })}` : ''}</p>
                            {e.note && <p className="mt-0.5 text-[12.5px] text-ink-2" lang="en">{e.note}</p>}
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
}
