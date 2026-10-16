'use client';

import * as React from 'react';
import Link from 'next/link';
import { Camera, Loader2, Check, AlertCircle, UserRound, Bell, KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { resizeImage } from '@/lib/resize-image';
import { cn } from '@/lib/utils';
import { authInput, authLabel } from '@/components/auth/AuthShell';
import { SettingsCard, CompanyDetailsCard, BrandPreferencesCard, VerificationCard } from '@/components/account/AccountCards';
import { ChangeEmailCard } from '@/components/account/ChangeEmailCard';
import { SessionsCard } from '@/components/account/SessionsCard';
import { TwoStepCard } from '@/components/account/TwoStepCard';
import { ReputationCard } from '@/components/supplier/ReputationCard';
import { DefaultCurrencyCard, ListingStatusCard } from '@/components/supplier/SupplierPreferenceCards';
import { useLanguage } from '@/contexts/LanguageContext';

type Prefs = { orderUpdates: boolean; productComments: boolean; lowStockAlerts: boolean; inboundOffers: boolean; marketingEmails: boolean; muteToasts: boolean };
/** label/desc are supplierMoney dictionary keys, translated at render time. */
const PREF_ROWS: { key: keyof Prefs; label: string; desc: string }[] = [
    { key: 'orderUpdates', label: 'prefOrderUpdates', desc: 'prefOrderUpdatesDesc' },
    { key: 'productComments', label: 'prefProductComments', desc: 'prefProductCommentsDesc' },
    { key: 'lowStockAlerts', label: 'prefLowStock', desc: 'prefLowStockDesc' },
    { key: 'inboundOffers', label: 'prefInbound', desc: 'prefInboundDesc' },
    { key: 'marketingEmails', label: 'prefMarketing', desc: 'prefMarketingDesc' },
    { key: 'muteToasts', label: 'prefMuteToasts', desc: 'prefMuteToastsDesc' },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
            className={cn('relative w-11 h-6 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]', on ? 'bg-[#0E7C74]' : 'bg-surface-3 ring-1 ring-line-strong')}>
            <span className={cn('absolute top-0.5 start-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5 rtl:-translate-x-5')} />
        </button>
    );
}

