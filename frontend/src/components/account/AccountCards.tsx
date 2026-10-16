'use client';

import * as React from 'react';
import { Building2, Check, AlertCircle, Loader2, Search, Plus, X, ShieldCheck, MailCheck, Clock3, FileCheck2, Tag } from 'lucide-react';
import { apiFetch, fetchProductPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COUNTRIES } from '@/lib/countries';
import { BUSINESS_TYPES } from '@/lib/business-types';
import { brandLogo, LOGO_BRANDS } from '@/lib/brand-logos';
import { AuthSelect, authInput, authLabel } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

/** Dictionary keys for BUSINESS_TYPES, same order. The stored value stays the English option. */
const BUSINESS_TYPE_KEYS = ['btWholesaler', 'btDistributor', 'btImporter', 'btExporter', 'btTrading', 'btBrandOwner', 'btAgent', 'btOther'] as const;

/** t() bound to this area's dictionary, plus labels for stored business types and countries. */
function useAccountText() {
    const { t, meta } = useLanguage();
    const tr = React.useCallback((k: string, vars?: Record<string, string | number>) => t('supplierMoney', k, vars), [t]);
    const businessTypeLabel = React.useCallback((v: string) => {
        const i = (BUSINESS_TYPES as readonly string[]).indexOf(v);
        return i >= 0 && BUSINESS_TYPE_KEYS[i] ? tr(BUSINESS_TYPE_KEYS[i]) : v;
    }, [tr]);
    const regionNames = React.useMemo(() => { try { return new Intl.DisplayNames([meta.intl], { type: 'region' }); } catch { return null; } }, [meta.intl]);
    const countryLabel = React.useCallback((name: string) => {
        const iso = COUNTRIES.find((c) => c.name === name)?.iso;
        if (!iso || !regionNames) return name;
        try { return regionNames.of(iso) || name; } catch { return name; }
    }, [regionNames]);
    const list = React.useCallback((items: string[]) => {
        try { return new Intl.ListFormat(meta.intl, { style: 'long', type: 'conjunction' }).format(items); } catch { return items.join(', '); }
    }, [meta.intl]);
    return { tr, businessTypeLabel, countryLabel, list };
}

export function SettingsCard({ icon, title, desc, action, children }: { icon: React.ReactNode; title: string; desc?: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl ring-1 ring-line bg-surface">
            <header className="flex items-start gap-3 px-5 py-4 border-b border-line">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-teal-soft text-teal flex items-center justify-center">{icon}</span>
                <div className="flex-1 min-w-0">
                    <h2 className="text-[16px] font-semibold text-heading">{title}</h2>
                    {desc && <p className="text-[13px] text-ink-3">{desc}</p>}
                </div>
                {action}
            </header>
            <div className="p-5">{children}</div>
        </section>
    );
}

function Status({ s }: { s: { ok: boolean; text: string } | null }) {
    if (!s) return null;
    return <p role={s.ok ? 'status' : 'alert'} className={cn('text-[13px] flex items-start gap-1.5', s.ok ? 'text-teal' : 'text-[#B91C1C]')}>{s.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}{s.text}</p>;
}

const errorText = async (res: Response) => {
    const b = await res.json().catch(() => ({}));
    // Server message when there is one; '' lets the caller show the translated fallback.
    return Array.isArray(b?.message) ? b.message.join(' ') : typeof b?.message === 'string' ? b.message : '';
};

// ── Company details ──────────────────────────────────────────────────────────
type Company = { companyName: string; businessType: string; website: string; phone: string; country: string; businessCity: string };

