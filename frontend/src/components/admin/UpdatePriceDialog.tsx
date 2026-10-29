'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, Dialog, ErrorState, Field, Notice, inputCls, selectCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

export interface PricedProduct {
    id: string; name: string; ean?: string | null;
    basePrice: number | null; price?: number | null; supplierCurrency?: string | null; supplierPrice?: number | null;
    unitsPerCase?: number | null; casesPerPallet?: number | null; moq?: number | null; moqUnit?: string | null;
}

/**
 * Update the net price of ONE Ali FMCG Catalog product
 * (PATCH /admin-catalog/products/:id/price). The field changed is the listing's
 * own price per case in its currency (supplierPrice / supplierCurrency → basePrice
 * in EUR) — the same field and rules a supplier uses for their own products. The
 * buyer price is never typed here: the server recalculates it with the Ali FMCG
 * markup, and the value shown after saving is what the server returned.
 */
export default function UpdatePriceDialog({ product, onClose, onSaved }: { product: PricedProduct | null; onClose: () => void; onSaved: () => void }) {
    const { t, fmt } = useLanguage();
    const tp = (k: string, v?: Record<string, string | number>) => t('adminProducts', k, v);
    const [rates, setRates] = React.useState<Record<string, number> | null>(null);
    const [price, setPrice] = React.useState('');
    const [basis, setBasis] = React.useState<'case' | 'piece'>('case');
    const [currency, setCurrency] = React.useState('EUR');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!product) return;
        setPrice(''); setBasis('case'); setError(null); setCurrency(product.supplierCurrency || 'EUR');
        if (!rates) apiFetch('/admin-catalog/import/schema').then((r) => (r.ok ? r.json() : null)).then((s) => s?.rates && setRates(s.rates)).catch(() => {});
    }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!product) return null;
    const money = (n: number | null | undefined, cur = 'EUR') => (n == null ? '—' : fmt.number(n, { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 4 }));
    const curNow = product.supplierCurrency || 'EUR';
    const netNow = product.supplierCurrency && product.supplierPrice ? product.supplierPrice : product.basePrice;
    const upc = product.unitsPerCase && product.unitsPerCase > 0 ? product.unitsPerCase : null;
    const n = Number(price.replace(',', '.'));
    const valid = price.trim() !== '' && Number.isFinite(n) && n > 0;
    const perCase = valid ? (basis === 'piece' ? (upc ? n * upc : null) : n) : null;
    const eurPerCase = perCase != null && rates?.[currency] ? perCase * rates[currency] : null;
    const pieceBlocked = basis === 'piece' && !upc;

    const save = async () => {
        if (!valid) { setError(tp('priceInvalid')); return; }
        if (pieceBlocked) { setError(tp('priceNoPack')); return; }
        setBusy(true); setError(null);
        try {
            const res = await apiFetch(`/admin-catalog/products/${product.id}/price`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price: n, currency, basis }) });
            const body = await res.json().catch(() => null);
            if (!res.ok) { const m = body?.message; throw new Error(Array.isArray(m) ? m.join(' ') : m || `HTTP ${res.status}`); }
            const eur2 = (v: number | null | undefined) => (v == null ? '—' : fmt.number(v, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            toast.success(tp('priceSaved', { net: money(body.supplierPrice, body.supplierCurrency), eur: eur2(body.basePrice), buyer: eur2(body.buyerPrice) }), { duration: 6000 });
            onSaved();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    return (
        <Dialog open={!!product} onClose={() => !busy && onClose()} dismissable={!busy} size="md" title={tp('updatePriceTitle')} description={product.name}
            footer={<><Button onClick={onClose} disabled={busy}>{tp('cancel')}</Button><Button variant="primary" loading={busy} disabled={!valid || pieceBlocked} onClick={save}>{tp('savePrice')}</Button></>}>
            <div className="space-y-4 text-[13.5px]">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-surface-2 ring-1 ring-inset ring-line p-3">
                    <div><dt className="text-[12px] text-ink-3">{tp('netNow')}</dt><dd className="font-semibold tabular-nums">{money(netNow, curNow)}{curNow !== 'EUR' && product.basePrice != null && <span className="block text-[12px] font-normal text-ink-3">≈ {money(product.basePrice)}</span>}</dd></div>
                    <div><dt className="text-[12px] text-ink-3">{tp('buyerNow')}</dt><dd className="font-semibold tabular-nums">{product.price ? money(product.price) : '—'}</dd></div>
                    <div><dt className="text-[12px] text-ink-3">{tp('packLabel')}</dt><dd>{upc ? tp('packLine', { pieces: upc, cases: product.casesPerPallet ?? '—' }) : tp('packUnknown')}</dd></div>
                    <div><dt className="text-[12px] text-ink-3">{tp('moq')}</dt><dd>{product.moq ? `${fmt.number(product.moq)} ${String(product.moqUnit || '').toLowerCase()}` : '—'}</dd></div>
                </dl>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_120px]">
                    <Field label={tp('newPrice')} htmlFor="up-price" required>
                        <input id="up-price" data-autofocus inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setError(null); }} className={cn(inputCls, 'tabular-nums')} aria-invalid={!!price && !valid} placeholder={netNow != null ? String(netNow) : ''} />
                    </Field>
                    <Field label={tp('priceBasis')} htmlFor="up-basis">
                        <select id="up-basis" value={basis} onChange={(e) => setBasis(e.target.value as 'case' | 'piece')} className={selectCls}>
                            <option value="case">{tp('perCase')}</option>
                            <option value="piece">{tp('perPiece')}</option>
                        </select>
                    </Field>
                    <Field label={tp('currencyLabel')} htmlFor="up-cur">
                        <select id="up-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
                            {Object.keys(rates || { [curNow]: 1, EUR: 1 }).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </Field>
                </div>
                {pieceBlocked && <Notice tone="warning">{tp('priceNoPack')}</Notice>}
                {valid && perCase != null && (
                    <p className="text-[13px] text-ink-2" aria-live="polite">
                        {tp('newPerCase', { price: money(perCase, currency) })}{eurPerCase != null && currency !== 'EUR' ? ` · ≈ ${money(eurPerCase)}` : ''}{upc ? ` · ${tp('perPieceIs', { price: money(perCase / upc, currency) })}` : ''}
                    </p>
                )}
                <p className="text-[12px] text-ink-3">{tp('priceFieldNote')}</p>
                {error && <ErrorState message={error} />}
            </div>
        </Dialog>
    );
}