/** Supplier account settings — every section reads and writes the real account record. */
export default function SupplierSettingsPage() {
    const { user, refreshUser } = useAuth();
    const { t } = useLanguage();
    const tr = (key: string, vars?: Record<string, string | number>) => t('supplierMoney', key, vars);
    const [name, setName] = React.useState('');
    const [avatar, setAvatar] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    const fileRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => { setName(user?.name || ''); setAvatar(user?.avatar || null); }, [user]);

    const [prefs, setPrefs] = React.useState<Prefs | null>(null);
    const [prefMsg, setPrefMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    React.useEffect(() => { apiFetch('/users/me/notification-prefs').then((r) => (r.ok ? r.json() : null)).then((d) => setPrefs(d)).catch(() => setPrefs(null)); }, []);
    const togglePref = async (k: keyof Prefs) => {
        if (!prefs) return;
        const prev = prefs; const next = { ...prefs, [k]: !prefs[k] };
        setPrefs(next); setPrefMsg(null);
        const res = await apiFetch('/users/me/notification-prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: next[k] }) }).catch(() => null);
        if (!res?.ok) { setPrefs(prev); setPrefMsg({ ok: false, text: tr('setPrefSaveError') }); }
    };

    const saveName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setMsg({ ok: false, text: tr('setNameRequired') }); return; }
        setBusy(true); setMsg(null);
        try {
            const res = await apiFetch('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
            if (!res.ok) throw new Error();
            await refreshUser(); setMsg({ ok: true, text: tr('setSaved') });
        } catch { setMsg({ ok: false, text: tr('couldNotSave') }); }
        finally { setBusy(false); }
    };
    const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (fileRef.current) fileRef.current.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { setMsg({ ok: false, text: tr('setImageType') }); return; }
        if (file.size > 4 * 1024 * 1024) { setMsg({ ok: false, text: tr('setImageSize') }); return; }
        setUploading(true); setMsg(null);
        try {
            const fd = new FormData(); fd.append('file', await resizeImage(file));
            const res = await apiFetch('/users/me/avatar', { method: 'POST', body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || tr('setUploadFailed'));
            setAvatar(data.url); await refreshUser(); setMsg({ ok: true, text: tr('setLogoUpdated') });
        } catch (err: any) { setMsg({ ok: false, text: err?.message || tr('setUploadFailed') }); }
        finally { setUploading(false); }
    };

    return (
        <div className="max-w-[1120px] mx-auto pb-16 text-start" data-no-translate>
            <div className="mb-6">
                <h1 className="text-[24px] font-semibold text-heading">{tr('setTitle')}</h1>
                <p className="text-[14px] text-ink-3">{tr('setSubtitle')}</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
                <div className="space-y-5 min-w-0">
                    <SettingsCard icon={<UserRound size={17} />} title={tr('setProfile')}>
                        <form onSubmit={saveName} className="flex flex-col sm:flex-row gap-5 sm:items-end">
                            <div className="flex items-center gap-3">
                                <span className="w-16 h-16 rounded-2xl bg-surface-2 ring-1 ring-line overflow-clip flex items-center justify-center text-[22px] font-semibold text-heading">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (user?.companyName?.[0] || user?.name?.[0] || 'A')}
                                </span>
                                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">
                                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {tr('setLogo')}
                                </button>
                                <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <label htmlFor="sp-name" className={authLabel}>{tr('setContactName')}</label>
                                <input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={authInput} />
                            </div>
                            <button type="submit" disabled={busy || name.trim() === (user?.name || '')} className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:bg-surface-3 disabled:text-ink-4">{busy && <Loader2 size={14} className="animate-spin" />} {tr('save')}</button>
                        </form>
                        {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('mt-3 text-[13px] flex items-center gap-1.5', msg.ok ? 'text-teal' : 'text-[#B91C1C]')}>{msg.ok ? <Check size={14} /> : <AlertCircle size={14} />}{msg.text}</p>}
                    </SettingsCard>
                    <CompanyDetailsCard />
                    <BrandPreferencesCard role="supplier" />
                    <DefaultCurrencyCard />
                </div>
                <div className="space-y-5 min-w-0">
                    <VerificationCard />
                    <ListingStatusCard />
                    <ReputationCard />
                    <ChangeEmailCard currentEmail={user?.email || ''} pendingEmail={user?.pendingEmail} onChanged={() => refreshUser()} />
                    <SettingsCard icon={<KeyRound size={17} />} title={tr('setSecurityTitle')}>
                        <p className="text-[13.5px] text-ink-2">{tr('setSecurityBody')}</p>
                        <Link href="/dashboard/security" className="mt-2 inline-block text-[13.5px] font-semibold text-teal hover:underline">{tr('setSecurityLink')}</Link>
                    </SettingsCard>
                    <TwoStepCard />
                    <SessionsCard />
                    <SettingsCard icon={<Bell size={17} />} title={tr('setNotifTitle')} desc={tr('setNotifDesc')}>
                        {prefs === null ? <p className="text-[13px] text-ink-3">{tr('setPrefsLoadError')}</p> : (
                            <ul className="space-y-3">
                                {PREF_ROWS.map((r) => (
                                    <li key={r.key} className="flex items-center gap-3">
                                        <div className="flex-1 min-w-0"><p className="text-[13.5px] font-medium text-ink">{tr(r.label)}</p><p className="text-[12px] text-ink-3">{tr(r.desc)}</p></div>
                                        <Toggle on={!!prefs[r.key]} onChange={() => togglePref(r.key)} label={tr(r.label)} />
                                    </li>
                                ))}
                            </ul>
                        )}
                        {prefMsg && <p role="alert" className="mt-3 text-[13px] text-[#B91C1C]">{prefMsg.text}</p>}
                    </SettingsCard>
                </div>
            </div>
        </div>
    );
}
