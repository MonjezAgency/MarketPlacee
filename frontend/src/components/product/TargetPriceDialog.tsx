'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Target } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button, Dialog, Field, Notice, inputCls, selectCls } from '@/components/supplier/ui';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'RON', 'AED', 'SAR', 'EGP'];

export interface TargetProduct {
    id: string; name: string; ean?: string | null; unitsPerCase?: number | null; casesPerPallet?: number | null; palletsPerShipment?: number | null;
    moq?: number | null; moqUnit?: string | null;
}

/**
 * Buyer sets a target price on the product page. The request goes to the
 * Atlantis sourcing desk; it never changes the listing or places an order.
 */
export default function TargetPriceDialog({ open, onClose, product, listedCasePrice }: { open: boolean; onClose: () => void; product: TargetProduct; listedCasePrice?: number | null }) {
    const [basis, setBasis] = React.useState<'CASE' | 'PIECE'>('CASE');
    const [price, setPrice] = React.useState('');
    const [currency, setCurrency] = React.useState('EUR');
    const [qty, setQty] = React.useState('');
    const [unit, setUnit] = React.useState<'CASE' | 'PALLET' | 'TRUCK'>('CASE');
    const [message, setMessage] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [done, setDone] = React.useState<any | null>(null);
    const keyRef = React.useRef('');
    React.useEffect(() => { if (open) { keyRef.current = `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; setError(null); setDone(null); } }, [open]);

    const upc = Number(product.unitsPerCase) || 0, cpp = Number(product.casesPerPallet) || 0, ppt = Number(product.palletsPerShipment) || 0;
    const units: ['CASE' | 'PALLET' | 'TRUCK', string][] = [['CASE', 'cases'], ...(cpp ? [['PALLET', 'pallets']] as any : []), ...(cpp && ppt ? [['TRUCK', 'trucks']] as any : [])];
    const n = Number(qty);
    const cases = Number.isInteger(n) && n > 0 ? (unit === 'CASE' ? n : unit === 'PALLET' ? n * cpp : n * cpp * ppt) : 0;
    const moqText = product.moq ? `${product.moq} ${String(product.moqUnit || 'piece').toLowerCase()}${product.moq === 1 ? '' : 's'}` : null;

    const submit = async () => {
        setError(null);
        const p = Number(price.replace(',', '.'));
        if (!(p > 0)) { setError('Enter the price you’d like to pay.'); return; }
        if (!(Number.isInteger(n) && n > 0)) { setError('Enter a whole quantity.'); return; }
        setBusy(true);
        try {
            const res = await apiFetch('/target-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, price: p, priceBasis: basis, currency, quantity: n, quantityUnit: unit, message: message.trim() || undefined, idempotencyKey: keyRef.current }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : 'We couldn’t send your target price. Please try again.');
            setDone(d);
        } catch (e: any) { setError(e.message); }
        finally { setBusy(false); }
    };

    return (
        <Dialog open={open} onClose={onClose} size="md" title={done ? 'Target price sent' : 'Set a target price'} description={done ? undefined : product.name}
            footer={done ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} icon={<Target size={15} />} onClick={submit}>Send target price</Button></>}>
            {done ? (
                <div className="space-y-3 text-[14px] text-ink-2">
                    <p className="flex items-center gap-2 text-emerald-700 font-medium"><CheckCircle2 size={18} /> Reference {done.ref}</p>
                    <p>Our sourcing desk will review your target of <b className="text-ink">{formatPrice(done.targetCasePrice)}</b> per case for {done.quantityCases.toLocaleString()} cases and reply in your notifications. Nothing is ordered and the listed price doesn’t change.</p>
                    <p>We’ll also tell you if the listed price drops to your target. <Link href="/dashboard/customer/targets" className="text-teal font-semibold hover:underline">See your target prices</Link></p>
                </div>
            ) : (
                <div className="space-y-4">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-2 ring-1 ring-line px-3 py-2.5 text-[13px]">
                        <dt className="text-ink-3">Barcode</dt><dd className="text-end font-mono text-ink-2">{product.ean || '—'}</dd>
                        <dt className="text-ink-3">Listed price</dt><dd className="text-end tabular-nums text-ink-2">{listedCasePrice ? `${formatPrice(listedCasePrice)} / case` : '—'}</dd>
                        {upc > 0 && <><dt className="text-ink-3">Pack</dt><dd className="text-end text-ink-2">{upc} pieces per case</dd></>}
                        {moqText && <><dt className="text-ink-3">Minimum order</dt><dd className="text-end text-ink-2">{moqText}</dd></>}
                    </dl>
                    <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                        <Field label="Your target price" htmlFor="tp-price" required>
                            <div className="flex gap-2">
                                <input id="tp-price" data-autofocus inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0.00" className={cn(inputCls, 'flex-1 min-w-0')} />
                                <div role="radiogroup" aria-label="Price per" className="inline-flex rounded-lg ring-1 ring-line-strong p-0.5 h-10 shrink-0">
                                    {(['CASE', ...(upc ? ['PIECE'] : [])] as ('CASE' | 'PIECE')[]).map((b) => (
                                        <button key={b} type="button" role="radio" aria-checked={basis === b} onClick={() => setBasis(b)} className={cn('px-3 rounded-md text-[13px] font-medium', basis === b ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>per {b.toLowerCase()}</button>
                                    ))}
                                </div>
                            </div>
                        </Field>
                        <Field label="Currency" htmlFor="tp-cur">
                            <select id="tp-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
                        </Field>
                    </div>
                    <Field label="Quantity" htmlFor="tp-qty" required hint={cases ? `${cases.toLocaleString()} cases${upc ? ` · ${(cases * upc).toLocaleString()} pieces` : ''}` : moqText ? `At least ${moqText}.` : undefined}>
                        <div className="flex gap-2">
                            <input id="tp-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} className={cn(inputCls, 'flex-1 min-w-0')} />
                            <select aria-label="Quantity unit" value={unit} onChange={(e) => setUnit(e.target.value as any)} className={cn(selectCls, 'w-[120px] shrink-0')}>{units.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                        </div>
                    </Field>
                    <Field label="Message" htmlFor="tp-msg" optional>
                        <textarea id="tp-msg" rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Delivery country, timing, recurring volume…" className={cn(inputCls, 'h-auto py-2')} />
                    </Field>
                    {currency !== 'EUR' && <p className="text-[12.5px] text-ink-3">Converted to EUR at our fixed rate for comparison; your typed figure is kept as entered.</p>}
                    {error && <Notice tone="danger">{error}</Notice>}
                    <p className="text-[12px] text-ink-3">Your target price is private — only you and the Atlantis sourcing desk see it. It doesn’t place an order.</p>
                </div>
            )}
        </Dialog>
    );
}
