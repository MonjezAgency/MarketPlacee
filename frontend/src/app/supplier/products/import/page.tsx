'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronLeft, Download, FileSpreadsheet } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { CATEGORIES_LIST } from '@/lib/products';
import { batchRows, prepareWorkbook, type PreparedFile } from '@/lib/import-file';
import { Button, Card, ErrorState, PageHeader } from '@/components/supplier/ui';
import { DropZone } from '@/components/supplier/DropZone';
import MapStep, { mappingProblems, type MapState } from '@/components/supplier/import/MapStep';
import ReviewStep from '@/components/supplier/import/ReviewStep';
import ImportStep, { type Progress } from '@/components/supplier/import/ImportStep';
import { expandReview, type Analysis, type CommitResult, type FieldDef, type Review, type ReviewRow } from '@/components/supplier/import/types';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'map' | 'review' | 'import';
const STEPS: [Step, string][] = [['upload', 'Upload'], ['map', 'Match columns'], ['review', 'Review'], ['import', 'Confirm & import']];
/** Uploads pass through a proxy that accepts at most ~4.5 MB per request. */
const MAX_UPLOAD = 4 * 1024 * 1024;
const MAX_PHOTO_IN_REQUEST = 3.5 * 1024 * 1024;

/**
 * Supplier bulk import: upload any product sheet → match its columns to
 * Atlantis fields (with the evidence for each suggestion) → review every row
 * against the original cells → confirm → import in batches with a report.
 */
