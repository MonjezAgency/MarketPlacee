'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    Package, Truck, CheckCircle2, XCircle, ArrowLeft, Loader2, RefreshCw, Download, AlertTriangle, ChevronDown,
    Send, ListPlus, Mail, MessageSquare, Warehouse, FileText, ExternalLink, Layers, Barcode, PackageCheck, Building2,
} from 'lucide-react';
import { cn, prettifyVariantSignature } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { SaveToListDialog } from '@/components/account/SaveToListDialog';
import { BuyerWorkflowPanel } from '@/components/orders/BuyerWorkflowPanel';
import { OrderProgress, Ltr, withNode, SLOT, useMoney } from '@/components/orders/order-ui';
import { Trans } from '@/components/i18n/Trans';
import { MOTION } from '@/components/ds';
import { statusKeys, lineLoad, orderRef, TONE_CLASS, type BuyerOrder } from '@/lib/buyer-orders';
import { buildInvoiceHtml } from '@/lib/invoice-print';
import type { BuyerWorkflow, Inspection } from '@/lib/order-workflow';
import { DISPUTE_REASONS, disputeReasonKey } from '@/lib/disputes';

type OrderStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface OrderDetail {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    paymentStatus?: string | null;
    shippingCompany: string | null;
    shippingCost: number | null;
    trackingNumber?: string | null;
    carrier?: string | null;
    expectedDelivery?: string | null;
    /** Supplier-uploaded invoice / receipt scan attached to the order. */
    supplierInvoiceUrl?: string | null;
    createdAt: string;
    customer?: { id: string; name: string; email: string; phone?: string | null; companyName?: string | null; country?: string | null; vatNumber?: string | null };
    items: {
        id: string; quantity: number; price: number; selectedTier?: string | null; productNameSnapshot?: string | null; mixedLoadId?: string | null;
        selectedVariants?: Record<string, string> | null; mixComposition?: { signature: string; quantity: number }[] | null;
        product: {
            id: string; name: string; images: string[]; brand?: string | null; category?: string | null; ean?: string | null; shelfLife?: string | null;
            exwLocation?: string | null; unit?: string; unitsPerCase?: number | null; casesPerPallet?: number | null; unitsPerPallet?: number | null; palletsPerShipment?: number | null;
        } | null;
    }[];
    history: { id: string; previousStatus: string | null; newStatus: string; createdAt: string; reason: string | null }[];
    /** Confirmation workflow (null for orders placed before it existed). */
    workflow?: BuyerWorkflow | null;
    inspections?: Inspection[];
}


const HISTORY_LABEL: Record<string, string> = {
    PENDING: 'statusAwaitingConfirmation', PAID: 'statusPaid', PROCESSING: 'statusConfirmed', SHIPPED: 'statusShipped', DELIVERED: 'statusDelivered', CANCELLED: 'statusCancelled',
};
const PAYMENT_LABEL: Record<string, { key: string; tone: string }> = {
    PAID: { key: 'paymentPaid', tone: 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300' },
    PROCESSING: { key: 'paymentProcessing', tone: 'bg-surface-3 text-ink-2' },
    FAILED: { key: 'paymentFailed', tone: 'bg-[#FEF2F2] text-[#B91C1C] dark:bg-red-500/15 dark:text-red-300' },
    REFUNDED: { key: 'paymentRefunded', tone: 'bg-surface-3 text-ink-2' },
};
const DISPUTE_TONE: Record<string, string> = {
    OPEN: 'bg-[#FFFBEB] text-[#B45309] dark:bg-amber-500/15 dark:text-amber-300',
    UNDER_REVIEW: 'bg-[#EFF6FF] text-[#1D4ED8] dark:bg-blue-500/15 dark:text-blue-300',
    RESOLVED_REFUND: 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300',
    RESOLVED_NO_REFUND: 'bg-surface-3 text-ink-2',
    CLOSED: 'bg-surface-3 text-ink-2',
};

/** The carrier's own tracking page where we know it; otherwise a web search for the reference. */
function trackingUrl(num: string, carrier: string | null | undefined) {
    const c = String(carrier || '').toUpperCase();
    const n = encodeURIComponent(num);
    if (c.includes('DHL')) return `https://www.dhl.com/en/express/tracking.html?AWB=${n}`;
    if (c.includes('FEDEX')) return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${n}`;
    if (c.includes('UPS')) return `https://www.ups.com/track?tracknum=${n}`;
    if (c.includes('ARAMEX')) return `https://www.aramex.com/track/results?ShipmentNumber=${n}`;
    if (c.includes('TNT')) return `https://www.tnt.com/express/en_eg/site/shipping-tools/tracking.html?searchType=con&cons=${n}`;
    if (c.includes('DPD')) return `https://tracking.dpd.de/status/en_DE/parcel/${n}`;
    if (c.includes('GLS')) return `https://gls-group.com/track/${n}`;
    return `https://www.google.com/search?q=${encodeURIComponent(`${carrier || 'shipment'} tracking ${num}`)}`;
}

const Card = ({ children, className, labelledBy, id }: { children: React.ReactNode; className?: string; labelledBy?: string; id?: string }) => (
    <section id={id} aria-labelledby={labelledBy} className={cn('rounded-2xl ring-1 ring-line bg-surface', className)}>{children}</section>
);
const CardTitle = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <h3 id={id} className="font-sans text-[15px] font-semibold text-heading">{children}</h3>
);

