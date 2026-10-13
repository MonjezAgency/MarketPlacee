'use client';

import * as React from 'react';
import Link from 'next/link';
import { Camera, Loader2, Check, AlertCircle, ShieldCheck, KeyRound, MonitorSmartphone, Bell, MapPin, Building2, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import { apiFetch } from '@/lib/api';
import { resizeImage } from '@/lib/resize-image';
import { cn } from '@/lib/utils';
import { checkPassword } from '@/lib/password-policy';
import { ChangeEmailCard } from '@/components/account/ChangeEmailCard';
import { CompanyDetailsCard, BrandPreferencesCard, VerificationCard } from '@/components/account/AccountCards';


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
        if (!name.trim()) { setProfileMsg({ ok: false, text: 'Name is required.' }); return; }
        setSaving(true); setProfileMsg(null);
        try {
            const res = await apiFetch('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Could not save your profile.');
            setProfileMsg({ ok: true, text: 'Profile saved.' });
            refreshUser?.();
        } catch (err: any) { setProfileMsg({ ok: false, text: err?.message || 'Could not save your profile.' }); }
        finally { setSaving(false); }
    };

    const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (fileRef.current) fileRef.current.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { setProfileMsg({ ok: false, text: 'Choose an image file (JPG, PNG or WebP).' }); return; }
        if (file.size > 4 * 1024 * 1024) { setProfileMsg({ ok: false, text: 'Image must be 4 MB or smaller.' }); return; }
        setUploading(true); setProfileMsg(null);
        try {
            const fd = new FormData(); fd.append('file', await resizeImage(file));
            const res = await apiFetch('/users/me/avatar', { method: 'POST', body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Upload failed.');
            setAvatar(data.url); setProfileMsg({ ok: true, text: 'Photo updated.' }); refreshUser?.();
        } catch (err: any) { setProfileMsg({ ok: false, text: err?.message || 'Upload failed.' }); }
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
        if (!pc.ok) { setPwMsg({ ok: false, text: pc.problems.join(' ') }); return; }
        if (next !== confirm) { setPwMsg({ ok: false, text: 'The new passwords don’t match.' }); return; }
        setPwBusy(true); setPwMsg(null);
        try {
            const res = await apiFetch('/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
            if (!res.ok) throw new Error(res.status === 400 ? 'Your current password is incorrect.' : 'Could not change the password. Try again.');
            setCur(''); setNext(''); setConfirm('');
            setPwMsg({ ok: true, text: 'Password changed.' });
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
        if (!res?.ok) { setPrefs(prefs); setPrefMsg({ ok: false, text: 'Could not save that preference.' }); } else setPrefMsg({ ok: true, text: 'Saved.' });
    };

    return (
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          <div className="space-y-5 min-w-0">
            <Card icon={<Building2 size={17} />} title="Profile" desc="Your name and photo.">
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
                                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Change photo
                            </button>
                            <p className="mt-1 text-[12px] text-ink-3">JPG, PNG or WebP, up to 4 MB.</p>
                            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
                        </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div><label htmlFor="s-name" className={label}>Name</label><input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className={input} autoComplete="name" /></div>
                        <div><label htmlFor="s-email" className={label}>Email</label><input id="s-email" value={user?.email || ''} disabled className={input} title="Change it in the Sign-in email section" /></div>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1">
                        <Status s={profileMsg} />
                        <button type="submit" disabled={saving} className="ms-auto h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />} Save profile</button>
                    </div>
                </form>
            </Card>
            <CompanyDetailsCard />
            <BrandPreferencesCard role="buyer" />
          </div>

            <div className="space-y-5 min-w-0">
                <VerificationCard />
                <ChangeEmailCard currentEmail={user?.email || ''} pendingEmail={user?.pendingEmail} onChanged={() => refreshUser?.()} />

                <Card icon={<KeyRound size={17} />} title="Password">
                    <form onSubmit={changePassword} className="space-y-3">
                        <div><label htmlFor="pw-cur" className={label}>Current password</label><input id="pw-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} className={input} autoComplete="current-password" required /></div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div><label htmlFor="pw-new" className={label}>New password</label><input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} className={input} autoComplete="new-password" required /></div>
                            <div><label htmlFor="pw-conf" className={label}>Confirm new password</label><input id="pw-conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} autoComplete="new-password" required /></div>
                        </div>
                        <p className="text-[12px] text-ink-3">12+ characters mixing at least three of: lower, upper, numbers, symbols. Avoid common passwords.</p>
                        <div className="flex items-center justify-between gap-3">
                            <Status s={pwMsg} />
                            <button type="submit" disabled={pwBusy} className="ms-auto h-10 px-5 inline-flex items-center gap-2 rounded-xl ring-1 ring-line-strong text-[13.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">{pwBusy && <Loader2 size={14} className="animate-spin" />} Change password</button>
                        </div>
                    </form>
                </Card>

                <Card icon={<ShieldCheck size={17} />} title="Two-step verification" desc="Add a code from an authenticator app or email when you sign in.">
                    <Link href="/dashboard/security" className="text-[13.5px] font-semibold text-teal hover:underline">Manage two-step verification</Link>
                </Card>

                <Card icon={<MonitorSmartphone size={17} />} title="Sessions">
                    <p className="text-[13.5px] text-ink-2">You’re signed in on this device.</p>
                    <p className="mt-1 text-[12.5px] text-ink-3">A list of your other signed-in devices isn’t available yet — Atlantis doesn’t record device details for sign-ins. If you think someone else has access, change your password and contact Atlantis.</p>
                    <button type="button" onClick={() => logout?.()} className="mt-3 h-9 px-3 inline-flex items-center gap-1.5 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface-2"><LogOut size={14} /> Sign out of this device</button>
                </Card>

                <Card icon={<Bell size={17} />} title="Email notifications">
                    {prefs === null ? <p className="text-[13px] text-ink-3">Preferences couldn’t be loaded.</p> : (
                        <div className="space-y-2">
                            {[['orderUpdates', 'Order updates', 'Confirmations, dispatch and delivery'], ['onboardingReminders', 'Profile reminders', 'Up to two reminders if your business profile is unfinished'], ['marketingEmails', 'News and offers', 'New products and promotions']].map(([k, t, d]) => (
                                <label key={k} className="flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-line cursor-pointer hover:ring-line-strong">
                                    <input type="checkbox" checked={!!prefs[k]} onChange={() => togglePref(k)} className="mt-0.5 w-4 h-4 accent-[#0E7C74]" />
                                    <span><span className="block text-[14px] font-medium text-ink">{t}</span><span className="block text-[12.5px] text-ink-3">{d}</span></span>
                                </label>
                            ))}
                            <Status s={prefMsg} />
                        </div>
                    )}
                </Card>

                <Card icon={<MapPin size={17} />} title="Delivery & currency">
                    <div className="space-y-3">
                        <Link href="/account/address" className="text-[13.5px] font-semibold text-teal hover:underline">Delivery address</Link>
                        <p className="text-[12px] text-ink-3">Saved in this browser only for now.</p>
                        <div>
                            <label htmlFor="s-cur" className={label}>Display currency</label>
                            <select id="s-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={input}>
                                {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>)}
                            </select>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
