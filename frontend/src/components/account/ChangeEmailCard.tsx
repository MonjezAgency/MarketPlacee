'use client';

import * as React from 'react';
import { AtSign, Loader2, Check, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { withStepUp } from '@/components/security/StepUp';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trans } from '@/components/i18n/Trans';

const input = 'w-full h-11 px-3.5 rounded-xl ring-1 ring-line bg-surface text-[14px] text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6] placeholder:text-ink-4';
const label = 'block text-[13px] font-medium text-ink-2 mb-1.5';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `tr` supplies the translated fallbacks; a server message is shown as sent. */
async function post(tr: (key: string) => string, path: string, body?: unknown, method = 'POST') {
    const res = await withStepUp((h) => apiFetch(path, { method, headers: { 'Content-Type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 429 ? tr('ceTooMany') : typeof data?.message === 'string' ? data.message : tr('somethingWrongRetry'));
    return data;
}

/**
 * Change sign-in email. The new address only replaces the old one after the
 * server confirms the code sent to it (the displayed email comes from /auth/me).
 */
export function ChangeEmailCard({ currentEmail, pendingEmail, onChanged }: { currentEmail: string; pendingEmail?: string | null; onChanged: () => void }) {
    const { t } = useLanguage();
    const tr = (key: string, vars?: Record<string, string | number>) => t('supplierMoney', key, vars);
    const [mode, setMode] = React.useState<'idle' | 'request' | 'confirm'>(pendingEmail ? 'confirm' : 'idle');
    const [newEmail, setNewEmail] = React.useState(pendingEmail || '');
    const [pw, setPw] = React.useState('');
    const [code, setCode] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    const [cooldown, setCooldown] = React.useState(0);
    React.useEffect(() => { if (pendingEmail) { setMode('confirm'); setNewEmail(pendingEmail); } }, [pendingEmail]);
    React.useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

    const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setMsg(null); try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e?.message || tr('somethingWrong') }); } finally { setBusy(false); } }; // i18n-ignore (TypeScript generic, not text)

    const request = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
        if (!EMAIL_RE.test(newEmail.trim())) throw new Error(tr('ceInvalidEmail'));
        if (!pw) throw new Error(tr('ceEnterPassword'));
        const r = await post(tr, '/auth/change-email', { newEmail: newEmail.trim(), currentPassword: pw });
        setPw(''); setMode('confirm'); setCooldown(Number(r?.retryAfter) || 60);
        setMsg({ ok: true, text: tr('ceCodeSent', { email: `\u2066${r?.pendingEmail || newEmail.trim()}\u2069` }) });
    }); };
    const confirm = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
        if (!/^\d{6}$/.test(code.trim())) throw new Error(tr('ceEnterCode'));
        const r = await post(tr, '/auth/change-email/confirm', { code: code.trim() });
        setCode(''); setMode('idle'); setMsg({ ok: true, text: tr('ceNowEmail', { email: `\u2066${r?.email ?? ''}\u2069` }) });
        onChanged();
    }); };
    const cancel = () => run(async () => { await post(tr, '/auth/change-email', undefined, 'DELETE'); setMode('idle'); setCode(''); setNewEmail(''); onChanged(); });

    return (
        <section className="rounded-2xl ring-1 ring-line bg-surface">
            <header className="flex items-start gap-3 px-5 pt-5">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><AtSign size={17} /></span>
                <div>
                    <h2 className="text-[16px] font-semibold text-heading">{tr('ceTitle')}</h2>
                    <p className="text-[13px] text-ink-3"><Trans text={tr('ceCurrently', { email: currentEmail })} tags={{ b: (c) => <bdi dir="ltr" className="font-medium text-ink">{c}</bdi> }} /></p>
                </div>
            </header>
            <div className="p-5 space-y-3">
                {mode === 'idle' && <button type="button" onClick={() => { setMode('request'); setMsg(null); }} className="h-9 px-3 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface-2">{tr('ceChange')}</button>}
                {mode === 'request' && (
                    <form onSubmit={request} className="space-y-3" noValidate>
                        <div><label htmlFor="ce-new" className={label}>{tr('ceNewEmail')}</label><input id="ce-new" type="email" dir="ltr" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" className={input} /></div>
                        <div><label htmlFor="ce-pw" className={label}>{tr('ceCurrentPassword')}</label><input id="ce-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" className={input} /></div>
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => { setMode('idle'); setMsg(null); }} className="h-10 px-4 rounded-xl text-[13.5px] font-medium text-ink-2 hover:text-ink">{tr('cancel')}</button>
                            <button type="submit" disabled={busy} className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} {tr('ceSendCode')}</button>
                        </div>
                    </form>
                )}
                {mode === 'confirm' && (
                    <form onSubmit={confirm} className="space-y-3" noValidate>
                        <p className="text-[13.5px] text-ink-2"><Trans text={tr('ceCodeSentTo', { email: newEmail })} tags={{ b: (c) => <bdi dir="ltr" className="font-semibold text-ink">{c}</bdi> }} /></p>
                        <div><label htmlFor="ce-code" className={label}>{tr('ceCode')}</label><input id="ce-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={cn(input, 'tracking-[0.35em] font-semibold')} /></div>
                        <div className="flex flex-wrap gap-2 justify-end">
                            <button type="button" onClick={cancel} disabled={busy} className="h-10 px-4 rounded-xl text-[13.5px] font-medium text-ink-2 hover:text-[#B91C1C]">{tr('ceCancelChange')}</button>
                            <button type="button" onClick={() => { setMode('request'); setMsg(null); }} disabled={cooldown > 0} className="h-10 px-4 rounded-xl ring-1 ring-line-strong text-[13.5px] font-semibold text-ink disabled:text-ink-4">{cooldown > 0 ? tr('ceCooldown', { seconds: cooldown }) : tr('ceResend')}</button>
                            <button type="submit" disabled={busy} className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} {tr('confirm')}</button>
                        </div>
                    </form>
                )}
                {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('text-[13px] flex items-start gap-1.5', msg.ok ? 'text-ink-2' : 'text-[#B91C1C]')}>{msg.ok ? <Check size={14} className="text-teal mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}{msg.text}</p>}
            </div>
        </section>
    );
}
