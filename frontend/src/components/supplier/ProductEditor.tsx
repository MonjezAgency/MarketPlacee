'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, ImagePlus, Link2, Star, Trash2, ChevronLeft, ChevronRight, Plus, X, CheckCircle2, AlertCircle, History } from 'lucide-react';
import { supplierApi, ApiError, type SupplierProduct } from '@/lib/supplier-api';
import { CATEGORIES_LIST } from '@/lib/products';
import { COUNTRIES } from '@/lib/countries';
import { MOQ_UNITS, UNIT_TYPES, WEIGHT_UNITS, digitsOnly, gtinProblem, isRealImage, missingFields, splitWeight } from '@/lib/catalog-rules';
import { Badge, Button, Card, ErrorState, Field, Notice, Skeleton, StatusBadge, eur, inputCls, int, selectCls, shortDate, useConfirm } from '@/components/supplier/ui';
import BarcodeImageFinder from '@/components/supplier/BarcodeImageFinder';
import { cn } from '@/lib/utils';

const VARIETY_TYPES = ['Size', 'Flavour', 'Pack type', 'Colour', 'Scent'];
type Variety = { name: string; values: string[] };

interface FormState {
    name: string; brand: string; category: string; ean: string; description: string; origin: string; exwLocation: string;
    weightValue: string; weightUnit: string; weightPack: string;
    currency: string; priceBasis: 'case' | 'piece'; priceInput: string;
    stock: string; unitsPerCase: string; casesPerPallet: string; palletsPerShipment: string;
    moq: string; moqUnit: string; shelfLife: string; leadTime: string; unit: string;
    images: string[]; variants: Variety[];
}

const EMPTY: FormState = {
    name: '', brand: '', category: '', ean: '', description: '', origin: '', exwLocation: '',
    weightValue: '', weightUnit: 'g', weightPack: '', currency: 'EUR', priceBasis: 'case', priceInput: '',
    stock: '', unitsPerCase: '', casesPerPallet: '', palletsPerShipment: '', moq: '', moqUnit: 'CASE', shelfLife: '', leadTime: '0', unit: 'piece',
    images: [], variants: [],
};

const fromProduct = (p: SupplierProduct): FormState => {
    const w = splitWeight(p.weight);
    return {
        name: p.name || '', brand: p.brand || '', category: p.category === 'General' ? '' : p.category || '', ean: p.ean || '',
        description: p.description || '', origin: p.origin || '', exwLocation: p.exwLocation || '',
        weightValue: w.value, weightUnit: w.unit, weightPack: w.pack,
        // Show the price exactly as the supplier typed it, in their currency.
        currency: p.supplierCurrency || 'EUR', priceBasis: 'case',
        priceInput: p.supplierCurrency && p.supplierPrice ? String(p.supplierPrice) : p.price ? String(Math.round(p.price * 10000) / 10000) : '',
        stock: p.stock !== null && p.stock !== undefined ? String(p.stock) : '', unitsPerCase: p.unitsPerCase ? String(p.unitsPerCase) : '',
        casesPerPallet: p.casesPerPallet ? String(p.casesPerPallet) : '', palletsPerShipment: p.palletsPerShipment ? String(p.palletsPerShipment) : '',
        moq: p.moq ? String(p.moq) : '', moqUnit: (p.moqUnit || 'CASE').toUpperCase(), shelfLife: p.shelfLife || '', leadTime: String(p.leadTime ?? 0), unit: p.unit || 'piece',
        images: (p.images || []).filter(isRealImage), variants: (p.variants || []).map((v) => ({ name: v.name, values: [...(v.values || [])] })),
    };
};

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

