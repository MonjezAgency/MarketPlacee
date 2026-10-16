'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, CheckCircle2, XCircle } from 'lucide-react';
import { Button, Card, Notice, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';
import { listJoin, where, type CommitResult, type Review } from './types';

export interface Progress { done: number; total: number; batch: number; batches: number }

/** Confirm (explicitly), then follow the batches, then the honest per-row result. */
export default function ImportStep({ review, onExisting, confirmed, setConfirmed, progress, results, error, multi, fileName }: {
    review: Review; onExisting: 'skip' | 'update'; confirmed: boolean; setConfirmed: (v: boolean) => void;
    progress: Progress | null; results: CommitResult[] | null; error: string | null; multi: boolean; fileName: string;
}) {
    const { t, fmt } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const s = review.summary;
    const updates = onExisting === 'update' ? s.update : 0;
    if (!results && !progress) {
        return (
            <div className="max-w-[760px] space-y-4">
                <Card title={tc('readyToImport')}>
                    <ul className="space-y-1.5 text-[14px]">
                        <li>{b(tc('sumReady', { count: s.ready, n: fmt.number(s.ready) }))}</li>
                        <li>{b(tc('sumDraft', { count: s.draft, n: fmt.number(s.draft) }))}</li>
                        {updates > 0 && <li>{b(tc('sumUpdates', { count: updates, n: fmt.number(updates) }))}</li>}
                        {(s.skip + s.unchanged) > 0 && <li>{b(tc('sumUnchanged', { count: s.skip + s.unchanged, n: fmt.number(s.skip + s.unchanged) }))}</li>}
                        {s.error > 0 && <li className="text-red-700">{b(tc('sumErrors', { count: s.error, n: fmt.number(s.error) }))}</li>}
                        {s.photosFromFile > 0 && <li>{b(tc('sumPhotos', { count: s.photosFromFile, n: fmt.number(s.photosFromFile) }))}</li>}
                    </ul>
                    <label className="mt-4 flex items-start gap-2.5 text-[13.5px] rounded-lg ring-1 ring-line p-3 bg-surface-2/40 cursor-pointer">
                        <input type="checkbox" className="mt-0.5 accent-[#0E7C74]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                        <span>{tc('importConfirm')}</span>
                    </label>
                </Card>
                {error && <Notice tone="danger">{error}</Notice>}
            </div>
        );
    }
    if (progress && !results) {
        const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
        return (
            <Card title={tc('importing')} description={tc('importingDesc')}>
                <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={tc('importProgress')}>
                    <div className="h-full bg-teal transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-[13px] text-ink-3 tabular-nums">{tc('progressRows', { count: progress.total, done: fmt.number(progress.done) })} · {tc('progressBatch', { batch: fmt.number(progress.batch), batches: fmt.number(progress.batches) })}</p>
            </Card>
        );
    }
    return <Results results={results!} review={review} error={error} multi={multi} fileName={fileName} />;
}

function Results({ results, review, error, multi, fileName }: { results: CommitResult[]; review: Review; error: string | null; multi: boolean; fileName: string }) {
    const { t, fmt, meta } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const int = (n: number) => fmt.number(n);
    const n = (o: CommitResult['outcome']) => results.filter((r) => r.outcome === o).length;
    const pending = results.filter((r) => r.status === 'PENDING').length;
    const drafts = results.filter((r) => r.outcome === 'created' && r.status === 'DRAFT');
    const failed = results.filter((r) => r.outcome === 'failed');
    const notSent = review.rows.filter((r) => !results.some((x) => x.key === r.key));
    const withNotes = results.filter((r) => r.notes?.length);
    const tiles: [string, number, Tone][] = [[tc('resSentToReview'), pending, 'success'], [tc('resSavedAsDrafts'), drafts.length, 'warning'], [tc('resUpdated'), n('updated'), 'info'], [tc('resFailed'), failed.length, 'danger']];
    const OUTCOME: Record<string, string> = { created: 'outCreated', updated: 'outUpdated', unchanged: 'outUnchanged', skipped: 'outSkipped', failed: 'outFailed' };
    const download = () => {
        const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        const lines = [['csvSheet', 'colRow', 'colProduct', 'colBarcode', 'colResult', 'status', 'csvDetails'].map((k) => tc(k))];
        for (const r of results) lines.push([r.sheet, String(r.row), r.name, r.ean, OUTCOME[r.outcome] ? tc(OUTCOME[r.outcome]) : r.outcome, r.status || '', [...(r.reasons || []), ...(r.missing?.length ? [tc('csvMissing', { fields: r.missing.join(', ') })] : []), ...(r.notes || [])].join(' | ')]);
        for (const r of notSent) lines.push([r.sheet, String(r.row), r.name, r.ean, r.state === 'error' ? tc('outNotImported') : r.state === 'skip' ? tc('outSkipped') : tc('outUnchanged'), '', r.errors.map((e) => e.reason).join(' | ')]);
        const blob = new Blob(['﻿' + lines.map((l) => l.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `import-report-${fileName.replace(/\.[^.]+$/, '')}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    return (
        <div className="space-y-4">
            {error && <Notice tone="danger" title={tc('importStopped')}>{error}</Notice>}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {tiles.map(([l, v, tone]) => (
                    <div key={l} className="rounded-xl ring-1 ring-line p-3">
                        <p className="text-[12.5px] text-ink-3">{l}</p>
                        <p className={cn('text-[24px] font-semibold tabular-nums', v ? (tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-800' : tone === 'success' ? 'text-emerald-700' : 'text-sky-700') : 'text-ink-4')}>{int(v)}</p>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-[13.5px] text-ink-2 flex-1 min-w-[16rem]">{tc('resultLine', { created: int(n('created')), updated: int(n('updated')), kept: int(n('skipped') + n('unchanged') + notSent.filter((r) => r.state !== 'error').length), notImported: int(failed.length + notSent.filter((r) => r.state === 'error').length), count: review.summary.total })}</p>
                <Button icon={<Download size={15} />} onClick={download}>{tc('downloadReport')}</Button>
            </div>
            {drafts.length > 0 && (
                <Notice tone="warning" title={tc('draftsToFinish', { count: drafts.length })}>
                    {tc('draftsHidden', { details: topMissing(drafts, meta.intl) || tc('details') })}
                    <span className="block mt-1"><Link href="/supplier/products?status=DRAFT" className="font-medium text-teal hover:underline">{tc('openYourDrafts')}</Link></span>
                </Notice>
            )}
            {withNotes.length > 0 && (
                <details className="rounded-xl ring-1 ring-line">
                    <summary className="px-4 py-2.5 cursor-pointer text-[13px] font-semibold text-heading">{tc('rowsWithNotes', { count: withNotes.length })}</summary>
                    <ul className="divide-y divide-line max-h-[30dvh] overflow-auto">{withNotes.map((r) => <li key={r.key} className="px-4 py-2 text-[12.5px]"><b>{where(r, multi, t)}</b> · {r.name}<span className="block text-ink-3">{r.notes!.join(' ')}</span></li>)}</ul>
                </details>
            )}
            {(failed.length > 0 || notSent.some((r) => r.state === 'error')) && (
                <div className="rounded-xl ring-1 ring-red-200">
                    <p className="px-4 py-2 text-[13px] font-semibold text-red-800 bg-red-50 dark:bg-red-500/10 rounded-t-xl flex items-center gap-2"><XCircle size={15} />{tc('rowsNotImported')}</p>
                    <ul className="divide-y divide-line max-h-[36dvh] overflow-auto">
                        {[...failed.map((r) => ({ key: r.key, sheet: r.sheet, row: r.row, name: r.name, why: r.reasons?.join(' ') })), ...notSent.filter((r) => r.state === 'error').map((r) => ({ key: r.key, sheet: r.sheet, row: r.row, name: r.name, why: r.errors.map((e) => e.reason).join(' ') }))]
                            .sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row)
                            .map((r) => <li key={r.key} className="px-4 py-2 text-[12.5px]"><b className="tabular-nums">{where(r, multi, t)}</b>{r.name && ` · ${r.name}`}<span className="block text-red-700">{r.why}</span></li>)}
                    </ul>
                </div>
            )}
            {!failed.length && !error && <p className="text-[13px] text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} />{tc('everyRowSaved')}</p>}
        </div>
    );
}

/** Server-provided field labels with their counts; empty when there are none. */
function topMissing(rows: CommitResult[], intl: string) {
    const c = new Map<string, number>();
    for (const r of rows) for (const m of r.missing || []) c.set(m, (c.get(m) || 0) + 1);
    return listJoin(Array.from(c).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, k]) => `${m.toLowerCase()} (${k})`), intl);
}

/** Renders “<b>12</b> new products …” dictionary text. */
const b = (text: string) => <Trans text={text} tags={{ b: (c) => <b className="tabular-nums">{c}</b> }} />;
