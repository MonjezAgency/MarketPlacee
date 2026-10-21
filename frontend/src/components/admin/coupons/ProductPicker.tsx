'use client';

import * as React from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ErrorState, Thumb, inputCls } from '@/components/supplier/ui';
import { adminCouponsApi, type CatalogProduct, type PickedProduct } from '@/lib/admin-coupons-api';
import { useTc } from './couponUi';

/**
 * "Products / SKUs": one searchable selector over real catalogue products (GET /coupons/admin/products: live and
 * in-review products, by name, brand or EAN). In this catalogue a SKU is a product (variants have no ids of their
 * own), so there is no separate SKU picker. Stores product ids only; nothing is chosen for the admin.
 */
export function ProductPicker({ selected, onChange, error }: { selected: PickedProduct[]; onChange: (p: PickedProduct[]) => void; error?: string }) {
    const tc = useTc();
    const [q, setQ] = React.useState('');
    const [results, setResults] = React.useState<CatalogProduct[] | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [failed, setFailed] = React.useState<string | null>(null);
    const listId = React.useId();

    const search = React.useCallback((term: string) => {
        setLoading(true); setFailed(null);
        adminCouponsApi.products(term).then(setResults).catch((e) => setFailed(e?.message || tc('loadFailed'))).finally(() => setLoading(false));
    }, [tc]);
    React.useEffect(() => { const h = setTimeout(() => search(q), 250); return () => clearTimeout(h); }, [q, search]);

    const chosen = new Set(selected.map((p) => p.id));
    const toggle = (p: PickedProduct) => onChange(chosen.has(p.id) ? selected.filter((x) => x.id !== p.id) : [...selected, p]);

    return (
        <div>
            <label htmlFor={`${listId}-q`} className="block mb-1.5 text-[13px] font-medium text-ink-2">
                {tc('productsLabel')} <span className="text-red-600" aria-hidden>*</span>
            </label>
            <div className="relative">
                <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                <input id={`${listId}-q`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tc('productSearchPh')} aria-controls={listId} aria-invalid={!!error} className={cn(inputCls, 'ps-9')} />
                {loading && <Loader2 size={15} className="absolute end-3 top-1/2 -translate-y-1/2 animate-spin text-ink-4" />}
            </div>

            {selected.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={tc('selectedProducts')}>
                    {selected.map((p) => (
                        <li key={p.id} className="inline-flex items-center gap-1 h-7 ps-2.5 pe-1 rounded-md bg-teal-soft text-heading text-[12.5px] ring-1 ring-inset ring-teal/20 max-w-full">
                            <span className="truncate">{p.missing ? tc('productRemoved') : p.name}</span>{p.ean && <bdi dir="ltr" className="text-[11.5px] text-ink-3">{p.ean}</bdi>}
                            <button type="button" onClick={() => toggle(p)} aria-label={tc('removeProduct', { name: p.missing ? tc('productRemoved') : p.name })} className="w-5 h-5 rounded inline-flex items-center justify-center hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><X size={12} /></button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-2 rounded-lg ring-1 ring-line max-h-64 overflow-y-auto">
                {failed ? <div className="p-2"><ErrorState message={failed} onRetry={() => search(q)} /></div>
                    : !results ? <p className="p-3 text-[13px] text-ink-3">{tc('loading')}</p>
                        : results.length === 0 ? <p className="p-3 text-[13px] text-ink-3">{tc('noProducts')}</p>
                            : (
                                <ul id={listId} aria-label={tc('productResults')} className="divide-y divide-line">
                                    {results.map((p) => {
                                        const on = chosen.has(p.id);
                                        return (
                                            <li key={p.id}>
                                                <button type="button" aria-pressed={on} onClick={() => toggle(p)}
                                                    className={cn('w-full flex items-center gap-3 px-3 py-2 text-start text-[13px] hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal', on && 'bg-teal-soft/60')}>
                                                    <span className={cn('w-4 h-4 shrink-0 rounded ring-1 ring-inset flex items-center justify-center', on ? 'bg-teal ring-teal text-white' : 'ring-line-strong')} aria-hidden>{on && <Check size={11} />}</span>
                                                    <Thumb src={p.image} size={32} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium text-ink truncate">{p.name}</span>
                                                        <span className="block text-[12px] text-ink-3 truncate">
                                                            {[p.brand, p.category].filter(Boolean).join(' · ')}
                                                            {p.ean ? <> · <bdi dir="ltr">{p.ean}</bdi></> : null}
                                                            {p.status !== 'APPROVED' ? ` · ${tc('notLive')}` : ''}
                                                        </span>
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
            </div>
            <p className="sr-only" aria-live="polite">{results ? tc('productResultCount', { count: results.length }) : ''}</p>
            {error ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">{error}</p> : <p className="mt-1 text-[12.5px] text-ink-3">{tc('productsHint')}</p>}
        </div>
    );
}
