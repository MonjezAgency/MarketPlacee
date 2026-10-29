'use client';

import * as React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDashed, Pencil, RefreshCw, XCircle, Image as ImageIcon } from 'lucide-react';
import { Badge, Button, Card, Notice, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ImportTarget } from './api';
import { categoryLabel, fieldLabel, listJoin, missingLabel, moqAmount, where, type FieldDef, type PhotoResult, type Review, type ReviewRow, type Source } from './types';
import { PhotoChoice, PhotoSearchPanel, PhotoThumb, type PhotoSearchState } from './PhotoSearch';

/** `label` values are supplierCatalog dictionary keys. */
const STATE: Record<ReviewRow['state'], { tone: Tone; label: string; icon: React.ReactNode }> = {
    ready: { tone: 'success', label: 'stateReady', icon: <CheckCircle2 size={13} /> },
    draft: { tone: 'warning', label: 'stateDraft', icon: <CircleDashed size={13} /> },
    update: { tone: 'info', label: 'stateUpdate', icon: <RefreshCw size={13} /> },
    unchanged: { tone: 'neutral', label: 'stateUnchanged', icon: <CheckCircle2 size={13} /> },
    skip: { tone: 'neutral', label: 'stateSkip', icon: <ChevronRight size={13} className="rtl:rotate-180" /> },
    error: { tone: 'danger', label: 'stateError', icon: <XCircle size={13} /> },
};
type Filter = 'all' | 'ready' | 'draft' | 'update' | 'error' | 'warnings' | 'existing';
const PAGE = 50;

/** The rows a field's value can come from, in display order (price and barcode have alternatives). */
const SOURCE_KEYS: Record<string, string[]> = { price: ['price', 'piecePrice', 'displayPrice'], ean: ['ean', 'eanPair'], stock: ['stock', 'stockPieces'] };