/** Shows the saved company record from /auth/me; Edit → Save persists via PATCH /users/me and re-reads the server. */
export function CompanyDetailsCard() {
    const { user, refreshUser } = useAuth();
    const { tr, businessTypeLabel, countryLabel, list } = useAccountText();
    const u = user as any;
    const saved: Company = { companyName: u?.companyName || '', businessType: u?.businessType || '', website: u?.website || '', phone: u?.phone || '', country: u?.country || '', businessCity: u?.businessCity || '' };
    const [editing, setEditing] = React.useState(false);
    const [f, setF] = React.useState<Company>(saved);
    const [busy, setBusy] = React.useState(false);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    const [err, setErr] = React.useState<Partial<Record<keyof Company, string>>>({});
    React.useEffect(() => { if (!editing) setF(saved); }, [user, editing]); // eslint-disable-line react-hooks/exhaustive-deps

    const missing = (['companyName', 'businessType', 'phone', 'country'] as const).filter((k) => !saved[k]);
    const set = (k: keyof Company, v: string) => { setF((p) => ({ ...p, [k]: v })); setErr((e) => ({ ...e, [k]: undefined })); };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        const er: typeof err = {};
        if (!f.companyName.trim()) er.companyName = tr('acCompanyRequired');
        const ph = f.phone.replace(/[\s()-]/g, '');
        if (ph && !/^\+?\d{8,15}$/.test(ph)) er.phone = tr('acPhoneFormat', { example: '+40712345678' });
        if (f.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(f.website.trim())) er.website = tr('acWebsiteFormat', { example: 'company.com' });
        setErr(er);
        if (Object.keys(er).length) return;
        setBusy(true); setMsg(null);
        try {
            const res = await apiFetch('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyName: f.companyName.trim(), businessType: f.businessType || null, website: f.website.trim() || null, phone: ph || null, country: f.country || null, businessCity: f.businessCity.trim() || null }) });
            if (!res.ok) throw new Error(await errorText(res));
            await refreshUser(); // show what the server now holds
            setEditing(false); setMsg({ ok: true, text: tr('acCompanySaved') });
        } catch (e: any) { setMsg({ ok: false, text: e?.message || tr('couldNotSave') }); }
        finally { setBusy(false); }
    };

    const rows: [string, string][] = [[tr('acRowCompany'), saved.companyName], [tr('acRowBusinessType'), saved.businessType ? businessTypeLabel(saved.businessType) : ''], [tr('acRowPhone'), saved.phone], [tr('acRowCountry'), saved.country ? countryLabel(saved.country) : ''], [tr('acRowCity'), saved.businessCity], [tr('acRowWebsite'), saved.website]];
    const missingKeys = { companyName: 'acMissingCompanyName', businessType: 'acMissingBusinessType', phone: 'acMissingPhone', country: 'acMissingCountry' } as const;
    return (
        <SettingsCard icon={<Building2 size={17} />} title={tr('acCompanyTitle')} desc={tr('acCompanyDesc')}
            action={!editing && user ? <button type="button" onClick={() => { setEditing(true); setMsg(null); }} className="h-9 px-3.5 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface-2">{tr('acEditDetails')}</button> : undefined}>
            {!user ? <div className="h-24 rounded-xl bg-surface-2 animate-pulse" aria-busy="true" /> : !editing ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <span className={cn('w-10 h-10 rounded-full flex items-center justify-center', missing.length ? 'bg-surface-3 text-ink-3' : 'bg-teal-soft text-teal')}>{missing.length ? <AlertCircle size={18} /> : <Check size={18} />}</span>
                        <div className="min-w-0">
                            <p className="text-[14.5px] font-semibold text-ink">{missing.length ? tr('acDetailsIncomplete') : tr('acDetailsComplete')}</p>
                            <p className="text-[13px] text-ink-3 truncate">{missing.length ? tr('acAddMissing', { fields: list(missing.map((m) => tr(missingKeys[m]))) }) : saved.companyName}</p>
                        </div>
                    </div>
                    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                        {rows.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[12px] text-ink-3">{k}</dt><dd className="text-[14px] text-ink truncate">{v || <span className="text-ink-4">—</span>}</dd></div>)}
                    </dl>
                    <Status s={msg} />
                </div>
            ) : (
                <form onSubmit={save} noValidate className="space-y-3.5">
                    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3.5">
                        <div><label htmlFor="cd-company" className={authLabel}>{tr('acCompanyName')}</label><input id="cd-company" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} className={authInput} aria-invalid={!!err.companyName} />{err.companyName && <p className="mt-1 text-[12.5px] text-[#B91C1C]">{err.companyName}</p>}</div>
                        <div><label htmlFor="cd-type" className={authLabel}>{tr('acRowBusinessType')}</label>
                            <AuthSelect id="cd-type" value={f.businessType} onChange={(e) => set('businessType', e.target.value)}>
                                <option value="">{tr('selectPlaceholder')}</option>
                                {[...BUSINESS_TYPES, ...(f.businessType && !(BUSINESS_TYPES as readonly string[]).includes(f.businessType) ? [f.businessType] : [])].map((b) => <option key={b} value={b}>{businessTypeLabel(b)}</option>)}
                            </AuthSelect></div>
                        <div><label htmlFor="cd-phone" className={authLabel}>{tr('acBusinessPhone')}</label><input id="cd-phone" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+40 712 345 678" dir="ltr" className={cn(authInput, 'rtl:text-end')} aria-invalid={!!err.phone} />{err.phone && <p className="mt-1 text-[12.5px] text-[#B91C1C]">{err.phone}</p>}</div>
                        <div><label htmlFor="cd-web" className={authLabel}>{tr('acRowWebsite')} <span className="font-normal text-ink-4">{tr('optional')}</span></label><input id="cd-web" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder={tr('egExample', { example: 'company.com' })} dir="ltr" className={cn(authInput, 'rtl:text-end')} aria-invalid={!!err.website} />{err.website && <p className="mt-1 text-[12.5px] text-[#B91C1C]">{err.website}</p>}</div>
                        <div><label htmlFor="cd-country" className={authLabel}>{tr('acRowCountry')}</label>
                            <AuthSelect id="cd-country" value={f.country} onChange={(e) => set('country', e.target.value)}>
                                <option value="">{tr('selectPlaceholder')}</option>
                                {[...COUNTRIES.map((c) => c.name), ...(f.country && !COUNTRIES.some((c) => c.name === f.country) ? [f.country] : [])].map((c) => <option key={c} value={c}>{countryLabel(c)}</option>)}
                            </AuthSelect></div>
                        <div><label htmlFor="cd-city" className={authLabel}>{tr('acRowCity')} <span className="font-normal text-ink-4">{tr('optional')}</span></label><input id="cd-city" value={f.businessCity} onChange={(e) => set('businessCity', e.target.value)} className={authInput} /></div>
                    </div>
                    <Status s={msg} />
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => { setEditing(false); setErr({}); setMsg(null); }} disabled={busy} className="h-10 px-4 rounded-xl text-[13.5px] font-medium text-ink-2 hover:text-ink">{tr('cancel')}</button>
                        <button type="submit" disabled={busy} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} {tr('acSaveDetails')}</button>
                    </div>
                </form>
            )}
        </SettingsCard>
    );
}

