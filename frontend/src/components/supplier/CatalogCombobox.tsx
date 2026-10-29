'use client';

import * as React from 'react';
import { Check, ChevronDown, Loader2, Plus, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { countryOptions, exactCountry, searchCountries, type CountryOption } from '@/lib/country-match';
import { inputCls } from '@/components/supplier/ui';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

/**
 * Brand and country-of-origin pickers for the product editor: ARIA 1.2
 * combobox (input + listbox, list autocomplete, no automatic selection).
 * Keyboard: ↓/↑ move through the options, Enter chooses, Esc closes.
 * Nothing is chosen for the supplier — a typed value only becomes a brand or
 * a country when they pick it (or type it exactly).
 */

interface Item { key: string; content: React.ReactNode; onPick: () => void; tone?: 'add' }
interface Group { key: string; title?: string; items: Item[] }

function ComboboxBase({ id, text, onText, onCommit, groups, status, live, open, setOpen, invalid, placeholder, listLabel, adornment }: {
    id: string; text: string; onText: (v: string) => void; onCommit: () => void;
    groups: Group[]; status?: React.ReactNode; live?: string; open: boolean; setOpen: (o: boolean) => void;
    invalid?: boolean; placeholder: string; listLabel: string; adornment?: React.ReactNode;
}) {
    const { t } = useLanguage();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const listRef = React.useRef<HTMLUListElement>(null);
    const [active, setActive] = React.useState(-1);
    const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
    React.useEffect(() => { setActive(-1); }, [text, flat.length]);
    React.useEffect(() => {
        if (active < 0) return;
        listRef.current?.querySelector(`#${CSS.escape(`${id}-opt-${active}`)}`)?.scrollIntoView({ block: 'nearest' });
    }, [active, id]);

    const pick = (i: number) => { flat[i]?.onPick(); setOpen(false); };
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(a + 1, flat.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (open) setActive((a) => Math.max(a - 1, -1)); }
        else if (e.key === 'Enter') { if (open && active >= 0) { e.preventDefault(); pick(active); } else if (open) { e.preventDefault(); onCommit(); setOpen(false); } }
        else if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false); } }
        else if (e.key === 'Tab') setOpen(false);
    };
    let n = -1;
    return (
        <div className="relative">
            <input
                ref={inputRef} id={id} value={text} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
                aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined} aria-invalid={invalid || undefined}
                autoComplete="off" spellCheck={false} placeholder={placeholder}
                onChange={(e) => { onText(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
                onBlur={() => { setOpen(false); onCommit(); }}
                onKeyDown={onKeyDown}
                className={cn(inputCls, 'pe-16')}
            />
            <span className="absolute inset-y-0 end-8 flex items-center pointer-events-none">{adornment}</span>
            <button type="button" tabIndex={-1} aria-label={t('catalogFields', 'showList')} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setOpen(!open); inputRef.current?.focus(); }}
                className="absolute inset-y-0 end-0 w-8 flex items-center justify-center text-ink-3 hover:text-ink">
                <ChevronDown size={16} aria-hidden />
            </button>
            <span className="sr-only" aria-live="polite">{open ? live : ''}</span>
            <ul ref={listRef} id={`${id}-list`} role="listbox" aria-label={listLabel} hidden={!open}
                onMouseDown={(e) => e.preventDefault()}
                className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-lg bg-surface ring-1 ring-line shadow-float py-1 text-[13.5px]">
                {status && <li role="presentation" className="px-3 py-2 text-[13px] text-ink-3">{status}</li>}
                {groups.map((g) => g.items.length > 0 && (
                    <li key={g.key} role="presentation">
                        {g.title && <div role="presentation" className="px-3 pt-2 pb-1 text-[11.5px] font-medium text-ink-3">{g.title}</div>}
                        <ul role="group" aria-label={g.title}>
                            {g.items.map((it) => {
                                n += 1;
                                const i = n;
                                return (
                                    <li key={it.key} id={`${id}-opt-${i}`} role="option" aria-selected={active === i}
                                        onClick={() => pick(i)} onMouseEnter={() => setActive(i)}
                                        className={cn('flex items-center gap-2 px-3 min-h-[36px] py-1.5 cursor-pointer', active === i ? 'bg-teal-soft' : '', it.tone === 'add' ? 'text-teal font-medium border-t border-line mt-1' : 'text-ink')}>
                                        {it.content}
                                    </li>
                                );
                            })}
                        </ul>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ─── Brand ─────────────────────────────────────────────────────────────

export type BrandState = 'known' | 'new' | 'unchecked';
interface BrandResult { brands: { name: string; count: number }[]; exact: string | null; similar: { name: string; count: number }[] }

/**
 * Brands on Ali FMCG (live listings + the supplier's own), searched on the
 * server (/supplier-catalog/brands). Choosing one sets its canonical name; a
 * brand that isn't there needs the explicit "add it as a new brand" option.
 */
export function BrandCombobox({ id, value, state, onChange, invalid }: { id: string; value: string; state: BrandState; onChange: (brand: string, state: BrandState) => void; invalid?: boolean }) {
    const { t } = useLanguage();
    const tf = (k: string, v?: Record<string, string | number>) => t('catalogFields', k, v);
    const [open, setOpen] = React.useState(false);
    const [res, setRes] = React.useState<{ q: string; data: BrandResult } | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [failed, setFailed] = React.useState(false);
    const [nonce, setNonce] = React.useState(0);
    const q = value.trim().replace(/\s+/g, ' ');

    React.useEffect(() => {
        if (!open) return;
        const ctl = new AbortController();
        setLoading(true); setFailed(false);
        const timer = window.setTimeout(() => {
            apiFetch(`/supplier-catalog/brands?q=${encodeURIComponent(q)}`, { signal: ctl.signal, cache: 'no-store' })
                .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
                .then((data: BrandResult) => { setRes({ q, data }); setLoading(false); })
                .catch((e) => { if (e?.name !== 'AbortError') { setFailed(true); setLoading(false); } });
        }, 250);
        return () => { window.clearTimeout(timer); ctl.abort(); };
    }, [q, open, nonce]);

    const data = res && res.q === q ? res.data : null;
    const count = (c: number) => <span className="ms-auto text-[12px] text-ink-4 tabular-nums">{tf('brandProducts', { count: c })}</span>;
    const brandItem = (prefix: string, b: { name: string; count: number }): Item => {
        const content = <><span className="truncate"><bdi>{b.name}</bdi></span>{b.name === value && state === 'known' && <Check size={14} className="text-teal shrink-0" aria-hidden />}{count(b.count)}</>;
        return { key: `${prefix}-${b.name}`, onPick: () => onChange(b.name, 'known'), content };
    };
    const groups: Group[] = [];
    if (data) {
        groups.push({ key: 'brands', title: q ? undefined : tf('brandTop'), items: data.brands.map((b) => brandItem('b', b)) });
        if (data.similar.length) groups.push({ key: 'similar', title: tf('brandSimilar'), items: data.similar.map((b) => brandItem('s', b)) });
    }
    const canAdd = !!q && !data?.exact && state !== 'new';
    const addContent = <><Plus size={14} className="shrink-0" aria-hidden /><span>{tf('brandAddNew', { brand: q })}</span></>;
    const retryContent = <><RefreshCw size={14} className="shrink-0 text-ink-3" aria-hidden /><span>{tf('brandRetry')}</span></>;
    if (canAdd && (data || failed)) groups.push({ key: 'add', items: [{ key: 'add', tone: 'add', onPick: () => onChange(q, 'new'), content: addContent }] });
    if (failed) groups.unshift({ key: 'retry', items: [{ key: 'retry', onPick: () => { setOpen(true); setNonce((x) => x + 1); }, content: retryContent }] });
    const status = loading && !data ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" aria-hidden />{tf('brandSearching')}</span>
        : failed ? tf('brandLoadError')
            : data && q && !data.brands.length ? tf('brandNoMatch', { query: q }) : null;
    const live = loading ? tf('brandSearching') : failed ? tf('brandLoadError') : data ? tf('brandResults', { count: data.brands.length }) : '';

    return (
        <ComboboxBase id={id} text={value} open={open} setOpen={(o) => { setOpen(o); if (o && failed) setNonce((x) => x + 1); }}
            onText={(v) => onChange(v, 'unchecked')}
            onCommit={() => { if (state === 'unchecked' && data?.exact) onChange(data.exact, 'known'); else if (state === 'unchecked' && !q && value) onChange('', 'unchecked'); }}
            groups={groups} status={status} live={live} invalid={invalid}
            placeholder={tf('brandPlaceholder')} listLabel={tf('brandListLabel')}
            adornment={state === 'known' && value ? <Check size={15} className="text-teal" aria-hidden /> : loading && open ? <Loader2 size={14} className="animate-spin text-ink-4" aria-hidden /> : null} />
    );
}

// ─── Country of origin ─────────────────────────────────────────────────

/** Every country with its name in the interface language (memoised per language). */
export function useCountryOptions(): CountryOption[] {
    const { meta } = useLanguage();
    return React.useMemo(() => countryOptions(meta.intl), [meta.intl]);
}

/**
 * Countries from the shared list, labelled in the interface language. The
 * stored value is the English name (what the server, product page and
 * filters use). Text that isn't one country stays as typed, for the editor
 * to flag; it is never mapped to a "close" country.
 */
export function CountryCombobox({ id, value, onChange, invalid }: { id: string; value: string; onChange: (name: string) => void; invalid?: boolean }) {
    const { t } = useLanguage();
    const tf = (k: string, v?: Record<string, string | number>) => t('catalogFields', k, v);
    const options = useCountryOptions();
    const selected = options.find((o) => o.name === value) ?? null;
    const shown = selected ? selected.label : value;
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState(shown);
    const [typing, setTyping] = React.useState(false);
    React.useEffect(() => { if (!typing) setText(shown); }, [shown, typing]);

    const results = typing ? searchCountries(options, text) : options;
    const groups: Group[] = [{
        key: 'countries', items: results.map((o) => ({
            key: o.iso, onPick: () => { onChange(o.name); setTyping(false); setText(o.label); },
            content: <><span aria-hidden className="w-5 text-center">{o.flag}</span><span className="truncate">{o.label}</span>{o.name === value && <Check size={14} className="ms-auto text-teal shrink-0" aria-hidden />}</>,
        })),
    }];
    const status = typing && text.trim() && !results.length ? tf('countryNoMatch', { query: text.trim() }) : null;

    return (
        <ComboboxBase id={id} text={text} open={open} setOpen={setOpen}
            onText={(v) => { setText(v); setTyping(true); }}
            onCommit={() => {
                if (!typing) return;
                setTyping(false);
                const raw = text.trim();
                if (!raw) { onChange(''); return; }
                const hit = exactCountry(options, raw);
                if (hit) { onChange(hit.name); setText(hit.label); } else onChange(raw);
            }}
            groups={groups} status={status} live={typing ? tf('countryResults', { count: results.length }) : ''} invalid={invalid}
            placeholder={tf('countryPlaceholder')} listLabel={tf('countryListLabel')}
            adornment={selected ? <span aria-hidden className="text-[15px]">{selected.flag}</span> : null} />
    );
}
