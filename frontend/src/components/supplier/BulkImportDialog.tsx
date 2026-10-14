'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Download, UploadCloud, X, ChevronDown, CheckCircle2, AlertCircle, XCircle, ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { Badge, Button, Dialog, ErrorState, Notice, Skeleton, eur, int, selectCls, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'map' | 'review' | 'result';
const ACCEPT = ['.xlsx', '.xls', '.csv'];

/**
 * Bulk product import: upload → check column mapping → review every row →
 * import → honest per-row result. The guide, template and validation all
 * come from the server's import schema, so they always agree.
 */
export default function BulkImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [schema, setSchema] = React.useState<any | null>(null);
    const [step, setStep] = React.useState<Step>('upload');
    const [file, setFile] = React.useState<File | null>(null);
    const [parsed, setParsed] = React.useState<any | null>(null);
    const [mapping, setMapping] = React.useState<Record<string, string>>({});
    const [currency, setCurrency] = React.useState('EUR');
    const [moqUnit, setMoqUnit] = React.useState('CASE');
    const [review, setReview] = React.useState<any | null>(null);
    const [onExisting, setOnExisting] = React.useState<'skip' | 'update'>('skip');
    const [result, setResult] = React.useState<any | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => { if (open && !schema) supplierApi.importSchema().then(setSchema).catch((e) => setError(e.message)); }, [open, schema]);
    const reset = () => { setStep('upload'); setFile(null); setParsed(null); setMapping({}); setReview(null); setResult(null); setError(null); };
    const close = () => { if (busy === 'commit') return; reset(); onClose(); };

    const fields: any[] = schema?.fields ?? [];
    const label = (k: string) => fields.find((f) => f.key === k)?.header ?? k;

    const readFile = async (f: File) => {
        setError(null);
        const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
        if (!ACCEPT.includes(ext)) { setError(`“${f.name}” isn’t a spreadsheet. Upload .xlsx or .csv.`); return; }
        if (f.size > (schema?.maxBytes ?? 5 * 1024 * 1024)) { setError('That file is larger than 5 MB. Split it into smaller files.'); return; }
        setFile(f); setBusy('parse');
        try {
            const p = await supplierApi.importParse(f);
            setParsed(p);
            const m: Record<string, string> = {};
            for (const x of p.matches) if (x.field) m[String(x.index)] = x.field;
            setMapping(m);
            setStep('map');
        } catch (e: any) { setError(e.message); setFile(null); }
        finally { setBusy(null); }
    };

    const downloadTemplate = async (format: 'xlsx' | 'csv') => {
        setBusy('template');
        try {
            const res = await apiFetch(`/supplier-catalog/import/template?format=${format}`);
            if (!res.ok) throw new Error('Couldn’t download the template.');
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = `atlantis-product-template.${format}`; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };

    // Mapping problems that must be fixed before review.
    const usedBy = new Map<string, string[]>();
    for (const [col, f] of Object.entries(mapping)) if (f) usedBy.set(f, [...(usedBy.get(f) || []), col]);
    const dupFields = Array.from(usedBy.entries()).filter(([, cols]) => cols.length > 1);
    const unresolvedAmbiguous = (parsed?.matches ?? []).filter((m: any) => m.status === 'ambiguous' && mapping[String(m.index)] === undefined);

    const body = () => ({ headers: parsed.headers, rows: parsed.rows, mapping, currency, moqUnit, firstRow: (parsed.headerRow || 1) + 1, onExisting });

    const runReview = async () => {
        setBusy('review'); setError(null);
        try { setReview(await supplierApi.importValidate(body())); setStep('review'); }
        catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };
    const commit = async () => {
        setBusy('commit'); setError(null);
        try { setResult(await supplierApi.importCommit(body())); setStep('result'); }
        catch (e: any) { setError(`${e.message} Nothing further was imported; check your inventory before retrying — rows that were saved are skipped automatically next time.`); }
        finally { setBusy(null); }
    };

    const importable = review ? review.summary.ready + review.summary.draft + (onExisting === 'update' ? review.summary.existing : 0) : 0;

    const footer = step === 'upload' ? (
        <Button variant="secondary" onClick={close}>Cancel</Button>
    ) : step === 'map' ? (<>
        <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={reset}>Choose another file</Button>
        <span className="flex-1" />
        <Button variant="primary" loading={busy === 'review'} disabled={dupFields.length > 0 || unresolvedAmbiguous.length > 0} onClick={runReview}>Check {int(parsed?.rows?.length)} rows <ArrowRight size={15} /></Button>
    </>) : step === 'review' ? (<>
        <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => setStep('map')} disabled={busy === 'commit'}>Back to columns</Button>
        <span className="flex-1" />
        <Button variant="primary" loading={busy === 'commit'} disabled={!importable} onClick={commit}>Import {int(importable)} product{importable === 1 ? '' : 's'}</Button>
    </>) : (<>
        <Button variant="secondary" onClick={reset}>Upload another file</Button>
        <Button variant="primary" onClick={close}>Done</Button>
    </>);

    return (
        <Dialog open={open} onClose={close} size="xl" dismissable={busy !== 'commit'}
            title="Bulk product upload"
            description={step === 'upload' ? 'Upload an .xlsx or .csv file. You’ll check the columns and every row before anything is saved.'
                : step === 'map' ? `${file?.name} · ${int(parsed?.rows?.length)} rows${parsed?.truncated ? ` (first ${schema?.maxRows})` : ''} · sheet “${parsed?.sheetName}”`
                    : step === 'review' ? 'Nothing has been saved yet. Fix errors in your file, or import the valid rows now.' : 'Import finished.'}
            footer={footer}>
            <Stepper step={step} />
            {error && <div className="mb-4"><ErrorState message={error} /></div>}

            {step === 'upload' && (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0 space-y-4">
                        <DropZone busy={busy === 'parse'} file={file} onFile={readFile} />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label htmlFor="imp-cur" className="block mb-1.5 text-[13px] font-medium text-ink-2">Prices in the file are in</label>
                                <select id="imp-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
                                    {(schema?.currencies ?? ['EUR']).map((c: string) => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <p className="mt-1 text-[12px] text-ink-3">Used when a row has no Currency column. Stored in EUR.</p>
                            </div>
                            <div>
                                <label htmlFor="imp-moq" className="block mb-1.5 text-[13px] font-medium text-ink-2">MOQ is counted in</label>
                                <select id="imp-moq" value={moqUnit} onChange={(e) => setMoqUnit(e.target.value)} className={selectCls}>
                                    {(schema?.moqUnits ?? ['CASE']).map((u: string) => <option key={u} value={u}>{u.toLowerCase()}s</option>)}
                                </select>
                                <p className="mt-1 text-[12px] text-ink-3">Used when a row has no MOQ Unit column.</p>
                            </div>
                        </div>
                        <FormatGuide fields={fields} />
                    </div>
                    <aside className="space-y-3">
                        <div className="rounded-xl ring-1 ring-line p-4">
                            <p className="text-[14px] font-semibold text-heading">Start from the template</p>
                            <p className="mt-1 text-[13px] text-ink-3">Every column in the right format, with one example row and an Instructions sheet.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Button size="sm" variant="primary" icon={<Download size={14} />} loading={busy === 'template'} onClick={() => downloadTemplate('xlsx')}>Excel template</Button>
                                <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => downloadTemplate('csv')}>CSV</Button>
                            </div>
                        </div>
                        <div className="rounded-xl ring-1 ring-line p-4 text-[13px] text-ink-2">
                            <p className="font-semibold text-heading">Using Google Sheets?</p>
                            <p className="mt-1 text-ink-3">Open your sheet → <b>File</b> → <b>Download</b> → <b>Microsoft Excel (.xlsx)</b> or <b>CSV</b>, then upload that file here.</p>
                        </div>
                        <div className="rounded-xl ring-1 ring-line p-4 text-[13px] text-ink-3">
                            <p className="font-semibold text-heading">How products are saved</p>
                            <ul className="mt-1 space-y-1 list-disc ps-4">
                                <li>Complete rows go to Atlantis review.</li>
                                <li>Rows missing details (often a photo) are saved as drafts for you to finish.</li>
                                <li>Rows with invalid values are skipped — nothing is guessed.</li>
                                <li>A barcode already in your catalog is never duplicated.</li>
                            </ul>
                        </div>
                    </aside>
                </div>
            )}

            {step === 'map' && parsed && (
                <MappingStep parsed={parsed} fields={fields} mapping={mapping} setMapping={setMapping} dupFields={dupFields} label={label} />
            )}

            {step === 'review' && review && <ReviewStep review={review} onExisting={onExisting} setOnExisting={setOnExisting} />}

            {step === 'result' && result && <ResultStep result={result} />}
        </Dialog>
    );
}

