'use client';

import * as React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDashed, Pencil, RefreshCw, XCircle, Image as ImageIcon } from 'lucide-react';
import { Badge, Button, Card, Notice, eur, int, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { where, type FieldDef, type Review, type ReviewRow, type Source } from './types';

const STATE: Record<ReviewRow['state'], { tone: Tone; label: string; icon: React.ReactNode }> = {
    ready: { tone: 'success', label: 'New · to review', icon: <CheckCircle2 size={13} /> },
    draft: { tone: 'warning', label: 'New · draft', icon: <CircleDashed size={13} /> },
    update: { tone: 'info', label: 'Update', icon: <RefreshCw size={13} /> },
    unchanged: { tone: 'neutral', label: 'No changes', icon: <CheckCircle2 size={13} /> },
    skip: { tone: 'neutral', label: 'Skipped · in catalog', icon: <ChevronRight size={13} /> },
    error: { tone: 'danger', label: 'Won’t import', icon: <XCircle size={13} /> },
};
type Filter = 'all' | 'ready' | 'draft' | 'update' | 'error' | 'warnings' | 'existing';
const PAGE = 50;

/** The rows a field's value can come from, in display order (price and barcode have alternatives). */
const SOURCE_KEYS: Record<string, string[]> = { price: ['price', 'piecePrice', 'displayPrice'], ean: ['ean', 'eanPair'], stock: ['stock', 'stockPieces'] };

export default function ReviewStep({ review, fields, multi, sources, photoUrl, onExisting, setOnExisting, onEditMapping, busy, headerOf }: {
    review: Review; fields: FieldDef[]; multi: boolean; sources: Record<string, Source>; headerOf: (key: string) => string;
    photoUrl: (path: string) => string | undefined; onExisting: 'skip' | 'update'; setOnExisting: (v: 'skip' | 'update') => void;
    onEditMapping: () => void; busy: boolean;
}) {
    const [filter, setFilter] = React.useState<Filter>('all');
    const [page, setPage] = React.useState(0);
    const [open, setOpen] = React.useState<string | null>(null);
    const s = review.summary;
    const existingCount = review.rows.filter((r) => r.existing && r.state !== 'error').length;
    const rows = review.rows.filter((r) => filter === 'all' || (filter === 'warnings' ? r.warnings.length > 0 : filter === 'existing' ? !!r.existing : r.state === filter));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    React.useEffect(() => { setPage(0); }, [filter]);
    const label = (k: string) => fields.find((f) => f.key === k)?.header ?? k;
    const stored = review.mapping.filter((m) => m.stored);
    const recordOnly = review.mapping.filter((m) => !m.stored && !['rowNumber', 'orderQty'].includes(m.field));
    const tiles: [string, number, Tone, Filter][] = [
        ['New, sent to review', s.ready, 'success', 'ready'], ['New, saved as drafts', s.draft, 'warning', 'draft'],
        ['Updates to your catalog', s.update, 'info', 'update'], ['Won’t be imported', s.error, 'danger', 'error'],
    ];
    const tabs: [Filter, string, number][] = [['all', 'All rows', s.total], ['ready', 'Ready', s.ready], ['draft', 'Drafts', s.draft], ['update', 'Updates', s.update], ['error', 'Errors', s.error], ['warnings', 'With warnings', s.withWarnings], ...(existingCount ? [['existing', 'Already in catalog', existingCount] as [Filter, string, number]] : [])];

    return (
        <div className={cn('space-y-4', busy && 'opacity-60 pointer-events-none')}>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {tiles.map(([l, n, tone, f]) => (
                    <button key={l} type="button" onClick={() => setFilter(f)} className={cn('text-start rounded-xl ring-1 p-3 transition-colors', filter === f ? 'ring-heading' : 'ring-line hover:ring-line-strong')}>
                        <p className="text-[12.5px] text-ink-3">{l}</p>
                        <p className={cn('text-[24px] font-semibold tabular-nums', n ? (tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-800' : tone === 'success' ? 'text-emerald-700' : 'text-sky-700') : 'text-ink-4')}>{int(n)}</p>
                    </button>
                ))}
            </div>

            <Card title="How your columns are imported" actions={<Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={onEditMapping}>Change</Button>}>
                <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-[13px]">
                    {stored.map((m) => (
                        <li key={m.key} className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-ink-2" title={headerOf(m.key)}>“{headerOf(m.key)}”</span><ArrowRight size={13} className="text-ink-4 shrink-0" /><span className="font-medium text-ink truncate">{m.label}</span>
                        </li>
                    ))}
                    {Object.entries(sources).map(([f, src]) => (
                        <li key={`src-${f}`} className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-ink-3 italic">{src.kind === 'constant' ? (src.perSheet && Object.keys(src.perSheet).length ? 'your value per sheet' : `your value “${src.value}”`) : src.kind === 'section' ? 'section headings' : src.kind === 'sheetName' ? 'sheet name' : 'product name'}</span>
                            <ArrowRight size={13} className="text-ink-4 shrink-0" /><span className="font-medium text-ink truncate">{label(f)}</span>
                        </li>
                    ))}
                </ul>
                {recordOnly.length > 0 && <p className="mt-3 text-[12.5px] text-ink-3"><b className="text-ink-2">Kept in each product’s import record (not product fields):</b> {recordOnly.map((m) => `“${headerOf(m.key)}” (${m.label})`).join(', ')}.</p>}
                {review.notProvided.length > 0 && <p className="mt-1.5 text-[12.5px] text-amber-800"><b>Not in your file and not set:</b> {review.notProvided.join(', ')} — the products affected are saved as drafts.</p>}
            </Card>

            {existingCount > 0 && (
                <div className="rounded-xl ring-1 ring-line p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                    <span className="text-ink-2"><b>{existingCount}</b> row{existingCount === 1 ? ' matches a product' : 's match products'} already in your catalog (same barcode, or same name when there is no barcode).</span>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name="exist" checked={onExisting === 'skip'} onChange={() => setOnExisting('skip')} className="accent-[#0E7C74]" /> Leave them as they are</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name="exist" checked={onExisting === 'update'} onChange={() => setOnExisting('update')} className="accent-[#0E7C74]" /> Update them with the file’s values</label>
                    {onExisting === 'update' && <span className="w-full text-[12px] text-ink-3">Only filled, valid cells are applied — an empty cell never clears saved data, and a row with an error never touches the product. Live photos are kept. Changing name, brand, barcode or weight sends a live product back to review.</span>}
                </div>
            )}

            <div role="tablist" aria-label="Filter rows" className="flex gap-1 overflow-x-auto">
                {tabs.map(([id, l, n]) => (
                    <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                        className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap', filter === id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                        {l} <span className={cn('ms-1 tabular-nums', filter === id ? 'text-white/70' : 'text-ink-4')}>{int(n)}</span>
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto rounded-xl ring-1 ring-line">
                <table className="w-full text-[12.5px]">
                    <thead className="bg-surface-2/70">
                        <tr className="text-ink-3 text-[12px]">
                            {['Row', 'Result', '', 'Product', 'Barcode', 'Price / case', 'Pcs/case', 'Stock', 'MOQ', 'Weight', 'Category'].map((h, i) => <th key={i} className="text-start font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.slice(page * PAGE, page * PAGE + PAGE).map((r) => {
                            const st = STATE[r.state];
                            const isOpen = open === r.key;
                            const bad = (f: string) => (r.errors.some((e) => e.field === f || SOURCE_KEYS[f]?.includes(e.field)) ? 'text-red-700 font-medium' : r.missing.some((m) => m.field === f) ? 'text-amber-800' : '');
                            const val = (v: React.ReactNode, f: string) => <span className={bad(f)}>{v === null || v === undefined || v === '' ? (r.missing.some((m) => m.field === f) ? 'Missing' : '—') : v}</span>;
                            const thumb = r.images[0] ? photoUrl(r.images[0]) : undefined;
                            return (
                                <React.Fragment key={r.key}>
                                    <tr className={cn('border-t border-line align-top cursor-pointer hover:bg-surface-2/40', isOpen && 'bg-surface-2/40')} onClick={() => setOpen(isOpen ? null : r.key)}>
                                        <td className="px-3 py-2 tabular-nums text-ink-3 whitespace-nowrap">{where(r, multi)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <Badge tone={st.tone}>{st.icon}{st.label}</Badge>
                                            {(r.errors.length > 0 || r.warnings.length > 0) && <span className="block mt-1 text-[11.5px] text-ink-3">{r.errors.length ? `${r.errors.length} error${r.errors.length === 1 ? '' : 's'}` : ''}{r.errors.length && r.warnings.length ? ' · ' : ''}{r.warnings.length ? `${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}` : ''}</span>}
                                        </td>
                                        <td className="px-1 py-1.5">
                                            <span className="w-10 h-10 rounded-lg bg-white ring-1 ring-line overflow-hidden flex items-center justify-center">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                {thumb ? <img src={thumb} alt="" className="max-w-full max-h-full object-contain" loading="lazy" /> : <ImageIcon size={15} className="text-ink-4" />}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 min-w-[220px] max-w-[300px]">
                                            <span className={cn('block line-clamp-2 font-medium text-ink', bad('name'))}>{r.name || 'Missing name'}</span>
                                            <span className={cn('block text-[11.5px] text-ink-3', bad('brand'))}>{r.brand || (r.missing.some((m) => m.field === 'brand') ? 'Brand missing' : '')}</span>
                                        </td>
                                        <td className="px-3 py-2 font-mono whitespace-nowrap">{val(r.ean, 'ean')}</td>
                                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{val(r.priceEur !== null ? eur(r.priceEur) : null, 'price')}{r.supplierCurrency && r.supplierCurrency !== 'EUR' && r.supplierPrice !== null && <span className="block text-[11px] text-ink-4">{r.supplierPrice.toFixed(2)} {r.supplierCurrency}</span>}</td>
                                        <td className="px-3 py-2 tabular-nums">{val(r.unitsPerCase, 'unitsPerCase')}</td>
                                        <td className="px-3 py-2 tabular-nums">{val(r.stock !== null ? int(r.stock) : null, 'stock')}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{val(r.moq !== null ? `${r.moq} ${r.moqUnit.toLowerCase()}${r.moq === 1 ? '' : 's'}` : null, 'moq')}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{val(r.weight, 'weight')}</td>
                                        <td className="px-3 py-2 max-w-[140px] truncate">{val(r.category, 'category')}</td>
                                        <td className="px-2 py-2 text-ink-4"><ChevronDown size={15} className={cn('transition-transform', isOpen && 'rotate-180')} /></td>
                                    </tr>
                                    {isOpen && <tr className="bg-surface-2/30"><td colSpan={12} className="px-3 sm:px-5 pb-4 pt-1"><RowDetail r={r} label={label} photoUrl={photoUrl} /></td></tr>}
                                    {!isOpen && (r.errors.length > 0 || r.warnings.length > 0) && (
                                        <tr className="bg-surface-2/20">
                                            <td />
                                            <td colSpan={11} className="px-3 pb-2 text-[12px]">
                                                {r.errors.slice(0, 2).map((e, i) => <p key={'e' + i} className="text-red-700">✕ {e.reason}</p>)}
                                                {r.warnings.slice(0, 2).map((w, i) => <p key={'w' + i} className="text-amber-800">⚠ {w}</p>)}
                                                {r.errors.length + r.warnings.length > 4 && <p className="text-ink-3">Open the row for everything.</p>}
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
            {pages > 1 && (
                <div className="flex items-center justify-between text-[13px] text-ink-3">
                    <span>{page * PAGE + 1}–{Math.min(rows.length, page * PAGE + PAGE)} of {int(rows.length)}</span>
                    <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} />} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                        <span className="px-2 tabular-nums">Page {page + 1} of {pages}</span>
                        <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={15} /></Button>
                    </div>
                </div>
            )}
            {s.missingImages > 0 && <Notice tone="info">{s.missingImages} row{s.missingImages === 1 ? ' has' : 's have'} no photo, so {s.missingImages === 1 ? 'it is' : 'they are'} saved as {s.missingImages === 1 ? 'a draft' : 'drafts'}. After importing you can find a photo by barcode (you approve it) or upload your own.</Notice>}
        </div>
    );
}

/** Every imported field next to the column and cell it came from. */
function RowDetail({ r, label, photoUrl }: { r: ReviewRow; label: (k: string) => string; photoUrl: (p: string) => string | undefined }) {
    const show: [string, string, React.ReactNode][] = [
        ['name', 'Product name', r.name], ['brand', 'Brand', r.brand], ['ean', 'Barcode', r.ean], ['category', 'Category', r.category],
        ['price', 'Price per case (EUR)', r.priceEur !== null ? eur(r.priceEur, 4) : null], ['unitsPerCase', 'Pieces per case', r.unitsPerCase],
        ['casesPerPallet', 'Cases per pallet', r.casesPerPallet], ['stock', 'Stock (cases)', r.stock], ['moq', 'MOQ', r.moq !== null ? `${r.moq} ${r.moqUnit.toLowerCase()}` : null],
        ['weight', 'Weight per piece', r.weight], ['origin', 'Country of origin', r.origin], ['exwLocation', 'EXW location', r.exwLocation], ['shelfLife', 'BBD / shelf life', r.shelfLife],
    ];
    const sourceOf = (f: string) => {
        for (const k of SOURCE_KEYS[f] || [f]) if (r.from[k]) return { col: r.from[k].column, value: r.from[k].value, as: k !== f ? label(k) : '' };
        return null;
    };
    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">
                <table className="w-full text-[12.5px]">
                    <thead><tr className="text-ink-4 text-[11.5px]"><th className="text-start font-medium py-1 pe-3">Your column</th><th className="text-start font-medium py-1 pe-3">In your file</th><th aria-hidden /><th className="text-start font-medium py-1 pe-3">Atlantis field</th><th className="text-start font-medium py-1">Imported value</th></tr></thead>
                    <tbody>
                        {show.map(([f, l, v]) => {
                            const src = sourceOf(f);
                            const note = r.notes[f];
                            const err = r.errors.find((e) => e.field === f || SOURCE_KEYS[f]?.includes(e.field));
                            const miss = r.missing.find((m) => m.field === f);
                            if (!src && !note && (v === null || v === '' || v === undefined) && !miss && !err) return null;
                            return (
                                <tr key={f} className="border-t border-line/70 align-top">
                                    <td className="py-1.5 pe-3 text-ink-2">{src ? `“${src.col}”` : <span className="italic text-ink-4">{note ? 'not a column' : '—'}</span>}{src?.as && <span className="block text-[11px] text-ink-4">as {src.as}</span>}</td>
                                    <td className="py-1.5 pe-3 font-mono text-ink-3 break-all">{src ? (src.value === '' ? <span className="italic">empty</span> : src.value) : ''}</td>
                                    <td className="py-1.5 pe-2 text-ink-4"><ArrowRight size={12} /></td>
                                    <td className="py-1.5 pe-3 text-ink-2">{l}</td>
                                    <td className="py-1.5">
                                        <span className={cn('font-medium', err ? 'text-red-700' : miss ? 'text-amber-800' : 'text-ink')}>{v === null || v === '' || v === undefined ? (miss ? 'Missing' : '—') : v}</span>
                                        {note && <span className="block text-[11.5px] text-ink-3">{note}</span>}
                                        {err && <span className="block text-[11.5px] text-red-700">{err.reason}</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {Object.keys(r.aux).length > 0 && <p className="mt-2 text-[12px] text-ink-3"><b className="text-ink-2">Kept in the import record:</b> {Object.entries(r.aux).map(([k, v]) => `${label(k)} ${v}`).join(' · ')}</p>}
                {r.changes.length > 0 && (
                    <div className="mt-3">
                        <p className="text-[12.5px] font-semibold text-heading">Changes to “{r.existing?.name}”</p>
                        <ul className="mt-1 text-[12.5px] space-y-0.5">{r.changes.map((c) => <li key={c.field}><span className="text-ink-3">{c.label}:</span> <span className="line-through text-ink-4">{c.from}</span> → <b>{c.to}</b></li>)}</ul>
                    </div>
                )}
                {r.state === 'unchanged' && <p className="mt-2 text-[12.5px] text-ink-3">Already in your catalog with the same values — nothing will change.</p>}
            </div>
            <div className="space-y-2 text-[12.5px]">
                {r.images.length > 0 && (
                    <div>
                        <p className="text-ink-3 mb-1">{r.notes.imageUrl || 'Photo from your file'}</p>
                        <div className="flex gap-2 flex-wrap">{r.images.map((p) => { const u = photoUrl(p); return u ? <span key={p} className="w-24 h-24 rounded-lg bg-white ring-1 ring-line flex items-center justify-center overflow-hidden">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="" className="max-w-full max-h-full object-contain" /></span> : <span key={p} className="text-ink-4">A picture in a format browsers can’t show</span>; })}</div>
                    </div>
                )}
                {r.errors.map((e, i) => <p key={'e' + i} className="flex gap-1.5 text-red-700"><XCircle size={14} className="mt-0.5 shrink-0" />{e.reason}</p>)}
                {r.missing.length > 0 && <p className="flex gap-1.5 text-amber-800"><CircleDashed size={14} className="mt-0.5 shrink-0" />Draft until added: {r.missing.map((m) => m.label.toLowerCase()).join(', ')}.</p>}
                {r.warnings.map((w, i) => <p key={'w' + i} className="flex gap-1.5 text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{w}</p>)}
            </div>
        </div>
    );
}
