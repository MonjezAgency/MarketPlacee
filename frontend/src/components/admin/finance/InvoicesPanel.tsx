'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Eye, FileText, Plus, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, Button, Dialog, EmptyState, ErrorState, Notice, Skeleton, inputCls, selectCls, useConfirm, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { InfoTip, LoadError, NoAccessState, fetchList, httpsUrl, readError, useMoney, useTf } from './shared';
import { ManualInvoiceDialog } from './ManualInvoiceDialog';

/** One row of GET /invoices (invoice.service.ts getAllInvoices), as recorded. */
export interface InvoiceRow {
    id: string; invoiceNumber: string; orderId: string | null; customerId: string;
    amount: number; tax: number; totalAmount: number; currency: string | null; status: string;
    dueDate: string | null; paidAt: string | null; pdfUrl: string | null; notes: string | null; createdAt: string;
    customer?: { id: string; name: string; email: string; companyName: string | null } | null;
}
const STATUSES = ['ISSUED', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
const STATUS_TONE: Record<string, Tone> = { ISSUED: 'warning', PAID: 'success', OVERDUE: 'danger', CANCELLED: 'neutral' };
const PAGE = 25;

const isOpen = (i: InvoiceRow) => i.status === 'ISSUED' || i.status === 'OVERDUE';
/** Past due from the record itself: status OVERDUE, or ISSUED with a due date before now. Nothing on the server sets OVERDUE today. */
const isPastDue = (i: InvoiceRow, now: number) => i.status === 'OVERDUE' || (i.status === 'ISSUED' && !!i.dueDate && new Date(i.dueDate).getTime() < now);
const cur = (i: InvoiceRow) => String(i.currency || '').toUpperCase() || '—';

/** Sum per currency — amounts in different currencies are never added together. */
function byCurrency(rows: InvoiceRow[]) {
    const m = new Map<string, { total: number; count: number }>();
    for (const r of rows) { const k = cur(r); const v = m.get(k) || { total: 0, count: 0 }; v.total += Number(r.totalAmount) || 0; v.count += 1; m.set(k, v); }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
}

/** CSV cell: quoted, and spreadsheet formulas neutralised. */
const cell = (v: unknown) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };

