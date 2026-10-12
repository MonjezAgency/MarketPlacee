'use client';

import * as React from 'react';
import { AtSign, Loader2, Check, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const input = 'w-full h-11 px-3.5 rounded-xl ring-1 ring-line bg-surface text-[14px] text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6] placeholder:text-ink-4';
const label = 'block text-[13px] font-medium text-ink-2 mb-1.5';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function post(path: string, body?: unknown, method = 'POST') {
    const res = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 429 ? 'Too many attempts. Wait a minute and try again.' : typeof data?.message === 'string' ? data.message : 'Something went wrong. Try again.');
    return data;
}

/**
 * Change sign-in email. The new address only replaces the old one after the
 * server confirms the code sent to it (the displayed email comes from /auth/me).
 */
export function ChangeEmailCard({ currentEmail, pendingEmail, onChanged }: { currentEmail: string; pendingEmail?: string | null; onChanged: () => void }) {
    const [mode, setMode] = React.useState<'idle' | 'request' | 'confirm'>(pendingEmail ? 'confirm' : 'idle');
    const [newEmail, setNewEmail] = React.useState(pendingEmail || '');
    const [pw, setPw] = React.useState('');
    const [code, setCode] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    const [cooldown, setCooldown] = React.useState(0);
    React.useEffect(() => { if (pendingEmail) { setMode('confirm'); setNewEmail(pendingEmail); } }, [pendingEmail]);
    React.useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

    const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setMsg(null); try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Something went wrong.' }); } finally { setBusy(false); } };

    const request = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
        if (!EMAIL_RE.test(newEmail.trim())) throw new Error('Enter a valid email address.');
        if (!pw) throw new Error('Enter your current password.');
        const r = await post('/auth/change-email', { newEmail: newEmail.trim(), currentPassword: pw });
        setPw(''); setMode('confirm'); setCooldown(Number(r?.retryAfter) || 60);
        setMsg({ ok: true, text: `If ${r?.pendingEmail || newEmail.trim()} can be used, a 6-digit code is on its way to it. It expires in 15 minutes.` });
    }); };
    const confirm = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
        if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter the 6-digit code.');
        const r = await post('/auth/change-email/confirm', { code: code.trim() });
        setCode(''); setMode('idle'); setMsg({ ok: true, text: `Your sign-in email is now ${r?.email}.` });
        onChanged();
    }); };
    const cancel = () => run(async () => { await post('/auth/change-email', undefined, 'DELETE'); setMode('idle'); setCode(''); setNewEmail(''); onChanged(); });

    return (
        <section className="rounded-2xl ring-1 ring-line bg-surface">
            <header className="flex items-start gap-3 px-5 pt-5">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><AtSign size={17} /></span>
                <div>
                    <h2 className="text-[16px] font-semibold text-heading">Sign-in email</h2>
                    <p className="text-[13px] text-ink-3">Currently <span className="font-medium text-ink">{currentEmail}</span></p>
                </div>
            </header>
            <div className="p-5 space-y-3">
                {mode === 'idle' && <button type="button" onClick={() => { setMode('request'); setMsg(null); }} className="h-9 px-3 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface-2">Change email</button>}
                {mode === 'request' && (
                    <form onSubmit={request} className="space-y-3" noValidate>
                        <div><label htmlFor="ce-new" className={label}>New email</label><input id="ce-new" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" className={input} /></div>
                        <div><label htmlFor="ce-pw" className={label}>Current password</label><input id="ce-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" className={input} /></div>
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => { setMode('idle'); setMsg(null); }} className="h-10 px-4 rounded-xl text-[13.5px] font-medium text-ink-2 hover:text-ink">Cancel</button>
                            <button type="submit" disabled={busy} className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} Send code</button>
                        </div>
                    </form>
                )}
                {mode === 'confirm' && (
                    <form onSubmit={confirm} className="space-y-3" noValidate>
                        <p className="text-[13.5px] text-ink-2">Enter the code sent to <span className="font-semibold text-ink">{newEmail}</span>. Your email won’t change until you do.</p>
                        <div><label htmlFor="ce-code" className={label}>Code</label><input id="ce-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={cn(input, 'tracking-[0.35em] font-semibold')} /></div>
                        <div className="flex flex-wrap gap-2 justify-end">
                            <button type="button" onClick={cancel} disabled={busy} className="h-10 px-4 rounded-xl text-[13.5px] font-medium text-ink-2 hover:text-[#B91C1C]">Cancel change</button>
                            <button type="button" onClick={() => { setMode('request'); setMsg(null); }} disabled={cooldown > 0} className="h-10 px-4 rounded-xl ring-1 ring-line-strong text-[13.5px] font-semibold text-ink disabled:text-ink-4">{cooldown > 0 ? `New code in ${cooldown}s` : 'Send a new code'}</button>
                            <button type="submit" disabled={busy} className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} Confirm</button>
                        </div>
                    </form>
                )}
                {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('text-[13px] flex items-start gap-1.5', msg.ok ? 'text-ink-2' : 'text-[#B91C1C]')}>{msg.ok ? <Check size={14} className="text-teal mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}{msg.text}</p>}
            </div>
        </section>
    );
}
