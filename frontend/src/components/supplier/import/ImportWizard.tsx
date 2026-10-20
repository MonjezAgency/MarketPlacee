'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronLeft, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { importApi, type ImportTarget } from './api';
import { CATEGORIES_LIST } from '@/lib/products';
import { batchRows, prepareWorkbook, type PreparedFile } from '@/lib/import-file';
import { Button, Card, ErrorState, PageHeader } from '@/components/supplier/ui';
import { DropZone } from '@/components/supplier/DropZone';
import MapStep, { mappingProblems, type MapState } from './MapStep';
import ReviewStep from './ReviewStep';
import ImportStep, { type Progress } from './ImportStep';
import { expandReview, type Analysis, type CommitResult, type FieldDef, type PhotoResult, type Review, type ReviewRow } from './types';
import ExtractStep, { withoutExcluded } from './ExtractStep';
import { emptyPhotoSearch, photoCandidates, type PhotoSearchState } from './PhotoSearch';
import { Notice } from '@/components/supplier/ui';
import { ApiError } from '@/lib/supplier-api';
import { Trans } from '@/components/i18n/Trans';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

type Step = 'upload' | 'extract' | 'map' | 'review' | 'import';
/** Step ids and their dictionary keys ([section, key]); PDFs get a step to check the rows read from the file. */
const STEPS: [Step, string, string][] = [['upload', 'supplierCatalog', 'stepUpload'], ['extract', 'catalogImport', 'stepExtract'], ['map', 'supplierCatalog', 'stepMap'], ['review', 'supplierCatalog', 'stepReview'], ['import', 'supplierCatalog', 'stepImport']];
const MAX_PDF = 4 * 1024 * 1024;
const PDF_ERRORS = new Set(['pdf_not_pdf', 'pdf_too_large', 'pdf_password', 'pdf_damaged', 'pdf_too_many_pages', 'pdf_timeout', 'pdf_scanned', 'pdf_no_table']);
/** Uploads pass through a proxy that accepts at most ~4.5 MB per request. */
const MAX_UPLOAD = 4 * 1024 * 1024;
const MAX_PHOTO_IN_REQUEST = 3.5 * 1024 * 1024;

/**
 * Bulk product import: upload any product sheet → match its columns to
 * Atlantis fields (with the evidence for each suggestion) → review every row
 * against the original cells → confirm → import in batches with a report.
 *
 * One wizard, two destinations: `supplier` (the supplier's own catalog, via
 * /supplier-catalog/import/*) and `catalog` (the Atlantis Catalog, staff only,
 * via /admin-catalog/import/*). Parsing, mapping, review and batching are the
 * same; only the endpoints, the destination copy and the links differ.
 */
