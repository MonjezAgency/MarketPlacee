'use client';

import * as React from 'react';
import { ArrowRight, CheckCircle2, CircleDashed, Image as ImageIcon, Info, Layers, Pencil, X } from 'lucide-react';
import { Badge, Button, Card, Notice, inputCls, selectCls, type Tone } from '@/components/supplier/ui';
import { Trans } from '@/components/i18n/Trans';
import { cn } from '@/lib/utils';
import { NEEDS, SOURCE_LABEL, categoryLabel, fieldLabel, listJoin, moqAmount, moqUnitsLabel, unitLabel, type Analysis, type ColumnSuggestion, type FieldDef, type Settings, type Source, type TFn } from './types';
import { useLanguage } from '@/contexts/LanguageContext';

/** “header” in the current language's quotation marks. */
const q = (t: TFn, s: string) => t('supplierCatalog', 'quoted', { text: s });

export interface MapState {
    selected: Set<string>;
    mapping: Record<string, string>;
    touched: Set<string>;
    sources: Record<string, Source>;
    settings: Settings;
}

/** Columns that still need a decision, and fields set by two columns of the same sheet. */
export function mappingProblems(a: Analysis, s: MapState) {
    const active = a.columns.filter((c) => c.sheets.some((x) => s.selected.has(x)));
    const unresolved = active.filter((c) => c.candidates.length && !s.touched.has(c.key) && !s.mapping[c.key]);
    const conflicts = new Map<string, string[]>(); // field → headers
    for (const sh of a.sheets.filter((x) => s.selected.has(x.name))) {
        const seen = new Map<string, string>();
        for (const col of sh.columns) {
            const f = s.mapping[col.key];
            if (!f) continue;
            const as = f === 'eanPair' ? 'ean' : f;
            if (seen.has(as) && seen.get(as) !== col.header) conflicts.set(as, [seen.get(as)!, col.header]);
            seen.set(as, col.header);
        }
    }
    const ambiguousDecimal = active.filter((c) => c.decimal === 'ambiguous' && s.mapping[c.key] && !s.settings.decimal[c.key]);
    return { active, unresolved, conflicts, ambiguousDecimal };
}