// ── Brand preferences ───────────────────────────────────────────────────────
const key = (b: string) => b.trim().toLowerCase();

/** Brands from the live catalog (+ brands with a logo on file), saved to the account via /users/me/brand-preferences. */
export function BrandPreferencesCard({ role }: { role: 'buyer' | 'supplier' }) {
    const { tr } = useAccountText();
    const { fmt } = useLanguage();
    const [catalog, setCatalog] = React.useState<{ name: string; count: number }[] | null>(null);
    const [saved, setSaved] = React.useState<string[] | null>(null);
    const [sel, setSel] = React.useState<string[]>([]);
    const [q, setQ] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    const [loadErr, setLoadErr] = React.useState(false);

    React.useEffect(() => {
        apiFetch('/users/me/brand-preferences').then(async (r) => { if (!r.ok) throw new Error(); const b = await r.json(); setSaved(b.brands ?? []); setSel(b.brands ?? []); }).catch(() => { setSaved([]); setLoadErr(true); });
        fetchProductPage({ limit: 1 }).then((r) => setCatalog((r.brands ?? []).map((b) => ({ name: b.value, count: b.count })))).catch(() => setCatalog([]));
    }, []);

    const options = React.useMemo(() => {
        const m = new Map<string, { name: string; count: number }>();
        for (const b of catalog ?? []) if (b.name && key(b.name) !== 'unnamed') m.set(key(b.name), b);
        for (const n of LOGO_BRANDS) if (!m.has(key(n))) m.set(key(n), { name: n, count: 0 });
        for (const n of sel) if (!m.has(key(n))) m.set(key(n), { name: n, count: 0 });
        return Array.from(m.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [catalog, sel]);
    const selKeys = new Set(sel.map(key));
    const term = q.trim();
    const shown = options.filter((o) => !term || key(o.name).includes(key(term)));
    const canAdd = term.length > 1 && term.length <= 60 && !options.some((o) => key(o.name) === key(term));
    const dirty = saved !== null && (saved.length !== sel.length || saved.some((s, i) => key(s) !== key(sel[i] ?? '')));

    const toggle = (n: string) => { setMsg(null); setSel((s) => (s.some((x) => key(x) === key(n)) ? s.filter((x) => key(x) !== key(n)) : [...s, n])); };
    const save = async () => {
        setBusy(true); setMsg(null);
        try {
            const res = await apiFetch('/users/me/brand-preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brands: sel }) });
            if (!res.ok) throw new Error(await errorText(res));
            const b = await res.json();
            setSaved(b.brands); setSel(b.brands); setMsg({ ok: true, text: tr('brSaved') });
        } catch (e: any) { setMsg({ ok: false, text: e?.message || tr('couldNotSave') }); }
        finally { setBusy(false); }
    };

    return (
        <SettingsCard icon={<Tag size={17} />} title={tr('brTitle')}
            desc={role === 'supplier' ? tr('brDescSupplier') : tr('brDescBuyer')}>
            {saved === null ? <div className="h-28 rounded-xl bg-surface-2 animate-pulse" aria-busy="true" /> : (
                <div className="space-y-4">
                    {loadErr && <Status s={{ ok: false, text: tr('brLoadError') }} />}
                    <label className="flex items-center gap-2 h-11 px-3.5 rounded-xl ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6] bg-surface">
                        <Search size={16} className="text-ink-4 shrink-0" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); toggle(term); setQ(''); } }}
                            placeholder={tr('brSearchPh')} aria-label={tr('brSearchAria')} className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-4" />
                        {q && <button type="button" onClick={() => setQ('')} aria-label={tr('brClearSearch')} className="text-ink-4 hover:text-ink"><X size={15} /></button>}
                    </label>
                    <div role="group" aria-label={tr('brGroup')} className="flex flex-wrap gap-2 max-h-[264px] overflow-y-auto pe-1 -me-1">
                        {canAdd && (
                            <button type="button" onClick={() => { toggle(term); setQ(''); }} className="inline-flex items-center gap-1.5 h-10 ps-3 pe-3.5 rounded-full ring-1 ring-dashed ring-[#2EC4B6] text-[13.5px] font-medium text-teal">
                                <Plus size={15} /> {tr('brAdd', { term })}
                            </button>
                        )}
                        {catalog === null && <span className="text-[13px] text-ink-3 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {tr('brLoading')}</span>}
                        {shown.map((o) => {
                            const on = selKeys.has(key(o.name));
                            const logo = brandLogo(o.name);
                            return (
                                <button key={o.name} type="button" aria-pressed={on} onClick={() => toggle(o.name)}
                                    className={cn('inline-flex items-center gap-2 h-10 ps-1.5 pe-3 rounded-full ring-1 text-[13.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                        on ? 'bg-heading text-surface ring-heading' : 'bg-surface text-ink ring-line hover:ring-line-strong')}>
                                    <span className="w-7 h-7 rounded-full bg-white ring-1 ring-line overflow-clip flex items-center justify-center text-[11px] font-semibold text-heading">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {logo ? <img src={logo} alt="" className="max-w-[78%] max-h-[78%] object-contain" /> : o.name.slice(0, 1).toUpperCase()}
                                    </span>
                                    {o.name}
                                    {on && <Check size={14} strokeWidth={2.5} />}
                                </button>
                            );
                        })}
                        {catalog !== null && !shown.length && !canAdd && <p className="text-[13px] text-ink-3">{tr('brNoMatch', { term })}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-line">
                        <p className="text-[13px] text-ink-3 pt-3">{tr('brSelected', { count: fmt.number(sel.length) })}</p>
                        {sel.length > 0 && <button type="button" onClick={() => { setSel([]); setMsg(null); }} className="pt-3 text-[13px] font-medium text-ink-3 hover:text-ink">{tr('brClearAll')}</button>}
                        <div className="ms-auto pt-3 flex items-center gap-3">
                            <Status s={msg} />
                            {dirty && <button type="button" onClick={() => { setSel(saved); setMsg(null); }} disabled={busy} className="h-10 px-3 text-[13.5px] font-medium text-ink-2 hover:text-ink">{tr('brDiscard')}</button>}
                            <button type="button" onClick={save} disabled={busy || !dirty} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:bg-surface-3 disabled:text-ink-4 disabled:cursor-not-allowed">{busy && <Loader2 size={14} className="animate-spin" />} {tr('brSaveChanges')}</button>
                        </div>
                    </div>
                </div>
            )}
        </SettingsCard>
    );
}

// ── Verification status (real fields only) ─────────────────────────────────
export function VerificationCard() {
    const { user } = useAuth();
    const { tr } = useAccountText();
    const u = user as any;
    if (!u) return null;
    const kyc = String(u.kycStatus || 'UNVERIFIED');
    const items = [
        { icon: MailCheck, label: tr('vEmail'), value: u.emailVerified ? tr('vVerified') : tr('vNotVerified'), ok: !!u.emailVerified },
        { icon: Clock3, label: tr('vAccountReview'), value: u.status === 'ACTIVE' ? tr('vApproved') : u.status === 'PENDING_APPROVAL' ? tr('vWaiting') : u.status === 'REJECTED' ? tr('vNotApproved') : String(u.status || '—').toLowerCase(), ok: u.status === 'ACTIVE' },
        { icon: FileCheck2, label: tr('vKyc'), value: kyc === 'VERIFIED' ? tr('vVerified') : kyc === 'PENDING' ? tr('vKycPending') : kyc === 'REJECTED' ? tr('vKycRejected') : tr('vKycNone'), ok: kyc === 'VERIFIED' },
    ];
    return (
        <SettingsCard icon={<ShieldCheck size={17} />} title={tr('vTitle')} desc={tr('vDesc')}>
            <ul className="space-y-3">
                {items.map(({ icon: Icon, label, value, ok }) => (
                    <li key={label} className="flex items-center gap-3">
                        <Icon size={17} className="text-ink-3 shrink-0" />
                        <span className="flex-1 min-w-0 text-[13.5px] text-ink-2">{label}</span>
                        <span className={cn('text-[12px] font-semibold px-2.5 py-1 rounded-full', ok ? 'bg-teal-soft text-teal' : 'bg-surface-3 text-ink-2')}>{value}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-4 text-[12.5px] text-ink-3">{tr('vNote')}</p>
        </SettingsCard>
    );
}