export default function ImportWizard({ target = 'supplier' }: { target?: ImportTarget }) {
    const api = React.useMemo(() => importApi(target), [target]);
    const catalog = target === 'catalog';
    const { t, fmt } = useLanguage();
    const ta = (k: string, v?: Record<string, string | number>) => t('adminProducts', k, v);
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const ti = (k: string, v?: Record<string, string | number>) => t('catalogImport', k, v);
    const [original, setOriginal] = React.useState<Analysis | null>(null);
    const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
    const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
    const [photos, setPhotos] = React.useState<PhotoSearchState>(emptyPhotoSearch);
    const [picks, setPicks] = React.useState<Map<string, PhotoResult>>(new Map());
    const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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

    React.useEffect(() => { api.schema().then(setSchema).catch((e) => setError(e.message)); }, [api]);
    React.useEffect(() => { if (!catalog) supplierApi.preferences().then((p) => setPrefCurrency(p.effectiveCurrency)).catch(() => {}); }, [catalog]);
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

    const stopPoll = () => { if (pollRef.current) clearTimeout(pollRef.current); pollRef.current = null; };
    React.useEffect(() => () => stopPoll(), []);
    React.useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
    const reset = () => { dropUrls(); stopPoll(); setOriginal(null); setExcluded(new Set()); setPdfUrl(null); setPhotos(emptyPhotoSearch()); setPicks(new Map()); setStep('upload'); setFile(null); setPrepared(null); setAnalysis(null); setMap(null); setReview(null); setResults(null); setProgress(null); setConfirmed(false); setError(null); setOnExisting('skip'); };

    const readFile = async (f: File) => {
        setError(null);
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const isPdf = ext === 'pdf' || f.type === 'application/pdf';
        if (!['xlsx', 'xls', 'csv'].includes(ext) && !isPdf) { setError(ti('errNotSupported', { file: f.name })); return; }
        reset(); setFile(f); setBusy('analyse');
        if (isPdf) {
            try {
                if (f.size > MAX_PDF) throw new Error(ti('err_pdf_too_large'));
                const a: Analysis = await api.analyse(f, f.name);
                // The PDF stays on this device; the browser's viewer shows its pages next to the rows.
                setPdfUrl(URL.createObjectURL(f));
                setPrepared({ upload: f, uploadName: f.name, photos: new Map(), originalSize: f.size });
                setOriginal(a); setAnalysis(a); setMap(initialMap(a, prefCurrency)); setStep('extract');
            } catch (e: any) {
                const code = e instanceof ApiError ? e.body?.code : null;
                setError(code && PDF_ERRORS.has(code) ? ti(`err_${code}`) : e.message); setFile(null);
            } finally { setBusy(null); }
            return;
        }
        try {
            const prep = await prepareWorkbook(f);
            if (prep.upload.size > MAX_UPLOAD) throw new Error(tc(ext !== 'xlsx' ? 'errFileTooLargeXlsx' : 'errFileTooLarge', { size: fmt.number(prep.upload.size / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }));
            const a: Analysis = await api.analyse(prep.upload, prep.uploadName);
            setPrepared(prep); setAnalysis(a); setMap(initialMap(a, prefCurrency)); setStep('map');
        } catch (e: any) { setError(e.message); setFile(null); }
        finally { setBusy(null); }
    };

    // What the later steps work with: for a PDF, the rows as the supplier corrected them, minus the ones left out.
    const effective = React.useMemo(() => (analysis ? withoutExcluded(analysis, excluded) : null), [analysis, excluded]);
    const request = (m: MapState, rowsBySheet?: Map<string, Set<number>>, chosen: Map<string, PhotoResult> = picks) => {
        const a = effective!;
        const sheets = a.sheets.filter((s) => m.selected.has(s.name)).map((s) => ({
            name: s.name, columns: s.columns,
            rows: rowsBySheet ? s.rows.filter((r) => rowsBySheet.get(s.name)?.has(r.row)) : s.rows,
        })).filter((s) => s.rows.length);
        const keys = new Set(sheets.flatMap((s) => s.columns.map((c) => c.key)));
        const mapping = Object.fromEntries(Object.entries(m.mapping).filter(([k]) => keys.has(k)));
        const externalImages = Object.fromEntries(Array.from(chosen).filter(([, r]) => r.candidate).map(([k, r]) => [k, { url: r.candidate!.url }]));
        return { fileName: a.fileName, format: a.format === 'pdf' ? 'pdf' : 'sheet', sheets, mapping, sources: m.sources, settings: m.settings, onExisting, ...(Object.keys(externalImages).length ? { externalImages } : {}) };
    };

    const runReview = async (exist = onExisting, chosen: Map<string, PhotoResult> = picks) => {
        if (!map) return;
        setBusy('review'); setError(null);
        try { setReview(expandReview(await api.validate({ ...request(map, undefined, chosen), onExisting: exist }))); setStep('review'); setConfirmed(false); }
        catch (e: any) { setError(e.message); }
        finally { setBusy(null); }
    };

    /** Optional: find photos by barcode for rows without one. Verified matches are pre-selected; everything stays the supplier's choice. */
    const findPhotos = async () => {
        if (!review) return;
        const rows = photoCandidates(review.rows, onExisting === 'update');
        if (!rows.length) return;
        try {
            const start = await api.photoLookup(rows.map((r) => ({ key: r.key, ean: r.ean, name: r.name, brand: r.brand, weight: r.weight, category: r.category })));
            setPhotos({ ...emptyPhotoSearch(), jobId: start.jobId, running: true, total: start.total, etaSeconds: start.etaSeconds });
            const poll = async () => {
                try {
                    const st = await api.photoLookupStatus(start.jobId);
                    const results = new Map<string, PhotoResult>(st.results.map((r: PhotoResult) => [r.key, r]));
                    setPhotos((p) => ({ ...p, completed: st.completed, total: st.total, etaSeconds: st.etaSeconds, results, running: !st.done, error: st.failed }));
                    if (!st.done) { pollRef.current = setTimeout(poll, 3000); return; }
                    const auto = new Map<string, PhotoResult>(Array.from(results).filter(([, r]) => r.status === 'verified' && !!r.candidate));
                    setPicks(auto);
                    if (auto.size) runReview(onExisting, auto);
                } catch (e: any) { setPhotos((p) => ({ ...p, running: false, error: e.message })); }
            };
            pollRef.current = setTimeout(poll, 1500);
        } catch (e: any) { setPhotos((p) => ({ ...p, running: false, error: e.message })); }
    };
    const pickPhoto = (key: string, on: boolean) => {
        const r = photos.results.get(key);
        const next = new Map(picks);
        if (on && r?.candidate) next.set(key, r); else next.delete(key);
        setPicks(next);
        runReview(onExisting, next);
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
                const out = await api.commit({ ...request(map, bySheet), startedAt, last: i === batches.length - 1 }, photos);
                all.push(...out.results);
            }
            setResults(all);
        } catch (e: any) {
            setResults(all);
            setError(`${e.message} ${all.length ? tc('errImportStoppedSaved', { count: all.length }) : tc('errImportStopped')}`);
        } finally { setBusy(null); setProgress(null); }
    };

    const downloadTemplate = async (format: 'xlsx' | 'csv', variant: 'blank' | 'example' = 'blank') => {
        setBusy(variant === 'example' ? 'example' : 'template');
        try {
            const res = await apiFetch(`${api.base}/import/template?format=${format}&variant=${variant}`);
            if (!res.ok) throw new Error(tc('errTemplateDownload'));
            const blob = await res.blob();
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${variant === 'example' ? 'atlantis-product-import-example' : 'atlantis-product-template'}.${format}`; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };

    const problems = effective && map ? mappingProblems(effective, map) : null;
    const nameMapped = !!(effective && map && effective.columns.some((c) => map.mapping[c.key] === 'name' && c.sheets.some((s) => map.selected.has(s))));
    const isPdf = analysis?.format === 'pdf';
    const steps = STEPS.filter(([s]) => s !== 'extract' || isPdf);
    const keptRows = effective?.totalRows ?? 0;
    const blockMap = !problems || !map?.selected.size || problems.unresolved.length > 0 || problems.conflicts.size > 0 || problems.ambiguousDecimal.length > 0 || !nameMapped;
    const importable = review ? review.rows.filter((r) => r.action !== 'none').length : 0;
    const multi = (effective?.sheets.length ?? 0) > 1;

    return (
        <div ref={top} className="min-h-[calc(100dvh-64px-48px)] flex flex-col" data-no-translate>
            <PageHeader eyebrow={<Link href={catalog ? '/admin/products/catalog' : '/supplier/products'} className="inline-flex items-center gap-1 hover:text-ink"><ChevronLeft size={14} className="rtl:rotate-180" />{catalog ? ta('tabCatalog') : tc('inventoryAndProducts')}</Link>}
                title={catalog ? ta('importTitle') : tc('bulkUpload')}
                description={analysis ? <span className="inline-flex items-center gap-1.5">{isPdf ? <FileText size={15} className="text-teal" /> : <FileSpreadsheet size={15} className="text-teal" />}<bdi>{analysis.fileName}</bdi> · {tc('productRowsCount', { count: analysis.totalRows })}{multi ? ` · ${tc('sheetsCount', { count: analysis.sheets.length })}` : ''}{prepared?.photos.size ? ` · ${tc('picturesCount', { count: prepared.photos.size })}` : ''}</span> : tc('importPageDesc')}
                actions={analysis && !busy ? <Button variant="ghost" onClick={reset}>{tc('startOver')}</Button> : undefined} />

            <ol className="flex flex-wrap items-center gap-2 mb-5 text-[13px]" aria-label={tc('progress')}>
                {steps.map(([s, sec, l], i) => {
                    const at = steps.findIndex(([x]) => x === step);
                    return (
                        <li key={s} className="flex items-center gap-2" aria-current={i === at ? 'step' : undefined}>
                            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold', i < at || (step === 'import' && results) ? 'bg-teal text-white' : i === at ? 'bg-heading text-white' : 'ring-1 ring-line-strong text-ink-4')}>{fmt.number(i + 1)}</span>
                            <span className={cn(i === at ? 'font-semibold text-heading' : 'text-ink-3')}>{t(sec as 'supplierCatalog', l)}</span>
                            {i < steps.length - 1 && <span className="w-8 h-px bg-line-strong" aria-hidden />}
                        </li>
                    );
                })}
            </ol>

            {catalog && <div className="mb-4"><Notice tone="info" title={ta('importDestination')}>{ta('importBehaviour')}</Notice></div>}
            {error && step !== 'import' && <div className="mb-4"><ErrorState message={error} /></div>}

            {step === 'upload' && (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-4 min-w-0">
                        <DropZone busy={busy === 'analyse'} file={file} onFile={readFile} busyText={file?.name ? tc('readingFileDetail', { file: file.name }) : tc('readingYourFile')}
                            hint={ti('importDropHintPdf')} title={ti('dropTitle')} accept=".xlsx,.xls,.csv,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/pdf" />
                        <Card title={tc('howItWorks')}>
                            <ol className="space-y-2 text-[13.5px] text-ink-2 list-decimal ps-5">
                                {['how1', 'how2', 'how3', 'how4'].map((k) => <li key={k}><Trans text={tc(k)} tags={{ b: (c) => <b>{c}</b> }} /></li>)}
                            </ol>
                        </Card>
                    </div>
                    <aside className="space-y-3">
                        <Card title={tc('fromScratchTitle')} description={tc('fromScratchDesc')}>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" icon={<Download size={14} />} loading={busy === 'template'} onClick={() => downloadTemplate('xlsx')}>{tc('excelTemplate')}</Button>
                                <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => downloadTemplate('csv')}>CSV</Button>{/* i18n-ignore: file format name, same in every language */}
                            </div>
                            <p className="mt-3 text-[12.5px] text-ink-3">{ti('exampleDesc')}</p>
                            <Button className="mt-2" size="sm" variant="ghost" icon={<Download size={14} />} loading={busy === 'example'} onClick={() => downloadTemplate('xlsx', 'example')}>{ti('exampleDownload')}</Button>
                        </Card>
                        <Card title={tc('neverDoneTitle')}>
                            <ul className="space-y-1 text-[13px] text-ink-3 list-disc ps-4">
                                {['never1', 'never2', 'never3', 'never4'].map((k) => <li key={k}>{tc(k)}</li>)}
                            </ul>
                        </Card>
                    </aside>
                </div>
            )}

            {step === 'extract' && analysis && original && (
                <ExtractStep analysis={analysis} original={original} setAnalysis={setAnalysis} excluded={excluded} setExcluded={setExcluded} pdfUrl={pdfUrl} />
            )}

            {step === 'map' && effective && map && (
                <MapStep analysis={effective} fields={fields} state={map} setState={setMap as any} categories={CATEGORIES_LIST}
                    currencies={schema?.currencies ?? ['EUR']} moqUnits={schema?.moqUnits ?? ['CASE']} unitTypes={schema?.unitTypes ?? ['piece']} photoCount={prepared?.photos.size ?? 0} />
            )}

            {step === 'review' && review && map && (
                <ReviewStep target={target} review={review} fields={fields} multi={multi} sources={map.sources} photoUrl={photoUrl} busy={busy === 'review'}
                    headerOf={(k) => analysis?.columns.find((c) => c.key === k)?.header.replace(/\s+/g, ' ').trim() ?? k}
                    onExisting={onExisting} setOnExisting={(v) => { setOnExisting(v); runReview(v); }} onEditMapping={() => setStep('map')}
                    photos={photos} picks={picks} onPick={pickPhoto} onFindPhotos={findPhotos} />
            )}

            {step === 'import' && review && (
                <ImportStep target={target} review={review} onExisting={onExisting} confirmed={confirmed} setConfirmed={setConfirmed} progress={progress} results={results} error={error} multi={multi} fileName={analysis?.fileName ?? 'import'} />
            )}

            {step !== 'upload' && <div className="h-6 shrink-0" aria-hidden />}
            {step !== 'upload' && (
                <div className="sticky bottom-0 z-30 mt-auto -mx-4 sm:-mx-6 lg:-mx-8 -mb-6 border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
                    <div className="px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3">
                        {step === 'extract' && <>
                            <Button variant="ghost" icon={<ArrowLeft size={15} className="rtl:rotate-180" />} onClick={reset}>{tc('chooseAnotherFile')}</Button>
                            <span className="flex-1 text-[12.5px] text-ink-3 text-end hidden sm:block">{tc('nothingSavedYet')}</span>
                            <Button variant="primary" disabled={!keptRows} onClick={() => { setStep('map'); setReview(null); }}>{ti('continueWithRows', { count: keptRows })} <ArrowRight size={15} className="rtl:rotate-180" /></Button>
                        </>}
                        {step === 'map' && <>
                            <Button variant="ghost" icon={<ArrowLeft size={15} className="rtl:rotate-180" />} onClick={isPdf ? () => setStep('extract') : reset}>{isPdf ? ti('backToExtracted') : tc('chooseAnotherFile')}</Button>
                            <span className="flex-1 text-[12.5px] text-ink-3 text-end hidden sm:block">{!nameMapped ? tc('mapNameToContinue') : problems?.unresolved.length ? tc('chooseHighlighted') : problems?.conflicts.size ? tc('twoColumnsSameField') : problems?.ambiguousDecimal.length ? tc('chooseNumberFormat') : tc('nothingSavedYet')}</span>
                            <Button variant="primary" loading={busy === 'review'} disabled={blockMap} onClick={() => runReview()}>{tc('reviewNRows', { count: map?.selected.size ? effective!.sheets.filter((s) => map.selected.has(s.name)).reduce((n, s) => n + s.rows.length, 0) : 0 })} <ArrowRight size={15} className="rtl:rotate-180" /></Button>
                        </>}
                        {step === 'review' && <>
                            <Button variant="ghost" icon={<ArrowLeft size={15} className="rtl:rotate-180" />} onClick={() => setStep('map')}>{tc('backToColumns')}</Button>
                            <span className="flex-1 text-[12.5px] text-ink-3 text-end hidden sm:block">{tc('nothingSavedYet')}</span>
                            <Button variant="primary" disabled={!importable || busy === 'review'} onClick={() => { setStep('import'); setError(null); }}>{tc('continueWithNRows', { count: importable })} <ArrowRight size={15} className="rtl:rotate-180" /></Button>
                        </>}
                        {step === 'import' && !results && <>
                            <Button variant="ghost" icon={<ArrowLeft size={15} className="rtl:rotate-180" />} disabled={busy === 'commit'} onClick={() => setStep('review')}>{tc('backToReview')}</Button>
                            <span className="flex-1" />
                            <Button variant="primary" loading={busy === 'commit'} disabled={!confirmed || !importable} onClick={runImport}>{tc('importNProducts', { count: importable })}</Button>
                        </>}
                        {step === 'import' && results && <>
                            <Button variant="secondary" onClick={reset}>{tc('uploadAnotherFile')}</Button>
                            <span className="flex-1" />
                            <Link href={catalog ? '/admin/products/catalog' : '/supplier/products'}><Button variant="primary">{catalog ? ta('goToCatalog') : tc('goToMyProducts')}</Button></Link>
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
    const price = a.columns.find((c) => c.currency && (c.field === 'piecePrice' || c.field === 'price' || c.candidates.length)) || a.columns.find((c) => c.currency && !c.field);
    return {
        selected: new Set(a.defaultSheets), mapping, touched: new Set(), sources,
        settings: { currency: price?.currency?.code || prefCurrency, moqUnit: 'CASE', unit: 'piece', pricePrecision: 'exact', decimal: {} },
    };
}
