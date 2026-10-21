'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, Pencil, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Dialog, ErrorState, Field, Notice, inputCls, selectCls } from '@/components/supplier/ui';
import { adminCouponsApi, type CategoryOption, type CouponRow, type CouponScope, type CouponType, type PickedProduct } from '@/lib/admin-coupons-api';
import { localZone, useCopy, useDiscountLabel, useMoney, useTc, useWhen, type Tc } from './couponUi';
import { ProductPicker } from './ProductPicker';

/**
 * Create or edit a coupon: code (generated on the server, or the admin's own), discount, what it applies to,
 * conditions and validity, then a review step. The server re-validates everything (coupon-rules.ts
 * parseCouponInput; on edit also: code locked once used, usage limit never below the uses); these checks
 * only catch mistakes before the request. Success is shown only after the server confirms.
 */

type Errors = Partial<Record<'code' | 'discountType' | 'discountPercent' | 'amountOff' | 'minOrderAmount' | 'usageLimit' | 'perCustomerLimit' | 'startsAt' | 'expirationDate' | 'dates' | 'scope' | 'categories' | 'productIds' | 'description', string>>;
const CUSTOM_CODE = /^[A-Z0-9](?:[A-Z0-9-]{2,22})[A-Z0-9]$/;
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const cents = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6; // i18n-ignore: comparison, not text
/** <input type="datetime-local"> value in the admin's time zone → ISO instant (UTC). */
const toIso = (v: string) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? 'invalid' : d.toISOString(); };
/** Date → value for <input type="datetime-local"> in the admin's time zone. */
const toLocalInput = (d: Date) => { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

interface Form {
    code: string; customCode: boolean; discountType: CouponType; percent: string; amount: string;
    scope: CouponScope; categories: string[]; products: PickedProduct[]; description: string;
    minOrder: string; usageLimit: string; perCustomer: string; startNow: boolean; start: string; end: string;
}
const blank = (): Form => {
    const in30 = new Date(Date.now() + 30 * 864e5); in30.setHours(23, 59, 0, 0);
    return { code: '', customCode: false, discountType: 'PERCENT', percent: '', amount: '', scope: 'ALL', categories: [], products: [], description: '', minOrder: '', usageLimit: '', perCustomer: '', startNow: true, start: toLocalInput(new Date(Date.now() + 3600_000)), end: toLocalInput(in30) };
};
const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
/** An existing coupon → form values (a legacy "for an offer" coupon becomes a products coupon for its product). */
const fromRow = (r: CouponRow): Form => ({
    code: r.code, customCode: true, discountType: r.discountType, percent: r.discountType === 'PERCENT' ? str(r.discountPercent) : '', amount: r.discountType === 'FIXED' ? str(r.amountOff) : '',
    scope: r.scope === 'LEGACY' ? 'PRODUCTS' : r.scope, categories: r.categories, products: r.products, description: r.description ?? '',
    minOrder: str(r.minOrderAmount), usageLimit: str(r.usageLimit), perCustomer: str(r.perCustomerLimit),
    startNow: !r.startsAt, start: toLocalInput(r.startsAt ? new Date(r.startsAt) : new Date(Date.now() + 3600_000)), end: toLocalInput(new Date(r.expirationDate)),
});

function validate(f: Form, tc: Tc, editing?: CouponRow | null): Errors {
    const e: Errors = {};
    const code = f.code.trim().toUpperCase();
    if (!code) e.code = tc(f.customCode ? 'errCodeEmpty' : 'errCodeGenerate');
    else if (!CUSTOM_CODE.test(code)) e.code = tc('errCodeFormat');
    if (f.discountType === 'PERCENT') {
        const p = num(f.percent);
        if (p === null || Number.isNaN(p)) e.discountPercent = tc('errPercentEmpty');
        else if (p < 1 || p > 100) e.discountPercent = tc('errPercentRange');
        else if (!cents(p)) e.discountPercent = tc('errDecimals');
    } else {
        const a = num(f.amount);
        if (a === null || Number.isNaN(a)) e.amountOff = tc('errAmountEmpty');
        else if (a <= 0) e.amountOff = tc('errAmountPositive');
        else if (a > 1_000_000) e.amountOff = tc('errAmountLarge');
        else if (!cents(a)) e.amountOff = tc('errDecimals');
    }
    const m = num(f.minOrder);
    if (m !== null && (Number.isNaN(m) || m < 0)) e.minOrderAmount = tc('errMinOrder');
    else if (m !== null && !cents(m)) e.minOrderAmount = tc('errDecimals');
    const whole = (v: string) => { const n = num(v); return n === null ? null : Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : NaN; };
    const ul = whole(f.usageLimit), pc = whole(f.perCustomer);
    if (Number.isNaN(ul)) e.usageLimit = tc('errLimit');
    else if (editing && ul != null && ul < Math.max(editing.usedCount, editing.redemptions)) e.usageLimit = tc('errLimitBelowUsed', { used: Math.max(editing.usedCount, editing.redemptions) });
    if (Number.isNaN(pc)) e.perCustomerLimit = tc('errLimit');
    else if (ul && pc && pc > ul) e.perCustomerLimit = tc('errPerCustomerHigher');
    const start = f.startNow ? null : toIso(f.start), end = toIso(f.end);
    if (start === 'invalid' || (!f.startNow && !f.start)) e.startsAt = tc('errStart');
    if (!end || end === 'invalid') e.expirationDate = tc('errEnd');
    // Editing: an end date already in the past may be kept as it is (the server applies the same rule).
    else if (new Date(end).getTime() <= Date.now() && !(editing && toLocalInput(new Date(editing.expirationDate)) === f.end)) e.expirationDate = tc('errEndPast');
    if (start && start !== 'invalid' && end && end !== 'invalid' && new Date(start) >= new Date(end)) e.dates = tc('errEndBeforeStart');
    if (f.scope === 'CATEGORY' && !f.categories.length) e.categories = tc('errCategory');
    if (f.description.trim().length > 120) e.description = tc('errDescription');
    if (f.scope === 'PRODUCTS' && !f.products.length) e.productIds = tc('errProducts');
    return e;
}

export function CreateCouponDialog({ open, onClose, onSaved, editing }: { open: boolean; onClose: () => void; onSaved: (row: CouponRow) => void; editing?: CouponRow | null }) {
    const tc = useTc();
    const copy = useCopy();
    const [f, setF] = React.useState<Form>(blank);
    const [step, setStep] = React.useState<'edit' | 'review'>('edit');
    const [errors, setErrors] = React.useState<Errors>({});
    const [touched, setTouched] = React.useState(false);
    const [generating, setGenerating] = React.useState(false);
    const [genError, setGenError] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [categories, setCategories] = React.useState<CategoryOption[] | null>(null);
    const [catError, setCatError] = React.useState<string | null>(null);
    const set = (k: keyof Form, v: Form[keyof Form]) => setF((p) => ({ ...p, [k]: v }));
    const codeLocked = !!editing && editing.redemptions > 0;
    const saveLock = React.useRef(false);

    const generate = React.useCallback(async () => {
        setGenerating(true); setGenError(null);
        try { const { code } = await adminCouponsApi.generateCode(); setF((p) => ({ ...p, code, customCode: false })); }
        catch (e: any) { setGenError(e?.message || tc('genFailed')); }
        finally { setGenerating(false); }
    }, [tc]);
    const loadCategories = React.useCallback(() => {
        setCatError(null);
        adminCouponsApi.categories().then(setCategories).catch((e) => setCatError(e?.message || tc('loadFailed')));
    }, [tc]);

    React.useEffect(() => {
        if (!open) return;
        setStep('edit'); setErrors({}); setTouched(false); setSaveError(null); setGenError(null);
        if (editing) setF(fromRow(editing)); else { setF(blank()); generate(); }
        // Only when the dialog opens (or switches coupon); not on every list refresh.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editing?.id]);
    React.useEffect(() => { if (open && f.scope === 'CATEGORY' && !categories) loadCategories(); }, [open, f.scope, categories, loadCategories]);
    React.useEffect(() => { if (touched) setErrors(validate(f, tc, editing)); }, [f, touched, tc, editing]);

    const draft = () => ({
        code: f.code.trim().toUpperCase(), discountType: f.discountType,
        discountPercent: f.discountType === 'PERCENT' ? num(f.percent) ?? undefined : undefined,
        amountOff: f.discountType === 'FIXED' ? num(f.amount) ?? undefined : undefined,
        minOrderAmount: num(f.minOrder), usageLimit: num(f.usageLimit), perCustomerLimit: num(f.perCustomer),
        startsAt: f.startNow ? null : (toIso(f.start) as string), expirationDate: toIso(f.end) as string,
        scope: f.scope, categories: f.scope === 'CATEGORY' ? f.categories : [], productIds: f.scope === 'PRODUCTS' ? f.products.map((p) => p.id) : [],
        description: f.description.trim() || null,
    });

    const toReview = () => {
        setTouched(true);
        const e = validate(f, tc, editing);
        setErrors(e);
        if (Object.keys(e).length) { toast.error(tc('fixFields')); return; }
        setStep('review');
    };
    const save = async () => {
        // One request at a time: the button is disabled while saving, and a second click before re-render is ignored.
        if (saveLock.current) return;
        saveLock.current = true;
        setSaving(true); setSaveError(null);
        try {
            const row = editing ? await adminCouponsApi.update(editing.id, draft()) : await adminCouponsApi.create(draft());
            toast.success(tc(editing ? 'savedToast' : 'createdToast', { code: row.code }));
            onSaved(row);
            onClose();
        } catch (e: any) {
            const fields = e?.body?.fields as Record<string, string> | undefined;
            if (fields && Object.keys(fields).length) { setErrors(fields as Errors); setStep('edit'); }
            setSaveError(e?.message || tc('saveFailed'));
        } finally { setSaving(false); saveLock.current = false; }
    };

    const footer = step === 'edit' ? (
        <>
            <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
            <Button variant="primary" onClick={toReview} disabled={generating && !f.code}>{tc('reviewBtn')}</Button>
        </>
    ) : (
        <>
            <Button variant="secondary" icon={<ArrowLeft size={14} className="rtl:rotate-180" />} onClick={() => setStep('edit')} disabled={saving}>{tc('backToEdit')}</Button>
            <Button variant="primary" loading={saving} onClick={save}>{tc(editing ? 'saveBtn' : 'createBtn')}</Button>
        </>
    );

    return (
        <Dialog open={open} onClose={saving ? () => {} : onClose} dismissable={!saving} size="xl"
            title={step === 'edit' ? tc(editing ? 'editTitle' : 'createTitle', { code: editing?.code ?? '' }) : tc('reviewTitle')}
            description={step === 'edit' ? tc(editing ? 'editDesc' : 'createDesc') : tc(editing ? 'reviewEditDesc' : 'reviewDesc')} footer={footer}>
            <div data-no-translate>
                {saveError && <div className="mb-4"><ErrorState message={saveError} /></div>}
                {editing && editing.redemptions > 0 && step === 'edit' && <div className="mb-4"><Notice tone="info">{tc('editUsedNote', { count: editing.redemptions })}</Notice></div>}
                {step === 'review' ? <Summary f={f} full /> : (
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="space-y-6 min-w-0">
                            <Group title={tc('groupCode')}>
                                {codeLocked ? (
                                    <div>
                                        <output className="h-10 px-3 min-w-[11rem] rounded-lg bg-surface-2 ring-1 ring-inset ring-line inline-flex items-center font-mono text-[16px] font-semibold tracking-wider text-ink"><bdi dir="ltr">{f.code}</bdi></output>
                                        <p className="mt-1 text-[12.5px] text-ink-3">{tc('codeLocked', { count: editing!.redemptions })}</p>
                                    </div>
                                ) : !f.customCode ? (
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <output aria-live="polite" aria-label={tc('generatedCode')} className={cn('h-10 px-3 min-w-[11rem] rounded-lg bg-surface-2 ring-1 ring-inset ring-line inline-flex items-center font-mono text-[16px] font-semibold tracking-wider text-ink', generating && 'opacity-60')}>
                                                <bdi dir="ltr">{f.code || '····-····'}</bdi>
                                            </output>
                                            <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={generating} onClick={generate}>{tc('generateAnother')}</Button>
                                            <Button size="sm" variant="ghost" icon={<Copy size={13} />} disabled={!f.code} onClick={() => copy(f.code)}>{tc('copyCode')}</Button>
                                            <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setF((p) => ({ ...p, customCode: true, code: '' }))}>{tc('useOwnCode')}</Button>
                                        </div>
                                        {genError ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">{genError}</p>
                                            : errors.code ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">{errors.code}</p>
                                                : <p className="mt-1 text-[12.5px] text-ink-3">{tc('generatedHint')}</p>}
                                    </div>
                                ) : (
                                    <Field label={tc('customCode')} htmlFor="cp-code" required error={errors.code} hint={tc('customCodeHint')}>
                                        <div className="flex gap-2">
                                            <input id="cp-code" value={f.code} maxLength={24} autoComplete="off" spellCheck={false} aria-invalid={!!errors.code}
                                                onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))} className={cn(inputCls, 'font-mono tracking-wider')} dir="ltr" />
                                            {!editing && <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={generate} loading={generating}>{tc('generateInstead')}</Button>}
                                        </div>
                                    </Field>
                                )}
                            </Group>

                            <Field label={tc('descriptionLabel')} htmlFor="cp-desc" optional error={errors.description} hint={tc('descriptionHint')}>
                                <input id="cp-desc" value={f.description} maxLength={120} onChange={(e) => set('description', e.target.value)} aria-invalid={!!errors.description} className={inputCls} />
                            </Field>

                            <Group title={tc('groupDiscount')}>
                                <fieldset>
                                    <legend className="sr-only">{tc('discountType')}</legend>
                                    <div className="grid grid-cols-2 gap-2 max-w-md">
                                        {(['PERCENT', 'FIXED'] as const).map((t) => (
                                            <label key={t} className={cn('flex items-center gap-2 h-10 px-3 rounded-lg ring-1 ring-inset cursor-pointer text-[13.5px] focus-within:ring-2 focus-within:ring-teal', f.discountType === t ? 'ring-teal bg-teal-soft text-heading font-medium' : 'ring-line-strong text-ink-2')}>
                                                <input type="radio" name="cp-type" value={t} checked={f.discountType === t} onChange={() => set('discountType', t)} className="accent-[#0E7C74]" />
                                                {t === 'PERCENT' ? tc('typePercent') : tc('typeFixed')}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                                {f.discountType === 'PERCENT' ? (
                                    <Field label={tc('percentLabel')} htmlFor="cp-pct" required error={errors.discountPercent} hint={tc('percentHint')} className="mt-3 max-w-[14rem]">
                                        <div className="relative">
                                            <input id="cp-pct" inputMode="decimal" value={f.percent} onChange={(e) => set('percent', e.target.value)} aria-invalid={!!errors.discountPercent} className={cn(inputCls, 'pe-9 tabular-nums')} />
                                            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-3 text-[13px]" aria-hidden>%</span>
                                        </div>
                                    </Field>
                                ) : (
                                    <Field label={tc('amountLabel')} htmlFor="cp-amt" required error={errors.amountOff} hint={tc('amountHint')} className="mt-3 max-w-[14rem]">
                                        <div className="relative">
                                            <input id="cp-amt" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} aria-invalid={!!errors.amountOff} className={cn(inputCls, 'pe-12 tabular-nums')} />
                                            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-3 text-[13px]" aria-hidden>{'EUR'}</span>
                                        </div>
                                    </Field>
                                )}
                            </Group>

                            <Group title={tc('groupAppliesTo')}>
                                <fieldset>
                                    <legend className="sr-only">{tc('groupAppliesTo')}</legend>
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        {(['ALL', 'CATEGORY', 'PRODUCTS'] as const).map((s) => (
                                            <label key={s} className={cn('flex items-start gap-2 p-3 rounded-lg ring-1 ring-inset cursor-pointer text-[13.5px] focus-within:ring-2 focus-within:ring-teal', f.scope === s ? 'ring-teal bg-teal-soft' : 'ring-line-strong')}>
                                                <input type="radio" name="cp-scope" value={s} checked={f.scope === s} onChange={() => set('scope', s)} className="mt-0.5 accent-[#0E7C74]" />
                                                <span><span className="block font-medium text-heading">{tc(`scope${s === 'ALL' ? 'All' : s === 'CATEGORY' ? 'Category' : 'Products'}`)}</span><span className="block text-[12px] text-ink-3">{tc(`scope${s === 'ALL' ? 'All' : s === 'CATEGORY' ? 'Category' : 'Products'}Hint`)}</span></span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                                {f.scope === 'CATEGORY' && (
                                    <fieldset className="mt-3" aria-invalid={!!errors.categories}>
                                        <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{tc('categoriesLabel')} <span className="text-red-600" aria-hidden>*</span></legend>
                                        {catError ? <ErrorState message={catError} onRetry={loadCategories} /> : !categories ? <p className="text-[13px] text-ink-3">{tc('loading')}</p> : (
                                            <div className="flex flex-wrap gap-2">
                                                {categories.map((c) => {
                                                    const on = f.categories.includes(c.category);
                                                    return (
                                                        <label key={c.category} className={cn('inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 ring-inset cursor-pointer text-[13px] focus-within:ring-2 focus-within:ring-teal', on ? 'ring-teal bg-teal-soft text-heading font-medium' : 'ring-line-strong text-ink-2')}>
                                                            <input type="checkbox" checked={on} onChange={() => set('categories', on ? f.categories.filter((x) => x !== c.category) : [...f.categories, c.category])} className="w-4 h-4 accent-[#0E7C74]" />
                                                            {tc('categoryOption', { category: c.category, live: c.live, total: c.products })}
                                                        </label>
                                                    );
                                                })}
                                                {f.categories.filter((x) => !categories.some((c) => c.category === x)).map((x) => (
                                                    <label key={x} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 ring-inset ring-amber-300 bg-amber-50 text-[13px] text-amber-900">
                                                        <input type="checkbox" checked onChange={() => set('categories', f.categories.filter((y) => y !== x))} className="w-4 h-4 accent-[#0E7C74]" />
                                                        {tc('categoryUnused', { category: x })}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                        {errors.categories ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">{errors.categories}</p> : <p className="mt-1 text-[12.5px] text-ink-3">{tc('categoriesHint')}</p>}
                                    </fieldset>
                                )}
                                {f.scope === 'PRODUCTS' && (
                                    <div className="mt-3">
                                        <ProductPicker selected={f.products} onChange={(p) => set('products', p)} error={errors.productIds} />
                                    </div>
                                )}
                            </Group>

                            <Group title={tc('groupConditions')}>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <Field label={tc('minOrderLabel')} htmlFor="cp-min" optional error={errors.minOrderAmount} hint={tc('minOrderHint')}>
                                        <div className="relative">
                                            <input id="cp-min" inputMode="decimal" value={f.minOrder} onChange={(e) => set('minOrder', e.target.value)} aria-invalid={!!errors.minOrderAmount} className={cn(inputCls, 'pe-12 tabular-nums')} />
                                            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-3 text-[13px]" aria-hidden>{'EUR'}</span>
                                        </div>
                                    </Field>
                                    <Field label={tc('usageLimitLabel')} htmlFor="cp-limit" optional error={errors.usageLimit} hint={editing && editing.redemptions > 0 ? tc('usageLimitUsedHint', { used: Math.max(editing.usedCount, editing.redemptions) }) : tc('usageLimitHint')}>
                                        <input id="cp-limit" inputMode="numeric" value={f.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} aria-invalid={!!errors.usageLimit} className={cn(inputCls, 'tabular-nums')} />
                                    </Field>
                                    <Field label={tc('perCustomerLabel')} htmlFor="cp-per" optional error={errors.perCustomerLimit} hint={tc('perCustomerHint')}>
                                        <input id="cp-per" inputMode="numeric" value={f.perCustomer} onChange={(e) => set('perCustomer', e.target.value)} aria-invalid={!!errors.perCustomerLimit} className={cn(inputCls, 'tabular-nums')} />
                                    </Field>
                                </div>
                            </Group>

                            <Group title={tc('groupValidity')} note={tc('timezoneNote', { zone: localZone() })}>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="flex items-center gap-2 mb-1.5 text-[13px] font-medium text-ink-2">
                                            <input type="checkbox" checked={f.startNow} onChange={(e) => set('startNow', e.target.checked)} className="w-4 h-4 accent-[#0E7C74]" />
                                            {tc('startNow')}
                                        </label>
                                        {!f.startNow && (
                                            <Field label={tc('startLabel')} htmlFor="cp-start" required error={errors.startsAt}>
                                                <input id="cp-start" type="datetime-local" value={f.start} onChange={(e) => set('start', e.target.value)} aria-invalid={!!errors.startsAt} className={cn(inputCls, 'tabular-nums')} />
                                            </Field>
                                        )}
                                        <UtcLine iso={f.startNow ? null : toIso(f.start)} />
                                    </div>
                                    <div>
                                        <Field label={tc('endLabel')} htmlFor="cp-end" required error={errors.expirationDate || errors.dates}>
                                            <input id="cp-end" type="datetime-local" value={f.end} onChange={(e) => set('end', e.target.value)} aria-invalid={!!(errors.expirationDate || errors.dates)} className={cn(inputCls, 'tabular-nums')} />
                                        </Field>
                                        <UtcLine iso={toIso(f.end)} />
                                    </div>
                                </div>
                            </Group>
                        </div>
                        <aside className="lg:sticky lg:top-0 self-start">
                            <Summary f={f} />
                        </aside>
                    </div>
                )}
            </div>
        </Dialog>
    );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <div>
                <h3 className="text-[14px] font-semibold text-heading">{title}</h3>
                {note && <p className="text-[12.5px] text-ink-3">{note}</p>}
            </div>
            {children}
        </section>
    );
}

function UtcLine({ iso }: { iso: string | null | 'invalid' }) {
    const tc = useTc();
    const when = useWhen();
    if (iso === 'invalid') return null;
    return <p className="mt-1 text-[12px] text-ink-3 tabular-nums">{iso ? tc('utcEquals', { utc: when.utc(iso) }) : tc('startsOnSave')}</p>;
}

/** Live summary of the draft (and the review step). Only states what the server will enforce. */
function Summary({ f, full }: { f: Form; full?: boolean }) {
    const tc = useTc();
    const money = useMoney();
    const discountLabel = useDiscountLabel();
    const when = useWhen();
    const pct = num(f.percent), amt = num(f.amount), min = num(f.minOrder), ul = num(f.usageLimit), pc = num(f.perCustomer);
    const start = f.startNow ? null : toIso(f.start), end = toIso(f.end);
    const value = f.discountType === 'PERCENT' ? (pct != null && !Number.isNaN(pct) ? discountLabel('PERCENT', pct, null) : '—') : (amt != null && !Number.isNaN(amt) ? discountLabel('FIXED', null, amt) : '—');
    const scope = f.scope === 'ALL' ? tc('scopeAllShort') : f.scope === 'CATEGORY' ? (f.categories.length ? f.categories.join(', ') : '—') : f.products.length ? tc('scopeProductsShort', { count: f.products.length }) : '—';
    const row = (label: string, v: React.ReactNode) => (
        <div className="flex items-start justify-between gap-3 py-1.5 border-b border-line last:border-0">
            <dt className="text-ink-3">{label}</dt><dd className="text-end text-ink font-medium min-w-0 break-words">{v}</dd>
        </div>
    );
    return (
        <div className="rounded-xl ring-1 ring-line bg-surface-2/60 p-4 text-[13px]" aria-live={full ? undefined : 'polite'}>
            {!full && <h3 className="text-[14px] font-semibold text-heading mb-2">{tc('summaryTitle')}</h3>}
            <dl>
                {row(tc('colCode'), <bdi dir="ltr" className="font-mono">{f.code || '—'}</bdi>)}
                {f.description.trim() && row(tc('descriptionLabel'), <span className="font-normal">{f.description.trim()}</span>)}
                {row(tc('colDiscount'), <span className="tabular-nums">{value}{f.discountType === 'FIXED' ? ` (${tc('typeFixed')})` : ''}</span>)}
                {row(tc('colScope'), scope)}
                {full && f.scope === 'PRODUCTS' && f.products.length > 0 && row(tc('selectedProducts'), <span className="font-normal">{f.products.map((p) => (p.missing ? tc('productRemoved') : p.name)).join(', ')}</span>)}
                {row(tc('minOrderLabel'), min ? money(min) : tc('none'))}
                {row(tc('usageLimitLabel'), ul ? ul : tc('unlimited'))}
                {row(tc('perCustomerLabel'), pc ? pc : tc('unlimited'))}
                {row(tc('startLabel'), start && start !== 'invalid' ? <span className="tabular-nums">{when.local(start)}<span className="block text-[12px] font-normal text-ink-3">{tc('utcTime', { time: when.utc(start) })}</span></span> : tc('startsOnSave'))}
                {row(tc('endLabel'), end && end !== 'invalid' ? <span className="tabular-nums">{when.local(end)}<span className="block text-[12px] font-normal text-ink-3">{tc('utcTime', { time: when.utc(end) })}</span></span> : '—')}
            </dl>
            <div className="mt-3">
                <Notice tone="info">
                    <p>{f.discountType === 'PERCENT' ? tc('ruleRounding') : tc('ruleCap')}</p>
                    <p className="mt-1">{tc('ruleCombine')}</p>
                    {f.scope !== 'ALL' && <p className="mt-1">{tc('ruleEligible')}</p>}
                </Notice>
            </div>
        </div>
    );
}