function buildPayload(f: FormState, rates: Record<string, number>, submit: boolean) {
    const rate = rates[f.currency] ?? 1;
    const upc = num(f.unitsPerCase);
    const entered = num(f.priceInput);
    // Case price in the supplier's own currency; the server converts to EUR.
    const caseInCurrency = entered && entered > 0 ? (f.priceBasis === 'case' ? entered : upc && upc > 0 ? entered * upc : null) : null;
    const priceCaseEur = caseInCurrency ? caseInCurrency * rate : null;
    const weight = f.weightValue ? `${f.weightPack ? `${f.weightPack} x ` : ''}${f.weightValue} ${f.weightUnit}` : '';
    return {
        name: f.name.trim(), brand: f.brand.trim(), category: f.category.trim(), ean: digitsOnly(f.ean) || null,
        description: f.description.trim(), origin: f.origin.trim() || null, exwLocation: f.exwLocation.trim() || null,
        weight: weight || null,
        supplierCurrency: f.currency, supplierPrice: caseInCurrency ? Math.round(caseInCurrency * 10000) / 10000 : undefined,
        unit: f.unit,
        stock: num(f.stock) ?? undefined, unitsPerCase: num(f.unitsPerCase), casesPerPallet: num(f.casesPerPallet),
        palletsPerShipment: num(f.palletsPerShipment), moq: num(f.moq), moqUnit: f.moqUnit, shelfLife: f.shelfLife.trim() || null,
        leadTime: num(f.leadTime) ?? 0, readyForDispatch: (num(f.leadTime) ?? 0) === 0,
        images: f.images, variants: f.variants.filter((v) => v.name.trim() && v.values.length),
        submit,
    };
}

/**
 * Supplier product editor, for new and existing products. The server applies
 * the same completeness rules; this form shows them up front.
 */
