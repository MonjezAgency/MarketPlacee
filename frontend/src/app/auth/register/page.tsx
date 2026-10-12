'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Eye, EyeOff, Loader2, ArrowLeft, ArrowRight, Pencil, ShoppingCart, Warehouse, MailCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { BUSINESS_TYPES } from '@/lib/business-types';
import { AuthShell, AuthSelect, authInput, authLabel, authPrimary, authSecondary, FieldError, FormAlert, PasswordChecklist, passwordOk } from '@/components/auth/AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STEPS = ['Account', 'Business', 'Review'] as const;


type Form = {
    name: string; email: string; password: string; confirm: string;
    role: 'customer' | 'supplier' | ''; companyName: string; website: string;
    phoneCode: string; phone: string; country: string; city: string; businessType: string;
};
type Errors = Partial<Record<keyof Form, string>>;

function validate(step: number, f: Form): Errors {
    const e: Errors = {};
    if (step === 0) {
        if (!f.name.trim()) e.name = 'Enter your full name.';
        if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid work email.';
        if (!passwordOk(f.password)) e.password = 'Your password doesn’t meet all the requirements yet.';
        if (!f.confirm) e.confirm = 'Confirm your password.';
        else if (f.confirm !== f.password) e.confirm = 'Passwords don’t match.';
    }
    if (step === 1) {
        if (!f.role) e.role = 'Choose how you’ll use Atlantis.';
        if (!f.companyName.trim()) e.companyName = 'Enter your company name.';
        const digits = f.phone.replace(/[\s()-]/g, '');
        if (!/^\d{6,14}$/.test(digits)) e.phone = 'Enter the phone number without the country code (6–14 digits).';
        if (!f.country) e.country = 'Choose your country.';
        if (!f.businessType) e.businessType = 'Choose the option closest to your business.';
        if (f.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(f.website.trim())) e.website = 'Enter a website like company.com, or leave it empty.';
    }
    return e;
}

