'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, FileText, Scale, ChevronRight, Receipt } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trans } from '@/components/i18n/Trans';
import { Ltr, useMoney } from '@/components/orders/order-ui';
import { MOTION } from '@/components/ds';
import { fetchMyOrders, orderRef, type BuyerOrder } from '@/lib/buyer-orders';
import { fetchMyDisputes, disputeReasonKey, type BuyerDispute } from '@/lib/disputes';
import { call } from '@/lib/wholesale';
import { cn } from '@/lib/utils';

/** An Atlantis invoice as GET /invoices/my returns it (only these fields are shown). */
interface BuyerInvoice { id: string; invoiceNumber: string; orderId: string | null; amount: number; tax: number; totalAmount: number; currency: string | null; status: string; dueDate: string | null; paidAt: string | null; createdAt: string }

const INVOICE_TONE: Record<string, string> = {
    PAID: 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300',
    OVERDUE: 'bg-[#FEF2F2] text-[#B91C1C] dark:bg-red-500/15 dark:text-red-300',
    ISSUED: 'bg-surface-3 text-ink-2',
    CANCELLED: 'bg-surface-3 text-ink-3',
};
const PAYMENT: Record<string, { key: string; tone: string }> = {
    PAID: { key: 'paymentPaid', tone: 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300' },
    PROCESSING: { key: 'paymentProcessing', tone: 'bg-surface-3 text-ink-2' },
    FAILED: { key: 'paymentFailed', tone: 'bg-[#FEF2F2] text-[#B91C1C] dark:bg-red-500/15 dark:text-red-300' },
    REFUNDED: { key: 'paymentRefunded', tone: 'bg-surface-3 text-ink-2' },
    UNPAID: { key: 'paymentNotRecorded', tone: 'bg-surface-2 text-ink-3 ring-1 ring-line' },
};
const DISPUTE_TONE: Record<string, string> = {
    OPEN: 'bg-[#FFFBEB] text-[#B45309] dark:bg-amber-500/15 dark:text-amber-300',
    UNDER_REVIEW: 'bg-[#EFF6FF] text-[#1D4ED8] dark:bg-blue-500/15 dark:text-blue-300',
    RESOLVED_REFUND: 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300',
    RESOLVED_NO_REFUND: 'bg-surface-3 text-ink-2',
    CLOSED: 'bg-surface-3 text-ink-2',
};

const Badge = ({ tone, children }: { tone: string; children: React.ReactNode }) => (
    <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap', tone)}>{children}</span>
);

function Section({ id, title, icon: Icon, lead, children }: { id: string; title: string; icon: React.ElementType; lead?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section aria-labelledby={id} className="rounded-2xl ring-1 ring-line bg-surface">
            <header className="px-5 sm:px-6 pt-5 pb-3">
                <h3 id={id} className="font-sans text-[16px] font-semibold text-heading inline-flex items-center gap-2"><Icon size={17} className="text-teal" aria-hidden /> {title}</h3>
                {lead && <p className="mt-1 text-[13px] text-ink-3">{lead}</p>}
            </header>
            {children}
        </section>
    );
}

/**
 * Payments & invoices — a read-only view of what the server records: each
 * order's payment status, Atlantis invoices and the buyer's disputes. Nothing
 * here pays, refunds or changes an order.
 */
export default function PaymentsPage() {
    const { t, fmt, meta } = useLanguage();
    const money = useMoney();
    const reduce = useReducedMotion();
    const [orders, setOrders] = React.useState<BuyerOrder[] | null>(null);
    const [invoices, setInvoices] = React.useState<BuyerInvoice[] | null>(null);
    const [disputes, setDisputes] = React.useState<BuyerDispute[] | null>(null);
    const [failed, setFailed] = React.useState<string[]>([]);

    const load = React.useCallback(async () => {
        setFailed([]);
        const results = await Promise.allSettled([
            fetchMyOrders(100).then((r) => setOrders(r.data ?? [])),
            call<BuyerInvoice[]>('/invoices/my').then((r) => setInvoices(Array.isArray(r) ? r : [])),
            fetchMyDisputes().then((r) => setDisputes(Array.isArray(r) ? r : [])),
        ]);
        const names = ['orders', 'invoices', 'disputes'];
        const bad = results.map((r, i) => (r.status === 'rejected' ? names[i] : null)).filter(Boolean) as string[];
        if (bad.includes('orders')) setOrders((o) => o ?? []);
        if (bad.includes('invoices')) setInvoices((v) => v ?? []);
        if (bad.includes('disputes')) setDisputes((d) => d ?? []);
        setFailed(bad);
    }, []);
    React.useEffect(() => { load(); }, [load]);

    // Invoice amounts are shown in the currency recorded on the invoice — never converted.
    const invoiceMoney = (n: number, currency: string | null) => {
        try { return new Intl.NumberFormat(meta.intl, { style: 'currency', currency: currency || 'EUR' }).format(n); } catch { return `${n.toFixed(2)} ${currency || ''}`; }
    };
    const date = (d: string | null) => (d ? fmt.date(d) : t('payments', 'noDate'));
    const loading = orders === null || invoices === null || disputes === null;
    const enter = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: MOTION.base * 1.6, ease: MOTION.ease, delay: i * 0.05 } });

    if (loading) {
        return (
            <div role="status" aria-label={t('payments', 'loading')} className="space-y-4">
                <div className="h-20 rounded-2xl bg-surface-2 animate-pulse" />
                <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
                <div className="h-64 rounded-2xl bg-surface-2 animate-pulse" />
            </div>
        );
    }

    const allFailed = failed.length === 3;
    const paidCount = orders!.filter((o) => o.paymentStatus === 'PAID').length;
    const openDisputes = disputes!.filter((d) => d.status === 'OPEN' || d.status === 'UNDER_REVIEW').length;
    const summary = [
        { label: t('payments', 'summaryPaid'), value: paidCount, of: orders!.length },
        { label: t('payments', 'summaryInvoices'), value: invoices!.length },
        { label: t('payments', 'summaryDisputes'), value: openDisputes },
    ];

    return (
        <div data-no-translate className="space-y-5 text-start">
            <div>
                <h2 className="font-sans text-[20px] font-semibold text-heading">{t('payments', 'title')}</h2>
                <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-3">{t('payments', 'lead')}</p>
            </div>

            {failed.length > 0 && (
                <p role="alert" className="flex flex-wrap items-center gap-2 text-[13.5px] text-[#B91C1C]">
                    <AlertTriangle size={15} aria-hidden /> {allFailed ? t('payments', 'loadError') : t('payments', 'partialError')}
                    <button type="button" onClick={load} className="font-semibold underline underline-offset-2">{t('payments', 'retry')}</button>
                </p>
            )}

            {!allFailed && (
                <>
                    <ul className="grid gap-3 sm:grid-cols-3">
                        {summary.map((s, i) => (
                            <motion.li key={s.label} {...enter(i)} className="rounded-2xl ring-1 ring-line bg-surface p-4">
                                <p className="text-[12.5px] text-ink-3">{s.label}</p>
                                <p className="mt-1 font-sans text-[24px] font-semibold text-heading tabular-nums">
                                    {fmt.number(s.value)}{s.of != null && <span className="text-[14px] font-normal text-ink-4"> / {fmt.number(s.of)}</span>}
                                </p>
                            </motion.li>
                        ))}
                    </ul>

                    {/* Invoices */}
                    <motion.div {...enter(3)}>
                        <Section id="invoices-title" title={t('payments', 'invoicesTitle')} icon={FileText}>
                            {invoices!.length === 0 ? (
                                <p className="px-5 sm:px-6 pb-5 text-[13.5px] text-ink-3">{t('payments', 'invoicesEmpty')}</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[560px] text-[13.5px]">
                                        <thead>
                                            <tr className="border-y border-line bg-surface-2/60 text-[12px] text-ink-3">
                                                {['colInvoice', 'colOrder', 'colIssued', 'colDue', 'colAmount', 'colStatus'].map((c) => (
                                                    <th key={c} scope="col" className={cn('px-4 first:ps-5 sm:first:ps-6 py-2 font-medium', c === 'colAmount' ? 'text-end' : 'text-start')}>{t('payments', c)}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoices!.map((inv) => (
                                                <tr key={inv.id} className="border-b border-line last:border-0">
                                                    <td className="px-4 ps-5 sm:ps-6 py-3 font-semibold text-ink"><Ltr>{inv.invoiceNumber}</Ltr></td>
                                                    <td className="px-4 py-3">{inv.orderId ? <Link href={`/dashboard/customer/orders/${inv.orderId}`} className="text-teal hover:underline"><Ltr>{orderRef(inv.orderId)}</Ltr></Link> : t('payments', 'noDate')}</td>
                                                    <td className="px-4 py-3 text-ink-2 whitespace-nowrap">{date(inv.createdAt)}</td>
                                                    <td className="px-4 py-3 text-ink-2 whitespace-nowrap">{date(inv.dueDate)}</td>
                                                    <td className="px-4 py-3 text-end font-semibold text-ink tabular-nums whitespace-nowrap">{invoiceMoney(inv.totalAmount, inv.currency)}</td>
                                                    <td className="px-4 py-3"><Badge tone={INVOICE_TONE[inv.status] || 'bg-surface-3 text-ink-2'}>{t('payments', `invoice${inv.status}`) || inv.status}</Badge></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Section>
                    </motion.div>

                    {/* Payment status per order */}
                    <motion.div {...enter(4)}>
                        <Section id="orders-title" title={t('payments', 'ordersTitle')} icon={Receipt} lead={t('payments', 'ordersLead')}>
                            {orders!.length === 0 ? (
                                <p className="px-5 sm:px-6 pb-5 text-[13.5px] text-ink-3">{t('payments', 'ordersEmpty')}</p>
                            ) : (
                                <ul className="border-t border-line divide-y divide-line">
                                    {orders!.map((o) => {
                                        const p = PAYMENT[o.paymentStatus || 'UNPAID'] || PAYMENT.UNPAID;
                                        return (
                                            <li key={o.id}>
                                                <Link href={`/dashboard/customer/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 sm:px-6 py-3 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6]">
                                                    <span className="font-semibold text-ink min-w-[96px]"><Ltr>{orderRef(o.id)}</Ltr></span>
                                                    <span className="text-[13px] text-ink-3">{fmt.date(o.createdAt)}</span>
                                                    <span className="ms-auto flex items-center gap-3">
                                                        <span className="text-[13.5px] font-semibold text-ink tabular-nums">{money(o.totalAmount)}</span>
                                                        <Badge tone={p.tone}>{t('payments', p.key)}</Badge>
                                                        <ChevronRight size={15} className="text-ink-4 rtl:rotate-180" aria-hidden />
                                                    </span>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Section>
                    </motion.div>

                    {/* Disputes */}
                    <motion.div {...enter(5)}>
                        <Section id="disputes-title" title={t('payments', 'disputesTitle')} icon={Scale}
                            lead={<Trans text={t('payments', 'disputesLead')} tags={{ link: (c) => <Link href="/returns" className="font-medium text-teal hover:underline">{c}</Link> }} />}>
                            {disputes!.length === 0 ? (
                                <p className="px-5 sm:px-6 pb-5 text-[13.5px] text-ink-3 inline-flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 text-[#059669] shrink-0" aria-hidden /> {t('payments', 'disputesEmpty')}</p>
                            ) : (
                                <ul className="border-t border-line divide-y divide-line">
                                    {disputes!.map((d) => {
                                        const rk = disputeReasonKey(d.reason);
                                        return (
                                            <li key={d.id} className="px-5 sm:px-6 py-3.5">
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                                    <Link href={`/dashboard/customer/orders/${d.orderId}#dispute`} className="font-semibold text-teal hover:underline"><Ltr>{orderRef(d.orderId)}</Ltr></Link>
                                                    <span className="text-[13px] text-ink-2">{rk ? t('disputes', rk) : d.reason}</span>
                                                    <span className="text-[12.5px] text-ink-3">{t('payments', 'colOpened')}: {fmt.date(d.createdAt)}</span>
                                                    <span className="ms-auto"><Badge tone={DISPUTE_TONE[d.status] || 'bg-surface-3 text-ink-2'}>{t('disputes', `status${d.status}`) || d.status}</Badge></span>
                                                </div>
                                                {d.resolution && <p className="mt-1 text-[12.5px] text-ink-2" lang="en">{t('payments', 'resolution', { text: d.resolution })}</p>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Section>
                    </motion.div>
                </>
            )}
        </div>
    );
}
