'use client';

import * as React from 'react';
import Link from 'next/link';
import { adminApi, type AdminProductRow, type BulkAction, type BulkResult, type CatalogScope } from '@/lib/admin-api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, Dialog, ErrorState, Field, Notice, inputCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

/**
 * Confirm → run → report for one bulk action on the admin Products page.
 * The preview is the same rule the server applies (admin-bulk.ts), shown so the
 * reviewer knows before confirming how many products will change; the server
 * checks every product again and its answer is what the result shows.
 */
export function previewSkip(action: BulkAction, scope: CatalogScope, p: AdminProductRow): string | null {
    const s = p.status;
    if (action === 'approve') {
        if (s === 'APPROVED') return 'ALREADY_APPROVED';
        if (s === 'REJECTED') return 'CLOSED';
        if (scope === 'submissions' && s === 'DRAFT') return 'NOT_SUBMITTED';
        if (scope === 'submissions' && s === 'NEEDS_CHANGES') return 'ALREADY_CHANGES';
        if (p.missing.length) return 'INCOMPLETE';
        return null;
    }
    if (action === 'reject') return s === 'REJECTED' ? 'ALREADY_REJECTED' : s === 'APPROVED' ? 'LIVE' : s === 'DRAFT' ? 'NOT_SUBMITTED' : null;
    if (action === 'changes') return s === 'NEEDS_CHANGES' ? 'ALREADY_CHANGES' : s === 'APPROVED' ? 'LIVE' : s === 'REJECTED' ? 'CLOSED' : s === 'DRAFT' ? 'NOT_SUBMITTED' : null;
    return null; // delete: what blocks it (orders, target prices, offers) is only known on the server
}