export default function MapStep({ analysis, fields, state, setState, categories, currencies, moqUnits, unitTypes, photoCount }: {
    analysis: Analysis; fields: FieldDef[]; state: MapState; setState: React.Dispatch<React.SetStateAction<MapState>>;
    categories: string[]; currencies: string[]; moqUnits: string[]; unitTypes: string[]; photoCount: number;
}) {
    const { t, fmt, meta } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const { active, unresolved, conflicts, ambiguousDecimal } = mappingProblems(analysis, state);
    const sheets = analysis.sheets.filter((s) => state.selected.has(s.name));
    const multi = analysis.sheets.length > 1;
    const rows = sheets.reduce((n, s) => n + s.rows.length, 0);
    const setMap = (key: string, field: string) => setState((p) => ({ ...p, mapping: { ...p.mapping, [key]: field }, touched: new Set(p.touched).add(key) }));
    const hidden = active.find((c) => c.hiddenDecimals && ['price', 'piecePrice', 'displayPrice'].includes(state.mapping[c.key]));
    const priceCol = active.find((c) => ['price', 'piecePrice', 'displayPrice'].includes(state.mapping[c.key]));
    const rowsWithPhoto = sheets.reduce((n, s) => n + s.rows.filter((r) => r.images?.length).length, 0);
    const otherPics = sheets.reduce((n, s) => n + s.otherImages.count, 0);

    return (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
            <div className="min-w-0 space-y-4">
                {analysis.notices.map((n) => <Notice key={n} tone="warning">{n}</Notice>)}
                {multi && (
                    <Card title={tc('sheetsTitle')} description={tc('sheetsDesc', { count: analysis.sheets.length })}>
                        <div className="flex flex-wrap gap-2">
                            {analysis.sheets.map((s) => {
                                const on = state.selected.has(s.name);
                                return (
                                    <label key={s.name} className={cn('inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 text-[13px] cursor-pointer', on ? 'ring-teal bg-teal-soft/50 text-heading' : 'ring-line text-ink-3')}>
                                        <input type="checkbox" className="accent-[#0E7C74]" checked={on}
                                            onChange={() => setState((p) => { const sel = new Set(p.selected); on ? sel.delete(s.name) : sel.add(s.name); return { ...p, selected: sel }; })} />
                                        <span className="font-medium">{s.name.trim()}</span>
                                        <span className="tabular-nums text-ink-4">{fmt.number(s.rows.length)}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-[12.5px] text-ink-3">{tc('sheetsSelected', { count: analysis.sheets.length, selected: fmt.number(sheets.length) })} · {tc('productRowsCount', { count: rows })}</p>
                    </Card>
                )}

                <Card title={tc('matchTitle')} bodyClassName="px-0 pb-0"
                    description={tc('matchDesc', { check: tc('badgeCheck'), choose: tc('badgeChoose') })}>
                    {(unresolved.length > 0 || conflicts.size > 0) && (
                        <div className="px-4 sm:px-5 pb-3 space-y-2">
                            {unresolved.length > 0 && <Notice tone="warning" title={tc('columnsNeedChoice', { count: unresolved.length })}>{tc('couldMeanMore', { count: unresolved.length, columns: listJoin(unresolved.map((c) => q(t, c.header.trim())), meta.intl), leaveOut: tc('leaveOut') })}</Notice>}
                            {Array.from(conflicts).map(([f, hs]: [string, string[]]) => <Notice key={f} tone="danger" title={tc('conflictTitle')}>{tc('conflictBody', { columns: listJoin(hs.map((h) => q(t, h.trim())), meta.intl), field: fieldLabel(fields, f, t) })}</Notice>)}
                        </div>
                    )}
                    <div className="overflow-x-auto border-t border-line">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-surface-2/60 text-ink-3 text-[12px]">
                                    <th className="text-start font-medium px-4 py-2 w-[30%]">{tc('colInYourFile')}</th>
                                    <th className="text-start font-medium px-2 py-2">{tc('colSampleValues')}</th>
                                    <th className="w-6" aria-hidden />
                                    <th className="text-start font-medium px-2 py-2 min-w-[220px]">{tc('colImportedAs')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {active.map((c) => <ColumnRow key={c.key} c={c} fields={fields} value={state.mapping[c.key] ?? ''} touched={state.touched.has(c.key)} multi={multi} selectedCount={sheets.length}
                                    conflict={Array.from(conflicts.keys()).includes(state.mapping[c.key] === 'eanPair' ? 'ean' : state.mapping[c.key])}
                                    decimal={state.settings.decimal[c.key]} onDecimal={(d) => setState((p) => ({ ...p, settings: { ...p.settings, decimal: { ...p.settings.decimal, [c.key]: d } } }))}
                                    onChange={(f) => setMap(c.key, f)} />)}
                            </tbody>
                        </table>
                    </div>
                    {(() => {
                        const empty = Array.from(new Set(sheets.flatMap((s) => s.emptyColumns)));
                        const skipped = sheets.flatMap((s) => s.skipped.map((k) => ({ ...k, sheet: s.name })));
                        if (!empty.length && !skipped.length) return null;
                        return (
                            <div className="px-4 sm:px-5 py-3 border-t border-line text-[12.5px] text-ink-3 space-y-1">
                                {empty.length > 0 && <p><b className="text-ink-2">{tc('emptyColumns')}</b> {listJoin(empty.map((e) => q(t, e.trim())), meta.intl)}.</p>}
                                {skipped.length > 0 && (
                                    <details>
                                        <summary className="cursor-pointer"><Trans text={tc('rowsNotRead', { count: skipped.length, n: fmt.number(skipped.length) })} tags={{ b: (c) => <b className="text-ink-2">{c}</b> }} /></summary>
                                        <ul className="mt-1 ps-4 list-disc max-h-40 overflow-auto">{skipped.map((k) => <li key={`${k.sheet}-${k.row}`}>{multi ? `${k.sheet.trim()} · ` : ''}{tc('rowN', { row: k.row })}: {k.reason} <span className="text-ink-4">(<bdi>{k.preview}</bdi>)</span></li>)}</ul>
                                    </details>
                                )}
                            </div>
                        );
                    })()}
                </Card>
                <p className="text-[12.5px] text-ink-3 flex items-start gap-1.5"><Info size={14} className="mt-0.5 shrink-0" />{tc('recordOnlyNote', { label: tc('badgeRecordOnly') })}</p>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-4">
                <Card title={tc('needsTitle')} description={tc('needsDesc')}>
                    <ul className="space-y-2.5">
                        {NEEDS.map((n) => <NeedRow key={n.key} need={n} analysis={analysis} state={state} setState={setState} fields={fields} categories={categories} moqUnits={moqUnits} unresolvedPrice={!!unresolved.find((c) => c.candidates.some((x) => ['price', 'piecePrice'].includes(x)))} />)}
                        <li className="flex items-start gap-2.5 text-[13px]">
                            {rowsWithPhoto ? <CheckCircle2 size={16} className="mt-0.5 text-emerald-600 shrink-0" /> : <CircleDashed size={16} className="mt-0.5 text-amber-600 shrink-0" />}
                            <span className="min-w-0">
                                <span className="font-medium text-ink">{tc('missing_images')}</span>
                                <span className="block text-[12.5px] text-ink-3">
                                    {rowsWithPhoto ? tc('rowsWithPhoto', { count: rows, n: fmt.number(rowsWithPhoto) }) : active.some((c) => state.mapping[c.key] === 'imageUrl') ? tc('fromImageLinks') : tc('noPhotosInFile')}
                                    {otherPics > 0 && ` ${tc('otherPictures', { count: otherPics })}`}
                                </span>
                            </span>
                        </li>
                    </ul>
                </Card>

                <Card title={tc('fileSettings')}>
                    <div className="space-y-3">
                        <label className="block">
                            <span className="block mb-1 text-[13px] font-medium text-ink-2">{tc('pricesAreIn')}</span>
                            <select value={state.settings.currency} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, currency: e.target.value } }))} className={selectCls} aria-label={tc('currencyOfPrices')}>
                                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {priceCol?.currency && <span className="block mt-1 text-[12px] text-ink-3">{tc('detectedCurrency', { code: priceCol.currency.code, source: priceCol.currency.source })}</span>}
                        </label>
                        {hidden?.hiddenDecimals && (
                            <fieldset className="rounded-lg ring-1 ring-amber-200 bg-amber-50/60 dark:bg-amber-500/10 p-3">
                                <legend className="sr-only">{tc('priceDecimals')}</legend>
                                <p className="text-[12.5px] text-ink-2"><Trans text={tc('hiddenDecimals', { count: hidden.hiddenDecimals.count, n: fmt.number(hidden.hiddenDecimals.count), where: multiSheet(analysis) ? tc('whereSheetRow', { sheet: hidden.hiddenDecimals.example.sheet.trim(), row: hidden.hiddenDecimals.example.row }) : tc('rowN', { row: hidden.hiddenDecimals.example.row }), shown: hidden.hiddenDecimals.example.shown, exact: hidden.hiddenDecimals.example.exact })} tags={{ b: (c) => <b>{c}</b>, n: (c) => <b dir="ltr">{c}</b> }} /></p>
                                {(['shown', 'exact'] as const).map((v) => (
                                    <label key={v} className="mt-1.5 flex items-center gap-2 text-[13px]">
                                        <input type="radio" name="precision" className="accent-[#0E7C74]" checked={state.settings.pricePrecision === v} onChange={() => setState((p) => ({ ...p, settings: { ...p.settings, pricePrecision: v } }))} />
                                        {v === 'shown' ? tc('valueShown', { value: hidden.hiddenDecimals!.example.shown }) : tc('valueFull', { value: hidden.hiddenDecimals!.example.exact })}
                                    </label>
                                ))}
                            </fieldset>
                        )}
                        <label className="block">
                            <span className="block mb-1 text-[13px] font-medium text-ink-2">{tc('plainMoqNumbers')}</span>
                            <select value={state.settings.moqUnit} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, moqUnit: e.target.value } }))} className={selectCls}>
                                {moqUnits.map((u) => <option key={u} value={u}>{moqUnitsLabel(u, t)}</option>)}
                            </select>
                            <span className="block mt-1 text-[12px] text-ink-3">{tc('moqTextReadAsWritten')}</span>
                        </label>
                        <label className="block">
                            <span className="block mb-1 text-[13px] font-medium text-ink-2">{tc('onePieceIsA')}</span>
                            <select value={state.settings.unit} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, unit: e.target.value } }))} className={selectCls}>
                                {unitTypes.map((u) => <option key={u} value={u}>{unitLabel(u, t)}</option>)}
                            </select>
                        </label>
                    </div>
                </Card>
                {ambiguousDecimal.length > 0 && <Notice tone="warning" title={tc('chooseNumberFormatTitle')}>{tc('pickNumberFormat', { columns: listJoin(ambiguousDecimal.map((c) => q(t, c.header.trim())), meta.intl) })}</Notice>}
                {photoCount > 0 && <p className="text-[12px] text-ink-4 flex items-center gap-1.5"><ImageIcon size={13} />{tc('picturesStayOnDevice', { count: photoCount })}</p>}
            </aside>
        </div>
    );
}

