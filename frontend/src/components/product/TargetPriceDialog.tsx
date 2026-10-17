'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronDown, Minus, Plus, Target } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, Dialog, Field, Notice, inputCls, selectCls } from '@/components/supplier/ui';
import { useCountryOptions } from '@/components/supplier/CatalogCombobox';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'RON', 'AED', 'SAR', 'EGP'];
type Unit = 'CASE' | 'PALLET' | 'TRUCK';

export interface TargetProduct {
    id: string; name: string; ean?: string | null; unitsPerCase?: number | null; casesPerPallet?: number | null; palletsPerShipment?: number | null;
    moq?: number | null; moqUnit?: string | null;
}

/**
 * "Set a target price" on the product page (layout follows the sourcing-request
 * reference: price, quantity stepper with the pack maths, delivery country,
 * more options, then a review step). The request goes to the Atlantis sourcing
 * desk through POST /target-prices; it never changes the listing or places an
 * order, and nothing claims suppliers are notified or delivery is included.
 */
export default function TargetPriceDialog({ open, onClose, product, listedCasePrice }: { open: boolean; onClose: () => void; product: TargetProduct; listedCasePrice?: number | null }) {
    const { t } = useLanguage();
    const tt = (k: string, v?: Record<string, string | number>) => t('targetPrice', k, v);
    const { user } = useAuth();
    const countries = useCountryOptions();

    const upc = Number(product.unitsPerCase) || 0, cpp = Number(product.casesPerPallet) || 0, ppt = Number(product.palletsPerShipment) || 0;
    const units: Unit[] = ['CASE', ...(cpp ? ['PALLET' as Unit] : []), ...(cpp && ppt ? ['TRUCK' as Unit] : [])];
    const casesIn = (u: Unit, n: number) => (u === 'CASE' ? n : u === 'PALLET' ? n * cpp : n * cpp * ppt);
    // Minimum order in cases, the same conversion the server uses (minOrderCases).
    const moqUnit = String(product.moqUnit || '').toUpperCase(), moq = Number(product.moq) || 0;
    const minCases = !moq ? 0 : moqUnit === 'PALLET' ? (cpp ? moq * cpp : 0) : moqUnit === 'TRUCK' ? (cpp && ppt ? moq * cpp * ppt : 0) : moqUnit === 'PIECE' ? (upc ? Math.ceil(moq / upc) : 0) : moq;

    const startUnit: Unit = cpp ? 'PALLET' : 'CASE';
    const startQty = Math.max(1, minCases ? Math.ceil(minCases / casesIn(startUnit, 1)) : 1);
    const accountCountry = React.useMemo(() => {
        const c = String(user?.country || '').trim();
        return c ? countries.find((o) => o.iso === c.toUpperCase() || o.name.toLowerCase() === c.toLowerCase())?.iso || '' : '';
    }, [user?.country, countries]);

    const [step, setStep] = React.useState<'form' | 'review' | 'done'>('form');
    const [basis, setBasis] = React.useState<'CASE' | 'PIECE'>('CASE');
    const [price, setPrice] = React.useState('');
    const [currency, setCurrency] = React.useState('EUR');
    const [qty, setQty] = React.useState(String(startQty));
    const [unit, setUnit] = React.useState<Unit>(startUnit);
    const [country, setCountry] = React.useState('');
    const [more, setMore] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [done, setDone] = React.useState<any | null>(null);
    const keyRef = React.useRef('');
    React.useEffect(() => {
        if (!open) return;
        keyRef.current = `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        setStep('form'); setError(null); setDone(null); setBusy(false);
        setCountry((c) => c || accountCountry);
    }, [open, accountCountry]);

    React.useEffect(() => { if (step === 'form') setError(null); }, [price, qty, unit, basis, currency, country, message]); // eslint-disable-line react-hooks/exhaustive-deps

    const n = Number(qty);
    const validQty = Number.isInteger(n) && n > 0;
    const cases = validQty ? casesIn(unit, n) : 0;
    const p = Number(price.replace(',', '.'));
    const countryLabel = countries.find((o) => o.iso === country);

    const bump = (d: number) => setQty(String(Math.max(1, (validQty ? n : 0) + d)));
    const changeUnit = (u: Unit) => {
        // Keep roughly the same volume when switching units, never below one.
        const now = cases || casesIn(unit, 1);
        setUnit(u); setQty(String(Math.max(1, Math.round(now / casesIn(u, 1)))));
    };

    const toReview = () => {
        setError(null);
        if (!(p > 0)) { setError(tt('errPrice')); return; }
        if (!validQty) { setError(tt('errQty')); return; }
        if (minCases && cases < minCases) { setError(tt('errMoq', { cases: minCases })); return; }
        setStep('review');
    };

    const submit = async () => {
        setError(null);
        setBusy(true);
        try {
            const res = await apiFetch('/target-prices', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: product.id, price: p, priceBasis: basis, currency, quantity: n, quantityUnit: unit, deliveryCountry: country || undefined, message: message.trim() || undefined, idempotencyKey: keyRef.current }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : tt('errSend'));
            setDone(d); setStep('done');
        } catch (e: any) { setError(e.message); setStep('form'); }
        finally { setBusy(false); }
    };

    const unitLabel = (u: Unit) => tt(u === 'CASE' ? 'unitCases' : u === 'PALLET' ? 'unitPallets' : 'unitTrucks');
    const priceText = p > 0 ? `${currency} ${p.toFixed(2)} ${tt(basis === 'CASE' ? 'perCase' : 'perPiece')}` : '—';

    const footer = step === 'done'
        ? <Button variant="primary" onClick={onClose}>{tt('done')}</Button>
        : step === 'review'
            ? <><Button variant="secondary" onClick={() => setStep('form')} disabled={busy}>{tt('back')}</Button><Button variant="primary" loading={busy} icon={<Target size={15} />} onClick={submit}>{tt('send')}</Button></>
            : <><Button variant="secondary" onClick={onClose}>{tt('cancel')}</Button><Button variant="primary" onClick={toReview}>{tt('review')}</Button></>;

    return (
        <Dialog open={open} onClose={onClose} size="md" footer={footer}
            title={tt(step === 'done' ? 'doneTitle' : step === 'review' ? 'reviewTitle' : 'title')}
            description={step === 'done' ? undefined : product.name}>
            {step === 'done' && done ? (
                <div className="space-y-3 text-[14px] text-ink-2">
                    <p className="flex items-center gap-2 text-emerald-700 font-medium"><CheckCircle2 size={18} /> {tt('doneRef', { ref: done.ref })}</p>
                    <p>{tt('doneBody', { price: formatPrice(done.targetCasePrice), cases: done.quantityCases })}</p>
                    <p>{tt('doneWatch')} <Link href="/dashboard/customer/targets" className="text-teal font-semibold hover:underline">{tt('doneLink')}</Link></p>
                </div>
            ) : step === 'review' ? (
                <div className="space-y-4">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-surface-2 ring-1 ring-line px-3.5 py-3 text-[13.5px]">
                        <dt className="text-ink-3">{tt('barcode')}</dt><dd className="text-end font-mono text-ink-2">{product.ean || '—'}</dd>
                        <dt className="text-ink-3">{tt('listed')}</dt><dd className="text-end tabular-nums text-ink-2">{listedCasePrice ? `${formatPrice(listedCasePrice)} ${tt('perCase')}` : '—'}</dd>
                        <dt className="text-ink-3">{tt('yourTarget')}</dt><dd className="text-end tabular-nums font-semibold text-heading">{priceText}</dd>
                        <dt className="text-ink-3">{tt('quantity')}</dt><dd className="text-end text-ink-2">{n.toLocaleString()} {unitLabel(unit)} · {tt('casesCount', { count: cases })}</dd>
                        <dt className="text-ink-3">{tt('country')}</dt><dd className="text-end text-ink-2">{countryLabel ? `${countryLabel.flag} ${countryLabel.label}` : tt('notSet')}</dd>
                        {message.trim() && <><dt className="text-ink-3">{tt('message')}</dt><dd className="text-end text-ink-2 break-words">{message.trim()}</dd></>}
                    </dl>
                    {currency !== 'EUR' && <p className="text-[12.5px] text-ink-3">{tt('convertNote')}</p>}
                    {error && <Notice tone="danger">{error}</Notice>}
                    <p className="text-[12.5px] text-ink-3">{tt('privacy')}</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <Field label={tt('priceLabel')} htmlFor="tp-price" required hint={listedCasePrice ? tt('listedHint', { price: formatPrice(listedCasePrice) }) : undefined}>
                        <div className="flex gap-2">
                            <div className="relative flex-1 min-w-0">
                                <span className="absolute inset-y-0 start-3 flex items-center text-[13px] text-ink-3 pointer-events-none">{currency}</span>
                                <input id="tp-price" data-autofocus inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0.00" className={cn(inputCls, 'ps-12 tabular-nums')} />
                            </div>
                            <div role="radiogroup" aria-label={tt('pricePer')} className="inline-flex rounded-lg ring-1 ring-line-strong p-0.5 h-10 shrink-0">
                                {(['CASE', ...(upc ? ['PIECE'] : [])] as ('CASE' | 'PIECE')[]).map((b) => (
                                    <button key={b} type="button" role="radio" aria-checked={basis === b} onClick={() => setBasis(b)} className={cn('px-3 rounded-md text-[13px] font-medium', basis === b ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>{tt(b === 'CASE' ? 'perCase' : 'perPiece')}</button>
                                ))}
                            </div>
                        </div>
                    </Field>

                    <Field label={tt('quantity')} htmlFor="tp-qty" required>
                        <div className="flex items-stretch gap-2">
                            <button type="button" aria-label={tt('decrease')} onClick={() => bump(-1)} disabled={!validQty || n <= 1}
                                className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-line-strong hover:ring-ink text-ink-2 inline-flex items-center justify-center disabled:opacity-40 disabled:hover:ring-line-strong"><Minus size={16} /></button>
                            <div className="flex flex-1 min-w-0 rounded-lg ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-[#2EC4B6] bg-surface">
                                <input id="tp-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
                                    className="flex-1 min-w-0 h-10 bg-transparent text-center text-[14px] tabular-nums text-ink outline-none" />
                                <select aria-label={tt('unitLabel')} value={unit} onChange={(e) => changeUnit(e.target.value as Unit)}
                                    className="h-10 bg-transparent pe-2 ps-1 text-[13px] text-ink-2 underline decoration-dotted underline-offset-4 outline-none cursor-pointer">
                                    {units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                                </select>
                            </div>
                            <button type="button" aria-label={tt('increase')} onClick={() => bump(1)}
                                className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-line-strong hover:ring-ink text-ink-2 inline-flex items-center justify-center"><Plus size={16} /></button>
                        </div>
                        {cases > 0 && (unit !== 'CASE' || upc > 0) && (
                            <p className="mt-1.5 text-[12px] text-ink-3 tabular-nums">{unit === 'CASE' ? tt('piecesCount', { count: cases * upc }) : tt(unit === 'PALLET' ? 'palletMaths' : 'truckMaths', { cases, per: unit === 'PALLET' ? cpp : cpp * ppt })}</p>
                        )}
                        {minCases > 0 && <p className={cn('mt-0.5 text-[12px]', cases && cases < minCases ? 'text-[#B91C1C]' : 'text-ink-3')}>{tt('moqHint', { cases: minCases })}</p>}
                    </Field>

                    <Field label={tt('country')} htmlFor="tp-country" optional hint={tt('countryHint')}>
                        <select id="tp-country" value={country} onChange={(e) => setCountry(e.target.value)} className={selectCls}>
                            <option value="">{tt('countryChoose')}</option>
                            {countries.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.label}</option>)}
                        </select>
                    </Field>

                    <p className="text-[12.5px] text-ink-3">{tt('excludesDelivery')}</p>

                    <div>
                        <button type="button" aria-expanded={more} aria-controls="tp-more" onClick={() => setMore((m) => !m)}
                            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-heading">
                            <ChevronDown size={15} className={cn('transition-transform motion-reduce:transition-none', more && 'rotate-180')} /> {tt(more ? 'fewerOptions' : 'moreOptions')}
                        </button>
                        {more && (
                            <div id="tp-more" className="mt-3 space-y-3">
                                <Field label={tt('currency')} htmlFor="tp-cur" hint={currency !== 'EUR' ? tt('convertNote') : undefined}>
                                    <select id="tp-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                                </Field>
                                <Field label={tt('message')} htmlFor="tp-msg" optional>
                                    <textarea id="tp-msg" rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tt('messagePh')} className={cn(inputCls, 'h-auto py-2')} />
                                </Field>
                            </div>
                        )}
                    </div>

                    {error && <Notice tone="danger">{error}</Notice>}
                    <p className="text-[12.5px] text-ink-3">{tt('privacy')}</p>
                </div>
            )}
        </Dialog>
    );
}