export default function BulkActionDialog({ action, scope, rows, onClose, onDone }: {
    action: BulkAction | null; scope: CatalogScope; rows: AdminProductRow[]; onClose: () => void; onDone: () => void;
}) {
    const { t } = useLanguage();
    const tp = (k: string, v?: Record<string, string | number>) => t('adminProducts', k, v);
    const [message, setMessage] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<BulkResult | null>(null);
    React.useEffect(() => { if (action) { setMessage(''); setError(null); setResult(null); } }, [action]);
    if (!action) return null;

    const verb = action === 'approve' && scope === 'catalog' ? 'publish' : action;
    const willSkip = rows.filter((r) => previewSkip(action, scope, r));
    const willChange = rows.length - willSkip.length;
    const needsMessage = action === 'reject' || action === 'changes';
    const nameOf = (id: string, fallback: string | null) => fallback || rows.find((r) => r.id === id)?.name || id.slice(0, 8);

    const run = async () => {
        if (needsMessage && message.trim().length < 10) { setError(tp('reasonTooShort')); return; }
        setBusy(true); setError(null);
        try {
            const r = await adminApi.bulk(action, rows.map((p) => p.id), needsMessage ? message.trim() : undefined);
            setResult(r);
            if (r.done > 0) onDone();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    const close = () => { if (!busy) onClose(); };
    const footer = result
        ? <Button variant="primary" onClick={close}>{tp('close')}</Button>
        : <><Button onClick={close} disabled={busy}>{tp('cancel')}</Button>
            <Button variant={action === 'delete' || action === 'reject' ? 'danger' : 'primary'} loading={busy} disabled={action !== 'delete' && willChange === 0} onClick={run}>
                {tp(`bulkRun_${verb}`, { count: action === 'delete' ? rows.length : willChange })}
            </Button></>;

    return (
        <Dialog open onClose={close} dismissable={!busy} size="md" title={result ? tp('bulkResultTitle') : tp(`bulkTitle_${verb}`, { count: rows.length })} footer={footer}>
            {!result ? (
                <div className="space-y-4 text-[13.5px]">
                    <p className="text-ink-2">{tp(`bulkBody_${verb}`)}</p>
                    {action !== 'delete' && (
                        <dl className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-surface-2 ring-1 ring-inset ring-line p-3"><dt className="text-[12px] text-ink-3">{tp('bulkWillChange')}</dt><dd className="text-[18px] font-semibold tabular-nums text-ink">{willChange}</dd></div>
                            <div className="rounded-lg bg-surface-2 ring-1 ring-inset ring-line p-3"><dt className="text-[12px] text-ink-3">{tp('bulkWillSkip')}</dt><dd className="text-[18px] font-semibold tabular-nums text-ink">{willSkip.length}</dd></div>
                        </dl>
                    )}
                    {willSkip.length > 0 && (
                        <ul className="max-h-40 overflow-y-auto rounded-lg ring-1 ring-inset ring-line divide-y divide-line text-[12.5px]">
                            {willSkip.map((r) => <li key={r.id} className="flex justify-between gap-3 px-3 py-2"><span className="truncate text-ink">{r.name}</span><span className="shrink-0 text-ink-3">{tp(`skip_${previewSkip(action, scope, r)}`)}</span></li>)}
                        </ul>
                    )}
                    {needsMessage && (
                        <Field label={tp(action === 'reject' ? 'reasonLabel' : 'changesLabel')} htmlFor="bulk-msg" required hint={tp(action === 'reject' ? 'reasonHint' : 'changesHint')}>
                            <textarea id="bulk-msg" data-autofocus value={message} onChange={(e) => { setMessage(e.target.value); setError(null); }} rows={4} className={cn(inputCls, 'h-auto py-2')} />
                        </Field>
                    )}
                    {action === 'delete' && <Notice tone="warning">{tp('bulkDeleteWarn')}</Notice>}
                    <p className="text-[12px] text-ink-3">{tp('bulkServerCheck')}</p>
                    {error && <ErrorState message={error} />}
                </div>
            ) : (
                <div className="space-y-4 text-[13.5px]" aria-live="polite">
                    <dl className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-3"><dt className="text-[12px] text-ink-3">{tp(`bulkDone_${verb}`)}</dt><dd className="text-[18px] font-semibold tabular-nums text-ink">{result.done}</dd></div>
                        <div className="rounded-lg bg-surface-2 ring-1 ring-inset ring-line p-3"><dt className="text-[12px] text-ink-3">{tp('bulkSkipped')}</dt><dd className="text-[18px] font-semibold tabular-nums text-ink">{result.skipped.length}</dd></div>
                        <div className={cn('rounded-lg p-3', result.failed.length ? 'bg-red-50 dark:bg-red-500/10' : 'bg-surface-2 ring-1 ring-inset ring-line')}><dt className="text-[12px] text-ink-3">{tp('bulkFailed')}</dt><dd className="text-[18px] font-semibold tabular-nums text-ink">{result.failed.length}</dd></div>
                    </dl>
                    {(result.skipped.length > 0 || result.failed.length > 0) && (
                        <ul className="max-h-56 overflow-y-auto rounded-lg ring-1 ring-inset ring-line divide-y divide-line text-[12.5px]">
                            {result.failed.map((f) => <li key={f.id} className="px-3 py-2"><span className="flex justify-between gap-3"><Link href={`/admin/products/${f.id}`} className="truncate text-ink hover:underline">{f.name}</Link><span className="shrink-0 text-red-700 dark:text-red-300">{tp('bulkFailedRow')}</span></span><span className="block text-ink-3">{f.error}</span></li>)}
                            {result.skipped.map((s) => (
                                <li key={s.id} className="px-3 py-2">
                                    <span className="flex justify-between gap-3">
                                        {s.reason === 'NOT_FOUND' ? <span className="truncate text-ink">{nameOf(s.id, s.name)}</span> : <Link href={`/admin/products/${s.id}`} className="truncate text-ink hover:underline">{nameOf(s.id, s.name)}</Link>}
                                        <span className="shrink-0 text-ink-3">{tp(`skip_${s.reason}`)}</span>
                                    </span>
                                    {s.detail?.length ? <span className="block text-ink-3">{tp('missingList', { fields: s.detail.join(', ') })}</span> : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </Dialog>
    );
}