const multiSheet = (a: Analysis) => a.sheets.length > 1;

function ColumnRow({ c, fields, value, touched, multi, selectedCount, conflict, decimal, onDecimal, onChange }: {
    c: ColumnSuggestion; fields: FieldDef[]; value: string; touched: boolean; multi: boolean; selectedCount: number; conflict: boolean;
    decimal?: '.' | ','; onDecimal: (d: '.' | ',') => void; onChange: (f: string) => void;
}) {
    const { t, fmt } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const fl = (k: string) => fieldLabel(fields, k, t);
    const def = fields.find((f) => f.key === value);
    const changed = touched && value !== (c.field ?? '');
    const status: { tone: Tone; label: string } =
        conflict ? { tone: 'danger', label: tc('badgeConflict') }
            : c.candidates.length && !touched && !value ? { tone: 'danger', label: tc('badgeChoose') }
                : changed ? { tone: 'brand', label: value ? tc('badgeSetByYou') : tc('badgeLeftOut') }
                    : !value ? { tone: 'neutral', label: c.confidence === 'none' ? tc('badgeNotRecognised') : tc('badgeLeftOut') }
                        : def && !def.stored ? { tone: 'neutral', label: tc('badgeRecordOnly') }
                            : c.confidence === 'high' ? { tone: 'success', label: tc('badgeMatched') } : { tone: 'warning', label: tc('badgeCheck') };
    const product = fields.filter((f) => f.stored);
    const extra = fields.filter((f) => !f.stored);
    const inSheets = multi && c.sheets.length < selectedCount ? tc('inNSheets', { count: c.sheets.length }) : '';
    return (
        <tr className={cn('border-t border-line align-top', conflict && 'bg-red-50/50 dark:bg-red-500/5')}>
            <td className="px-4 py-2.5">
                {c.parent && <span className="block text-[11.5px] text-ink-4">{c.parent.trim()} ›</span>}
                <span className="font-medium text-ink break-words">{c.header.replace(/\s+/g, ' ').trim()}</span>
                <span className="block text-[11.5px] text-ink-4">{[inSheets, c.filled < c.total ? tc('filledInRows', { count: c.total, n: fmt.number(c.filled) }) : ''].filter(Boolean).join(' · ')}</span>
            </td>
            <td className="px-2 py-2.5 max-w-[260px]">
                <span className="flex flex-wrap gap-1">
                    {c.samples.slice(0, 3).map((s) => <span key={s} className="max-w-[200px] truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2" title={s}>{s}</span>)}
                </span>
            </td>
            <td className="py-3 text-ink-4" aria-hidden><ArrowRight size={14} className="rtl:rotate-180" /></td>
            <td className="px-2 py-2.5 pe-4">
                <div className="flex items-center gap-2">
                    <select aria-label={tc('importColumnAs', { column: c.header.trim() })} value={value} onChange={(e) => onChange(e.target.value)} className={cn(selectCls, 'h-9 flex-1 min-w-[180px]', conflict && 'ring-red-400')}>
                        {c.candidates.length > 0 && !value && <option value="" disabled={!touched}>{touched ? tc('leaveOut') : tc('choose')}</option>}
                        {c.candidates.length > 0 && <optgroup label={tc('mostLikely')}>{c.candidates.map((k) => <option key={'c' + k} value={k}>{fl(k)}</option>)}</optgroup>}
                        <option value="">{tc('leaveOut')}</option>
                        <optgroup label={tc('productFields')}>{product.map((f) => <option key={f.key} value={f.key}>{fl(f.key)}{f.required === 'yes' ? ' *' : ''}</option>)}</optgroup>
                        <optgroup label={tc('recordOnlyGroup')}>{extra.map((f) => <option key={f.key} value={f.key}>{fl(f.key)}</option>)}</optgroup>
                    </select>
                    <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <p className="mt-1 text-[12px] text-ink-3">{changed ? (c.field ? tc('suggestedField', { field: fl(c.field) }) : c.candidates.length ? tc('youChoseOptions', { options: c.candidates.map(fl).join(' / ') }) : tc('setByYouDot')) : c.reason}{c.checks.length ? ` ${c.checks.join(' · ')}.` : ''}</p>
                {c.decimal === 'ambiguous' && value && (
                    <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-amber-800">
                        {tc('numbersWrittenAs')}
                        <select value={decimal ?? ''} onChange={(e) => onDecimal(e.target.value as '.' | ',')} className={cn(selectCls, 'h-8 w-auto text-[12.5px]')}>
                            <option value="" disabled>{tc('chooseLower')}</option>
                            <option value=".">1,234.56</option>
                            <option value=",">1.234,56</option>
                        </select>
                    </label>
                )}
            </td>
        </tr>
    );
}