export function InvoicesPanel({ canWrite }: { canWrite: boolean }) {
    const tf = useTf();
    const { fmt } = useLanguage();
    const money = useMoney();
    const confirm = useConfirm();
    const [rows, setRows] = React.useState<InvoiceRow[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [forbidden, setForbidden] = React.useState(false);
    const [q, setQ] = React.useState('');
    const [status, setStatus] = React.useState('');
    const [page, setPage] = React.useState(1);
    const [creating, setCreating] = React.useState(false);
    const [detail, setDetail] = React.useState<InvoiceRow | null>(null);
    const [paying, setPaying] = React.useState<string | null>(null);
    const [msg, setMsg] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
    const now = React.useMemo(() => Date.now(), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

    const load = React.useCallback(() => {
        setError(null);
        fetchList('/invoices', tf('loadFailed'))
            .then((d) => { setForbidden(false); setRows(d as InvoiceRow[]); })
            .catch((e) => { if (e instanceof LoadError && e.forbidden) setForbidden(true); else setError(e?.message || tf('loadFailed')); });
    }, [tf]);
    React.useEffect(() => { load(); }, [load]);

    const date = (d: string | null | undefined) => (d ? fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric' }) : null);
    const account = (i: InvoiceRow) => i.customer ? (i.customer.companyName || i.customer.name) : null;

    const filtered = React.useMemo(() => {
        const needle = q.trim().toLowerCase();
        return (rows || []).filter((i) => {
            if (status === 'PAST_DUE' ? !isPastDue(i, now) : status && i.status !== status) return false;
            if (!needle) return true;
            return [i.invoiceNumber, i.orderId, i.customer?.name, i.customer?.companyName, i.customer?.email].some((v) => v && String(v).toLowerCase().includes(needle));
        });
    }, [rows, q, status, now]);
    React.useEffect(() => { setPage(1); }, [q, status]);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
    const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

    const metrics = React.useMemo(() => {
        const all = rows || [];
        return [
            { key: 'Invoiced', rows: all.filter((i) => i.status !== 'CANCELLED') },
            { key: 'Outstanding', rows: all.filter(isOpen) },
            { key: 'Paid', rows: all.filter((i) => i.status === 'PAID') },
            { key: 'PastDue', rows: all.filter((i) => isPastDue(i, now)) },
        ].map((m) => ({ ...m, sums: byCurrency(m.rows) }));
    }, [rows, now]);

    const exportCsv = () => {
        const head = ['invoiceNumber', 'account', 'accountEmail', 'orderId', 'currency', 'amount', 'taxAsRecorded', 'total', 'status', 'issued', 'due', 'paidAt', 'document'].map((k) => tf(`csv_${k}`));
        const lines = filtered.map((i) => [i.invoiceNumber, account(i) ?? '', i.customer?.email ?? '', i.orderId ?? '', cur(i), i.amount, i.tax, i.totalAmount, i.status, i.createdAt?.slice(0, 10), i.dueDate?.slice(0, 10) ?? '', i.paidAt?.slice(0, 10) ?? '', httpsUrl(i.pdfUrl) ?? ''].map(cell).join(','));
        const blob = new Blob(['﻿' + [head.map(cell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `atlantis-invoices-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMsg({ tone: 'success', text: tf('exportDone', { count: filtered.length }) });
    };

    const markPaid = async (i: InvoiceRow) => {
        if (paying) return;
        const ok = await confirm({ title: tf('payConfirmTitle', { number: i.invoiceNumber }), body: tf('payConfirmBody', { total: money(i.totalAmount, i.currency) }), confirm: tf('payConfirmCta') });
        if (!ok) return;
        setPaying(i.id); setMsg(null);
        try {
            const res = await apiFetch(`/invoices/${encodeURIComponent(i.id)}/pay`, { method: 'POST' });
            if (!res.ok) throw new Error(res.status >= 500 ? tf('payNoConfirmation') : await readError(res, tf('payFailed')));
            const upd = await res.json().catch(() => null);
            if (upd?.status !== 'PAID') throw new Error(tf('payNoConfirmation'));
            setMsg({ tone: 'success', text: tf('paid', { number: i.invoiceNumber }) });
            load();
        } catch (e: any) { setMsg({ tone: 'danger', text: e?.message || tf('payFailed') }); } finally { setPaying(null); }
    };

    const statusBadge = (i: InvoiceRow) => (
        <span className="flex flex-wrap gap-1">
            <Badge tone={STATUS_TONE[i.status] ?? 'neutral'} dot>{(STATUSES as readonly string[]).includes(i.status) ? tf(`status_${i.status}`) : i.status}</Badge>
            {i.status === 'ISSUED' && isPastDue(i, now) && <Badge tone="danger">{tf('pastDue')}</Badge>}
        </span>
    );

    if (forbidden) return <section className="rounded-xl bg-surface ring-1 ring-line" aria-label={tf('invoicesTitle')}><NoAccessState /></section>;

    return (
        <div className="space-y-4">
            <section aria-label={tf('metricsAria')} className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((m) => (
                    <div key={m.key} className="rounded-xl bg-surface ring-1 ring-line p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                        <p className="text-[12.5px] font-medium text-ink-3 flex items-center gap-1">{tf(`metric${m.key}`)}<InfoTip label={tf('metricInfoAria', { name: tf(`metric${m.key}`) })} text={tf(`metric${m.key}Info`)} /></p>
                        {!rows ? <div className="mt-1.5 h-7 w-24 rounded bg-surface-3 animate-pulse" /> : m.sums.length === 0 ? (
                            <p className="mt-0.5 text-[22px] leading-8 font-semibold text-heading tabular-nums">{tf('metricNone')}</p>
                        ) : (
                            <ul className="mt-0.5 space-y-0.5">
                                {m.sums.map(([c, v]) => <li key={c} className="text-[20px] leading-7 font-semibold text-heading tabular-nums">{money(v.total, c)}</li>)}
                            </ul>
                        )}
                        {rows && <p className="mt-0.5 text-[12px] text-ink-3">{tf('metricCount', { count: m.rows.length })}</p>}
                    </div>
                ))}
            </section>
            {rows && metrics[0].sums.length > 1 && <Notice tone="info">{tf('mixedCurrencies')}</Notice>}
            <Notice tone="info">{tf('integrationNote')}</Notice>

            <section className="rounded-xl bg-surface ring-1 ring-line shadow-[0_1px_2px_rgba(15,23,42,0.04)]" aria-labelledby="inv-title">
                <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 pt-4">
                    <div className="min-w-0">
                        <h2 id="inv-title" className="text-[15px] font-semibold text-heading">{tf('invoicesTitle')}</h2>
                        <p className="mt-0.5 text-[13px] text-ink-3">{tf('invoicesLead')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button icon={<Download size={14} />} disabled={!filtered.length} onClick={exportCsv}>{tf('exportCsv')}</Button>
                        {canWrite && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>{tf('newManual')}</Button>}
                    </div>
                </div>
                <div className="px-4 sm:px-5 pt-3 flex flex-wrap gap-2">
                    <label className="relative flex-1 min-w-[14rem]">
                        <span className="sr-only">{tf('search')}</span>
                        <Search size={15} aria-hidden className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tf('searchPh')} className={cn(inputCls, 'ps-9')} />
                    </label>
                    <select aria-label={tf('filterStatus')} value={status} onChange={(e) => setStatus(e.target.value)} className={cn(selectCls, 'w-auto min-w-[11rem]')}>
                        <option value="">{tf('allStatuses')}</option>
                        {STATUSES.map((s) => <option key={s} value={s}>{tf(`status_${s}`)}</option>)}
                        <option value="PAST_DUE">{tf('pastDue')}</option>
                    </select>
                </div>
                <div className="px-4 sm:px-5 pt-3" aria-live="polite">{msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}</div>
                <div className="py-3">
                    {error && <div className="px-4 sm:px-5"><ErrorState message={error} onRetry={load} /></div>}
                    {!rows && !error && <div className="px-4 sm:px-5 space-y-2" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
                    {rows && (rows.length === 0 ? (
                        <EmptyState icon={<FileText size={20} />} title={tf('emptyTitle')}>{tf('emptyBody')}</EmptyState>
                    ) : filtered.length === 0 ? (
                        <EmptyState icon={<Search size={20} />} title={tf('noMatchTitle')} action={<Button onClick={() => { setQ(''); setStatus(''); }}>{tf('clearFilters')}</Button>}>{tf('noMatchBody')}</EmptyState>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1180px] text-[13.5px]">
                                    <caption className="sr-only">{tf('invoicesTitle')}</caption>
                                    <thead><tr className="text-ink-3 text-[12.5px] border-y border-line bg-surface-2/60">
                                        <th scope="col" className="text-start font-medium ps-4 sm:ps-5 pe-2 py-2">{tf('colNumber')}</th>
                                        <th scope="col" className="text-start font-medium px-2 py-2">{tf('colAccount')}</th>
                                        <th scope="col" className="text-start font-medium px-2 py-2">{tf('colOrder')}</th>
                                        <th scope="col" className="text-end font-medium px-2 py-2">{tf('colAmount')}</th>
                                        <th scope="col" className="text-end font-medium px-2 py-2">{tf('colTax')}</th>
                                        <th scope="col" className="text-end font-medium px-2 py-2">{tf('colTotal')}</th>
                                        <th scope="col" className="text-start font-medium px-2 py-2">{tf('colStatus')}</th>
                                        <th scope="col" className="text-start font-medium px-2 py-2">{tf('colIssued')}</th>
                                        <th scope="col" className="text-start font-medium px-2 py-2">{tf('colDue')}</th>
                                        <th scope="col" className="text-start font-medium px-2 py-2">{tf('colDocument')}</th>
                                        <th scope="col" className="text-end font-medium px-2 pe-4 sm:pe-5 py-2">{tf('colActions')}</th>
                                    </tr></thead>
                                    <tbody>
                                        {shown.map((i) => {
                                            const doc = httpsUrl(i.pdfUrl);
                                            return (
                                                <tr key={i.id} className="border-b border-line last:border-0 align-top">
                                                    <td className="ps-4 sm:ps-5 pe-2 py-2.5 font-medium text-ink whitespace-nowrap"><bdi dir="ltr">{i.invoiceNumber}</bdi></td>
                                                    <td className="px-2 py-2.5 max-w-[16rem]">
                                                        {account(i) ? <Link href={`/admin/users/${i.customerId}`} className="text-teal font-medium hover:underline">{account(i)}</Link> : <span className="text-ink-4">{tf('notRecorded')}</span>}
                                                        {i.customer?.email && <span className="block text-[12px] text-ink-3 truncate"><bdi dir="ltr">{i.customer.email}</bdi></span>}
                                                    </td>
                                                    <td className="px-2 py-2.5 whitespace-nowrap">{i.orderId ? <Link href={`/admin/orders/${i.orderId}`} className="text-teal font-medium hover:underline"><bdi dir="ltr">#{i.orderId.slice(-8).toUpperCase()}</bdi></Link> : <span className="text-ink-4">{tf('manualNoOrder')}</span>}</td>
                                                    <td className="px-2 py-2.5 text-end tabular-nums whitespace-nowrap">{money(i.amount, i.currency)}</td>
                                                    <td className="px-2 py-2.5 text-end tabular-nums whitespace-nowrap text-ink-2">{money(i.tax, i.currency)}</td>
                                                    <td className="px-2 py-2.5 text-end tabular-nums whitespace-nowrap font-semibold text-heading">{money(i.totalAmount, i.currency)}</td>
                                                    <td className="px-2 py-2.5">{statusBadge(i)}</td>
                                                    <td className="px-2 py-2.5 whitespace-nowrap text-ink-2">{date(i.createdAt) ?? '—'}</td>
                                                    <td className="px-2 py-2.5 whitespace-nowrap text-ink-2">{date(i.dueDate) ?? <span className="text-ink-4">{tf('notRecorded')}</span>}</td>
                                                    <td className="px-2 py-2.5 whitespace-nowrap">{doc ? <a href={doc} target="_blank" rel="noopener noreferrer" className="text-teal font-medium hover:underline">{tf('openPdf')}</a> : <span className="text-ink-4">{tf('noDocument')}</span>}</td>
                                                    <td className="px-2 pe-4 sm:pe-5 py-2.5">
                                                        <div className="flex justify-end gap-1">
                                                            <button type="button" onClick={() => setDetail(i)} title={tf('details')} aria-label={tf('detailsOf', { number: i.invoiceNumber })} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Eye size={15} /></button>
                                                            {canWrite && isOpen(i) && <Button size="sm" variant="secondary" loading={paying === i.id} disabled={!!paying} onClick={() => markPaid(i)}>{tf('markPaid')}</Button>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 sm:px-5 pt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-3">
                                <p>{tf('showing', { from: (page - 1) * PAGE + 1, to: Math.min(page * PAGE, filtered.length), total: filtered.length })}</p>
                                {pages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{tf('prev')}</Button>
                                        <span className="tabular-nums">{tf('pageOf', { page, pages })}</span>
                                        <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{tf('next')}</Button>
                                    </div>
                                )}
                            </div>
                        </>
                    ))}
                </div>
            </section>
            {creating && <ManualInvoiceDialog onClose={() => setCreating(false)} onCreated={load} />}
            {detail && <InvoiceDetail inv={detail} onClose={() => setDetail(null)} statusBadge={statusBadge(detail)} />}
        </div>
    );
}

function InvoiceDetail({ inv, onClose, statusBadge }: { inv: InvoiceRow; onClose: () => void; statusBadge: React.ReactNode }) {
    const tf = useTf();
    const { fmt } = useLanguage();
    const money = useMoney();
    const date = (d: string | null) => (d ? fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric' }) : null);
    const doc = httpsUrl(inv.pdfUrl);
    const row = (label: string, value: React.ReactNode) => (
        <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3 py-2 border-b border-line last:border-0 text-[13.5px]">
            <dt className="text-ink-3">{label}</dt><dd className="text-ink min-w-0 break-words">{value ?? <span className="text-ink-4">{tf('notRecorded')}</span>}</dd>
        </div>
    );
    return (
        <Dialog open onClose={onClose} title={<bdi dir="ltr">{inv.invoiceNumber}</bdi>} description={tf('detailLead')} size="md" footer={<Button variant="secondary" onClick={onClose}>{tf('close')}</Button>}>
            <dl>
                {row(tf('colStatus'), statusBadge)}
                {row(tf('colAccount'), inv.customer ? <>{inv.customer.companyName || inv.customer.name}<span className="block text-[12.5px] text-ink-3"><bdi dir="ltr">{inv.customer.email}</bdi></span></> : null)}
                {row(tf('colOrder'), inv.orderId ? <Link href={`/admin/orders/${inv.orderId}`} className="text-teal font-medium hover:underline"><bdi dir="ltr">#{inv.orderId.slice(-8).toUpperCase()}</bdi></Link> : tf('manualNoOrder'))}
                {row(tf('detailCurrency'), <bdi dir="ltr">{cur(inv)}</bdi>)}
                {row(tf('colAmount'), money(inv.amount, inv.currency))}
                {row(tf('colTax'), money(inv.tax, inv.currency))}
                {row(tf('colTotal'), <strong>{money(inv.totalAmount, inv.currency)}</strong>)}
                {row(tf('colIssued'), date(inv.createdAt))}
                {row(tf('colDue'), date(inv.dueDate))}
                {row(tf('detailPaidAt'), date(inv.paidAt))}
                {row(tf('colDocument'), doc ? <a href={doc} target="_blank" rel="noopener noreferrer" className="text-teal font-medium hover:underline">{tf('openPdf')}</a> : tf('noDocument'))}
                {row(tf('detailNotes'), inv.notes || null)}
            </dl>
            <p className="mt-3 text-[12.5px] text-ink-3">{tf('taxCaveat')}</p>
        </Dialog>
    );
}