export default function ReviewStep({ target = 'supplier', review, fields, multi, sources, photoUrl, onExisting, setOnExisting, onEditMapping, busy, headerOf, photos, picks, onPick, onFindPhotos }: {
    target?: ImportTarget;
    review: Review; fields: FieldDef[]; multi: boolean; sources: Record<string, Source>; headerOf: (key: string) => string;
    photoUrl: (path: string) => string | undefined; onExisting: 'skip' | 'update'; setOnExisting: (v: 'skip' | 'update') => void;
    onEditMapping: () => void; busy: boolean;
    photos: PhotoSearchState; picks: Map<string, PhotoResult>; onPick: (key: string, on: boolean) => void; onFindPhotos: () => void;
}) {
    const { t, fmt, meta } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n));
    const money = (n: number, digits = 2) => fmt.number(n, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });
    const [filter, setFilter] = React.useState<Filter>('all');
    const [page, setPage] = React.useState(0);
    const [open, setOpen] = React.useState<string | null>(null);
    const s = review.summary;
    const existingCount = review.rows.filter((r) => r.existing && r.state !== 'error').length;
    const rows = review.rows.filter((r) => filter === 'all' || (filter === 'warnings' ? r.warnings.length > 0 : filter === 'existing' ? !!r.existing : r.state === filter));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    React.useEffect(() => { setPage(0); }, [filter]);
    const label = (k: string) => fieldLabel(fields, k, t);
    const stored = review.mapping.filter((m) => m.stored);
    const recordOnly = review.mapping.filter((m) => !m.stored && !['rowNumber', 'orderQty'].includes(m.field));
    const tiles: [string, number, Tone, Filter][] = [
        [(target === 'catalog' ? t('adminProducts', 'impTileNewPublish') : tc('tileNewReview')), s.ready, 'success', 'ready'], [tc('tileNewDrafts'), s.draft, 'warning', 'draft'],
        [(target === 'catalog' ? t('adminProducts', 'impTileUpdates') : tc('tileUpdates')), s.update, 'info', 'update'], [tc('tileWontImport'), s.error, 'danger', 'error'],
    ];
    const tabs: [Filter, string, number][] = [['all', tc('filterAllRows'), s.total], ['ready', tc('filterReady'), s.ready], ['draft', tc('tabDrafts'), s.draft], ['update', tc('filterUpdates'), s.update], ['error', tc('filterErrors'), s.error], ['warnings', tc('filterWarnings'), s.withWarnings], ...(existingCount ? [['existing', tc('filterExisting'), existingCount] as [Filter, string, number]] : [])];

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

            <Card title={tc('howColumnsImported')} actions={<Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={onEditMapping}>{tc('change')}</Button>}>
                <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-[13px]">
                    {stored.map((m) => (
                        <li key={m.key} className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-ink-2" title={headerOf(m.key)}>{tc('quoted', { text: headerOf(m.key) })}</span><ArrowRight size={13} className="text-ink-4 shrink-0 rtl:rotate-180" /><span className="font-medium text-ink truncate">{label(m.field)}</span>
                        </li>
                    ))}
                    {Object.entries(sources).map(([f, src]) => (
                        <li key={`src-${f}`} className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-ink-3 italic">{src.kind === 'constant' ? (src.perSheet && Object.keys(src.perSheet).length ? tc('srcValuePerSheet') : tc('srcValue', { value: f === 'category' && src.value ? categoryLabel(src.value, t) : src.value ?? '' })) : src.kind === 'section' ? tc('srcSectionHeadings') : src.kind === 'sheetName' ? tc('srcSheetName') : tc('srcProductName')}</span>
                            <ArrowRight size={13} className="text-ink-4 shrink-0 rtl:rotate-180" /><span className="font-medium text-ink truncate">{label(f)}</span>
                        </li>
                    ))}
                </ul>
                {recordOnly.length > 0 && <p className="mt-3 text-[12.5px] text-ink-3"><b className="text-ink-2">{tc('keptInRecord')}</b> {recordOnly.map((m) => `${tc('quoted', { text: headerOf(m.key) })} (${label(m.field)})`).join(', ')}.</p>}
                {review.notProvided.length > 0 && <p className="mt-1.5 text-[12.5px] text-amber-800"><Trans text={tc('notProvided', { fields: listJoin(review.notProvided, meta.intl) })} tags={{ b: (c) => <b>{c}</b> }} /></p>}
            </Card>

            <PhotoSearchPanel review={review} state={photos} picks={picks} onStart={onFindPhotos} updateExisting={onExisting === 'update'} />

            {/* Brands not on Ali FMCG yet: importing is the supplier's confirmation (catalogFields section). */}
            {(s.newBrands?.length ?? 0) > 0 && (
                <Notice tone="warning" title={t('catalogFields', 'importNewBrandsTitle', { count: s.newBrands!.length })}>
                    {t('catalogFields', 'importNewBrandsBody', { brands: listJoin(s.newBrands!.slice(0, 12).map((b) => `“${b}”`), meta.intl) + (s.newBrands!.length > 12 ? ' …' : '') })}
                </Notice>
            )}

            {existingCount > 0 && (
                <div className="rounded-xl ring-1 ring-line p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                    <span className="text-ink-2"><Trans text={target === 'catalog' ? t('adminProducts', 'impExistingMatch', { count: existingCount, n: fmt.number(existingCount) }) : tc('existingMatch', { count: existingCount, n: fmt.number(existingCount) })} tags={{ b: (c) => <b>{c}</b> }} /></span>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name="exist" checked={onExisting === 'skip'} onChange={() => setOnExisting('skip')} className="accent-[#0E7C74]" /> {tc('leaveAsTheyAre')}</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name="exist" checked={onExisting === 'update'} onChange={() => setOnExisting('update')} className="accent-[#0E7C74]" /> {tc('updateWithFile')}</label>
                    {onExisting === 'update' && <span className="w-full text-[12px] text-ink-3">{(target === 'catalog' ? t('adminProducts', 'impUpdateRules') : tc('updateRules'))}</span>}
                </div>
            )}

            <div role="tablist" aria-label={tc('filterRows')} className="flex gap-1 overflow-x-auto">
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
                            {['colRow', 'colResult', '', 'colProduct', 'colBarcode', 'colPricePerCase', 'colPcsPerCase', 'stock', 'colMoq', 'colWeight', 'category'].map((h, i) => <th key={i} className="text-start font-medium px-3 py-2 whitespace-nowrap">{h ? tc(h) : ''}</th>)}
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.slice(page * PAGE, page * PAGE + PAGE).map((r) => {
                            const st = STATE[r.state];
                            const isOpen = open === r.key;
                            const bad = (f: string) => (r.errors.some((e) => e.field === f || SOURCE_KEYS[f]?.includes(e.field)) ? 'text-red-700 font-medium' : r.missing.some((m) => m.field === f) ? 'text-amber-800' : '');
                            const val = (v: React.ReactNode, f: string) => <span className={bad(f)}>{v === null || v === undefined || v === '' ? (r.missing.some((m) => m.field === f) ? tc('missing') : '—') : v}</span>;
                            const thumb = r.images[0] ? photoUrl(r.images[0]) : undefined;
                            return (
                                <React.Fragment key={r.key}>
                                    <tr className={cn('border-t border-line align-top cursor-pointer hover:bg-surface-2/40', isOpen && 'bg-surface-2/40')} onClick={() => setOpen(isOpen ? null : r.key)}>
                                        <td className="px-3 py-2 tabular-nums text-ink-3 whitespace-nowrap">{where(r, multi, t)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <Badge tone={st.tone}>{st.icon}{tc(st.label)}</Badge>
                                            {(r.errors.length > 0 || r.warnings.length > 0) && <span className="block mt-1 text-[11.5px] text-ink-3">{r.errors.length ? tc('errorsCount', { count: r.errors.length }) : ''}{r.errors.length && r.warnings.length ? ' · ' : ''}{r.warnings.length ? tc('warningsCount', { count: r.warnings.length }) : ''}</span>}
                                        </td>
                                        <td className="px-1 py-1.5">
                                            {!thumb && photos.results.get(r.key)?.candidate && !r.images.length && r.imageStatus !== 'from_link'
                                                ? <PhotoThumb result={photos.results.get(r.key)} picked={picks.has(r.key)} />
                                                : <span className="w-10 h-10 rounded-lg bg-white ring-1 ring-line overflow-hidden flex items-center justify-center">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    {thumb ? <img src={thumb} alt="" className="max-w-full max-h-full object-contain" loading="lazy" /> : <ImageIcon size={15} className="text-ink-4" />}
                                                </span>}
                                        </td>
                                        <td className="px-3 py-2 min-w-[220px] max-w-[300px]">
                                            <span className={cn('block line-clamp-2 font-medium text-ink', bad('name'))}>{r.name || tc('missingName')}</span>
                                            <span className={cn('block text-[11.5px] text-ink-3', bad('brand'))}>{r.brand || (r.missing.some((m) => m.field === 'brand') ? tc('brandMissing') : '')}</span>
                                        </td>
                                        <td className="px-3 py-2 font-mono whitespace-nowrap">{val(r.ean, 'ean')}</td>
                                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{val(r.priceEur !== null ? money(r.priceEur) : null, 'price')}{r.supplierCurrency && r.supplierCurrency !== 'EUR' && r.supplierPrice !== null && <span className="block text-[11px] text-ink-4">{fmt.number(r.supplierPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.supplierCurrency}</span>}</td>
                                        <td className="px-3 py-2 tabular-nums">{val(r.unitsPerCase !== null ? int(r.unitsPerCase) : null, 'unitsPerCase')}</td>
                                        <td className="px-3 py-2 tabular-nums">{val(r.stock !== null ? int(r.stock) : null, 'stock')}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{val(r.moq !== null ? moqAmount(r.moq, r.moqUnit, t) : null, 'moq')}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{val(r.weight, 'weight')}</td>
                                        <td className="px-3 py-2 max-w-[140px] truncate">{val(categoryLabel(r.category, t), 'category')}</td>
                                        <td className="px-2 py-2 text-ink-4"><ChevronDown size={15} className={cn('transition-transform', isOpen && 'rotate-180')} /></td>
                                    </tr>
                                    {isOpen && <tr className="bg-surface-2/30"><td colSpan={12} className="px-3 sm:px-5 pb-4 pt-1"><RowDetail r={r} label={label} photoUrl={photoUrl} money={money} photo={<PhotoChoice result={photos.results.get(r.key)} picked={picks.has(r.key)} onToggle={(on) => onPick(r.key, on)} ownPhoto={r.images.length > 0 || r.imageStatus === 'from_link' || !!r.existing?.hasPhoto} />} /></td></tr>}
                                    {!isOpen && (r.errors.length > 0 || r.warnings.length > 0) && (
                                        <tr className="bg-surface-2/20">
                                            <td />
                                            <td colSpan={11} className="px-3 pb-2 text-[12px]">
                                                {r.errors.slice(0, 2).map((e, i) => <p key={'e' + i} className="text-red-700">✕ {e.reason}</p>)}
                                                {r.warnings.slice(0, 2).map((w, i) => <p key={'w' + i} className="text-amber-800">⚠ {w}</p>)}
                                                {r.errors.length + r.warnings.length > 4 && <p className="text-ink-3">{tc('openRowForAll')}</p>}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {!rows.length && <tr><td colSpan={12} className="px-3 py-8 text-center text-ink-3">{tc('noRowsInView')}</td></tr>}
                    </tbody>
                </table>
            </div>
            {pages > 1 && (
                <div className="flex items-center justify-between text-[13px] text-ink-3">
                    <span>{tc('rangeOf', { from: fmt.number(page * PAGE + 1), to: fmt.number(Math.min(rows.length, page * PAGE + PAGE)), total: int(rows.length) })}</span>
                    <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} className="rtl:rotate-180" />} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{tc('previous')}</Button>
                        <span className="px-2 tabular-nums">{tc('pageOf', { page: fmt.number(page + 1), pages: fmt.number(pages) })}</span>
                        <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>{tc('next')} <ChevronRight size={15} className="rtl:rotate-180" /></Button>
                    </div>
                </div>
            )}
            {s.missingImages > 0 && <Notice tone="info">{tc('missingImagesNotice', { count: s.missingImages })}</Notice>}
        </div>
    );
}

/** Every imported field next to the column and cell it came from. */
function RowDetail({ r, label, photoUrl, money, photo }: { r: ReviewRow; label: (k: string) => string; photoUrl: (p: string) => string | undefined; money: (n: number, digits?: number) => string; photo?: React.ReactNode }) {
    const { t, meta } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const show: [string, string, React.ReactNode][] = [
        ['name', tc('productName'), r.name], ['brand', tc('brand'), r.brand], ['ean', tc('colBarcode'), r.ean], ['category', tc('category'), categoryLabel(r.category, t)],
        ['price', tc('pricePerCaseEur'), r.priceEur !== null ? money(r.priceEur, 4) : null], ['unitsPerCase', tc('piecesPerCase'), r.unitsPerCase],
        ['casesPerPallet', tc('casesPerPallet'), r.casesPerPallet], ['stock', tc('needStock'), r.stock], ['moq', tc('colMoq'), r.moq !== null ? moqAmount(r.moq, r.moqUnit, t) : null],
        ['weight', tc('needWeight'), r.weight], ['origin', tc('origin'), r.origin], ['exwLocation', tc('exwLabel'), r.exwLocation], ['shelfLife', tc('shelfLifeShort'), r.shelfLife],
    ];
    const sourceOf = (f: string) => {
        for (const k of SOURCE_KEYS[f] || [f]) if (r.from[k]) return { col: r.from[k].column, value: r.from[k].value, as: k !== f ? label(k) : '' };
        return null;
    };
    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">
                <table className="w-full text-[12.5px]">
                    <thead><tr className="text-ink-4 text-[11.5px]"><th className="text-start font-medium py-1 pe-3">{tc('colYourColumn')}</th><th className="text-start font-medium py-1 pe-3">{tc('colInYourFileShort')}</th><th aria-hidden /><th className="text-start font-medium py-1 pe-3">{tc('colAtlantisField')}</th><th className="text-start font-medium py-1">{tc('colImportedValue')}</th></tr></thead>
                    <tbody>
                        {show.map(([f, l, v]) => {
                            const src = sourceOf(f);
                            const note = r.notes[f];
                            const err = r.errors.find((e) => e.field === f || SOURCE_KEYS[f]?.includes(e.field));
                            const miss = r.missing.find((m) => m.field === f);
                            if (!src && !note && (v === null || v === '' || v === undefined) && !miss && !err) return null;
                            return (
                                <tr key={f} className="border-t border-line/70 align-top">
                                    <td className="py-1.5 pe-3 text-ink-2">{src ? tc('quoted', { text: src.col }) : <span className="italic text-ink-4">{note ? tc('notAColumn') : '—'}</span>}{src?.as && <span className="block text-[11px] text-ink-4">{tc('asField', { field: src.as })}</span>}</td>
                                    <td className="py-1.5 pe-3 font-mono text-ink-3 break-all">{src ? (src.value === '' ? <span className="italic font-sans">{tc('empty')}</span> : <bdi>{src.value}</bdi>) : ''}</td>
                                    <td className="py-1.5 pe-2 text-ink-4"><ArrowRight size={12} className="rtl:rotate-180" /></td>
                                    <td className="py-1.5 pe-3 text-ink-2">{l}</td>
                                    <td className="py-1.5">
                                        <span className={cn('font-medium', err ? 'text-red-700' : miss ? 'text-amber-800' : 'text-ink')}>{v === null || v === '' || v === undefined ? (miss ? tc('missing') : '—') : v}</span>
                                        {note && <span className="block text-[11.5px] text-ink-3">{note}</span>}
                                        {err && <span className="block text-[11.5px] text-red-700">{err.reason}</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {Object.keys(r.aux).length > 0 && <p className="mt-2 text-[12px] text-ink-3"><b className="text-ink-2">{tc('keptInRecordShort')}</b> {Object.entries(r.aux).map(([k, v]) => `${label(k)} ${v}`).join(' · ')}</p>}
                {r.changes.length > 0 && (
                    <div className="mt-3">
                        <p className="text-[12.5px] font-semibold text-heading">{tc('changesTo', { name: r.existing?.name ?? '' })}</p>
                        <ul className="mt-1 text-[12.5px] space-y-0.5">{r.changes.map((c) => <li key={c.field}><span className="text-ink-3">{c.field === 'images' ? t('catalogImport', 'changePhoto') : label(c.field)}:</span> <bdi className="line-through text-ink-4">{c.from}</bdi> <span className="inline-block rtl:rotate-180">→</span> <b><bdi>{c.to}</bdi></b></li>)}</ul>
                    </div>
                )}
                {r.state === 'unchanged' && <p className="mt-2 text-[12.5px] text-ink-3">{tc('unchangedNote')}</p>}
            </div>
            <div className="space-y-2 text-[12.5px]">
                {photo}
                {r.images.length > 0 && (
                    <div>
                        <p className="text-ink-3 mb-1">{r.notes.imageUrl || tc('photoFromFile')}</p>
                        <div className="flex gap-2 flex-wrap">{r.images.map((p) => { const u = photoUrl(p); return u ? <span key={p} className="w-24 h-24 rounded-lg bg-white ring-1 ring-line flex items-center justify-center overflow-hidden">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="" className="max-w-full max-h-full object-contain" /></span> : <span key={p} className="text-ink-4">{tc('unsupportedPicture')}</span>; })}</div>
                    </div>
                )}
                {r.errors.map((e, i) => <p key={'e' + i} className="flex gap-1.5 text-red-700"><XCircle size={14} className="mt-0.5 shrink-0" />{e.reason}</p>)}
                {r.missing.length > 0 && <p className="flex gap-1.5 text-amber-800"><CircleDashed size={14} className="mt-0.5 shrink-0" />{tc('draftUntilAdded', { fields: listJoin(r.missing.map((m) => missingLabel(m, t)), meta.intl) })}</p>}
                {r.warnings.map((w, i) => <p key={'w' + i} className="flex gap-1.5 text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{w}</p>)}
            </div>
        </div>
    );
}