function NeedRow({ need, analysis, state, setState, fields, categories, moqUnits, unresolvedPrice }: {
    need: (typeof NEEDS)[number]; analysis: Analysis; state: MapState; setState: React.Dispatch<React.SetStateAction<MapState>>;
    fields: FieldDef[]; categories: string[]; moqUnits: string[]; unresolvedPrice: boolean;
}) {
    const { t } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const [editing, setEditing] = React.useState(false);
    const keys = [need.key, ...(need.also || [])];
    const sheets = analysis.sheets.filter((s) => state.selected.has(s.name));
    const cols = analysis.columns.filter((c) => keys.includes(state.mapping[c.key]) && c.sheets.some((s) => state.selected.has(s)));
    const covered = new Set(cols.flatMap((c) => c.sheets.filter((s) => state.selected.has(s))));
    const partial = cols.length > 0 && covered.size < sheets.length;
    const src = state.sources[need.key];
    const hint = need.key === 'exwLocation' ? analysis.hints.find((h) => h.field === 'exwLocation') : undefined;
    const hasSections = sheets.some((s) => s.sections.length);
    const ok = cols.length > 0 || !!src;
    const shownValue = (v?: string) => (need.key === 'category' && v ? categoryLabel(v, t) : v ?? '');
    const describe = (s: Source) => s.kind === 'constant'
        ? (s.perSheet && Object.values(s.perSheet).some(Boolean) ? (s.value ? tc('setPerSheetOthers', { value: shownValue(s.value) }) : tc('setPerSheet')) : tc('setByYouValue', { value: need.key === 'moq' && state.sources.moqUnit?.value && s.value && /^\d+$/.test(s.value) ? moqAmount(Number(s.value), state.sources.moqUnit.value, t) : shownValue(s.value) }))
        : s.kind === 'section' ? tc('fromSectionHeadings', { examples: Array.from(new Set(sheets.flatMap((x) => x.sections))).slice(0, 3).join(', ') })
            : s.kind === 'sheetName' ? tc('fromSheetName')
                : need.key === 'brand' ? (s.value || (s.perSheet && Object.keys(s.perSheet).length) ? tc('fromNameBrandOtherwise') : tc('fromNameBrand')) : tc('fromNameWeight');
    return (
        <li className="text-[13px]">
            <div className="flex items-start gap-2.5">
                {ok && !partial ? <CheckCircle2 size={16} className="mt-0.5 text-emerald-600 shrink-0" /> : <CircleDashed size={16} className="mt-0.5 text-amber-600 shrink-0" />}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{tc(need.label)}</span>
                        {need.sources.length > 0 && !cols.length && <button type="button" onClick={() => setEditing((e) => !e)} className="ms-auto inline-flex items-center gap-1 text-[12px] font-medium text-teal hover:underline">{editing ? <><X size={12} />{tc('close')}</> : src ? <><Pencil size={12} />{tc('change')}</> : tc('addAValue')}</button>}
                    </div>
                    <span className="block text-[12.5px] text-ink-3">
                        {cols.length ? `${tc('fromColumns', { columns: cols.map((c) => q(t, c.header.replace(/\s+/g, ' ').trim())).join(' / ') })}${partial ? ` — ${tc('notInSheets', { count: sheets.length - covered.size })}` : ''}`
                            : need.key === 'price' && unresolvedPrice ? tc('choosePriceMeaning')
                                : src ? describe(src) : tc('notInFile')}
                    </span>
                    {hint && src?.kind === 'constant' && src.value === hint.value && <span className="block text-[12px] text-ink-4">{tc('suggestedFrom', { source: hint.source })}</span>}
                    {editing && <SourceEditor need={need} source={src} sheets={sheets.map((s) => s.name)} hasSections={hasSections} categories={categories} moqUnits={moqUnits}
                        moqUnit={state.sources.moqUnit?.value}
                        onChange={(s, extra) => { setEditing(false); setState((p) => {
                            const next = { ...p.sources };
                            if (s) next[need.key] = s; else delete next[need.key];
                            if (need.key === 'moq') { if (s && extra?.moqUnit) next.moqUnit = { kind: 'constant', value: extra.moqUnit }; else if (!s) delete next.moqUnit; }
                            return { ...p, sources: next };
                        }); }} />}
                </div>
            </div>
            {need.key === 'name' && !cols.length && <p className="mt-1 ms-6 text-[12px] text-red-700">{tc('mapNameColumn')}</p>}
        </li>
    );
}