export default function ProductEditor({ productId }: { productId?: string }) {
    const router = useRouter();
    const confirm = useConfirm();
    const [product, setProduct] = React.useState<SupplierProduct | null>(null);
    const [f, setF] = React.useState<FormState>(EMPTY);
    const [initial, setInitial] = React.useState<string>(JSON.stringify(EMPTY));
    const [loading, setLoading] = React.useState(!!productId);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState<null | 'draft' | 'submit' | 'save'>(null);
    const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({});
    const [rates, setRates] = React.useState<Record<string, number>>({ EUR: 1 });
    const [touched, setTouched] = React.useState(false);
    const [history, setHistory] = React.useState<any[] | null>(null);

    const [defaultCurrency, setDefaultCurrency] = React.useState<string | null>(null);
    React.useEffect(() => {
        supplierApi.preferences().then((pr) => {
            setRates(pr.rates || { EUR: 1 });
            setDefaultCurrency(pr.effectiveCurrency);
            // New product: start in the supplier's default currency (from Settings).
            if (!productId) { setF((x) => ({ ...x, currency: pr.effectiveCurrency })); setInitial((i) => JSON.stringify({ ...JSON.parse(i), currency: pr.effectiveCurrency })); }
        }).catch(() => {});
    }, [productId]);
    const load = React.useCallback(() => {
        if (!productId) return;
        setLoading(true); setLoadError(null);
        supplierApi.product(productId)
            .then((p) => { setProduct(p); const s = fromProduct(p); setF(s); setInitial(JSON.stringify(s)); })
            .catch((e) => setLoadError(e.status === 404 ? 'This product doesn’t exist or isn’t yours.' : e.message))
            .finally(() => setLoading(false));
    }, [productId]);
    React.useEffect(() => { load(); }, [load]);

    const dirty = JSON.stringify(f) !== initial;
    // Warn before leaving with unsaved changes (tab close, reload, in-app links).
    React.useEffect(() => {
        if (!dirty) return;
        const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        const onClick = (e: MouseEvent) => {
            const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!a || a.target === '_blank' || a.hasAttribute('data-skip-unsaved') || e.metaKey || e.ctrlKey) return;
            if (!window.confirm('You have unsaved changes. Leave without saving?')) { e.preventDefault(); e.stopPropagation(); }
        };
        window.addEventListener('beforeunload', onUnload);
        document.addEventListener('click', onClick, true);
        return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onClick, true); };
    }, [dirty]);

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setF((p) => ({ ...p, [k]: v })); setServerErrors((e) => ({ ...e, [k]: '' })); };

    // ── Price maths (one source: EUR per case) ──
    const rate = rates[f.currency] ?? 1;
    const upc = num(f.unitsPerCase);
    const entered = num(f.priceInput);
    const priceCaseEur = entered && entered > 0 ? (f.priceBasis === 'case' ? entered * rate : upc && upc > 0 ? entered * upc * rate : null) : null;
    const piecePriceEur = priceCaseEur && upc ? priceCaseEur / upc : null;
    const caseInCurrencyView = entered && entered > 0 ? (f.priceBasis === 'case' ? entered : upc && upc > 0 ? entered * upc : null) : null;
    const switchBasis = (b: 'case' | 'piece') => {
        if (b === f.priceBasis) return;
        const e = num(f.priceInput);
        let next = f.priceInput;
        if (e && upc && upc > 0) next = String(Math.round((b === 'piece' ? e / upc : e * upc) * 10000) / 10000);
        setF((p) => ({ ...p, priceBasis: b, priceInput: next }));
    };

    const missing = missingFields({ ...f, weightValue: f.weightValue, priceCaseEur, images: f.images });
    const eanProblem = f.ean ? gtinProblem(f.ean) : null;
    const status = product?.status ?? 'NEW';
    const rejected = status === 'REJECTED';
    const live = status === 'APPROVED';
    const err = (k: string) => serverErrors[k] || (touched && missing.find((m) => m.field === k) ? 'Required.' : '') || '';

    const payload = (submit: boolean) => buildPayload(f, rates, submit);
    const save = async (mode: 'draft' | 'submit' | 'save') => {
        setTouched(true);
        const bad: Record<string, string> = {};
        if (eanProblem) bad.ean = eanProblem;
        if (f.priceInput && !(num(f.priceInput)! > 0)) bad.priceInput = 'Enter a price above 0.';
        if (f.priceBasis === 'piece' && f.priceInput && !upc) bad.unitsPerCase = 'Needed to turn a piece price into a case price.';
        for (const k of ['stock', 'unitsPerCase', 'casesPerPallet', 'palletsPerShipment', 'moq', 'leadTime'] as const) {
            if (f[k].trim() && !/^\d+$/.test(f[k].trim())) bad[k] = 'Whole numbers only.';
        }
        if (f.weightValue && !(Number(f.weightValue) > 0)) bad.weightValue = 'Enter a number above 0.';
        if (!f.name.trim()) bad.name = 'A name is needed even for a draft.';
        if (Object.keys(bad).length) { setServerErrors(bad); toast.error('Fix the highlighted fields.'); document.getElementById(`pe-${Object.keys(bad)[0]}`)?.focus(); return; }
        if (mode === 'submit' && missing.length) { toast.error(`Still missing: ${missing.map((m) => m.label.toLowerCase()).join(', ')}`); return; }
        setSaving(mode);
        try {
            // Existing product: send only what changed, so untouched fields are never rewritten.
            let body: any = payload(mode === 'submit');
            if (productId) {
                const before: any = buildPayload(JSON.parse(initial), rates, false);
                body = Object.fromEntries(Object.entries(body).filter(([k, v]) => k === 'submit' || JSON.stringify(v) !== JSON.stringify(before[k])));
            }
            const saved = productId ? await supplierApi.update(productId, body) : await supplierApi.create(body);
            const s = fromProduct(saved);
            setInitial(JSON.stringify(s)); setF(s); setProduct(saved); setServerErrors({});
            toast.success(saved.status === 'PENDING' ? 'Saved and sent to Atlantis for review' : saved.status === 'APPROVED' ? 'Saved — live listing updated' : 'Draft saved');
            if (!productId) router.replace(`/supplier/products/${saved.id}/edit`);
        } catch (e: any) {
            const body = e instanceof ApiError ? e.body : null;
            const fieldErrs: Record<string, string> = {};
            for (const m of [...(body?.invalid || []), ...(body?.missing || [])]) fieldErrs[m.field === 'price' ? 'priceInput' : m.field === 'weight' ? 'weightValue' : m.field] = m.reason;
            setServerErrors(fieldErrs);
            toast.error(e.message || 'Couldn’t save.');
        } finally { setSaving(null); }
    };

    const leave = async () => {
        if (dirty && !(await confirm({ title: 'Discard unsaved changes?', body: 'Your edits on this page will be lost.', confirm: 'Discard', tone: 'danger' }))) return;
        setInitial(JSON.stringify(f)); // disarm the guard
        router.push('/supplier/products');
    };

    if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
    if (loadError) return <div className="space-y-4"><Link href="/supplier/products" className="inline-flex items-center gap-1 text-[13px] text-teal"><ArrowLeft size={14} /> Inventory</Link><ErrorState message={loadError} onRetry={load} /></div>;

    const primaryAction = live || status === 'PENDING'
        ? <Button variant="primary" loading={saving === 'save'} disabled={!dirty || rejected || !!saving} onClick={() => save('save')}>Save changes</Button>
        : <Button variant="primary" loading={saving === 'submit'} disabled={rejected || !!saving || missing.length > 0} onClick={() => save('submit')} title={missing.length ? 'Complete the required details first' : undefined}>Submit for review</Button>;

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3 mb-5">
                <button type="button" onClick={leave} className="w-9 h-9 rounded-lg ring-1 ring-line flex items-center justify-center text-ink-2 hover:bg-surface-2" aria-label="Back to inventory"><ArrowLeft size={17} /></button>
                <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-ink-3">Inventory &amp; products</p>
                    <h1 className="text-[22px] font-semibold text-heading truncate">{productId ? f.name || 'Edit product' : 'Add product'}</h1>
                </div>
                {product && <StatusBadge status={product.status} />}
                {dirty && <Badge tone="warning">Unsaved changes</Badge>}
            </div>

            {rejected && <div className="mb-4"><Notice tone="danger" title="This listing was rejected">{product?.adminNotes || 'No reason was given.'} Rejected listings can’t be edited — create a new listing that addresses the reason.</Notice></div>}
            {status === 'NEEDS_CHANGES' && product?.adminNotes && <div className="mb-4"><Notice tone="warning" title="Atlantis asked for changes">{product.adminNotes}</Notice></div>}
            {live && <div className="mb-4"><Notice tone="info">This product is live. Price, stock, packaging, MOQ, best-before and lead time update immediately. Replacing an existing name, brand, category, barcode, photo set, origin or weight sends it back to review — it’s hidden from buyers until approved again.</Notice></div>}

            <fieldset disabled={rejected} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
                <div className="space-y-4 min-w-0">
                    <Card title="Product identity" description="What the product is. Shown to buyers.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Product name" htmlFor="pe-name" required error={err('name')} className="sm:col-span-2" hint="As on the pack, including size — e.g. “Milka Choco & Cake 35 g”.">
                                <input id="pe-name" value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} aria-invalid={!!err('name')} maxLength={200} />
                            </Field>
                            <Field label="Brand" htmlFor="pe-brand" required error={err('brand')}>
                                <input id="pe-brand" value={f.brand} onChange={(e) => set('brand', e.target.value)} className={inputCls} aria-invalid={!!err('brand')} />
                            </Field>
                            <Field label="Category" htmlFor="pe-category" required error={err('category')}>
                                <select id="pe-category" value={f.category} onChange={(e) => set('category', e.target.value)} className={selectCls} aria-invalid={!!err('category')}>
                                    <option value="">Choose…</option>
                                    {f.category && !CATEGORIES_LIST.includes(f.category) && <option value={f.category}>{f.category}</option>}
                                    {CATEGORIES_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </Field>
                            <Field label="Barcode (EAN / GTIN)" htmlFor="pe-ean" required error={serverErrors.ean || (f.ean ? eanProblem : err('ean'))} hint="EAN-13, EAN-8, UPC-A (12) or GTIN-14. Leading zeros are kept.">
                                <input id="pe-ean" value={f.ean} onChange={(e) => set('ean', e.target.value.replace(/[^\d\s-]/g, ''))} inputMode="numeric" autoComplete="off" className={cn(inputCls, 'font-mono')} aria-invalid={!!(f.ean && eanProblem)} />
                            </Field>
                            <Field label="Weight / volume per piece" htmlFor="pe-weightValue" required error={err('weightValue') || err('weight')}>
                                <div className="flex gap-2">
                                    <input id="pe-weightValue" value={f.weightValue} onChange={(e) => set('weightValue', e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" className={inputCls} aria-invalid={!!err('weight')} placeholder="400" />
                                    <select aria-label="Weight unit" value={f.weightUnit} onChange={(e) => set('weightUnit', e.target.value)} className={cn(selectCls, 'w-[92px] shrink-0')}>
                                        {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            </Field>
                            <Field label="Country of origin" htmlFor="pe-origin" required error={err('origin')}>
                                <select id="pe-origin" value={f.origin} onChange={(e) => set('origin', e.target.value)} className={selectCls} aria-invalid={!!err('origin')}>
                                    <option value="">Choose…</option>
                                    {f.origin && !COUNTRIES.some((c) => c.name === f.origin) && <option value={f.origin}>{f.origin}</option>}
                                    {COUNTRIES.map((c) => <option key={c.iso} value={c.name}>{c.name}</option>)}
                                </select>
                            </Field>
                            <Field label="EXW location" htmlFor="pe-exw" required error={err('exwLocation')} hint="City and country of the warehouse buyers collect from (Ex Works).">
                                <input id="pe-exw" value={f.exwLocation} onChange={(e) => set('exwLocation', e.target.value)} className={inputCls} placeholder="Bucharest, Romania" aria-invalid={!!err('exwLocation')} />
                            </Field>
                            <Field label="Description" htmlFor="pe-desc" optional className="sm:col-span-2">
                                <textarea id="pe-desc" value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} className={cn(inputCls, 'h-auto py-2')} maxLength={4000} />
                            </Field>
                        </div>
                    </Card>

                    <Card title="Price" description="Your price before the Atlantis margin. Stored in EUR per case.">
                        <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                            <Field label="Currency" htmlFor="pe-cur" hint={defaultCurrency ? (f.currency === defaultCurrency ? 'Your default (Settings)' : `Default: ${defaultCurrency}`) : undefined}>
                                <select id="pe-cur" value={f.currency} onChange={(e) => set('currency', e.target.value)} className={selectCls}>
                                    {Object.keys(rates).map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </Field>
                            <Field label="Your price" htmlFor="pe-priceInput" required error={err('priceInput') || (touched && !priceCaseEur ? 'Required.' : '')}>
                                <div className="flex flex-wrap gap-2">
                                    <input id="pe-priceInput" value={f.priceInput} onChange={(e) => set('priceInput', e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" className={cn(inputCls, 'flex-1 min-w-[120px]')} placeholder="0.00" />
                                    <div role="radiogroup" aria-label="Price is for" className="inline-flex rounded-lg ring-1 ring-line-strong p-0.5 h-10">
                                        {(['case', 'piece'] as const).map((b) => (
                                            <button key={b} type="button" role="radio" aria-checked={f.priceBasis === b} onClick={() => switchBasis(b)}
                                                className={cn('px-3 rounded-md text-[13px] font-medium', f.priceBasis === b ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>per {b}</button>
                                        ))}
                                    </div>
                                </div>
                            </Field>
                        </div>
                        <div className="mt-3 rounded-lg bg-surface-2 ring-1 ring-line px-3 py-2.5 text-[13px] text-ink-2 grid gap-1 sm:grid-cols-3">
                            <span>Case price: <b className="tabular-nums">{caseInCurrencyView ? `${caseInCurrencyView.toFixed(2)} ${f.currency}` : '—'}</b>{f.currency !== 'EUR' && priceCaseEur ? <span className="text-ink-3"> ≈ {eur(priceCaseEur)}</span> : null}</span>
                            <span>Piece price: <b className="tabular-nums">{piecePriceEur ? eur(piecePriceEur, 3) : upc ? '—' : 'needs pieces per case'}</b></span>
                            <span>Pallet price: <b className="tabular-nums">{priceCaseEur && num(f.casesPerPallet) ? eur(priceCaseEur * num(f.casesPerPallet)!) : '—'}</b></span>
                            {f.currency !== 'EUR' && <span className="sm:col-span-3 text-[12px] text-ink-3">Your price is saved in {f.currency} exactly as typed. The EUR figure used on the platform is converted at a fixed rate of 1 {f.currency} = {rate} EUR — it is not a live exchange rate.</span>}
                        </div>
                    </Card>

                    <Card title="Packaging, stock & ordering" description="Stock is counted in cases. Pallet and truck prices are offered only when their pack sizes are filled in.">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="Pieces per case" htmlFor="pe-unitsPerCase" required error={err('unitsPerCase')}>
                                <input id="pe-unitsPerCase" value={f.unitsPerCase} onChange={(e) => set('unitsPerCase', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} aria-invalid={!!err('unitsPerCase')} />
                            </Field>
                            <Field label="Cases per pallet" htmlFor="pe-casesPerPallet" required error={err('casesPerPallet')}>
                                <input id="pe-casesPerPallet" value={f.casesPerPallet} onChange={(e) => set('casesPerPallet', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
                            </Field>
                            <Field label="Pallets per truck" htmlFor="pe-palletsPerShipment" optional error={serverErrors.palletsPerShipment}>
                                <input id="pe-palletsPerShipment" value={f.palletsPerShipment} onChange={(e) => set('palletsPerShipment', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
                            </Field>
                            <Field label="Unit type" htmlFor="pe-unit" required hint="What one piece is. Prices and stock stay per case.">
                                <select id="pe-unit" value={f.unit} onChange={(e) => set('unit', e.target.value)} className={selectCls}>
                                    {!UNIT_TYPES.includes(f.unit as any) && f.unit && <option value={f.unit}>{f.unit}</option>}
                                    {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </Field>
                            <Field label="Stock available (cases)" htmlFor="pe-stock" required error={err('stock')}
                                hint={num(f.stock) !== null && num(f.casesPerPallet) ? `≈ ${Math.floor(num(f.stock)! / num(f.casesPerPallet)!)} full pallets${upc ? ` · ${int(num(f.stock)! * upc)} pieces` : ''}` : upc && num(f.stock) !== null ? `${int(num(f.stock)! * upc)} pieces` : 'Whole cases ready to sell.'}>
                                <input id="pe-stock" value={f.stock} onChange={(e) => set('stock', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} aria-invalid={!!err('stock')} />
                            </Field>
                            <Field label="Minimum order" htmlFor="pe-moq" required error={err('moq')} className="sm:col-span-2">
                                <div className="flex gap-2">
                                    <input id="pe-moq" value={f.moq} onChange={(e) => set('moq', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} aria-invalid={!!err('moq')} />
                                    <select aria-label="Minimum order unit" value={f.moqUnit} onChange={(e) => set('moqUnit', e.target.value)} className={cn(selectCls, 'w-[130px] shrink-0')}>
                                        {MOQ_UNITS.map((u) => <option key={u} value={u}>{u.toLowerCase()}s</option>)}
                                    </select>
                                </div>
                            </Field>
                            <Field label="Best before / shelf life" htmlFor="pe-shelf" optional hint="e.g. 2027-03-31 or “9 months”.">
                                <input id="pe-shelf" value={f.shelfLife} onChange={(e) => set('shelfLife', e.target.value)} className={inputCls} />
                            </Field>
                            <Field label="Lead time (days)" htmlFor="pe-leadTime" optional error={serverErrors.leadTime} hint="0 = ready to dispatch.">
                                <input id="pe-leadTime" value={f.leadTime} onChange={(e) => set('leadTime', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
                            </Field>
                        </div>
                    </Card>

                    <Card id="media" title="Photos" description="At least one real photo is required before review. The first photo is the main one buyers see.">
                        <MediaEditor images={f.images} onChange={(imgs) => set('images', imgs)} ean={f.ean} name={f.name} brand={f.brand} productId={productId} savedEan={product?.ean ?? null} weight={f.weightValue ? `${f.weightPack ? `${f.weightPack} x ` : ''}${f.weightValue} ${f.weightUnit}` : ''} error={touched && !f.images.some(isRealImage) ? 'Add at least one photo.' : ''} />
                    </Card>

                    <Card title="Varieties" description="Optional. Use only for options of THIS product that buyers choose between (e.g. sizes or flavours sold under the same listing).">
                        <VarietiesEditor value={f.variants} onChange={(v) => set('variants', v)} />
                    </Card>

                    {productId && (
                        <Card title="Change history" description="Price, stock, status and identity changes on this product."
                            actions={history === null ? <Button size="sm" variant="ghost" icon={<History size={14} />} onClick={() => supplierApi.history(productId).then(setHistory).catch(() => setHistory([]))}>Show</Button> : null}>
                            {history === null ? <p className="text-[13px] text-ink-3">Hidden.</p> : history.length === 0 ? <p className="text-[13px] text-ink-3">No recorded changes yet.</p> : (
                                <ul className="text-[12.5px] divide-y divide-line">
                                    {history.map((h) => (
                                        <li key={h.id} className="py-1.5 flex flex-wrap gap-x-2">
                                            <span className="text-ink-3 tabular-nums">{shortDate(h.createdAt)}</span>
                                            <span className="font-medium text-ink">{h.field}</span>
                                            <span className="text-ink-2 break-all">{(h.oldValue ?? '—').slice(0, 60)} → {(h.newValue ?? '—').slice(0, 60)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    )}
                </div>

                {/* Status + checklist (sticky on desktop) */}
                <aside className="lg:sticky lg:top-4 space-y-3">
                    <Card title="Ready for review?">
                        {missing.length === 0 ? (
                            <p className="flex items-center gap-2 text-[13.5px] text-emerald-700"><CheckCircle2 size={16} /> All required details are filled in.</p>
                        ) : (
                            <>
                                <p className="text-[13px] text-ink-2 mb-2">Still needed before it can be reviewed:</p>
                                <ul className="space-y-1">
                                    {missing.map((m) => (
                                        <li key={m.field}><button type="button" className="inline-flex items-center gap-1.5 text-[13px] text-amber-800 hover:underline" onClick={() => document.getElementById(m.field === 'images' ? 'media' : `pe-${m.field === 'price' ? 'priceInput' : m.field === 'weight' ? 'weightValue' : m.field === 'exwLocation' ? 'exw' : m.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><AlertCircle size={13} />{m.label}</button></li>
                                    ))}
                                </ul>
                                <p className="mt-2 text-[12px] text-ink-3">You can save a draft any time. Drafts are never shown to buyers.</p>
                            </>
                        )}
                        {product?.statusNote && <p className="mt-3 pt-3 border-t border-line text-[12.5px] text-ink-3">{product.statusNote}</p>}
                        {product?.movement && (
                            <dl className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-y-1 text-[12.5px]">
                                <dt className="text-ink-3">Reserved</dt><dd className="text-end tabular-nums">{int(product.movement.reserved)} cases</dd>
                                <dt className="text-ink-3">Delivered</dt><dd className="text-end tabular-nums">{int(product.movement.delivered)} cases</dd>
                            </dl>
                        )}
                    </Card>
                    <div className="hidden lg:flex flex-col gap-2">
                        {primaryAction}
                        {!live && status !== 'PENDING' && <Button variant="secondary" loading={saving === 'draft'} disabled={rejected || !!saving} onClick={() => save('draft')}>Save draft</Button>}
                        <Button variant="ghost" onClick={leave}>Cancel</Button>
                    </div>
                </aside>
            </fieldset>

            {/* Mobile action bar */}
            {/* Sticky inside the scroll area (not fixed to the window) so it never covers the sidebar or the last fields. */}
            <div className="lg:hidden sticky bottom-0 z-30 -mx-4 sm:-mx-6 mt-4 bg-surface/95 backdrop-blur border-t border-line px-4 sm:px-6 py-3 flex flex-wrap gap-2 justify-end">
                <Button variant="ghost" onClick={leave}>Cancel</Button>
                {!live && status !== 'PENDING' && <Button variant="secondary" loading={saving === 'draft'} disabled={rejected || !!saving} onClick={() => save('draft')}>Save draft</Button>}
                {primaryAction}
            </div>
        </div>
    );
}

function MediaEditor({ images, onChange, ean, name, brand, error, productId, savedEan, weight }: { images: string[]; onChange: (v: string[]) => void; ean: string; name: string; brand: string; error?: string; productId?: string; savedEan?: string | null; weight?: string }) {
    const fileRef = React.useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = React.useState(0);
    const [url, setUrl] = React.useState('');
    const [urlErr, setUrlErr] = React.useState('');
    const move = (i: number, d: -1 | 1) => { const n = [...images]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
    const upload = async (files: FileList | null) => {
        const list = Array.from(files || []).slice(0, 10);
        for (const file of list) {
            if (!file.type.startsWith('image/')) { toast.error(`${file.name} isn’t an image.`); continue; }
            if (file.size > 15 * 1024 * 1024) { toast.error(`${file.name} is larger than 15 MB.`); continue; }
            setUploading((n) => n + 1);
            try { const r = await supplierApi.uploadImage(file); onChange([...imagesRef.current, r.url]); }
            catch (e: any) { toast.error(`${file.name}: ${e.message}`); }
            finally { setUploading((n) => n - 1); }
        }
    };
    const imagesRef = React.useRef(images);
    imagesRef.current = images;
    const addUrl = () => {
        const u = url.trim();
        if (!/^https:\/\/\S+\.\S+/i.test(u)) { setUrlErr('Use a full https:// link to an image.'); return; }
        const img = new Image();
        img.onload = () => { onChange([...imagesRef.current, u]); setUrl(''); setUrlErr(''); };
        img.onerror = () => setUrlErr('That link doesn’t load as an image.');
        img.src = u;
    };
    return (
        <div className="space-y-3">
            {images.length > 0 ? (
                <ul className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                    {images.map((src, i) => (
                        <li key={src + i} className={cn('rounded-lg ring-1 overflow-hidden bg-white', i === 0 ? 'ring-teal ring-2' : 'ring-line')}>
                            <div className="relative aspect-square flex items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt={i === 0 ? 'Main photo' : `Photo ${i + 1}`} className="max-w-[88%] max-h-[88%] object-contain" />
                                {i === 0 && <span className="absolute top-1.5 start-1.5"><Badge tone="brand">Main</Badge></span>}
                            </div>
                            <div className="flex items-center justify-between border-t border-line px-1 py-1">
                                <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="w-7 h-7 rounded flex items-center justify-center text-ink-3 hover:bg-surface-2 disabled:opacity-30"><ChevronLeft size={15} /></button>
                                {i !== 0 && <button type="button" aria-label="Make main photo" onClick={() => onChange([src, ...images.filter((_, j) => j !== i)])} className="w-7 h-7 rounded flex items-center justify-center text-ink-3 hover:bg-surface-2"><Star size={14} /></button>}
                                <button type="button" aria-label="Remove photo" onClick={() => onChange(images.filter((_, j) => j !== i))} className="w-7 h-7 rounded flex items-center justify-center text-ink-3 hover:text-red-700 hover:bg-red-50"><Trash2 size={14} /></button>
                                <button type="button" aria-label="Move later" disabled={i === images.length - 1} onClick={() => move(i, 1)} className="w-7 h-7 rounded flex items-center justify-center text-ink-3 hover:bg-surface-2 disabled:opacity-30"><ChevronRight size={15} /></button>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : <p className={cn('text-[13px]', error ? 'text-red-700' : 'text-ink-3')}>{error || 'No photos yet.'}</p>}
            <div className="flex flex-wrap gap-2">
                <Button type="button" icon={<ImagePlus size={15} />} loading={uploading > 0} onClick={() => fileRef.current?.click()}>Upload photos</Button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
                <div className="flex gap-2 flex-1 min-w-[240px]">
                    <label htmlFor="pe-imgurl" className="sr-only">Image link</label>
                    <input id="pe-imgurl" value={url} onChange={(e) => { setUrl(e.target.value); setUrlErr(''); }} placeholder="Or paste an https image link" className={inputCls} />
                    <Button type="button" icon={<Link2 size={14} />} onClick={addUrl} disabled={!url.trim()}>Add</Button>
                </div>
            </div>
            {urlErr && <p role="alert" className="text-[12.5px] text-red-700">{urlErr}</p>}
            <BarcodeImageFinder productId={productId} savedEan={savedEan} ean={digitsOnly(ean)} name={name} brand={brand} weight={weight} current={images}
                onAccept={(u) => { onChange([...imagesRef.current, u]); toast.success('Photo added — save to keep it.'); }}
                onSkip={() => fileRef.current?.click()} />
        </div>
    );
}

function VarietiesEditor({ value, onChange }: { value: Variety[]; onChange: (v: Variety[]) => void }) {
    const [drafts, setDrafts] = React.useState<string[]>([]);
    const update = (i: number, v: Partial<Variety>) => onChange(value.map((x, j) => (j === i ? { ...x, ...v } : x)));
    const addValue = (i: number) => {
        const t = (drafts[i] || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!t.length) return;
        update(i, { values: Array.from(new Set([...value[i].values, ...t])) });
        setDrafts((d) => { const n = [...d]; n[i] = ''; return n; });
    };
    return (
        <div className="space-y-3">
            {value.map((v, i) => (
                <div key={i} className="rounded-lg ring-1 ring-line p-3 space-y-2">
                    <div className="flex gap-2">
                        <label className="sr-only" htmlFor={`var-${i}`}>Attribute</label>
                        <input id={`var-${i}`} list="variety-types" value={v.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Attribute, e.g. Size" className={cn(inputCls, 'max-w-[220px]')} />
                        <span className="flex-1" />
                        <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {v.values.map((val) => (
                            <span key={val} className="inline-flex items-center gap-1 h-7 ps-2.5 pe-1 rounded-md bg-surface-2 ring-1 ring-line text-[12.5px]">
                                {val}
                                <button type="button" aria-label={`Remove ${val}`} onClick={() => update(i, { values: v.values.filter((x) => x !== val) })} className="w-5 h-5 rounded flex items-center justify-center text-ink-3 hover:text-ink"><X size={12} /></button>
                            </span>
                        ))}
                        <input value={drafts[i] || ''} onChange={(e) => setDrafts((d) => { const n = [...d]; n[i] = e.target.value; return n; })}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addValue(i); } }} onBlur={() => addValue(i)}
                            placeholder="Add value, press Enter" aria-label={`Add a ${v.name || 'value'}`} className="h-7 px-2 rounded-md ring-1 ring-inset ring-line-strong text-[12.5px] outline-none focus:ring-2 focus:ring-teal min-w-[160px]" />
                    </div>
                </div>
            ))}
            <datalist id="variety-types">{VARIETY_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            <Button type="button" size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, { name: '', values: [] }])}>Add attribute</Button>
        </div>
    );
}
