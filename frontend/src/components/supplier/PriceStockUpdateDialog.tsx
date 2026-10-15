'use client';

import * as React from 'react';
import { Download, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { DropZone } from '@/components/supplier/DropZone';
import { Badge, Button, Dialog, ErrorState, Notice, int, useConfirm } from '@/components/supplier/ui';
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
    const reset = () => { setStep('upload'); setFile(null); setParsed(null); setPreview(null); setResult(null); setError(null); };
    const close = () => { if (busy === 'commit') return; reset(); onClose(); };

    const download = async (blank: boolean) => {
        setBusy(blank ? 'blank' : 'template');
        try {
            const res = await apiFetch(`/supplier-catalog/updates/template${blank ? '?blank=1' : ''}`);
            if (!res.ok) throw new Error(blank ? 'Couldn’t download the template.' : 'Couldn’t download your catalog.');
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
        const ok = await confirm({ title: `Apply ${n} change${n === 1 ? '' : 's'}?`, body: 'Prices (and stock, where you changed it) of these products are updated now. Live listings show the new price to buyers straight away, and every change is recorded in the product’s history.', confirm: 'Apply changes' });
        if (!ok) return;
        setBusy('commit'); setError(null);
        try { setResult(await supplierApi.updatesCommit({ headers: parsed.headers, rows: parsed.rows, firstRow: (parsed.headerRow || 1) + 1, fileName: file?.name })); setStep('done'); }
        catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };
    const fmt = (v: number | null, cur?: string) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}${cur ? ` ${cur}` : ''}`);
    const s = preview?.summary;

    return (
        <Dialog open={open} onClose={close} size="xl" dismissable={busy !== 'commit'} title="Update prices & stock"
            description={step === 'upload' ? 'For products already in your catalog. Nothing is created and empty cells keep the current value.' : step === 'review' ? `${file?.name} · nothing has changed yet` : 'Update finished'}
            footer={step === 'upload' ? <Button variant="secondary" onClick={close}>Cancel</Button>
                : step === 'review' ? <><Button variant="ghost" onClick={reset}>Choose another file</Button><span className="flex-1" /><Button variant="primary" loading={busy === 'commit'} disabled={!s?.changes} onClick={apply}>Apply {int(s?.changes)} change{s?.changes === 1 ? '' : 's'}</Button></>
                    : <Button variant="primary" onClick={close}>Done</Button>}>
            {error && <div className="mb-3"><ErrorState message={error} /></div>}
            {step === 'upload' && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <DropZone busy={busy === 'parse'} file={file} onFile={read} />
                    <div className="rounded-xl ring-1 ring-line p-4 text-[13px] text-ink-2 space-y-2">
                        <p className="rounded-lg bg-teal-soft/60 px-3 py-2 text-ink"><b>Recommended:</b> Download your existing catalog, update the required price values, and upload the file. Keep product identifiers unchanged so every update matches the correct product.</p>
                        <p className="pt-1 font-semibold text-heading">1. Download your catalog</p>
                        <p className="text-ink-3">Every product with its Atlantis ID, barcode, currency and current price per case. Type new prices in <b>New Price per Case</b> — no need to retype anything else.</p>
                        <Button size="sm" variant="primary" icon={<Download size={14} />} loading={busy === 'template'} onClick={() => download(false)}>Download existing catalog</Button>
                        <p className="text-ink-3">Or build your own list: <button type="button" className="font-semibold text-teal hover:underline disabled:opacity-50 inline-flex items-center gap-1" disabled={!!busy} onClick={() => download(true)}><FileSpreadsheet size={13} />download the blank update template</button> and add the Atlantis ID (or EAN) of each product you change.</p>
                        <p className="pt-2 font-semibold text-heading">2. Edit prices (and stock if needed)</p>
                        <p className="text-ink-3">Prices are per case, in each product’s own currency. Empty cells change nothing; “Current …” columns are for reference and are never applied. Stock changes only if you fill <b>New Stock (cases)</b>.</p>
                        <p className="pt-2 font-semibold text-heading">3. Upload the updated spreadsheet</p>
                        <p className="text-ink-3">You’ll see every change and any problem before anything is saved. Products are never created from this file.</p>
                    </div>
                </div>
            )}
            {step === 'review' && preview && (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-[13px]"><Badge tone="brand">{int(s.changes)} to change</Badge><Badge>{int(s.unchanged)} unchanged</Badge>{s.errors > 0 && <Badge tone="danger">{int(s.errors)} with errors (skipped)</Badge>}</div>
                    {s.errors > 0 && <Notice tone="warning">Rows with errors are skipped. Fix them in the file and upload again if you need them.</Notice>}
                    <div className="overflow-auto max-h-[55dvh] rounded-xl ring-1 ring-line">
                        <table className="w-full text-[12.5px]">
                            <thead className="sticky top-0 bg-surface-2"><tr className="text-ink-3">{['Row', 'Product', 'Price per case', 'Stock (cases)', 'What changes'].map((h) => <th key={h} className="text-start font-medium px-3 py-2">{h}</th>)}</tr></thead>
                            <tbody>
                                {preview.rows.map((r: any) => (
                                    <tr key={r.row} className={cn('border-t border-line align-top', r.state === 'unchanged' && 'text-ink-4')}>
                                        <td className="px-3 py-2 tabular-nums">{r.row}</td>
                                        <td className="px-3 py-2 max-w-[260px]"><span className="line-clamp-1">{r.name || '—'}</span><span className="block font-mono text-ink-3">{r.ean || ''}</span></td>
                                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.price.changed ? <>{fmt(r.price.before, r.price.currencyBefore)} <ArrowRight size={12} className="inline" /> <b>{fmt(r.price.after, r.price.currency)}</b></> : fmt(r.price.before, r.price.currencyBefore)}</td>
                                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.stock.changed ? <>{int(r.stock.before)} <ArrowRight size={12} className="inline" /> <b>{int(r.stock.after)}</b></> : int(r.stock.before)}</td>
                                        <td className="px-3 py-2">{r.state === 'error' ? <span className="text-red-700">{r.errors.join(' ')}</span> : r.state === 'change' ? <Badge tone="brand">{(r.fields || []).map((f: string) => (f === 'price' ? 'Price' : 'Stock')).join(' + ') || 'Will update'}</Badge> : 'No change'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[12px] text-ink-3">Price and stock changes on live products apply immediately (no new review). Each change is recorded in the product’s history.</p>
                </div>
            )}
            {step === 'done' && result && (
                <div className="space-y-3 text-[14px]">
                    <p><b>{int(result.summary.updated)}</b> updated · {int(result.summary.unchanged)} unchanged · <span className={result.summary.failed ? 'text-red-700' : ''}>{int(result.summary.failed)} failed</span> — these are the changes actually saved.</p>
                    {result.results.filter((x: any) => x.outcome === 'failed').map((x: any) => <p key={x.row} className="text-[13px] text-red-700">Row {x.row}{x.name ? ` · ${x.name}` : ''}: {x.reasons?.join(' ')}</p>)}
                </div>
            )}
        </Dialog>
    );
}
