'use client';

import * as React from 'react';
import { Download, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { DropZone } from '@/components/supplier/DropZone';
import { Badge, Button, Dialog, ErrorState, Notice, useConfirm } from '@/components/supplier/ui';
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

/**
 * Update prices and stock of EXISTING products from a spreadsheet:
 * download your catalog → edit → upload → check every before/after → apply.
 * Nothing is created; empty cells change nothing; each change is logged.
 */
export default function PriceStockUpdateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [step, setStep] = React.useState<'upload' | 'review' | 'done'>('upload');
    const [file, setFile] = React.useState<File | null>(null);
    const [parsed, setParsed] = React.useState<any | null>(null);
    const [preview, setPreview] = React.useState<any | null>(null);
    const [result, setResult] = React.useState<any | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const confirm = useConfirm();
    const { t, fmt: f } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : f.number(n));
    const reset = () => { setStep('upload'); setFile(null); setParsed(null); setPreview(null); setResult(null); setError(null); };
    const close = () => { if (busy === 'commit') return; reset(); onClose(); };

    const download = async (blank: boolean) => {
        setBusy(blank ? 'blank' : 'template');
        try {
            const res = await apiFetch(`/supplier-catalog/updates/template${blank ? '?blank=1' : ''}`);
            if (!res.ok) throw new Error(blank ? tc('errTemplateDownload') : tc('errCatalogDownload'));
            const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = blank ? 'atlantis-price-update-template.xlsx' : 'atlantis-my-catalog-prices.xlsx'; a.click();
        } catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };
    const read = async (f: File) => {
        setError(null); setFile(f); setBusy('parse');
        try {
            const p = await supplierApi.importParse(f);
            setParsed(p);
            setPreview(await supplierApi.updatesPreview({ headers: p.headers, rows: p.rows, firstRow: (p.headerRow || 1) + 1, fileName: f.name }));
            setStep('review');
        } catch (e: any) { setError(e.message); setFile(null); } finally { setBusy(null); }
    };
    const apply = async () => {
        const n = s?.changes ?? 0;
        const ok = await confirm({ title: tc('applyChangesTitle', { count: n }), body: tc('applyChangesBody'), confirm: tc('applyChanges') });
        if (!ok) return;
        setBusy('commit'); setError(null);
        try { setResult(await supplierApi.updatesCommit({ headers: parsed.headers, rows: parsed.rows, firstRow: (parsed.headerRow || 1) + 1, fileName: file?.name })); setStep('done'); }
        catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };
    const fmt = (v: number | null, cur?: string) => (v === null || v === undefined ? '—' : `${f.number(Number(v), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ''}`);
    const s = preview?.summary;

    return (
        <Dialog open={open} onClose={close} size="xl" dismissable={busy !== 'commit'} title={tc('updatePricesStock')}
            description={step === 'upload' ? tc('updDescUpload') : step === 'review' ? tc('updDescReview', { file: file?.name ?? '' }) : tc('updDescDone')}
            footer={step === 'upload' ? <Button variant="secondary" onClick={close}>{tc('cancel')}</Button>
                : step === 'review' ? <><Button variant="ghost" onClick={reset}>{tc('chooseAnotherFile')}</Button><span className="flex-1" /><Button variant="primary" loading={busy === 'commit'} disabled={!s?.changes} onClick={apply}>{tc('applyNChanges', { count: s?.changes ?? 0 })}</Button></>
                    : <Button variant="primary" onClick={close}>{tc('done')}</Button>}>
            {error && <div className="mb-3"><ErrorState message={error} /></div>}
            {step === 'upload' && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <DropZone busy={busy === 'parse'} file={file} onFile={read} />
                    <div className="rounded-xl ring-1 ring-line p-4 text-[13px] text-ink-2 space-y-2">
                        <p className="rounded-lg bg-teal-soft/60 px-3 py-2 text-ink"><Trans text={tc('updRecommended')} tags={{ b: (c) => <b>{c}</b> }} /></p>
                        <p className="pt-1 font-semibold text-heading">{tc('updStep1')}</p>
                        <p className="text-ink-3"><Trans text={tc('updStep1Body')} tags={{ col: (c) => <b dir="ltr">{c}</b> }} /></p>
                        <Button size="sm" variant="primary" icon={<Download size={14} />} loading={busy === 'template'} onClick={() => download(false)}>{tc('downloadExistingCatalog')}</Button>
                        <p className="text-ink-3"><Trans text={tc('updOwnList')} tags={{ link: (c) => <button type="button" className="font-semibold text-teal hover:underline disabled:opacity-50 inline-flex items-center gap-1" disabled={!!busy} onClick={() => download(true)}><FileSpreadsheet size={13} />{c}</button> }} /></p>
                        <p className="pt-2 font-semibold text-heading">{tc('updStep2')}</p>
                        <p className="text-ink-3"><Trans text={tc('updStep2Body')} tags={{ col: (c) => <b dir="ltr">{c}</b> }} /></p>
                        <p className="pt-2 font-semibold text-heading">{tc('updStep3')}</p>
                        <p className="text-ink-3">{tc('updStep3Body')}</p>
                    </div>
                </div>
            )}
            {step === 'review' && preview && (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-[13px]"><Badge tone="brand">{tc('nToChange', { count: s.changes })}</Badge><Badge>{tc('nUnchanged', { count: s.unchanged })}</Badge>{s.errors > 0 && <Badge tone="danger">{tc('nWithErrorsSkipped', { count: s.errors })}</Badge>}</div>
                    {s.errors > 0 && <Notice tone="warning">{tc('rowsWithErrorsSkipped')}</Notice>}
                    <div className="overflow-auto max-h-[55dvh] rounded-xl ring-1 ring-line">
                        <table className="w-full text-[12.5px]">
                            <thead className="sticky top-0 bg-surface-2"><tr className="text-ink-3">{['colRow', 'colProduct', 'colPricePerCaseLong', 'colStockCases', 'colWhatChanges'].map((h) => <th key={h} className="text-start font-medium px-3 py-2">{tc(h)}</th>)}</tr></thead>
                            <tbody>
                                {preview.rows.map((r: any) => (
                                    <tr key={r.row} className={cn('border-t border-line align-top', r.state === 'unchanged' && 'text-ink-4')}>
                                        <td className="px-3 py-2 tabular-nums">{f.number(r.row)}</td>
                                        <td className="px-3 py-2 max-w-[260px]"><span className="line-clamp-1">{r.name || '—'}</span><span className="block font-mono text-ink-3">{r.ean || ''}</span></td>
                                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.price.changed ? <>{fmt(r.price.before, r.price.currencyBefore)} <ArrowRight size={12} className="inline rtl:rotate-180" /> <b>{fmt(r.price.after, r.price.currency)}</b></> : fmt(r.price.before, r.price.currencyBefore)}</td>
                                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.stock.changed ? <>{int(r.stock.before)} <ArrowRight size={12} className="inline rtl:rotate-180" /> <b>{int(r.stock.after)}</b></> : int(r.stock.before)}</td>
                                        <td className="px-3 py-2">{r.state === 'error' ? <span className="text-red-700">{r.errors.join(' ')}</span> : r.state === 'change' ? <Badge tone="brand">{(r.fields || []).map((x: string) => (x === 'price' ? tc('priceTitle') : tc('stock'))).join(' + ') || tc('willUpdate')}</Badge> : tc('noChange')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[12px] text-ink-3">{tc('updLiveNote')}</p>
                </div>
            )}
            {step === 'done' && result && (
                <div className="space-y-3 text-[14px]">
                    <p><Trans text={tc('updResult', { updated: int(result.summary.updated), unchanged: int(result.summary.unchanged), failed: int(result.summary.failed) })} tags={{ b: (c) => <b>{c}</b>, bad: (c) => <span className={result.summary.failed ? 'text-red-700' : ''}>{c}</span> }} /></p>
                    {result.results.filter((x: any) => x.outcome === 'failed').map((x: any) => <p key={x.row} className="text-[13px] text-red-700">{tc('whereRow', { row: x.row })}{x.name ? ` · ${x.name}` : ''}: {x.reasons?.join(' ')}</p>)}
                </div>
            )}
        </Dialog>
    );
}