export default function OrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { t, fmt } = useLanguage();
    const money = useMoney();
    const reduce = useReducedMotion();
    const [order, setOrder] = React.useState<OrderDetail | null>(null);
    const [state, setState] = React.useState<'loading' | 'ready' | 'notFound' | 'error'>('loading');
    const [refreshing, setRefreshing] = React.useState(false);
    const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [invoice, setInvoice] = React.useState<any>(null);
    const [existingDispute, setExistingDispute] = React.useState<any>(null);
    const [showDisputeForm, setShowDisputeForm] = React.useState(false);
    const [disputeReason, setDisputeReason] = React.useState('');
    const [disputeDescription, setDisputeDescription] = React.useState('');
    const [isSubmittingDispute, setIsSubmittingDispute] = React.useState(false);
    const [disputeSuccess, setDisputeSuccess] = React.useState(false);
    const [disputeError, setDisputeError] = React.useState('');
    const [isConfirming, setIsConfirming] = React.useState(false);
    const [saveOpen, setSaveOpen] = React.useState(false);

    const fetchOrder = React.useCallback(async (initial = false) => {
        if (initial) setState('loading'); else setRefreshing(true);
        try {
            const [orderRes, disputesRes, invoicesRes] = await Promise.all([
                apiFetch(`/orders/${id}`),
                apiFetch(`/disputes/my`),
                apiFetch(`/invoices/my`),
            ]);
            if (!orderRes.ok) { setState(orderRes.status === 404 || orderRes.status === 403 ? 'notFound' : 'error'); return; }
            setOrder(await orderRes.json());
            if (disputesRes.ok) setExistingDispute((await disputesRes.json()).find((d: any) => d.orderId === id) || null);
            if (invoicesRes.ok) setInvoice((await invoicesRes.json()).find((i: any) => i.orderId === id) || null);
            setState('ready');
        } catch { setState((s) => (s === 'ready' ? s : 'error')); }
        finally { setRefreshing(false); }
    }, [id]);

    React.useEffect(() => { fetchOrder(true); }, [fetchOrder]);

    // Deep link from the order list ("Report a problem") opens the dispute section.
    React.useEffect(() => {
        if (state !== 'ready' || typeof window === 'undefined' || window.location.hash !== '#dispute') return;
        document.getElementById('dispute')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, [state, reduce]);

    const printInvoice = () => {
        if (!order || !invoice) return;
        setIsDownloading(true);
        try {
            const blob = new Blob([buildInvoiceHtml(invoice, order as any)], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const win = window.open(url, '_blank');
            if (!win) { setNotice({ tone: 'err', text: t('orderDetail', 'invoicePopupBlocked') }); URL.revokeObjectURL(url); return; }
            win.addEventListener('load', () => { win.print(); URL.revokeObjectURL(url); });
        } finally { setIsDownloading(false); }
    };

    const confirmReceipt = async () => {
        if (!window.confirm(t('orderDetail', 'confirmPrompt'))) return;
        setIsConfirming(true); setNotice(null);
        try {
            const res = await apiFetch(`/orders/${id}/confirm-delivery`, { method: 'POST' });
            if (!res.ok) throw new Error('failed');
            await fetchOrder();
            setNotice({ tone: 'ok', text: t('orders', 'noteDelivered') });
        } catch { setNotice({ tone: 'err', text: t('orderDetail', 'confirmFailed') }); }
        finally { setIsConfirming(false); }
    };

    const submitDispute = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!disputeReason || !disputeDescription.trim()) { setDisputeError(t('orderDetail', 'disputeRequired')); return; }
        setIsSubmittingDispute(true); setDisputeError('');
        try {
            const res = await apiFetch(`/disputes`, { method: 'POST', body: JSON.stringify({ orderId: id, reason: disputeReason, description: disputeDescription.trim() }) });
            if (!res.ok) throw new Error('failed');
            setExistingDispute(await res.json());
            setDisputeSuccess(true);
            setShowDisputeForm(false);
        } catch { setDisputeError(t('orderDetail', 'disputeFailed')); }
        finally { setIsSubmittingDispute(false); }
    };

    if (state === 'loading') {
        return (
            <div role="status" aria-label={t('orderDetail', 'loading')} className="space-y-4">
                <div className="h-16 rounded-2xl bg-surface-2 animate-pulse" />
                <div className="h-28 rounded-2xl bg-surface-2 animate-pulse" />
                <div className="grid gap-4 lg:grid-cols-3"><div className="lg:col-span-2 h-72 rounded-2xl bg-surface-2 animate-pulse" /><div className="h-72 rounded-2xl bg-surface-2 animate-pulse" /></div>
            </div>
        );
    }

    if (state !== 'ready' || !order) {
        return (
            <div className="rounded-2xl ring-1 ring-line px-5 py-12 text-center" role="alert">
                <span className="mx-auto w-12 h-12 rounded-2xl bg-surface-2 text-ink-3 flex items-center justify-center"><XCircle size={22} aria-hidden /></span>
                <p className="mt-3 text-[15px] font-semibold text-ink">{state === 'notFound' ? t('orderDetail', 'notFound') : t('orderDetail', 'loadError')}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {state === 'error' && <button type="button" onClick={() => fetchOrder(true)} className="h-10 px-4 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">{t('orderDetail', 'retry')}</button>}
                    <Link href="/dashboard/customer/orders" className="h-10 px-4 inline-flex items-center rounded-xl ring-1 ring-line-strong text-[13.5px] font-semibold text-ink">{t('orderDetail', 'back')}</Link>
                </div>
            </div>
        );
    }

    // Shape the detail response like a list order for the shared status/progress logic.
    const asListOrder = {
        ...order,
        workflow: order.workflow ? { reviewStatus: order.workflow.reviewStatus, termsVersion: order.workflow.termsVersion, party: order.workflow.party, buyerMustAccept: order.workflow.buyerMustAccept } : null,
        inspection: order.inspections?.[0]?.status ?? null,
        shipment: order.trackingNumber ? { trackingNumber: order.trackingNumber, carrier: order.carrier ?? null, status: null, expectedDelivery: order.expectedDelivery ?? null } : null,
    } as unknown as BuyerOrder;
    const st = statusKeys(asListOrder);
    const ref = orderRef(order.id);
    const cancelled = order.status === 'CANCELLED';
    const canDispute = (order.status === 'SHIPPED' || order.status === 'DELIVERED') && !existingDispute;
    const freight = order.shippingCost ?? null;
    const payment = order.paymentStatus ? PAYMENT_LABEL[order.paymentStatus] : undefined;
    const exw = Array.from(new Set(order.items.map((i) => i.product?.exwLocation?.trim()).filter(Boolean) as string[]));
    const enter = (delay = 0) => (reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: MOTION.base * 1.6, ease: MOTION.ease, delay } });

    return (
        <div data-no-translate className="space-y-5 text-start">
            {/* Header */}
            <div>
                <Link href="/dashboard/customer/orders" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
                    <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden /> {t('orderDetail', 'back')}
                </Link>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="font-sans text-[22px] sm:text-[24px] font-semibold text-heading">{withNode(t('orderDetail', 'title', { ref: SLOT }), <Ltr>{ref}</Ltr>)}</h2>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                            <span>{t('orderDetail', 'placed', { date: fmt.date(order.createdAt) })}</span>
                            <span className={cn('h-6 px-2.5 inline-flex items-center rounded-full text-[12px] font-semibold', TONE_CLASS[st.tone])}>{t('orders', st.label)}</span>
                            {payment && <span className={cn('h-6 px-2.5 inline-flex items-center rounded-full text-[12px] font-semibold', payment.tone)}>{t('orders', payment.key)}</span>}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {!cancelled && (
                            <button type="button" onClick={() => setSaveOpen(true)} className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg ring-1 ring-line-strong bg-surface text-[13px] font-semibold text-ink hover:ring-ink transition-colors">
                                <ListPlus size={14} aria-hidden /> {t('orderDetail', 'saveToList')}
                            </button>
                        )}
                        <Link href="/dashboard/customer/support?tab=orders" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2">
                            <MessageSquare size={14} aria-hidden /> {t('orderDetail', 'messageTeam')}
                        </Link>
                        <a href={`mailto:Info@atlantisfmcg.com?subject=${encodeURIComponent(t('orderDetail', 'emailSubject', { ref }))}`} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2">
                            <Mail size={14} aria-hidden /> {t('orderDetail', 'emailTeam')}
                        </a>
                        <button type="button" onClick={() => fetchOrder()} aria-label={t('orderDetail', 'refresh')} title={t('orderDetail', 'refresh')} className="w-9 h-9 rounded-lg ring-1 ring-line flex items-center justify-center text-ink-3 hover:text-ink">
                            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} aria-hidden />
                        </button>
                    </div>
                </div>
                {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={cn('mt-3 text-[13px] font-medium', notice.tone === 'err' ? 'text-[#B91C1C]' : 'text-[#047857]')}>{notice.text}</p>}
            </div>

            {/* Shipped: the one action that's the buyer's to take */}
            {order.status === 'SHIPPED' && (
                <motion.div {...enter()} className="rounded-2xl ring-1 ring-[#BFDBFE] bg-[#EFF6FF] dark:bg-blue-500/10 dark:ring-blue-500/30 p-4 sm:p-5 flex flex-wrap items-center gap-4">
                    <span className="w-10 h-10 rounded-xl bg-surface text-[#1D4ED8] flex items-center justify-center shrink-0" aria-hidden><Truck size={18} /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-semibold text-heading">{t('orderDetail', 'shippedTitle')}</p>
                        <p className="mt-0.5 text-[13px] text-ink-2">{t('orderDetail', 'shippedBody')}</p>
                    </div>
                    <button type="button" onClick={confirmReceipt} disabled={isConfirming} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-60">
                        {isConfirming ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <PackageCheck size={15} aria-hidden />} {t('orderDetail', 'confirmReceipt')}
                    </button>
                </motion.div>
            )}

            {/* Progress + key facts */}
            <motion.div {...enter(0.04)}>
                <Card className="p-5 sm:p-6" labelledBy="progress-title">
                    <h3 id="progress-title" className="sr-only">{t('orderDetail', 'progressTitle')}</h3>
                    {cancelled ? (
                        <div className="flex items-start gap-3">
                            <XCircle size={22} className="text-[#B91C1C] shrink-0" aria-hidden />
                            <div>
                                <p className="text-[15px] font-semibold text-heading">{t('orderDetail', 'cancelledTitle')}</p>
                                <p className="mt-0.5 text-[13.5px] text-ink-2">{t('orderDetail', 'cancelledBody')}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <OrderProgress o={asListOrder} />
                            {st.note && <p className="mt-3 text-[13px] text-ink-2">{st.vars?.number ? withNode(t('orders', st.note, { ...st.vars, number: SLOT }), <Ltr>{st.vars.number}</Ltr>) : t('orders', st.note)}</p>}
                        </>
                    )}
                    <dl className="mt-5 pt-5 border-t border-line grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-4">
                        <div className="min-w-0">
                            <dt className="text-[12px] text-ink-3">{t('orderDetail', 'factReference')}</dt>
                            <dd className="mt-0.5 text-[14px] font-semibold text-heading"><Ltr>{ref}</Ltr></dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-[12px] text-ink-3">{t('orderDetail', 'factInvoice')}</dt>
                            <dd className="mt-0.5 text-[14px] font-semibold text-heading">{invoice?.invoiceNumber ? <Ltr>{invoice.invoiceNumber}</Ltr> : <span className="font-normal text-ink-3">{t('orderDetail', 'factInvoiceNone')}</span>}</dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-[12px] text-ink-3">{t('orderDetail', 'factTracking')}</dt>
                            <dd className="mt-0.5 text-[14px] font-semibold text-heading">
                                {order.trackingNumber ? (
                                    <>
                                        <a href={trackingUrl(String(order.trackingNumber).trim(), order.carrier)} target="_blank" rel="noopener noreferrer" title={t('orderDetail', 'openTracking')} className="inline-flex items-center gap-1 text-teal hover:underline">
                                            <Ltr>{order.trackingNumber}</Ltr> <ExternalLink size={12} aria-hidden />
                                        </a>
                                        {order.carrier && <span className="block text-[12px] font-normal text-ink-3">{t('orderDetail', 'factTrackingVia', { carrier: order.carrier })}</span>}
                                    </>
                                ) : <span className="text-[13px] font-normal text-ink-3">{order.status === 'DELIVERED' || cancelled ? t('payments', 'noDate') : t('orderDetail', 'factTrackingNone')}</span>}
                            </dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-[12px] text-ink-3">{freight != null ? t('orderDetail', 'totalWithDelivery') : t('orderDetail', 'goodsTotal')}</dt>
                            <dd className="mt-0.5 text-[16px] font-semibold text-heading tabular-nums">{money(order.totalAmount + (freight ?? 0))}</dd>
                        </div>
                    </dl>
                </Card>
            </motion.div>

            <div className="grid gap-5 lg:grid-cols-3 items-start">
                <div className="lg:col-span-2 space-y-5 min-w-0">
                    {/* Products */}
                    <motion.div {...enter(0.08)}>
                        <Card labelledBy="products-title">
                            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5">
                                <CardTitle id="products-title">{t('orderDetail', 'productsTitle')}</CardTitle>
                                <span className="text-[12.5px] text-ink-3">{t('orderDetail', 'productsCount', { count: order.items.length })}</span>
                            </div>
                            <ul className="divide-y divide-line px-5 sm:px-6 pb-2">
                                {order.items.map((item) => {
                                    const p = item.product;
                                    const load = lineLoad(item as any);
                                    const mixed = !!item.mixedLoadId;
                                    const name = p?.name || item.productNameSnapshot || (mixed ? t('orders', load.kind === 'truck' ? 'mixedTruck' : 'mixedPallet') : t('orders', 'productUnavailable'));
                                    const qtyKey = load.kind === 'truck' ? 'lineTruck' : load.kind === 'pallet' ? 'linePallet' : 'lineCarton';
                                    const priceKey = load.kind === 'truck' ? 'perTruck' : load.kind === 'pallet' ? 'perPallet' : 'perCarton';
                                    const variants = item.selectedVariants ? Object.entries(item.selectedVariants).filter(([k]) => !k.startsWith('__')) : [];
                                    const pack: [string, number | null | undefined][] = [
                                        ['unitsPerCarton', p?.unitsPerCase], ['cartonsPerPallet', p?.casesPerPallet], ['palletsPerTruck', p?.palletsPerShipment],
                                    ];
                                    return (
                                        <li key={item.id} className="py-4">
                                            <div className="flex gap-3 sm:gap-4">
                                                <span className="relative w-16 h-16 shrink-0 rounded-xl ring-1 ring-line bg-media overflow-clip">
                                                    {p?.images?.[0]
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        ? <img src={p.images[0]} alt="" loading="lazy" className="absolute inset-0 m-auto max-w-[82%] max-h-[82%] object-contain mix-blend-multiply" />
                                                        : <span className="absolute inset-0 flex items-center justify-center text-ink-4" aria-hidden>{mixed ? <Layers size={18} /> : <Package size={18} />}</span>}
                                                </span>
                                                <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-6">
                                                    <div className="min-w-0">
                                                        <p className="text-[14.5px] font-semibold text-heading leading-snug break-words">{name}</p>
                                                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12.5px] text-ink-3">
                                                            {p?.brand && <span className="font-medium text-ink-2">{p.brand}</span>}
                                                            {p?.category && <span>{p.category}</span>}
                                                            <span>{t('orderDetail', 'soldBy')}</span>
                                                        </p>
                                                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
                                                            {p?.ean && <span className="inline-flex items-center gap-1"><Barcode size={13} className="text-ink-4" aria-hidden /><span className="sr-only">{t('orderDetail', 'ean')} </span><Ltr>{p.ean}</Ltr></span>}
                                                            <span>{t('orders', qtyKey, { count: item.quantity })}</span>
                                                            {load.kind !== 'carton' && load.cartons != null && <span>{t('orders', 'cartons', { count: load.cartons })}</span>}
                                                            <span>{load.perUnit != null ? t('orders', 'perUnit', { price: money(load.perUnit) }) : t('orders', priceKey, { price: money(item.price) })}</span>
                                                        </p>
                                                        {variants.length > 0 && (
                                                            <p className="mt-2 flex flex-wrap gap-1.5">
                                                                {variants.map(([k, v]) => <span key={k} className="inline-flex items-center h-6 px-2 rounded-md bg-surface-2 ring-1 ring-line text-[11.5px] text-ink-2">{k}: <span className="ms-1 font-semibold text-ink">{v}</span></span>)}
                                                            </p>
                                                        )}
                                                        {Array.isArray(item.mixComposition) && item.mixComposition.length > 0 && (
                                                            <div className="mt-2 rounded-xl ring-1 ring-line bg-teal-soft/50 px-3 py-2 text-[12px]">
                                                                <p className="font-semibold text-teal text-[11.5px] mb-1">{t('orderDetail', 'mixedComposition')}</p>
                                                                <ul className="space-y-0.5 text-ink-2">
                                                                    {item.mixComposition.map((c) => <li key={c.signature} className="break-all">{fmt.number(c.quantity)} × {prettifyVariantSignature(c.signature) || t('orderDetail', 'variantFallback')}</li>)}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="mt-1.5 sm:mt-0 sm:text-end shrink-0">
                                                        <p className="text-[14.5px] font-semibold text-heading tabular-nums">{money(load.lineTotal)}</p>
                                                        {load.units != null && <p className="text-[12.5px] text-ink-3">{t('orders', 'units', { count: load.units })}</p>}
                                                    </div>
                                                </div>
                                            </div>
                                            {(pack.some(([, v]) => !!v) || p?.shelfLife) && (
                                                <dl className="mt-3 ms-0 sm:ms-20 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px]">
                                                    {pack.filter(([, v]) => !!v).map(([k, v]) => (
                                                        <div key={k}><dt className="text-ink-3">{t('orderDetail', k)}</dt><dd className="font-semibold text-ink tabular-nums">{fmt.number(v as number)}</dd></div>
                                                    ))}
                                                    {/* Product shelf life from the listing — not a best-before date for this delivery. */}
                                                    {p?.shelfLife && <div><dt className="text-ink-3">{t('orderDetail', 'shelfLife')}</dt><dd className="font-semibold text-ink">{p.shelfLife}</dd></div>}
                                                </dl>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </Card>
                    </motion.div>

                    {/* Confirmation workflow (orders placed since supplier confirmation exists) */}
                    {order.workflow && <BuyerWorkflowPanel order={order as any} onChange={() => fetchOrder()} />}

                    {/* Status history */}
                    {order.history?.length > 0 && (
                        <Card className="p-5 sm:p-6" labelledBy="history-title">
                            <CardTitle id="history-title">{t('orderDetail', 'historyTitle')}</CardTitle>
                            <ol className="mt-4 relative space-y-4 before:absolute before:top-1.5 before:bottom-1.5 before:start-[3px] before:w-px before:bg-line">
                                {order.history.map((entry) => (
                                    <li key={entry.id} className="relative ps-5">
                                        <span className="absolute start-0 top-1.5 w-[7px] h-[7px] rounded-full bg-[#2EC4B6]" aria-hidden />
                                        <p className="text-[13.5px] font-semibold text-ink">{HISTORY_LABEL[entry.newStatus] ? t('orders', HISTORY_LABEL[entry.newStatus]) : entry.newStatus}</p>
                                        {/* Reasons are written by staff or the system (English). */}
                                        {entry.reason && <p className="text-[12.5px] text-ink-2" lang="en">{entry.reason}</p>}
                                        <p className="text-[12px] text-ink-4"><time dateTime={entry.createdAt}>{fmt.date(entry.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></p>
                                    </li>
                                ))}
                            </ol>
                        </Card>
                    )}

                    {/* Dispute */}
                    <Card id="dispute" className="scroll-mt-32 overflow-clip" labelledBy="dispute-title">
                        <div className="p-5 sm:p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                    <span className="w-10 h-10 rounded-xl bg-[#FFFBEB] dark:bg-amber-500/10 text-[#B45309] flex items-center justify-center shrink-0" aria-hidden><AlertTriangle size={18} /></span>
                                    <div className="min-w-0">
                                        <CardTitle id="dispute-title">{t('orderDetail', 'disputeTitle')}</CardTitle>
                                        <p className="mt-0.5 text-[13px] text-ink-2"><Trans text={t('orderDetail', 'disputeLead')} tags={{ link: (c) => <Link href="/returns" className="font-medium text-teal hover:underline">{c}</Link> }} /></p>
                                    </div>
                                </div>
                                {canDispute && !disputeSuccess && (
                                    <button type="button" onClick={() => setShowDisputeForm((v) => !v)} aria-expanded={showDisputeForm} aria-controls="dispute-form"
                                        className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg ring-1 ring-line-strong bg-surface text-[13px] font-semibold text-ink hover:ring-ink">
                                        {showDisputeForm ? t('orderDetail', 'disputeCancel') : t('orderDetail', 'disputeOpen')}
                                        <ChevronDown size={14} className={cn('transition-transform', showDisputeForm && 'rotate-180')} aria-hidden />
                                    </button>
                                )}
                            </div>

                            {existingDispute && (
                                <div className="mt-4 rounded-xl ring-1 ring-line p-4 text-[13px]">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-heading">{withNode(t('orderDetail', 'disputeRef', { ref: SLOT }), <Ltr>#{String(existingDispute.id).slice(-6).toUpperCase()}</Ltr>)}</p>
                                        <span className={cn('h-6 px-2.5 inline-flex items-center rounded-full text-[12px] font-semibold', DISPUTE_TONE[existingDispute.status] || 'bg-surface-3 text-ink-2')}>
                                            {t('disputes', `status${existingDispute.status}`) || existingDispute.status}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-ink-2">{t('orderDetail', 'disputeReason')}: {disputeReasonKey(existingDispute.reason) ? t('disputes', disputeReasonKey(existingDispute.reason)!) : existingDispute.reason}</p>
                                    {existingDispute.resolution && <p className="mt-1 text-ink-2" lang="en">{t('payments', 'resolution', { text: existingDispute.resolution })}</p>}
                                </div>
                            )}
                            {disputeSuccess && (
                                <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-[#ECFDF5] dark:bg-emerald-500/10 px-4 py-3 text-[13px] font-medium text-[#047857] dark:text-emerald-300">
                                    <CheckCircle2 size={16} className="shrink-0" aria-hidden /> {t('orderDetail', 'disputeSubmitted')}
                                </p>
                            )}
                            {!canDispute && !existingDispute && !disputeSuccess && (
                                <p className="mt-3 text-[12.5px] text-ink-3">{t('orderDetail', 'disputeNotYet')}</p>
                            )}
                        </div>
                        <AnimatePresence initial={false}>
                            {showDisputeForm && (
                                <motion.form id="dispute-form" onSubmit={submitDispute} noValidate
                                    initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                                    className="overflow-hidden border-t border-line">
                                    <div className="p-5 sm:p-6 space-y-4">
                                        <div>
                                            <label htmlFor="dispute-reason" className="block text-[13px] font-semibold text-ink">{t('orderDetail', 'disputeReason')}</label>
                                            <select id="dispute-reason" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} required
                                                className="mt-1.5 w-full h-11 rounded-xl ring-1 ring-line-strong bg-surface px-3 text-[14px] text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6]">
                                                <option value="">{t('orderDetail', 'disputeReasonPlaceholder')}</option>
                                                {DISPUTE_REASONS.map((r) => <option key={r.value} value={r.value}>{t('disputes', r.key)}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="dispute-description" className="block text-[13px] font-semibold text-ink">{t('orderDetail', 'disputeDescription')}</label>
                                            <textarea id="dispute-description" value={disputeDescription} onChange={(e) => setDisputeDescription(e.target.value)} rows={4} required
                                                placeholder={t('orderDetail', 'disputeDescriptionPlaceholder')}
                                                className="mt-1.5 w-full rounded-xl ring-1 ring-line-strong bg-surface px-3 py-2.5 text-[14px] text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6] resize-y" />
                                        </div>
                                        {disputeError && <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-[#B91C1C]"><AlertTriangle size={13} aria-hidden /> {disputeError}</p>}
                                        <button type="submit" disabled={isSubmittingDispute} className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:opacity-60">
                                            {isSubmittingDispute ? <><Loader2 size={14} className="animate-spin" aria-hidden /> {t('orderDetail', 'disputeSubmitting')}</> : <><Send size={14} className="rtl:-scale-x-100" aria-hidden /> {t('orderDetail', 'disputeSubmit')}</>}
                                        </button>
                                    </div>
                                </motion.form>
                            )}
                        </AnimatePresence>
                    </Card>
                </div>

                {/* Right rail */}
                <div className="space-y-5 min-w-0">
                    <Card className="p-5 sm:p-6" labelledBy="summary-title">
                        <CardTitle id="summary-title">{t('orderDetail', 'summaryTitle')}</CardTitle>
                        <dl className="mt-4 space-y-2.5 text-[13.5px]">
                            <div className="flex justify-between gap-3"><dt className="text-ink-2">{t('orderDetail', 'goods')}</dt><dd className="font-semibold text-ink tabular-nums">{money(order.totalAmount)}</dd></div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-ink-2">{t('orderDetail', 'delivery')}</dt>
                                <dd className={cn('tabular-nums', freight != null ? 'font-semibold text-ink' : 'text-ink-3')}>{freight != null ? money(freight) : t('orderDetail', 'deliveryQuoted')}</dd>
                            </div>
                            <div className="flex justify-between gap-3 pt-3 border-t border-line">
                                <dt className="font-semibold text-heading">{freight != null ? t('orderDetail', 'totalWithDelivery') : t('orderDetail', 'goodsTotal')}</dt>
                                <dd className="text-[16px] font-semibold text-heading tabular-nums">{money(order.totalAmount + (freight ?? 0))}</dd>
                            </div>
                        </dl>
                        <p className="mt-3 text-[12px] text-ink-3">{t('orderDetail', 'vatNote')}</p>
                    </Card>

                    {(exw.length > 0 || order.shippingCompany || order.carrier) && (
                        <Card className="p-5 sm:p-6" labelledBy="delivery-title">
                            <CardTitle id="delivery-title">{t('orderDetail', 'deliveryTitle')}</CardTitle>
                            {exw.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-[12px] text-ink-3">{t('orderDetail', 'exwTitle')}</p>
                                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                        {exw.map((loc) => <li key={loc} className="inline-flex items-center gap-1.5 min-h-7 px-2.5 rounded-full bg-teal-soft text-teal text-[12px] font-semibold"><Warehouse size={12} aria-hidden /> {loc}</li>)}
                                    </ul>
                                </div>
                            )}
                            {(order.carrier || order.shippingCompany) && (
                                <div className="mt-4">
                                    <p className="text-[12px] text-ink-3">{t('orderDetail', 'carrier')}</p>
                                    <p className="mt-0.5 text-[13.5px] font-semibold text-ink inline-flex items-center gap-1.5"><Truck size={14} className="text-ink-4" aria-hidden /> {order.carrier || order.shippingCompany}</p>
                                </div>
                            )}
                        </Card>
                    )}

                    <Card className="p-5 sm:p-6" labelledBy="documents-title">
                        <CardTitle id="documents-title">{t('orderDetail', 'documentsTitle')}</CardTitle>
                        <div className="mt-4 space-y-3">
                            {invoice ? (
                                <div className="flex items-center justify-between gap-3">
                                    <p className="inline-flex items-center gap-2 text-[13.5px] text-ink min-w-0"><FileText size={15} className="text-ink-4 shrink-0" aria-hidden /> {withNode(t('orderDetail', 'invoiceNumber', { number: SLOT }), <Ltr>{invoice.invoiceNumber}</Ltr>)}</p>
                                    <button type="button" onClick={printInvoice} disabled={isDownloading} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg ring-1 ring-line-strong text-[12.5px] font-semibold text-ink hover:ring-ink disabled:opacity-60 shrink-0">
                                        {isDownloading ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Download size={12} aria-hidden />} {t('orderDetail', 'invoicePrint')}
                                    </button>
                                </div>
                            ) : <p className="text-[13px] text-ink-3">{t('orderDetail', 'invoiceNotIssued')}</p>}
                            {order.supplierInvoiceUrl && (
                                <a href={order.supplierInvoiceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-xl ring-1 ring-line px-3 py-2.5 text-[13.5px] text-ink hover:ring-line-strong">
                                    <span className="inline-flex items-center gap-2"><FileText size={15} className="text-ink-4" aria-hidden /> {t('orderDetail', 'supplierInvoiceOpen')}</span>
                                    <ExternalLink size={13} className="text-ink-4" aria-hidden />
                                </a>
                            )}
                        </div>
                    </Card>

                    {order.customer && (
                        <Card className="p-5 sm:p-6" labelledBy="details-title">
                            <CardTitle id="details-title">{t('orderDetail', 'detailsTitle')}</CardTitle>
                            <div className="mt-3 space-y-1 text-[13px] text-ink-2 break-words">
                                <p className="text-[14px] font-semibold text-ink">{order.customer.companyName || order.customer.name}</p>
                                {order.customer.companyName && <p>{order.customer.name}</p>}
                                {order.customer.email && <p><Ltr>{order.customer.email}</Ltr></p>}
                                {order.customer.phone && <p><Ltr>{order.customer.phone}</Ltr></p>}
                                {order.customer.country && <p>{order.customer.country}</p>}
                                {order.customer.vatNumber && <p>{withNode(t('orderDetail', 'vat', { number: SLOT }), <Ltr>{order.customer.vatNumber}</Ltr>)}</p>}
                            </div>
                            <p className="mt-3 pt-3 border-t border-line text-[12.5px] text-ink-3 inline-flex items-center gap-1.5"><Building2 size={13} aria-hidden /> {t('orderDetail', 'handledBy')}</p>
                        </Card>
                    )}
                </div>
            </div>

            <SaveToListDialog orderId={order.id} open={saveOpen} onClose={() => setSaveOpen(false)} />
        </div>
    );
}