function RegisterWizard() {
    const router = useRouter();
    const sp = useSearchParams();
    const { register } = useAuth();
    const { locale } = useLanguage() as any;
    const inviteRole = (sp.get('role') || '').toLowerCase();
    const [step, setStep] = React.useState(0);
    const [done, setDone] = React.useState<number[]>([]);
    const [showPw, setShowPw] = React.useState(false);
    const [errors, setErrors] = React.useState<Errors>({});
    const [submitting, setSubmitting] = React.useState(false);
    const [serverError, setServerError] = React.useState('');
    const [f, setF] = React.useState<Form>({
        name: '', email: sp.get('email') || '', password: '', confirm: '',
        role: inviteRole === 'supplier' ? 'supplier' : inviteRole === 'customer' || inviteRole === 'buyer' ? 'customer' : '',
        companyName: '', website: '', phoneCode: '+40', phone: '', country: '', city: '', businessType: '',
    });
    const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };
    const heading = React.useRef<HTMLHeadingElement>(null);
    React.useEffect(() => { heading.current?.focus(); }, [step]);

    const next = () => {
        const e = validate(step, f);
        setErrors(e);
        if (Object.keys(e).length) { document.getElementById(`f-${Object.keys(e)[0]}`)?.focus(); return; }
        setDone((d) => Array.from(new Set([...d, step])));
        setStep((s) => Math.min(2, s + 1));
    };
    const goTo = (i: number) => { if (i < step || done.includes(i - 1) || i === 0) setStep(i); };

    const submit = async () => {
        if (submitting) return; // no double submit
        for (const s of [0, 1]) { const e = validate(s, f); if (Object.keys(e).length) { setErrors(e); setStep(s); return; } }
        setSubmitting(true); setServerError('');
        const res: any = await register({
            name: f.name.trim(), email: f.email.trim(), password: f.password, role: f.role,
            companyName: f.companyName.trim(), website: f.website.trim() || undefined,
            phone: `${f.phoneCode}${f.phone.replace(/[\s()-]/g, '')}`, country: f.country,
            ...( { businessCity: f.city.trim() || undefined, businessType: f.businessType } as any),
            inviteToken: sp.get('invite') || undefined, locale,
        } as any);
        if (typeof res === 'string' || !res) { setServerError(typeof res === 'string' ? res : 'We couldn’t reach Atlantis. Check your connection and try again.'); setSubmitting(false); return; }
        // Only now — after the server has issued a code — move to the code screen.
        try { sessionStorage.setItem('atl_verify_email', res.email || f.email.trim().toLowerCase()); } catch { /* ignore */ }
        router.push(`/auth/verify-email?email=${encodeURIComponent(res.email || f.email.trim().toLowerCase())}&sent=1`);
    };

    const countryName = f.country;
    return (
        <AuthShell wide>
            <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-5 sm:p-7">
                <h1 className="text-[22px] leading-tight font-semibold text-heading">Create your business account</h1>
                <p className="mt-1 text-[14px] text-ink-3">For wholesalers, distributors, importers and bulk traders.</p>
                <p className="text-[13.5px] text-ink-3">Already registered? <Link href="/auth/login" className="font-semibold text-teal hover:underline">Sign in</Link></p>

                {/* Progress: 1 → 2 → 3 */}
                <ol className="mt-5 flex items-center" aria-label="Registration progress">
                    {STEPS.map((label, i) => {
                        const isDone = done.includes(i) && i < step || (i < step);
                        const current = i === step;
                        return (
                            <li key={label} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
                                <button type="button" onClick={() => goTo(i)} disabled={!(i < step)} aria-current={current ? 'step' : undefined}
                                    className="flex items-center gap-2 group disabled:cursor-default">
                                    <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold transition-colors',
                                        isDone ? 'bg-[#0E7C74] text-white' : current ? 'bg-heading text-surface' : 'ring-1 ring-line-strong text-ink-3')}>
                                        {isDone ? <Check size={15} strokeWidth={2.5} /> : i + 1}
                                    </span>
                                    <span className={cn('text-[13px] font-medium hidden sm:inline', current ? 'text-heading' : isDone ? 'text-teal group-hover:underline' : 'text-ink-3')}>{label}</span>
                                    <span className="sr-only">{isDone ? ' (completed)' : current ? ' (current step)' : ''}</span>
                                </button>
                                {i < STEPS.length - 1 && <span aria-hidden className="flex-1 mx-3 h-[2px] rounded-full bg-line overflow-hidden"><span className={cn('block h-full bg-[#0E7C74] transition-[width] duration-300', i < step ? 'w-full' : 'w-0')} /></span>}
                            </li>
                        );
                    })}
                </ol>

                <form className="mt-5" noValidate onSubmit={(e) => { e.preventDefault(); step < 2 ? next() : submit(); }}>
                    <h2 ref={heading} tabIndex={-1} className="text-[16px] font-semibold text-heading outline-none">
                        {step === 0 ? 'Account basics' : step === 1 ? 'Business profile' : 'Review and create'}
                    </h2>

                    <div key={step} className="mt-3.5 space-y-3.5 motion-safe:animate-[atl-toast-in_200ms_ease-out]">
                        {step === 0 && (<>
                            <div>
                                <label htmlFor="f-name" className={authLabel}>Full name</label>
                                <input id="f-name" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className={authInput} aria-invalid={!!errors.name} aria-describedby="e-name" />
                                <FieldError id="e-name">{errors.name}</FieldError>
                            </div>
                            <div>
                                <label htmlFor="f-email" className={authLabel}>Work email</label>
                                <input id="f-email" type="email" inputMode="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="name@company.com" className={authInput} aria-invalid={!!errors.email} aria-describedby="e-email" />
                                <FieldError id="e-email">{errors.email}</FieldError>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="f-password" className={authLabel}>Password</label>
                                    <div className="relative">
                                        <input id="f-password" type={showPw ? 'text' : 'password'} value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" className={cn(authInput, 'pe-11')} aria-invalid={!!errors.password} aria-describedby="e-password pw-rules" />
                                        <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-ink-3 hover:text-ink">{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="f-confirm" className={authLabel}>Confirm password</label>
                                    <input id="f-confirm" type={showPw ? 'text' : 'password'} value={f.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" className={authInput} aria-invalid={!!errors.confirm} aria-describedby="e-confirm" />
                                    <FieldError id="e-confirm">{errors.confirm}</FieldError>
                                </div>
                            </div>
                            <div id="pw-rules"><PasswordChecklist value={f.password} /></div>
                            <FieldError id="e-password">{errors.password}</FieldError>
                        </>)}

                        {step === 1 && (<>
                            <fieldset>
                                <legend className={authLabel}>Account type</legend>
                                <div id="f-role" tabIndex={-1} role="radiogroup" aria-describedby="e-role" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 outline-none">
                                    {([['customer', 'Buyer', 'Source by the pallet or truckload', ShoppingCart], ['supplier', 'Supplier', 'List stock and offers for Atlantis', Warehouse]] as const).map(([v, t, d, Icon]) => (
                                        <label key={v} className={cn('flex items-start gap-3 rounded-xl px-3.5 py-3 ring-1 cursor-pointer transition-colors', f.role === v ? 'ring-2 ring-[#2EC4B6] bg-teal-soft/60' : 'ring-line hover:ring-line-strong')}>
                                            <input type="radio" name="role" value={v} checked={f.role === v} onChange={() => set('role', v)} aria-label={`${t} — ${d}`} className="sr-only" />
                                            <span className={cn('w-9 h-9 shrink-0 rounded-lg flex items-center justify-center', f.role === v ? 'bg-[#0E7C74] text-white' : 'bg-surface-2 text-ink-2')}><Icon size={17} /></span>
                                            <span><span className="block text-[14.5px] font-semibold text-ink">{t}</span><span className="block text-[12.5px] text-ink-3">{d}</span></span>
                                        </label>
                                    ))}
                                </div>
                                <FieldError id="e-role">{errors.role}</FieldError>
                            </fieldset>
                            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3.5">
                                <div>
                                    <label htmlFor="f-companyName" className={authLabel}>Company name</label>
                                    <input id="f-companyName" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} autoComplete="organization" className={authInput} aria-invalid={!!errors.companyName} aria-describedby="e-companyName" />
                                    <FieldError id="e-companyName">{errors.companyName}</FieldError>
                                </div>
                                <div>
                                    <label htmlFor="f-businessType" className={authLabel}>Business type</label>
                                    <AuthSelect id="f-businessType" value={f.businessType} onChange={(e) => set('businessType', e.target.value)} aria-invalid={!!errors.businessType} aria-describedby="e-businessType">
                                        <option value="">Select…</option>
                                        {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                                    </AuthSelect>
                                    <FieldError id="e-businessType">{errors.businessType}</FieldError>
                                </div>
                                <div>
                                    <label htmlFor="f-country" className={authLabel}>Country</label>
                                    <AuthSelect id="f-country" value={f.country} onChange={(e) => { const c = COUNTRIES.find((x) => x.name === e.target.value); set('country', e.target.value); if (c && !f.phone) set('phoneCode', c.dialCode); }} autoComplete="country-name" aria-invalid={!!errors.country} aria-describedby="e-country">
                                        <option value="">Select…</option>
                                        {COUNTRIES.map((c) => <option key={c.iso} value={c.name}>{c.name}</option>)}
                                    </AuthSelect>
                                    <FieldError id="e-country">{errors.country}</FieldError>
                                </div>
                                <div>
                                    <label htmlFor="f-city" className={authLabel}>City <span className="font-normal text-ink-4">(optional)</span></label>
                                    <input id="f-city" value={f.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" placeholder="e.g. Rotterdam" className={authInput} />
                                </div>
                                <div>
                                    <label htmlFor="f-phone" className={authLabel}>Business phone</label>
                                    <div className="flex gap-2">
                                        <AuthSelect aria-label="Country calling code" value={f.phoneCode} onChange={(e) => set('phoneCode', e.target.value)} className="w-[104px] shrink-0">
                                            {Array.from(new Map(COUNTRIES.map((c) => [c.dialCode, c])).values()).map((c) => <option key={c.dialCode} value={c.dialCode}>{c.flag} {c.dialCode}</option>)}
                                        </AuthSelect>
                                        <input id="f-phone" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel-national" placeholder="712 345 678" className={cn(authInput, 'min-w-0')} aria-invalid={!!errors.phone} aria-describedby="e-phone" />
                                    </div>
                                    <FieldError id="e-phone">{errors.phone}</FieldError>
                                </div>
                                <div>
                                    <label htmlFor="f-website" className={authLabel}>Website <span className="font-normal text-ink-4">(optional)</span></label>
                                    <input id="f-website" value={f.website} onChange={(e) => set('website', e.target.value)} autoComplete="url" placeholder="company.com" className={authInput} aria-invalid={!!errors.website} aria-describedby="e-website" />
                                    <FieldError id="e-website">{errors.website}</FieldError>
                                </div>
                            </div>
                        </>)}

                        {step === 2 && (<>
                            {[
                                { s: 0, title: 'Account', rows: [['Name', f.name], ['Work email', f.email], ['Password', '••••••••']] },
                                { s: 1, title: 'Business', rows: [['Account type', f.role === 'supplier' ? 'Supplier' : 'Buyer'], ['Company', f.companyName], ['Business type', f.businessType], ['Phone', `${f.phoneCode} ${f.phone}`], ['Location', [f.city, countryName].filter(Boolean).join(', ')], ['Website', f.website || '—']] },
                            ].map((g) => (
                                <section key={g.title} className="rounded-xl ring-1 ring-line">
                                    <header className="flex items-center justify-between px-4 py-2.5 border-b border-line">
                                        <h3 className="text-[13.5px] font-semibold text-ink">{g.title}</h3>
                                        <button type="button" onClick={() => setStep(g.s)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-teal hover:underline"><Pencil size={13} /> Edit</button>
                                    </header>
                                    <dl className="px-4 py-2 divide-y divide-line">
                                        {g.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2 text-[13.5px]"><dt className="text-ink-3">{k}</dt><dd className="text-ink text-end break-all">{v}</dd></div>)}
                                    </dl>
                                </section>
                            ))}
                            <FormAlert tone="info">
                                <span className="flex gap-2.5"><MailCheck size={17} className="text-teal shrink-0 mt-0.5" />
                                    <span>We’ll email a 6-digit code to <strong className="text-ink">{f.email}</strong> to verify it. After that, our team reviews new business accounts before trading starts — formal business verification isn’t part of sign-up yet.</span></span>
                            </FormAlert>
                            <p className="text-[12.5px] text-ink-3">By creating an account you agree to the <Link href="/terms" className="text-teal hover:underline">Terms</Link> and <Link href="/privacy-policy" className="text-teal hover:underline">Privacy policy</Link>.</p>
                        </>)}

                        {serverError && <FormAlert>{serverError}</FormAlert>}
                    </div>

                    <div className="mt-6 flex items-center gap-3">
                        {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} disabled={submitting} className={authSecondary}><ArrowLeft size={16} /> Back</button>}
                        <button type="submit" disabled={submitting} className={cn(authPrimary, 'flex-1')}>
                            {submitting ? <><Loader2 size={16} className="animate-spin" /> Creating account…</> : step < 2 ? <>Continue <ArrowRight size={16} /></> : 'Create account'}
                        </button>
                    </div>
                </form>
            </div>
        </AuthShell>
    );
}

export default function RegisterPage() {
    return <React.Suspense fallback={null}><RegisterWizard /></React.Suspense>;
}