export default function ImportProductsPage() {
    const [schema, setSchema] = React.useState<any | null>(null);
    const [prefCurrency, setPrefCurrency] = React.useState('EUR');
    const [step, setStep] = React.useState<Step>('upload');
    const [file, setFile] = React.useState<File | null>(null);
    const [prepared, setPrepared] = React.useState<PreparedFile | null>(null);
    const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
    const [map, setMap] = React.useState<MapState | null>(null);
    const [review, setReview] = React.useState<Review | null>(null);
    const [onExisting, setOnExisting] = React.useState<'skip' | 'update'>('skip');
    const [confirmed, setConfirmed] = React.useState(false);
    const [progress, setProgress] = React.useState<Progress | null>(null);
    const [results, setResults] = React.useState<CommitResult[] | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const urls = React.useRef(new Map<string, string>());

    React.useEffect(() => { supplierApi.importSchema().then(setSchema).catch((e) => setError(e.message)); }, []);
    React.useEffect(() => { supplierApi.preferences().then((p) => setPrefCurrency(p.effectiveCurrency)).catch(() => {}); }, []);
    const dropUrls = () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); urls.current.clear(); };
    React.useEffect(() => dropUrls, []);
    // Don't lose an import in progress to an accidental tab close.
    React.useEffect(() => {
        if (busy !== 'commit') return;
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [busy]);

    // Each step starts at the top (the hub scrolls inside <main>, which scrolls smoothly by default).
    const top = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const scroller = top.current?.closest('main');
        if (scroller) scroller.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }, [step, results]);

    const fields: FieldDef[] = schema?.allFields ?? [];
    const photoUrl = React.useCallback((path: string) => {
        if (!prepared) return undefined;
        let u = urls.current.get(path);
        const blob = prepared.photos.get(path);
        if (!u && blob) { u = URL.createObjectURL(blob); urls.current.set(path, u); }
        return u;
    }, [prepared]);

    const reset = () => { dropUrls(); setStep('upload'); setFile(null); setPrepared(null); setAnalysis(null); setMap(null); setReview(null); setResults(null); setProgress(null); setConfirmed(false); setError(null); setOnExisting('skip'); };

    const readFile = async (f: File) => {
        setError(null);
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) { setError(`“${f.name}” isn’t a spreadsheet. Upload an .xlsx, .xls or .csv file.`); return; }
        reset(); setFile(f); setBusy('analyse');
        try {
            const prep = await prepareWorkbook(f);
            if (prep.upload.size > MAX_UPLOAD) throw new Error(`Without its pictures this file is still ${(prep.upload.size / 1048576).toFixed(1)} MB; the limit is 4 MB. Split it into smaller files${ext !== 'xlsx' ? ' or save it as .xlsx' : ''}.`);
            const a: Analysis = await supplierApi.importAnalyse(prep.upload, prep.uploadName);
            setPrepared(prep); setAnalysis(a); setMap(initialMap(a, prefCurrency)); setStep('map');
        } catch (e: any) { setError(e.message); setFile(null); }
        finally { setBusy(null); }
    };

    const request = (m: MapState, rowsBySheet?: Map<string, Set<number>>) => {
        const a = analysis!;
        const sheets = a.sheets.filter((s) => m.selected.has(s.name)).map((s) => ({
            name: s.name, columns: s.columns,
            rows: rowsBySheet ? s.rows.filter((r) => rowsBySheet.get(s.name)?.has(r.row)) : s.rows,
        })).filter((s) => s.rows.length);
        const keys = new Set(sheets.flatMap((s) => s.columns.map((c) => c.key)));
        const mapping = Object.fromEntries(Object.entries(m.mapping).filter(([k]) => keys.has(k)));
        return { fileName: a.fileName, sheets, mapping, sources: m.sources, settings: m.settings, onExisting };
    };

    const runReview = async (exist = onExisting) => {
        if (!map) return;
        setBusy('review'); setError(null);
        try { setReview(expandReview(await supplierApi.importValidate({ ...request(map), onExisting: exist }))); setStep('review'); setConfirmed(false); }
        catch (e: any) { setError(e.message); }
        finally { setBusy(null); }
    };

    const runImport = async () => {
        if (!review || !map || !prepared) return;
        const todo = review.rows.filter((r) => r.action !== 'none');
        const batches = batchRows(todo, prepared.photos);
        const startedAt = new Date().toISOString();
        const all: CommitResult[] = [];
        setBusy('commit'); setError(null); setProgress({ done: 0, total: todo.length, batch: 0, batches: batches.length });
        try {
            for (let i = 0; i < batches.length; i++) {
                const b = batches[i];
                setProgress({ done: all.length, total: todo.length, batch: i + 1, batches: batches.length });
                const bySheet = new Map<string, Set<number>>();
                for (const r of b) (bySheet.get(r.sheet) || bySheet.set(r.sheet, new Set()).get(r.sheet)!).add(r.row);
                const photos = b.flatMap((r: ReviewRow) => r.images.map((p) => ({ path: p, blob: prepared.photos.get(p) }))).filter((p): p is { path: string; blob: Blob } => !!p.blob && p.blob.size <= MAX_PHOTO_IN_REQUEST);
                const out = await supplierApi.importCommit({ ...request(map, bySheet), startedAt, last: i === batches.length - 1 }, photos);
                all.push(...out.results);
            }
            setResults(all);
        } catch (e: any) {
            setResults(all);
            setError(`${e.message} ${all.length ? `${all.length} row${all.length === 1 ? ' was' : 's were'} saved before this; ` : ''}upload the same file again to continue — rows already imported are recognised and not duplicated.`);
        } finally { setBusy(null); setProgress(null); }
    };

    const downloadTemplate = async (format: 'xlsx' | 'csv') => {
        setBusy('template');
        try {
            const res = await apiFetch(`/supplier-catalog/import/template?format=${format}`);
            if (!res.ok) throw new Error('Couldn’t download the template.');
            const blob = await res.blob();
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `atlantis-product-template.${format}`; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };

    const problems = analysis && map ? mappingProblems(analysis, map) : null;
    const nameMapped = !!(analysis && map && analysis.columns.some((c) => map.mapping[c.key] === 'name' && c.sheets.some((s) => map.selected.has(s))));
    const blockMap = !problems || !map?.selected.size || problems.unresolved.length > 0 || problems.conflicts.size > 0 || problems.ambiguousDecimal.length > 0 || !nameMapped;
    const importable = review ? review.rows.filter((r) => r.action !== 'none').length : 0;
    const multi = (analysis?.sheets.length ?? 0) > 1;

    return (
        <div ref={top} className="min-h-[calc(100dvh-64px-48px)] flex flex-col">
            <PageHeader eyebrow={<Link href="/supplier/products" className="inline-flex items-center gap-1 hover:text-ink"><ChevronLeft size={14} />Inventory &amp; products</Link>}
                title="Bulk upload"
                description={analysis ? <span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={15} className="text-teal" />{analysis.fileName} · {analysis.totalRows.toLocaleString()} product rows{multi ? ` in ${analysis.sheets.length} sheets` : ''}{prepared?.photos.size ? ` · ${prepared.photos.size.toLocaleString()} pictures` : ''}</span> : 'Upload your own product sheet — any layout, English or Arabic column names. You check everything before anything is saved.'}
                actions={analysis && !busy ? <Button variant="ghost" onClick={reset}>Start over</Button> : undefined} />

            <ol className="flex flex-wrap items-center gap-2 mb-5 text-[13px]" aria-label="Progress">
                {STEPS.map(([s, l], i) => {
                    const at = STEPS.findIndex(([x]) => x === step);
                    return (
                        <li key={s} className="flex items-center gap-2" aria-current={i === at ? 'step' : undefined}>
                            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold', i < at || (step === 'import' && results) ? 'bg-teal text-white' : i === at ? 'bg-heading text-white' : 'ring-1 ring-line-strong text-ink-4')}>{i + 1}</span>
                            <span className={cn(i === at ? 'font-semibold text-heading' : 'text-ink-3')}>{l}</span>
                            {i < STEPS.length - 1 && <span className="w-8 h-px bg-line-strong" aria-hidden />}
                        </li>
                    );
                })}
            </ol>

            {error && step !== 'import' && <div className="mb-4"><ErrorState message={error} /></div>}

            {step === 'upload' && (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-4 min-w-0">
                        <DropZone busy={busy === 'analyse'} file={file} onFile={readFile} busyText={`Reading ${file?.name ?? 'your file'} — columns, sheets and pictures…`}
                            hint=".xlsx, .xls or .csv · product photos inside the workbook are kept · up to 2,500 rows" />
                        <Card title="How it works">
                            <ol className="space-y-2 text-[13.5px] text-ink-2 list-decimal ps-5">
                                <li><b>Upload</b> your offer as it is. Several sheets, two-row headers, brand headings and photos placed in cells are all read.</li>
                                <li><b>Match columns.</b> Each of your columns is shown with the Atlantis field it fits, and why. Unclear ones — like a plain “Price” — are left for you to choose.</li>
                                <li><b>Review</b> every row next to the cell it came from: errors, warnings, drafts, and exactly what changes for products you already have.</li>
                                <li><b>Confirm & import.</b> Nothing is saved before this. You get a report of what was actually saved.</li>
                            </ol>
                        </Card>
                    </div>
                    <aside className="space-y-3">
                        <Card title="Starting from scratch?" description="The template has every column in the right format, with an example row and an Instructions sheet.">
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" icon={<Download size={14} />} loading={busy === 'template'} onClick={() => downloadTemplate('xlsx')}>Excel template</Button>
                                <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => downloadTemplate('csv')}>CSV</Button>
                            </div>
                        </Card>
                        <Card title="What is never done">
                            <ul className="space-y-1 text-[13px] text-ink-3 list-disc ps-4">
                                <li>Guessing what an unclear column means.</li>
                                <li>Inventing a missing value — the product is saved as a draft instead.</li>
                                <li>Duplicating a barcode already in your catalog.</li>
                                <li>Letting a row with an error touch a saved product.</li>
                            </ul>
                        </Card>
                    </aside>
                </div>
            )}

            {step === 'map' && analysis && map && (
                <MapStep analysis={analysis} fields={fields} state={map} setState={setMap as any} categories={CATEGORIES_LIST}
                    currencies={schema?.currencies ?? ['EUR']} moqUnits={schema?.moqUnits ?? ['CASE']} unitTypes={schema?.unitTypes ?? ['piece']} photoCount={prepared?.photos.size ?? 0} />
            )}

            {step === 'review' && review && map && (
                <ReviewStep review={review} fields={fields} multi={multi} sources={map.sources} photoUrl={photoUrl} busy={busy === 'review'}
                    headerOf={(k) => analysis?.columns.find((c) => c.key === k)?.header.replace(/\s+/g, ' ').trim() ?? k}
                    onExisting={onExisting} setOnExisting={(v) => { setOnExisting(v); runReview(v); }} onEditMapping={() => setStep('map')} />
            )}

            {step === 'import' && review && (
                <ImportStep review={review} onExisting={onExisting} confirmed={confirmed} setConfirmed={setConfirmed} progress={progress} results={results} error={error} multi={multi} fileName={analysis?.fileName ?? 'import'} />
            )}

            {step !== 'upload' && <div className="h-6 shrink-0" aria-hidden />}
            {step !== 'upload' && (
                <div className="sticky bottom-0 z-30 mt-auto -mx-4 sm:-mx-6 lg:-mx-8 -mb-6 border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
                    <div className="px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3">
                        {step === 'map' && <>
                            <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={reset}>Choose another file</Button>
                            <span className="flex-1 text-[12.5px] text-ink-3 text-end hidden sm:block">{!nameMapped ? 'Map the product-name column to continue.' : problems?.unresolved.length ? 'Choose what the highlighted columns mean.' : problems?.conflicts.size ? 'Two columns are set to the same field.' : problems?.ambiguousDecimal.length ? 'Choose how numbers are written.' : 'Nothing is saved yet.'}</span>
                            <Button variant="primary" loading={busy === 'review'} disabled={blockMap} onClick={() => runReview()}>Review {map?.selected.size ? analysis!.sheets.filter((s) => map.selected.has(s.name)).reduce((n, s) => n + s.rows.length, 0).toLocaleString() : 0} rows <ArrowRight size={15} /></Button>
                        </>}
                        {step === 'review' && <>
                            <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => setStep('map')}>Back to columns</Button>
                            <span className="flex-1 text-[12.5px] text-ink-3 text-end hidden sm:block">Nothing is saved yet.</span>
                            <Button variant="primary" disabled={!importable || busy === 'review'} onClick={() => { setStep('import'); setError(null); }}>Continue with {importable.toLocaleString()} row{importable === 1 ? '' : 's'} <ArrowRight size={15} /></Button>
                        </>}
                        {step === 'import' && !results && <>
                            <Button variant="ghost" icon={<ArrowLeft size={15} />} disabled={busy === 'commit'} onClick={() => setStep('review')}>Back to review</Button>
                            <span className="flex-1" />
                            <Button variant="primary" loading={busy === 'commit'} disabled={!confirmed || !importable} onClick={runImport}>Import {importable.toLocaleString()} product{importable === 1 ? '' : 's'}</Button>
                        </>}
                        {step === 'import' && results && <>
                            <Button variant="secondary" onClick={reset}>Upload another file</Button>
                            <span className="flex-1" />
                            <Link href="/supplier/products"><Button variant="primary">Go to my products</Button></Link>
                        </>}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Start from the suggestions: confident matches are set, unclear ones wait for the supplier; hints are offered, labelled with their source. */
function initialMap(a: Analysis, prefCurrency: string): MapState {
    const mapping: Record<string, string> = {};
    for (const c of a.columns) mapping[c.key] = c.field && (c.confidence === 'high' || c.confidence === 'medium') ? c.field : '';
    const mapped = new Set(Object.values(mapping));
    const sources: MapState['sources'] = {};
    const exw = a.hints.find((h) => h.field === 'exwLocation');
    if (exw && !mapped.has('exwLocation')) sources.exwLocation = { kind: 'constant', value: exw.value };
    if (!mapped.has('brand') && a.sheets.some((s) => s.sections.length)) sources.brand = { kind: 'section' };
    const price = a.columns.find((c) => c.currency && (c.field === 'piecePrice' || c.field === 'price' || c.candidates.length));
    return {
        selected: new Set(a.defaultSheets), mapping, touched: new Set(), sources,
        settings: { currency: price?.currency?.code || prefCurrency, moqUnit: 'CASE', unit: 'piece', pricePrecision: 'exact', decimal: {} },
    };
}
