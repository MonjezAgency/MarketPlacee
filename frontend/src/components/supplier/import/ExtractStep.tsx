'use client';

import * as React from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, FileText, Info, RotateCcw, X } from 'lucide-react';
import { Badge, Button, Card, Notice } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { listJoin, type Analysis, type RowFlag, type SheetRow } from './types';

const PAGE = 60;
/** Flags that need the supplier's eye; the others only say how a row was read. */
const ATTENTION = new Set(['between_rows', 'text_repaired', 'barcode_spaces', 'key_value']);
const needsCheck = (r: SheetRow) => !!r.flags?.some((f) => ATTENTION.has(f.code));
export const rowId = (sheet: string, row: number) => `${sheet}!${row}`;

/**
 * PDF only: every row as it was read, next to the page it came from. The
 * supplier corrects values and leaves out rows that aren't products before
 * any column matching. The value read from the PDF is always kept beside a
 * correction, and nothing is saved here.
 */
export default function ExtractStep({ analysis, original, setAnalysis, excluded, setExcluded, pdfUrl }: {
    analysis: Analysis; original: Analysis; setAnalysis: (a: Analysis) => void;
    excluded: Set<string>; setExcluded: (s: Set<string>) => void; pdfUrl: string | null;
}) {
    const { t, fmt, meta } = useLanguage();
    const ti = (k: string, v?: Record<string, string | number>) => t('catalogImport', k, v);
    const pdf = analysis.pdf!;
    const [onlyCheck, setOnlyCheck] = React.useState(false);
    const [viewPage, setViewPage] = React.useState<number | null>(null);
    const [zoom, setZoom] = React.useState(true);
    const [pageIdx, setPageIdx] = React.useState<Record<string, number>>({});
    const orig = React.useMemo(() => new Map(original.sheets.flatMap((s) => s.rows.map((r) => [rowId(s.name, r.row), r.cells] as const))), [original]);
    const total = analysis.sheets.reduce((n, s) => n + s.rows.length, 0);
    const flagged = analysis.sheets.reduce((n, s) => n + s.rows.filter(needsCheck).length, 0);
    const previews = pdf.previews || {};
    const canView = !!pdfUrl || Object.keys(previews).length > 0;
    const pages = (ps: number[]) => listJoin(ps.map((p) => fmt.number(p)), meta.intl);

    const setCell = (sheet: string, row: number, col: number, value: string) => {
        setAnalysis({
            ...analysis,
            sheets: analysis.sheets.map((s) => s.name !== sheet ? s : {
                ...s,
                rows: s.rows.map((r) => {
                    if (r.row !== row) return r;
                    const cells = r.cells.map((c, i) => (i === col ? value : c));
                    // What the PDF said, for every cell the supplier changed (sent with the import and kept in its record).
                    const before = orig.get(rowId(sheet, row)) || [];
                    const edited: Record<string, string> = {};
                    cells.forEach((c, i) => { if (c !== (before[i] ?? '')) edited[s.columns[i]?.header || `#${i + 1}`] = before[i] ?? ''; });
                    return { ...r, cells, edited: Object.keys(edited).length ? edited : undefined };
                }),
            }),
        });
    };
    const toggle = (id: string) => { const n = new Set(excluded); if (n.has(id)) n.delete(id); else n.add(id); setExcluded(n); };

    return (
        <div className={cn('grid gap-4', viewPage !== null && pdfUrl && 'xl:grid-cols-[minmax(0,1fr)_460px]')}>
            <div className="space-y-4 min-w-0">
                <Card title={ti('extractTitle')} description={ti('extractDesc')}>
                    <ul className="text-[13.5px] text-ink-2 space-y-1">
                        <li>{ti('extractSummary', { count: total, pages: pdf.pages, tables: analysis.sheets.length })}</li>
                        {flagged > 0 && <li className="text-amber-800">{ti('extractFlagged', { count: flagged })}</li>}
                        {excluded.size > 0 && <li>{ti('extractExcluded', { count: excluded.size })}</li>}
                    </ul>
                    {canView && <div className="mt-3"><Button size="sm" variant="secondary" icon={<FileText size={14} />} onClick={() => setViewPage(viewPage === null ? (pdf.tablePages[0] ?? pdf.keyValuePages[0] ?? 1) : null)}>{viewPage === null ? ti('showPdf') : ti('hidePdf')}</Button></div>}
                </Card>
                {pdf.scannedPages.length > 0 && <Notice tone="warning" title={ti('scannedTitle', { count: pdf.scannedPages.length })}>{ti('scannedBody', { pages: pages(pdf.scannedPages) })}</Notice>}
                {pdf.keyValuePages.length > 0 && <Notice tone="info">{ti('keyValueNotice', { pages: pages(pdf.keyValuePages) })}</Notice>}
                {pdf.notes.length > 0 && (
                    <details className="rounded-xl ring-1 ring-line">
                        <summary className="px-4 py-2.5 cursor-pointer text-[13px] font-semibold text-heading">{ti('notesTitle', { count: pdf.notes.length })}</summary>
                        <p className="px-4 pt-1 text-[12.5px] text-ink-3">{ti('notesHelp')}</p>
                        <ul className="px-4 pb-3 pt-1 space-y-0.5 text-[12.5px] max-h-48 overflow-auto">{pdf.notes.map((n, i) => <li key={i}><span className="text-ink-4 tabular-nums">{ti('pageShort', { page: n.page })}</span> · <bdi>{n.text}</bdi></li>)}</ul>
                    </details>
                )}
                <label className="inline-flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-[#0E7C74]" checked={onlyCheck} onChange={(e) => setOnlyCheck(e.target.checked)} />{ti('onlyRowsToCheck')}</label>

                {analysis.sheets.map((s) => {
                    const rows = s.rows.filter((r) => !onlyCheck || needsCheck(r) || r.edited);
                    // Text columns (names, descriptions) get room; number columns stay compact.
                    const wide = new Set(s.columns.filter((c) => { const v = s.rows.map((r) => r.cells[c.index] || '').filter(Boolean); return v.length && v.reduce((n, x) => n + x.length, 0) / v.length > 14; }).map((c) => c.index));
                    const mid = new Set(s.columns.filter((c) => { const v = s.rows.map((r) => r.cells[c.index] || '').filter(Boolean); return v.length && v.reduce((n, x) => n + x.length, 0) / v.length > 7; }).map((c) => c.index));
                    const pi = Math.min(pageIdx[s.name] ?? 0, Math.max(0, Math.ceil(rows.length / PAGE) - 1));
                    const shown = rows.slice(pi * PAGE, pi * PAGE + PAGE);
                    const cols = s.columns.filter((c) => s.rows.some((r) => (orig.get(rowId(s.name, r.row))?.[c.index] || r.cells[c.index] || '').trim()));
                    return (
                        <section key={s.name} className="rounded-xl ring-1 ring-line overflow-hidden">
                            <h3 className="px-4 py-2.5 text-[13.5px] font-semibold text-heading bg-surface-2/60 flex items-center gap-2">{analysis.sheets.length > 1 ? <bdi>{s.name}</bdi> : ti('tableFound')}<span className="text-ink-4 font-normal">· {ti('rowsCount', { count: s.rows.length })}</span></h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead><tr className="text-ink-3 text-[12px] bg-surface-2/30">
                                        <th className="px-2 py-2 text-start font-medium whitespace-nowrap">{ti('colKeep')}</th>
                                        <th className="px-2 py-2 text-start font-medium whitespace-nowrap">{ti('colPage')}</th>
                                        {cols.map((c) => <th key={c.key} className="px-2 py-2 text-start font-medium min-w-[90px]"><bdi>{c.header}</bdi></th>)}
                                        <th className="px-2 py-2 text-start font-medium min-w-[200px]">{ti('colToCheck')}</th>
                                    </tr></thead>
                                    <tbody>
                                        {shown.map((r: SheetRow) => {
                                            const id = rowId(s.name, r.row);
                                            const off = excluded.has(id);
                                            const before = orig.get(id) || [];
                                            return (
                                                <tr key={id} className={cn('border-t border-line align-top', off && 'opacity-45', !off && needsCheck(r) && 'bg-amber-50/60 dark:bg-amber-500/5')}>
                                                    <td className="px-2 py-1.5"><input type="checkbox" className="accent-[#0E7C74] mt-1.5" checked={!off} onChange={() => toggle(id)} aria-label={ti('keepRowAria', { row: r.row })} /></td>
                                                    <td className="px-2 py-1.5 whitespace-nowrap">
                                                        <button type="button" className="text-teal hover:underline tabular-nums mt-1" disabled={!canView} onClick={() => setViewPage(r.page ?? 1)} title={canView ? ti('openPage', { page: r.page ?? 1 }) : undefined}>{ti('pageShort', { page: r.page ?? 1 })}</button>
                                                    </td>
                                                    {cols.map((c) => {
                                                        const v = r.cells[c.index] ?? '';
                                                        const was = before[c.index] ?? '';
                                                        const changed = v !== was;
                                                        return (
                                                            <td key={c.key} className="px-1 py-1">
                                                                <input value={v} disabled={off} onChange={(e) => setCell(s.name, r.row, c.index, e.target.value)} dir="auto"
                                                                    aria-label={`${c.header} · ${ti('rowN', { row: r.row })}`}
                                                                    className={cn('w-full h-8 px-2 rounded-md', wide.has(c.index) ? 'min-w-[240px]' : mid.has(c.index) ? 'min-w-[150px]' : 'min-w-[80px]', ' bg-surface ring-1 ring-inset text-[12.5px] outline-none focus:ring-2 focus:ring-teal', changed ? 'ring-sky-400' : 'ring-line')} />
                                                                {changed && (
                                                                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-sky-800 dark:text-sky-300">
                                                                        <span className="truncate">{ti('readAs', { value: was || '—' })}</span>
                                                                        <button type="button" className="shrink-0 hover:text-heading" onClick={() => setCell(s.name, r.row, c.index, was)} aria-label={ti('restore')} title={ti('restore')}><RotateCcw size={11} /></button>
                                                                    </span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-2 py-1.5 text-[11.5px] text-amber-900 dark:text-amber-200 space-y-0.5">
                                                        {(r.flags || []).map((f, i) => ATTENTION.has(f.code)
                                                            ? <p key={i} className="flex gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /><span>{flagText(f, ti, meta.intl)}</span></p>
                                                            : <p key={i} className="flex gap-1 text-ink-3"><Info size={12} className="mt-0.5 shrink-0" /><span>{flagText(f, ti, meta.intl)}</span></p>)}
                                                        {r.source && <p className="text-ink-4 line-clamp-2" title={r.source}>{ti('onPage')} <bdi>{r.source}</bdi></p>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {!shown.length && <tr><td colSpan={cols.length + 3} className="px-3 py-6 text-center text-ink-3">{ti('nothingToCheck')}</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                            {rows.length > PAGE && (
                                <div className="flex items-center justify-end gap-1 px-3 py-2 text-[12.5px] text-ink-3 border-t border-line">
                                    <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} className="rtl:rotate-180" />} disabled={pi === 0} onClick={() => setPageIdx({ ...pageIdx, [s.name]: pi - 1 })}>{t('supplierCatalog', 'previous')}</Button>
                                    <span className="tabular-nums px-1">{t('supplierCatalog', 'pageOf', { page: fmt.number(pi + 1), pages: fmt.number(Math.ceil(rows.length / PAGE)) })}</span>
                                    <Button size="sm" variant="ghost" disabled={(pi + 1) * PAGE >= rows.length} onClick={() => setPageIdx({ ...pageIdx, [s.name]: pi + 1 })}>{t('supplierCatalog', 'next')} <ChevronRight size={14} className="rtl:rotate-180" /></Button>
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
            {viewPage !== null && canView && (
                <aside className="xl:sticky xl:top-4 h-[70dvh] xl:h-[calc(100dvh-180px)] rounded-xl ring-1 ring-line overflow-hidden flex flex-col bg-surface">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-line text-[13px]">
                        <Badge tone="info">{ti('pageShort', { page: viewPage })}</Badge>
                        <span className="text-ink-3 flex-1 truncate">{previews[viewPage] ? ti('pagePictureNote') : ti('pdfPrivate')}</span>
                        <button type="button" onClick={() => setViewPage(null)} aria-label={ti('hidePdf')} className="text-ink-3 hover:text-heading"><X size={16} /></button>
                    </div>
                    {previews[viewPage] ? (
                        <div className="flex-1 overflow-auto bg-surface-2/40 p-2" dir="ltr">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <button type="button" onClick={() => setZoom(!zoom)} className={cn('block', zoom ? 'w-[220%] cursor-zoom-out' : 'w-full cursor-zoom-in')} aria-label={zoom ? ti('zoomOut') : ti('zoomIn')} title={zoom ? ti('zoomOut') : ti('zoomIn')}>
                                <img src={previews[viewPage]} alt={ti('pageImageAlt', { page: viewPage })} className="w-full h-auto rounded ring-1 ring-line bg-white" />
                            </button>
                        </div>
                    ) : pdfUrl ? (
                        // No picture of this page: the browser's own PDF viewer, from the file on this device.
                        <iframe key={viewPage} src={`${pdfUrl}#page=${viewPage}`} title={ti('pdfFrameTitle')} className="flex-1 w-full bg-white" />
                    ) : null}
                    {pdfUrl && <a href={`${pdfUrl}#page=${viewPage}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 border-t border-line text-[12.5px] text-teal hover:underline inline-flex items-center gap-1.5"><ExternalLink size={13} />{ti('openPdfTab', { page: viewPage })}</a>}
                </aside>
            )}
        </div>
    );
}

export function flagText(f: RowFlag, ti: (k: string, v?: Record<string, string | number>) => string, intl: string): string {
    switch (f.code) {
        case 'multiline': return ti('flagMultiline', { columns: listJoin(f.columns.map((c) => `“${c}”`), intl), count: f.columns.length });
        case 'between_rows': return ti('flagBetweenRows', { text: f.text });
        case 'text_repaired': return ti('flagTextRepaired');
        case 'barcode_spaces': return ti('flagBarcodeSpaces', { value: f.value });
        case 'key_value': return ti('flagKeyValue');
        case 'no_header_on_page': return ti('flagNoHeader', { page: f.fromPage });
        default: return '';
    }
}

/** The analysis the later steps work with: rows the supplier left out are dropped. */
export function withoutExcluded(a: Analysis, excluded: Set<string>): Analysis {
    if (!excluded.size) return a;
    const sheets = a.sheets.map((s) => ({ ...s, rows: s.rows.filter((r) => !excluded.has(rowId(s.name, r.row))) })).filter((s) => s.rows.length);
    return { ...a, sheets, totalRows: sheets.reduce((n, s) => n + s.rows.length, 0), defaultSheets: a.defaultSheets.filter((n) => sheets.some((s) => s.name === n)) };
}
