'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { COUNTRIES } from '@/lib/countries';
import { BUSINESS_TYPES } from '@/lib/business-types';
import { REQUIRED_PROFILE_FIELDS, PROFILE_FIELD_LABEL, missingProfileFields } from '@/lib/profile-completion';
import { AuthShell, AuthSelect, authInput, authLabel, authPrimary, FieldError, FormAlert } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';

type F = { name: string; companyName: string; businessType: string; country: string; phoneCode: string; phone: string; businessCity: string; website: string };

/**
 * Business profile for accounts that started without one (Google sign-up).
 * Same required fields as email sign-up. Each save persists, so the user can
 * leave and resume; the server marks onboarding complete when nothing is missing.
 */
export default function CompleteProfilePage() {
    const router = useRouter();
    const { user, isAuthReady, refreshUser } = useAuth();
    const u = user as any;
    const [f, setF] = React.useState<F | null>(null);
    const [err, setErr] = React.useState<Partial<Record<keyof F, string>>>({});
    const [busy, setBusy] = React.useState(false);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

    React.useEffect(() => {
        if (!isAuthReady) return;
        if (!user) { router.replace('/auth/login?redirect=/auth/complete-profile'); return; }
        if (f) return;
        const dial = COUNTRIES.find((c) => c.name === u.country)?.dialCode || '+40';
        const phone = String(u.phone || '');
        setF({ name: u.name || '', companyName: u.companyName || '', businessType: u.businessType || '', country: u.country || '', phoneCode: phone.startsWith('+') ? '' : dial, phone, businessCity: u.businessCity || '', website: u.website || '' });
    }, [isAuthReady, user]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!f) return <AuthShell><p className="flex items-center gap-2 text-[14px] text-ink-3"><Loader2 size={16} className="animate-spin" /> Loading your profile…</p></AuthShell>;

    const fullPhone = f.phone.trim().startsWith('+') ? f.phone.replace(/[\s()-]/g, '') : `${f.phoneCode}${f.phone.replace(/[\s()-]/g, '')}`;
    const current = { name: f.name, companyName: f.companyName, businessType: f.businessType, country: f.country, phone: f.phone.trim() ? fullPhone : '' };
    const missing = missingProfileFields(current);
    const done = REQUIRED_PROFILE_FIELDS.length - missing.length;
    const set = (k: keyof F, v: string) => { setF((p) => ({ ...p!, [k]: v })); setErr((e) => ({ ...e, [k]: undefined })); setMsg(null); };

    const save = async (finish: boolean) => {
        const e: typeof err = {};
        if (f.phone.trim() && !/^\+?\d{8,15}$/.test(fullPhone)) e.phone = 'Enter the number without the country code (or in full +international format).';
        if (f.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(f.website.trim())) e.website = 'Enter a website like company.com, or leave it empty.';
        if (finish) for (const m of missing) e[m as keyof F] = `${PROFILE_FIELD_LABEL[m]} is required.`;
        setErr(e);
        if (Object.keys(e).length) { document.getElementById(`cp-${Object.keys(e)[0]}`)?.focus(); return; }
        setBusy(true); setMsg(null);
        try {
            // Only send filled fields so "save and finish later" never blanks anything.
            const body: Record<string, string> = {};
            if (f.name.trim()) body.name = f.name.trim();
            if (f.companyName.trim()) body.companyName = f.companyName.trim();
            if (f.businessType) body.businessType = f.businessType;
            if (f.country) body.country = f.country;
            if (f.phone.trim()) body.phone = fullPhone;
            if (f.businessCity.trim()) body.businessCity = f.businessCity.trim();
            if (f.website.trim()) body.website = f.website.trim();
            const res = await apiFetch('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof data?.message === 'string' ? data.message : 'Could not save. Try again.');
            await refreshUser();
            if (finish) {
                const role = String(data?.role || u.role || '').toUpperCase();
                window.location.href = data?.status && data.status !== 'ACTIVE' ? '/auth/pending' : role === 'SUPPLIER' ? '/supplier' : '/dashboard/customer';
                return;
            }
            setMsg({ ok: true, text: 'Saved. You can finish later — we’ll keep your progress.' });
        } catch (e2: any) { setMsg({ ok: false, text: e2?.message || 'Could not save. Try again.' }); }
        finally { setBusy(false); }
    };

    return (
        <AuthShell wide>
            <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-5 sm:p-7">
                <span className="w-11 h-11 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><ClipboardList size={21} /></span>
                <h1 className="mt-4 text-[22px] leading-tight font-semibold text-heading">Complete your business profile</h1>
                <p className="mt-1 text-[14px] text-ink-3">A few details about your company before you can order. Signed in as <span className="font-medium text-ink">{u?.email}</span>.</p>

                <div className="mt-5" aria-label="Profile progress">
                    <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-medium text-ink-2">{done} of {REQUIRED_PROFILE_FIELDS.length} required details</span>
                        {missing.length > 0 && <span className="text-ink-3 truncate ms-3">Left: {missing.map((m) => PROFILE_FIELD_LABEL[m].toLowerCase()).join(', ')}</span>}
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={REQUIRED_PROFILE_FIELDS.length} aria-valuenow={done}>
                        <div className={cn('h-full rounded-full transition-[width] duration-300', missing.length ? 'bg-[#2EC4B6]' : 'bg-[#0E7C74]')} style={{ width: `${(done / REQUIRED_PROFILE_FIELDS.length) * 100}%` }} />
                    </div>
                </div>

                <form className="mt-5 space-y-3.5" noValidate onSubmit={(e) => { e.preventDefault(); save(true); }}>
                    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3.5">
                        <div><label htmlFor="cp-name" className={authLabel}>Full name</label><input id="cp-name" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className={authInput} aria-invalid={!!err.name} /><FieldError id="cpe-name">{err.name}</FieldError></div>
                        <div><label htmlFor="cp-companyName" className={authLabel}>Company name</label><input id="cp-companyName" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} autoComplete="organization" className={authInput} aria-invalid={!!err.companyName} /><FieldError id="cpe-company">{err.companyName}</FieldError></div>
                        <div><label htmlFor="cp-businessType" className={authLabel}>Business type</label>
                            <AuthSelect id="cp-businessType" value={f.businessType} onChange={(e) => set('businessType', e.target.value)} aria-invalid={!!err.businessType}>
                                <option value="">Select…</option>{BUSINESS_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                            </AuthSelect><FieldError id="cpe-type">{err.businessType}</FieldError></div>
                        <div><label htmlFor="cp-country" className={authLabel}>Country</label>
                            <AuthSelect id="cp-country" value={f.country} onChange={(e) => { const c = COUNTRIES.find((x) => x.name === e.target.value); set('country', e.target.value); if (c && !f.phone) set('phoneCode', c.dialCode); }} autoComplete="country-name" aria-invalid={!!err.country}>
                                <option value="">Select…</option>{COUNTRIES.map((c) => <option key={c.iso} value={c.name}>{c.name}</option>)}
                            </AuthSelect><FieldError id="cpe-country">{err.country}</FieldError></div>
                        <div><label htmlFor="cp-phone" className={authLabel}>Business phone</label>
                            <div className="flex gap-2">
                                {!f.phone.trim().startsWith('+') && (
                                    <AuthSelect aria-label="Country calling code" value={f.phoneCode} onChange={(e) => set('phoneCode', e.target.value)} className="w-[104px] shrink-0">
                                        {Array.from(new Map(COUNTRIES.map((c) => [c.dialCode, c])).values()).map((c) => <option key={c.dialCode} value={c.dialCode}>{c.flag} {c.dialCode}</option>)}
                                    </AuthSelect>
                                )}
                                <input id="cp-phone" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="712 345 678" className={cn(authInput, 'min-w-0')} aria-invalid={!!err.phone} />
                            </div><FieldError id="cpe-phone">{err.phone}</FieldError></div>
                        <div><label htmlFor="cp-businessCity" className={authLabel}>City <span className="font-normal text-ink-4">(optional)</span></label><input id="cp-businessCity" value={f.businessCity} onChange={(e) => set('businessCity', e.target.value)} autoComplete="address-level2" className={authInput} /></div>
                        <div className="sm:col-span-2"><label htmlFor="cp-website" className={authLabel}>Website <span className="font-normal text-ink-4">(optional)</span></label><input id="cp-website" value={f.website} onChange={(e) => set('website', e.target.value)} autoComplete="url" placeholder="company.com" className={authInput} aria-invalid={!!err.website} /><FieldError id="cpe-web">{err.website}</FieldError></div>
                    </div>
                    {msg && <FormAlert tone={msg.ok ? 'ok' : 'error'}><span className="inline-flex items-center gap-1.5">{msg.ok && <Check size={14} className="text-teal" />}{msg.text}</span></FormAlert>}
                    <p className="text-[12.5px] text-ink-3">These details describe your business; they aren’t a company verification.</p>
                    <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                        <button type="button" onClick={() => save(false)} disabled={busy} className="h-11 px-4 rounded-xl ring-1 ring-line-strong text-[14.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60">Save and finish later</button>
                        <button type="submit" disabled={busy} className={cn(authPrimary, 'sm:flex-1')}>{busy ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Complete profile'}</button>
                    </div>
                </form>
            </div>
        </AuthShell>
    );
}
