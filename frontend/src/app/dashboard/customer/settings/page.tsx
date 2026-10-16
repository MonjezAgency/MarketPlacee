'use client';

import * as React from 'react';
import Link from 'next/link';
import { Camera, Loader2, Check, AlertCircle, ShieldCheck, KeyRound, MonitorSmartphone, Bell, MapPin, Building2, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import { apiFetch } from '@/lib/api';
import { withStepUp } from '@/components/security/StepUp';
import { resizeImage } from '@/lib/resize-image';
import { cn } from '@/lib/utils';
import { checkPassword } from '@/lib/password-policy';
import { ChangeEmailCard } from '@/components/account/ChangeEmailCard';
import { SessionsCard } from '@/components/account/SessionsCard';
import { TwoStepCard } from '@/components/account/TwoStepCard';
import { CompanyDetailsCard, BrandPreferencesCard, VerificationCard } from '@/components/account/AccountCards';
import { useLanguage } from '@/contexts/LanguageContext';

/** Maps lib/password-policy problems (English, shared with the server) to dictionary keys for display. */
const PW_PROBLEMS: [RegExp, string][] = [
    [/at least 12/i, 'pwTooShort'], [/at most 128/i, 'pwTooLong'], [/three of/i, 'pwClasses'],
    [/space/i, 'pwSpaces'], [/common|predictable/i, 'pwCommon'], [/email/i, 'pwEmail'], [/name/i, 'pwName'],
];
const NOTIF_PREFS = [
    ['orderUpdates', 'stPrefOrders', 'stPrefOrdersDesc'],
    ['onboardingReminders', 'stPrefReminders', 'stPrefRemindersDesc'],
    ['marketingEmails', 'stPrefMarketing', 'stPrefMarketingDesc'],
] as const;


const input = 'w-full h-11 px-3.5 rounded-xl ring-1 ring-line bg-surface text-[14px] text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6] placeholder:text-ink-4 disabled:bg-surface-2 disabled:text-ink-3';
const label = 'block text-[13px] font-medium text-ink-2 mb-1.5';

function Card({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl ring-1 ring-line bg-surface">
            <header className="flex items-start gap-3 px-5 pt-5">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-teal-soft text-teal flex items-center justify-center">{icon}</span>
                <div>
                    <h2 className="text-[16px] font-semibold text-heading">{title}</h2>
                    {desc && <p className="text-[13px] text-ink-3">{desc}</p>}
                </div>
            </header>
            <div className="p-5">{children}</div>
        </section>
    );
}

function Status({ s }: { s: { ok: boolean; text: string } | null }) {
    if (!s) return null;
    return <p role={s.ok ? 'status' : 'alert'} className={cn('text-[13px] flex items-center gap-1.5', s.ok ? 'text-teal' : 'text-[#B91C1C]')}>{s.ok ? <Check size={14} /> : <AlertCircle size={14} />}{s.text}</p>;
}

export default function SettingsPage() {
    const { user, refreshUser, logout } = useAuth() as any;
    const { currency, setCurrency } = useCurrency();
    const { t, meta } = useLanguage();
    const currencyName = (code: string, fallback: string) => {
        try { return new Intl.DisplayNames([meta.intl], { type: 'currency' }).of(code) || fallback; } catch { return fallback; }
    };

    // ── Profile ────────────────────────────────────────────────
    const [name, setName] = React.useState('');
    const [avatar, setAvatar] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [profileMsg, setProfileMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    const fileRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        setName(user?.name || ''); setAvatar(user?.avatar || null);
    }, [user]);

    const saveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setProfileMsg({ ok: false, text: t('buyerAccount', 'stNameRequired') }); return; }
        setSaving(true); setProfileMsg(null);
        try {
            const res = await apiFetch('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || t('buyerAccount', 'stProfileError'));
            setProfileMsg({ ok: true, text: t('buyerAccount', 'stProfileSaved') });
            refreshUser?.();
        } catch (err: any) { setProfileMsg({ ok: false, text: err?.message || t('buyerAccount', 'stProfileError') }); }
        finally { setSaving(false); }
    };

    const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (fileRef.current) fileRef.current.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { setProfileMsg({ ok: false, text: t('buyerAccount', 'stImageType') }); return; }
        if (file.size > 4 * 1024 * 1024) { setProfileMsg({ ok: false, text: t('buyerAccount', 'stImageSize') }); return; }
        setUploading(true); setProfileMsg(null);
        try {
            const fd = new FormData(); fd.append('file', await resizeImage(file));
            const res = await apiFetch('/users/me/avatar', { method: 'POST', body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || t('buyerAccount', 'stUploadFailed'));
            setAvatar(data.url); setProfileMsg({ ok: true, text: t('buyerAccount', 'stPhotoUpdated') }); refreshUser?.();
        } catch (err: any) { setProfileMsg({ ok: false, text: err?.message || t('buyerAccount', 'stUploadFailed') }); }
        finally { setUploading(false); }
    };

    // ── Password ───────────────────────────────────────────────
    const [cur, setCur] = React.useState('');
    const [next, setNext] = React.useState('');
    const [confirm, setConfirm] = React.useState('');
    const [pwBusy, setPwBusy] = React.useState(false);
    const [pwMsg, setPwMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    const changePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const pc = checkPassword(next, { email: user?.email, name: user?.name });
        if (!pc.ok) { setPwMsg({ ok: false, text: pc.problems.map((x) => { const k = PW_PROBLEMS.find(([re]) => re.test(x))?.[1]; return k ? t('buyerAccount', k) : x; }).join(' ') }); return; }
        if (next !== confirm) { setPwMsg({ ok: false, text: t('buyerAccount', 'stPwMismatch') }); return; }
        setPwBusy(true); setPwMsg(null);
        try {
            const res = await withStepUp((h) => apiFetch('/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) }));
            if (!res.ok) throw new Error(res.status === 400 ? t('buyerAccount', 'stPwIncorrect') : t('buyerAccount', 'stPwError'));
            setCur(''); setNext(''); setConfirm('');
            setPwMsg({ ok: true, text: t('buyerAccount', 'stPwChanged') });
        } catch (err: any) { setPwMsg({ ok: false, text: err?.message }); }
        finally { setPwBusy(false); }
    };

    // ── Notifications (real per-user preferences) ──────────────
    const [prefs, setPrefs] = React.useState<Record<string, boolean> | null>(null);
    const [prefMsg, setPrefMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    React.useEffect(() => {
        apiFetch('/users/me/notification-prefs').then((r) => (r.ok ? r.json() : null)).then((d) => setPrefs(d?.prefs ?? d ?? null)).catch(() => setPrefs(null));
    }, []);
    const togglePref = async (k: string) => {
        if (!prefs) return;
        const nextPrefs = { ...prefs, [k]: !prefs[k] };
        setPrefs(nextPrefs); setPrefMsg(null);
        const res = await apiFetch('/users/me/notification-prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: nextPrefs[k] }) }).catch(() => null);
        if (!res?.ok) { setPrefs(prefs); setPrefMsg({ ok: false, text: t('buyerAccount', 'stPrefError') }); } else setPrefMsg({ ok: true, text: t('buyerAccount', 'saved') });
    };

    return (
        <div className="grid gap-5 lg:grid-cols-2 items-start" data-no-translate>
          <div className="space-y-5 min-w-0">
            <Card icon={<Building2 size={17} />} title={t('buyerAccount', 'stProfile')} desc={t('buyerAccount', 'stProfileDesc')}>
                <form onSubmit={saveProfile} className="space-y-4">
                    <div className="flex items-center gap-4">
                        <span className="relative w-16 h-16 rounded-2xl bg-surface-2 ring-1 ring-line overflow-clip flex items-center justify-center text-[22px] font-semibold text-heading">
                            {avatar
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={avatar} alt="" className="w-full h-full object-cover" />
                                : (user?.name?.[0] || 'A')}
                        </span>
                        <div>
                            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">
                                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {t('buyerAccount', 'stChangePhoto')}
                            </button>
                            <p className="mt-1 text-[12px] text-ink-3">{t('buyerAccount', 'stPhotoHint')}</p>
                            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
                        </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div><label htmlFor="s-name" className={label}>{t('buyerAccount', 'stName')}</label><input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className={input} autoComplete="name" /></div>
                        <div><label htmlFor="s-email" className={label}>{t('buyerAccount', 'stEmail')}</label><input id="s-email" value={user?.email || ''} disabled className={input} title={t('buyerAccount', 'stEmailTitle')} dir="ltr" /></div>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1">
                        <Status s={profileMsg} />
                        <button type="submit" disabled={saving} className="ms-auto h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />} {t('buyerAccount', 'stSaveProfile')}</button>
                    </div>
                </form>
            </Card>
            <CompanyDetailsCard />
            <BrandPreferencesCard role="buyer" />
          </div>

            <div className="space-y-5 min-w-0">
                <VerificationCard />
                <ChangeEmailCard currentEmail={user?.email || ''} pendingEmail={user?.pendingEmail} onChanged={() => refreshUser?.()} />

                <Card icon={<KeyRound size={17} />} title={t('buyerAccount', 'stPassword')}>
                    <form onSubmit={changePassword} className="space-y-3">
                        <div><label htmlFor="pw-cur" className={label}>{t('buyerAccount', 'stCurrentPw')}</label><input id="pw-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} className={input} autoComplete="current-password" required /></div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div><label htmlFor="pw-new" className={label}>{t('buyerAccount', 'stNewPw')}</label><input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} className={input} autoComplete="new-password" required /></div>
                            <div><label htmlFor="pw-conf" className={label}>{t('buyerAccount', 'stConfirmPw')}</label><input id="pw-conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} autoComplete="new-password" required /></div>
                        </div>
                        <p className="text-[12px] text-ink-3">{t('buyerAccount', 'stPwHint')}</p>
                        <div className="flex items-center justify-between gap-3">
                            <Status s={pwMsg} />
                            <button type="submit" disabled={pwBusy} className="ms-auto h-10 px-5 inline-flex items-center gap-2 rounded-xl ring-1 ring-line-strong text-[13.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">{pwBusy && <Loader2 size={14} className="animate-spin" />} {t('buyerAccount', 'stChangePw')}</button>
                        </div>
                    </form>
                </Card>

                <TwoStepCard />

                <SessionsCard />

                <Card icon={<Bell size={17} />} title={t('buyerAccount', 'stEmailNotifs')}>
                    {prefs === null ? <p className="text-[13px] text-ink-3">{t('buyerAccount', 'stPrefsError')}</p> : (
                        <div className="space-y-2">
                            {NOTIF_PREFS.map(([k, titleKey, descKey]) => (
                                <label key={k} className="flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-line cursor-pointer hover:ring-line-strong">
                                    <input type="checkbox" checked={!!prefs[k]} onChange={() => togglePref(k)} className="mt-0.5 w-4 h-4 accent-[#0E7C74]" />
                                    <span><span className="block text-[14px] font-medium text-ink">{t('buyerAccount', titleKey)}</span><span className="block text-[12.5px] text-ink-3">{t('buyerAccount', descKey)}</span></span>
                                </label>
                            ))}
                            <Status s={prefMsg} />
                        </div>
                    )}
                </Card>

                <Card icon={<MapPin size={17} />} title={t('buyerAccount', 'stDelivery')}>
                    <div className="space-y-3">
                        <Link href="/account/address" className="text-[13.5px] font-semibold text-teal hover:underline">{t('buyerAccount', 'stDeliveryAddress')}</Link>
                        <p className="text-[12px] text-ink-3">{t('buyerAccount', 'stDeliveryNote')}</p>
                        <div>
                            <label htmlFor="s-cur" className={label}>{t('buyerAccount', 'stCurrency')}</label>
                            <select id="s-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={input}>
                                {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code} — {currencyName(c.code, c.name)}</option>)}
                            </select>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