function Stepper({ step }: { step: Step }) {
    const steps: [Step, string][] = [['upload', 'Upload'], ['map', 'Columns'], ['review', 'Review'], ['result', 'Result']];
    const at = steps.findIndex(([s]) => s === step);
    return (
        <ol className="flex items-center gap-2 mb-4 text-[12.5px]" aria-label="Progress">
            {steps.map(([s, l], i) => (
                <li key={s} className="flex items-center gap-2" aria-current={i === at ? 'step' : undefined}>
                    <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold', i < at ? 'bg-teal text-white' : i === at ? 'bg-heading text-white' : 'ring-1 ring-line-strong text-ink-4')}>{i + 1}</span>
                    <span className={cn(i === at ? 'font-semibold text-heading' : 'text-ink-3')}>{l}</span>
                    {i < steps.length - 1 && <span className="w-6 h-px bg-line-strong" aria-hidden />}
                </li>
            ))}
        </ol>
    );
}

function DropZone({ onFile, busy, file }: { onFile: (f: File) => void; busy: boolean; file: File | null }) {
    const input = React.useRef<HTMLInputElement>(null);
    const [over, setOver] = React.useState(false);
    const depth = React.useRef(0);
    return (
        <div
            role="button" tabIndex={0} aria-label="Upload a spreadsheet: drop a file here or press Enter to choose one"
            onClick={() => !busy && input.current?.click()}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.current?.click(); } }}
            onDragEnter={(e) => { e.preventDefault(); depth.current++; setOver(true); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={(e) => { e.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
            onDrop={(e) => { e.preventDefault(); depth.current = 0; setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onFile(f); }}
            data-testid="import-dropzone"
            className={cn('flex flex-col items-center justify-center text-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                over ? 'border-teal bg-teal-soft' : 'border-line-strong bg-surface-2/50 hover:bg-surface-2')}>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
            <span className="w-11 h-11 rounded-xl bg-surface ring-1 ring-line flex items-center justify-center text-teal">{busy ? <span className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full animate-spin" /> : <UploadCloud size={21} />}</span>
            {busy ? <p className="text-[14px] font-medium text-heading">Reading {file?.name}…</p> : (<>
                <p className="text-[14px] font-semibold text-heading">{over ? 'Drop to upload' : 'Drag a spreadsheet here, or click to choose'}</p>
                <p className="text-[12.5px] text-ink-3">.xlsx or .csv · up to 5 MB · up to 1,000 rows</p>
            </>)}
        </div>
    );
}

function FormatGuide({ fields }: { fields: any[] }) {
    const [open, setOpen] = React.useState(false);
    const req = fields.filter((f) => f.required !== 'no');
    const opt = fields.filter((f) => f.required === 'no');
    return (
        <div className="rounded-xl ring-1 ring-line">
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded-xl">
                <FileSpreadsheet size={18} className="text-teal shrink-0" />
                <span className="flex-1">
                    <span className="block text-[14px] font-semibold text-heading">Spreadsheet format</span>
                    <span className="block text-[12.5px] text-ink-3">{fields.filter((f) => f.required === 'yes').length} required · price and stock in either of two forms · {opt.length} optional · English or Arabic column names</span>
                </span>
                <ChevronDown size={17} className={cn('text-ink-3 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
                <div className="border-t border-line overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead>
                            <tr className="bg-surface-2/60 text-ink-3">
                                <th className="text-start font-medium px-4 py-2">Column</th>
                                <th className="text-start font-medium px-2 py-2">What to enter</th>
                                <th className="text-start font-medium px-2 py-2">Example</th>
                                <th className="text-start font-medium px-4 py-2 hidden md:table-cell">Also recognised</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...req, ...opt].map((f) => (
                                <tr key={f.key} className="border-t border-line align-top">
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className="font-medium text-ink">{f.header}</span>
                                        <span className="block mt-0.5">{f.required === 'yes' ? <Badge tone="danger">Required</Badge> : f.required === 'one-of' ? <Badge tone="warning">One of two</Badge> : <Badge>Optional</Badge>}</span>
                                    </td>
                                    <td className="px-2 py-2 text-ink-2 min-w-[220px]">{f.description}</td>
                                    <td className="px-2 py-2 font-mono text-ink whitespace-nowrap">{f.example || '—'}</td>
                                    <td className="px-4 py-2 text-ink-3 hidden md:table-cell">{f.aliases.slice(0, 5).join(', ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="px-4 py-3 border-t border-line text-[12.5px] text-ink-3">“One of two”: give either Price per Case or Price per Piece, and either Stock (cases) or Stock (pieces). A plain “Price” or “Quantity” column is never guessed — you choose what it means on the next step.</p>
                </div>
            )}
        </div>
    );
}

const MATCH_TONE: Record<string, { tone: Tone; label: string }> = {
    matched: { tone: 'success', label: 'Matched' }, ambiguous: { tone: 'warning', label: 'Choose' }, duplicate: { tone: 'warning', label: 'Duplicate' },
    unmatched: { tone: 'neutral', label: 'Not recognised' }, empty: { tone: 'neutral', label: 'Empty header' }, manual: { tone: 'brand', label: 'Set by you' },
};

function MappingStep({ parsed, fields, mapping, setMapping, dupFields, label }: any) {
    const requiredMissing = fields.filter((f: any) => f.required === 'yes' && !Object.values(mapping).includes(f.key));
    const groups = ['price', 'stock'].filter((g) => !fields.some((f: any) => f.group === g && Object.values(mapping).includes(f.key)));
    return (
        <div className="space-y-3">
            {dupFields.length > 0 && <Notice tone="danger" title="Two columns point to the same field">{dupFields.map(([f]: any) => label(f)).join(', ')} — set one of them to “Don’t import”.</Notice>}
            {(requiredMissing.length > 0 || groups.length > 0) && (
                <Notice tone="warning" title="Some required information has no column">
                    {[...requiredMissing.map((f: any) => f.header), ...groups.map((g: string) => (g === 'price' ? 'a price' : 'stock'))].join(', ')}. You can still import — those products will be saved as drafts for you to complete.
                </Notice>
            )}
            <div className="overflow-x-auto rounded-xl ring-1 ring-line">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="bg-surface-2/60 text-ink-3 text-[12px]">
                            <th className="text-start font-medium px-4 py-2">Column in your file</th>
                            <th className="text-start font-medium px-2 py-2">Sample values</th>
                            <th className="text-start font-medium px-2 py-2">Import as</th>
                            <th className="text-start font-medium px-4 py-2">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {parsed.matches.map((m: any) => {
                            const col = String(m.index);
                            const value = mapping[col];
                            const manual = value !== undefined && value !== (m.field ?? undefined);
                            const st = manual ? 'manual' : m.status;
                            const samples = parsed.rows.slice(0, 3).map((r: string[]) => r[m.index]).filter(Boolean);
                            return (
                                <tr key={col} className="border-t border-line align-top">
                                    <td className="px-4 py-2 font-medium text-ink whitespace-nowrap">{m.header || <span className="text-ink-4">(no name)</span>}</td>
                                    <td className="px-2 py-2 text-ink-3 max-w-[260px]"><span className="line-clamp-2 break-all">{samples.join(' · ') || '—'}</span></td>
                                    <td className="px-2 py-2 min-w-[200px]">
                                        <select aria-label={`Import column ${m.header} as`} value={value ?? ''} className={cn(selectCls, 'h-9')}
                                            onChange={(e) => setMapping((prev: any) => { const n = { ...prev }; if (e.target.value) n[col] = e.target.value; else n[col] = ''; return n; })}>
                                            <option value="">Don’t import</option>
                                            {(m.candidates?.length && m.status === 'ambiguous' ? fields.filter((f: any) => m.candidates.includes(f.key)) : fields).map((f: any) => <option key={f.key} value={f.key}>{f.header}{f.required === 'yes' ? ' *' : ''}</option>)}
                                            {m.status === 'ambiguous' && <option disabled>──────────</option>}
                                            {m.status === 'ambiguous' && fields.filter((f: any) => !m.candidates.includes(f.key)).map((f: any) => <option key={'o' + f.key} value={f.key}>{f.header}</option>)}
                                        </select>
                                        {m.status === 'ambiguous' && value === undefined && <p className="mt-1 text-[12px] text-amber-800">{m.note}</p>}
                                    </td>
                                    <td className="px-4 py-2"><Badge tone={MATCH_TONE[st]?.tone ?? 'neutral'}>{MATCH_TONE[st]?.label ?? st}</Badge>{(m.status === 'duplicate' || m.status === 'unmatched') && !manual && <p className="mt-1 text-[12px] text-ink-3 max-w-[220px]">{m.note}</p>}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-[12.5px] text-ink-3 flex items-start gap-1.5"><Info size={14} className="mt-0.5 shrink-0" />Columns set to “Don’t import” are left out. Nothing is saved until the last step.</p>
        </div>
    );
}

const ROW_STATE: Record<string, { tone: Tone; label: string; icon: React.ReactNode }> = {
    ready: { tone: 'success', label: 'Ready for review', icon: <CheckCircle2 size={13} /> },
    draft: { tone: 'warning', label: 'Saved as draft', icon: <AlertCircle size={13} /> },
    error: { tone: 'danger', label: 'Will be skipped', icon: <XCircle size={13} /> },
};

function ReviewStep({ review, onExisting, setOnExisting }: any) {
    const [filter, setFilter] = React.useState<'all' | 'ready' | 'draft' | 'error' | 'existing'>('all');
    const s = review.summary;
    const rows = review.rows.filter((r: any) => filter === 'all' || (filter === 'existing' ? r.existing && r.state !== 'error' : r.state === filter && !(filter !== 'error' && r.existing)));
    const tabs: [typeof filter, string, number][] = [['all', 'All rows', s.total], ['ready', 'Ready', s.ready], ['draft', 'Drafts', s.draft], ['error', 'Errors', s.error], ['existing', 'Already in catalog', s.existing]];
    return (
        <div className="space-y-3">
            {review.mappingWarnings?.length > 0 && <Notice tone="warning">{review.mappingWarnings.map((w: string) => <p key={w}>{w}</p>)}</Notice>}
            {s.existing > 0 && (
                <div className="rounded-xl ring-1 ring-line p-3 flex flex-wrap items-center gap-3 text-[13px]">
                    <span className="text-ink-2"><b>{s.existing}</b> row{s.existing === 1 ? ' has a barcode' : 's have barcodes'} already in your catalog.</span>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name="exist" checked={onExisting === 'skip'} onChange={() => setOnExisting('skip')} className="accent-[#0E7C74]" /> Skip them</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name="exist" checked={onExisting === 'update'} onChange={() => setOnExisting('update')} className="accent-[#0E7C74]" /> Update them with the file’s values</label>
                    {onExisting === 'update' && <span className="text-[12px] text-ink-3 w-full">Only filled cells are applied; empty cells never clear saved data. Changing name, brand, barcode or photos sends a live product back to review.</span>}
                </div>
            )}
            <div role="tablist" className="flex gap-1 overflow-x-auto">
                {tabs.map(([id, l, n]) => (
                    <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                        className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap', filter === id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                        {l} <span className={cn('ms-1 tabular-nums', filter === id ? 'text-white/70' : 'text-ink-4')}>{n}</span>
                    </button>
                ))}
            </div>
            <div className="overflow-auto max-h-[52dvh] rounded-xl ring-1 ring-line">
                <table className="w-full text-[12.5px]">
                    <thead className="sticky top-0 z-10 bg-surface-2">
                        <tr className="text-ink-3 text-[12px]">
                            {['Row', 'Status', 'Product', 'Brand', 'Barcode', 'Category', 'Price/case (EUR)', 'Stock (cases)', 'Origin', 'EXW', 'Weight', 'Photo'].map((h) => <th key={h} className="text-start font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r: any) => {
                            const st = ROW_STATE[r.state];
                            const bad = (f: string) => r.errors.some((e: any) => e.field === f) ? 'text-red-700 font-medium' : r.missing.some((e: any) => e.field === f) ? 'text-amber-800' : '';
                            const cell = (v: any, f: string) => <span className={bad(f)}>{v === null || v === undefined || v === '' ? (r.missing.some((e: any) => e.field === f) || r.errors.some((e: any) => e.field === f) ? 'Missing' : '—') : v}</span>;
                            return (
                                <React.Fragment key={r.row}>
                                    <tr className="border-t border-line align-top">
                                        <td className="px-3 py-2 tabular-nums text-ink-3">{r.row}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <Badge tone={st.tone}>{st.icon}{st.label}</Badge>
                                            {r.existing && <span className="block mt-1 text-[11.5px] text-ink-3">In catalog: {r.existing.name.slice(0, 28)}</span>}
                                        </td>
                                        <td className="px-3 py-2 max-w-[220px]"><span className={cn('line-clamp-2', bad('name'))}>{r.name || 'Missing'}</span></td>
                                        <td className="px-3 py-2">{cell(r.brand, 'brand')}</td>
                                        <td className="px-3 py-2 font-mono">{cell(r.ean, 'ean')}</td>
                                        <td className="px-3 py-2">{cell(r.category, 'category')}</td>
                                        <td className="px-3 py-2 tabular-nums">{cell(r.priceEur !== null ? eur(r.priceEur) : null, 'price')}</td>
                                        <td className="px-3 py-2 tabular-nums">{cell(r.stock !== null ? int(r.stock) : null, 'stock')}</td>
                                        <td className="px-3 py-2">{cell(r.origin, 'origin')}</td>
                                        <td className="px-3 py-2 max-w-[140px] truncate">{cell(r.exwLocation, 'exwLocation')}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{cell(r.weight, 'weight')}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{r.imageStatus === 'from_file' ? <Badge tone="neutral">From file</Badge> : <Badge tone="warning">Missing</Badge>}</td>
                                    </tr>
                                    {(r.errors.length > 0 || r.missing.length > 0 || r.warnings.length > 0) && (
                                        <tr className="bg-surface-2/40">
                                            <td />
                                            <td colSpan={11} className="px-3 pb-2 text-[12px]">
                                                {r.errors.map((e: any, i: number) => <p key={'e' + i} className="text-red-700">✕ {e.reason}</p>)}
                                                {r.missing.length > 0 && <p className="text-amber-800">Draft until added: {r.missing.map((m: any) => m.label.toLowerCase()).join(', ')}.</p>}
                                                {r.warnings.map((w: string, i: number) => <p key={'w' + i} className="text-ink-3">ⓘ {w}</p>)}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {!rows.length && <tr><td colSpan={12} className="px-3 py-8 text-center text-ink-3">No rows in this view.</td></tr>}
                    </tbody>
                </table>
            </div>
            <p className="text-[12.5px] text-ink-3">{s.missingImages > 0 && `${s.missingImages} row${s.missingImages === 1 ? ' has' : 's have'} no photo — after importing you can find photos by barcode or upload your own. `}Rows with errors are not imported; fix them in your file and upload it again (already-imported barcodes are skipped).</p>
        </div>
    );
}

function ResultStep({ result }: { result: any }) {
    const s = result.summary;
    const needImage = result.results.filter((r: any) => r.outcome === 'created' && r.imageMissing);
    const failed = result.results.filter((r: any) => r.outcome === 'failed');
    const tiles: [string, number, Tone][] = [['Sent to review', s.pendingReview, 'success'], ['Saved as drafts', s.drafts, 'warning'], ['Skipped (already in catalog)', s.skipped, 'neutral'], ['Failed', s.failed, 'danger']];
    return (
        <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {tiles.map(([l, n, tone]) => (
                    <div key={l} className="rounded-xl ring-1 ring-line p-3">
                        <p className="text-[12.5px] text-ink-3">{l}</p>
                        <p className={cn('text-[22px] font-semibold tabular-nums', n ? (tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-800' : tone === 'success' ? 'text-emerald-700' : 'text-heading') : 'text-ink-4')}>{int(n)}</p>
                    </div>
                ))}
            </div>
            <p className="text-[13px] text-ink-2">{s.created} created{s.updated ? `, ${s.updated} updated` : ''} out of {s.total} rows. These figures are what was actually saved.</p>
            {needImage.length > 0 && (
                <Notice tone="warning" title={`${needImage.length} product${needImage.length === 1 ? '' : 's'} need a photo`}>
                    They’re saved as drafts and stay hidden from buyers. Open each one to find a photo by barcode (you approve it) or upload your own.
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                        {needImage.slice(0, 20).map((r: any) => <li key={r.productId}><Link href={`/supplier/products/${r.productId}/edit#media`} className="text-teal hover:underline">{r.name || r.ean}</Link></li>)}
                    </ul>
                    {needImage.length > 20 && <p className="mt-1"><Link href="/supplier/products?status=DRAFT" className="text-teal hover:underline">See all drafts</Link></p>}
                </Notice>
            )}
            {failed.length > 0 && (
                <div className="rounded-xl ring-1 ring-red-200">
                    <p className="px-4 py-2 text-[13px] font-semibold text-red-800 bg-red-50 rounded-t-xl">Rows not imported</p>
                    <ul className="divide-y divide-line max-h-[30dvh] overflow-auto">
                        {failed.map((r: any) => (
                            <li key={r.row} className="px-4 py-2 text-[12.5px]"><b className="tabular-nums">Row {r.row}</b> {r.name && `· ${r.name}`}<span className="block text-red-700">{r.reasons?.join(' ')}</span></li>
                        ))}
                    </ul>
                </div>
            )}
            {!result.results.length && <Skeleton className="h-8" />}
        </div>
    );
}