function SourceEditor({ need, source, sheets, hasSections, categories, moqUnits, moqUnit, onChange }: {
    need: (typeof NEEDS)[number]; source?: Source; sheets: string[]; hasSections: boolean; categories: string[]; moqUnits: string[]; moqUnit?: string;
    onChange: (s: Source | null, extra?: { moqUnit?: string }) => void;
}) {
    const { t } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const kinds = need.sources.filter((k) => (k !== 'section' || hasSections) && (k !== 'sheetName' || sheets.length > 1));
    // Pre-select only when there is nothing to choose between (e.g. stock: one value); never nudge towards a guess.
    const [kind, setKind] = React.useState<Source['kind'] | 'none' | ''>(source?.kind ?? (kinds.length === 1 ? kinds[0] : ''));
    const [value, setValue] = React.useState(source?.value ?? '');
    const [perSheet, setPerSheet] = React.useState<Record<string, string>>(source?.perSheet ?? {});
    const [usePerSheet, setUsePerSheet] = React.useState(!!source?.perSheet && Object.keys(source.perSheet).length > 0);
    const [unit, setUnit] = React.useState(moqUnit || 'CASE');
    const input = (v: string, set: (v: string) => void, label: string) => need.key === 'category'
        ? <select aria-label={label} value={v} onChange={(e) => set(e.target.value)} className={cn(selectCls, 'h-9')}><option value="">{tc('chooseCategory')}</option>{categories.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}</select>
        : <input aria-label={label} value={v} onChange={(e) => set(e.target.value)} inputMode={['stock', 'moq', 'unitsPerCase', 'casesPerPallet'].includes(need.key) ? 'numeric' : undefined}
            placeholder={need.key === 'exwLocation' ? tc('cityCountry') : need.key === 'weight' ? tc('weightExample') : ''} className={cn(inputCls, 'h-9')} />;
    const apply = () => {
        if (kind === '') return;
        if (kind === 'none') return onChange(null);
        const ps = usePerSheet ? Object.fromEntries(Object.entries(perSheet).filter(([, v]) => v.trim())) : undefined;
        onChange({ kind, value: value.trim() || undefined, perSheet: ps && Object.keys(ps).length ? ps : undefined }, need.key === 'moq' ? { moqUnit: unit } : undefined);
    };
    const canPerSheet = sheets.length > 1 && (kind === 'constant' || (kind === 'fromName' && need.key === 'brand'));
    return (
        <div className="mt-2 rounded-lg ring-1 ring-line p-3 space-y-2.5 bg-surface-2/40">
            <div className="space-y-1">
                {kinds.map((k) => (
                    <label key={k} className="flex items-center gap-2 text-[12.5px]">
                        <input type="radio" className="accent-[#0E7C74]" checked={kind === k} onChange={() => setKind(k)} />
                        {k === 'fromName' && need.key === 'brand' ? tc('findKnownBrand') : tc(SOURCE_LABEL[k])}
                    </label>
                ))}
                <label className="flex items-center gap-2 text-[12.5px]"><input type="radio" className="accent-[#0E7C74]" checked={kind === 'none'} onChange={() => setKind('none')} />{tc('leaveEmpty')}</label>
            </div>
            {(kind === 'constant' || (kind === 'fromName' && need.key === 'brand')) && (
                <div className="space-y-2">
                    {kind === 'fromName' && <p className="text-[12px] text-ink-3">{tc('noKnownBrandUse')}</p>}
                    {!usePerSheet && (
                        <div className="flex gap-2">
                            {input(value, setValue, tc(need.label))}
                            {need.key === 'moq' && <select aria-label={tc('moqUnit')} value={unit} onChange={(e) => setUnit(e.target.value)} className={cn(selectCls, 'h-9 w-28')}>{moqUnits.map((u) => <option key={u} value={u}>{moqUnitsLabel(u, t)}</option>)}</select>}
                        </div>
                    )}
                    {canPerSheet && (
                        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[#0E7C74]" checked={usePerSheet} onChange={(e) => setUsePerSheet(e.target.checked)} /><Layers size={13} />{tc('differentPerSheet')}</label>
                    )}
                    {usePerSheet && (
                        <div className="max-h-56 overflow-auto space-y-1.5 pe-1">
                            {sheets.map((s) => (
                                <div key={s} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                                    <span className="text-[12.5px] text-ink-2 truncate" title={s}>{s.trim()}</span>
                                    {input(perSheet[s] ?? '', (v) => setPerSheet((p) => ({ ...p, [s]: v })), tc('valueForSheet', { field: tc(need.label), sheet: s }))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <Button size="sm" variant="primary" disabled={kind === ''} onClick={apply}>{tc('apply')}</Button>
        </div>
    );
}
