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
    return Array.isArray(b?.message) ? b.message.join(' ') : typeof b?.message === 'string' ? b.message : 'Could not save. Try again.';
};

// ── Company details ──────────────────────────────────────────────────────────
type Company = { companyName: string; businessType: string; website: string; phone: string; country: string; businessCity: string };

/** Shows the saved company record from /auth/me; Edit → Save persists via PATCH /users/me and re-reads the server. */
export function CompanyDetailsCard() {
    const { user, refreshUser } = useAuth();
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
        if (!f.companyName.trim()) er.companyName = 'Company name is required.';
        const ph = f.phone.replace(/[\s()-]/g, '');
        if (ph && !/^\+?\d{8,15}$/.test(ph)) er.phone = 'Use international format, e.g. +40712345678.';
        if (f.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(f.website.trim())) er.website = 'Enter a website like company.com.';
        setErr(er);
        if (Object.keys(er).length) return;
        setBusy(true); setMsg(null);
        try {
            const res = await apiFetch('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyName: f.companyName.trim(), businessType: f.businessType || null, website: f.website.trim() || null, phone: ph || null, country: f.country || null, businessCity: f.businessCity.trim() || null }) });
            if (!res.ok) throw new Error(await errorText(res));
            await refreshUser(); // show what the server now holds
            setEditing(false); setMsg({ ok: true, text: 'Company details saved.' });
        } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save. Try again.' }); }
        finally { setBusy(false); }
    };

    const rows: [string, string][] = [['Company', saved.companyName], ['Business type', saved.businessType], ['Phone', saved.phone], ['Country', saved.country], ['City', saved.businessCity], ['Website', saved.website]];
    return (
        <SettingsCard icon={<Building2 size={17} />} title="Company details" desc="Your trading company as Atlantis sees it. Self-declared — not a verification."
            action={!editing && user ? <button type="button" onClick={() => { setEditing(true); setMsg(null); }} className="h-9 px-3.5 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface-2">Edit details</button> : undefined}>
            {!user ? <div className="h-24 rounded-xl bg-surface-2 animate-pulse" aria-busy="true" /> : !editing ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <span className={cn('w-10 h-10 rounded-full flex items-center justify-center', missing.length ? 'bg-surface-3 text-ink-3' : 'bg-teal-soft text-teal')}>{missing.length ? <AlertCircle size={18} /> : <Check size={18} />}</span>
                        <div className="min-w-0">
                            <p className="text-[14.5px] font-semibold text-ink">{missing.length ? 'Details incomplete' : 'Details complete'}</p>
                            <p className="text-[13px] text-ink-3 truncate">{missing.length ? `Add ${missing.map((m) => ({ companyName: 'company name', businessType: 'business type', phone: 'phone', country: 'country' }[m])).join(', ')}.` : saved.companyName}</p>
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
                        <div><label htmlFor="cd-company" className={authLabel}>Company name</label><input id="cd-company" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} className={authInput} aria-invalid={!!err.companyName} />{err.companyName && <p className="mt-1 text-[12.5px] text-[#B91C1C]">{err.companyName}</p>}</div>
                        <div><label htmlFor="cd-type" className={authLabel}>Business type</label>
                            <AuthSelect id="cd-type" value={f.businessType} onChange={(e) => set('businessType', e.target.value)}>
                                <option value="">Select…</option>
                                {[...BUSINESS_TYPES, ...(f.businessType && !(BUSINESS_TYPES as readonly string[]).includes(f.businessType) ? [f.businessType] : [])].map((b) => <option key={b} value={b}>{b}</option>)}
                            </AuthSelect></div>
                        <div><label htmlFor="cd-phone" className={authLabel}>Business phone</label><input id="cd-phone" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+40 712 345 678" className={authInput} aria-invalid={!!err.phone} />{err.phone && <p className="mt-1 text-[12.5px] text-[#B91C1C]">{err.phone}</p>}</div>
                        <div><label htmlFor="cd-web" className={authLabel}>Website <span className="font-normal text-ink-4">(optional)</span></label><input id="cd-web" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="company.com" className={authInput} aria-invalid={!!err.website} />{err.website && <p className="mt-1 text-[12.5px] text-[#B91C1C]">{err.website}</p>}</div>
                        <div><label htmlFor="cd-country" className={authLabel}>Country</label>
                            <AuthSelect id="cd-country" value={f.country} onChange={(e) => set('country', e.target.value)}>
                                <option value="">Select…</option>
                                {[...COUNTRIES.map((c) => c.name), ...(f.country && !COUNTRIES.some((c) => c.name === f.country) ? [f.country] : [])].map((c) => <option key={c} value={c}>{c}</option>)}
                            </AuthSelect></div>
                        <div><label htmlFor="cd-city" className={authLabel}>City <span className="font-normal text-ink-4">(optional)</span></label><input id="cd-city" value={f.businessCity} onChange={(e) => set('businessCity', e.target.value)} className={authInput} /></div>
                    </div>
                    <Status s={msg} />
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => { setEditing(false); setErr({}); setMsg(null); }} disabled={busy} className="h-10 px-4 rounded-xl text-[13.5px] font-medium text-ink-2 hover:text-ink">Cancel</button>
                        <button type="submit" disabled={busy} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} Save details</button>
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
            setSaved(b.brands); setSel(b.brands); setMsg({ ok: true, text: 'Brand preferences saved.' });
        } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save. Try again.' }); }
        finally { setBusy(false); }
    };

    return (
        <SettingsCard icon={<Tag size={17} />} title="Brand preferences"
            desc={role === 'supplier' ? 'The brands you supply. Saved to your account for the Atlantis team.' : 'The brands you trade most. New offers from them are shown first on your Overview.'}>
            {saved === null ? <div className="h-28 rounded-xl bg-surface-2 animate-pulse" aria-busy="true" /> : (
                <div className="space-y-4">
                    {loadErr && <Status s={{ ok: false, text: 'Your saved brands couldn’t be loaded. Refresh before saving.' }} />}
                    <label className="flex items-center gap-2 h-11 px-3.5 rounded-xl ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6] bg-surface">
                        <Search size={16} className="text-ink-4 shrink-0" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); toggle(term); setQ(''); } }}
                            placeholder="Search brands or type to add one" aria-label="Search brands" className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-4" />
                        {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="text-ink-4 hover:text-ink"><X size={15} /></button>}
                    </label>
                    <div role="group" aria-label="Brands" className="flex flex-wrap gap-2 max-h-[264px] overflow-y-auto pe-1 -me-1">
                        {canAdd && (
                            <button type="button" onClick={() => { toggle(term); setQ(''); }} className="inline-flex items-center gap-1.5 h-10 ps-3 pe-3.5 rounded-full ring-1 ring-dashed ring-[#2EC4B6] text-[13.5px] font-medium text-teal">
                                <Plus size={15} /> Add “{term}”
                            </button>
                        )}
                        {catalog === null && <span className="text-[13px] text-ink-3 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading brands…</span>}
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
                        {catalog !== null && !shown.length && !canAdd && <p className="text-[13px] text-ink-3">No brands match “{term}”.</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-line">
                        <p className="text-[13px] text-ink-3 pt-3">{sel.length} selected</p>
                        {sel.length > 0 && <button type="button" onClick={() => { setSel([]); setMsg(null); }} className="pt-3 text-[13px] font-medium text-ink-3 hover:text-ink">Clear all</button>}
                        <div className="ms-auto pt-3 flex items-center gap-3">
                            <Status s={msg} />
                            {dirty && <button type="button" onClick={() => { setSel(saved); setMsg(null); }} disabled={busy} className="h-10 px-3 text-[13.5px] font-medium text-ink-2 hover:text-ink">Discard</button>}
                            <button type="button" onClick={save} disabled={busy || !dirty} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:bg-surface-3 disabled:text-ink-4 disabled:cursor-not-allowed">{busy && <Loader2 size={14} className="animate-spin" />} Save changes</button>
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
    const u = user as any;
    if (!u) return null;
    const kyc = String(u.kycStatus || 'UNVERIFIED');
    const items = [
        { icon: MailCheck, label: 'Email', value: u.emailVerified ? 'Verified' : 'Not verified', ok: !!u.emailVerified },
        { icon: Clock3, label: 'Account review', value: u.status === 'ACTIVE' ? 'Approved by Atlantis' : u.status === 'PENDING_APPROVAL' ? 'Waiting for review' : u.status === 'REJECTED' ? 'Not approved' : String(u.status || '—').toLowerCase(), ok: u.status === 'ACTIVE' },
        { icon: FileCheck2, label: 'Identity documents (KYC)', value: kyc === 'VERIFIED' ? 'Verified' : kyc === 'PENDING' ? 'Submitted — under review' : kyc === 'REJECTED' ? 'Rejected — resubmit' : 'Not submitted', ok: kyc === 'VERIFIED' },
    ];
    return (
        <SettingsCard icon={<ShieldCheck size={17} />} title="Verification" desc="Status from your account record.">
            <ul className="space-y-3">
                {items.map(({ icon: Icon, label, value, ok }) => (
                    <li key={label} className="flex items-center gap-3">
                        <Icon size={17} className="text-ink-3 shrink-0" />
                        <span className="flex-1 min-w-0 text-[13.5px] text-ink-2">{label}</span>
                        <span className={cn('text-[12px] font-semibold px-2.5 py-1 rounded-full', ok ? 'bg-teal-soft text-teal' : 'bg-surface-3 text-ink-2')}>{value}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-4 text-[12.5px] text-ink-3">Company registration (trade licence, VAT) isn’t verified by Atlantis yet; details above are as you provided them.</p>
        </SettingsCard>
    );
}
