'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { AuthShell, authInput, authLabel, authPrimary, FormAlert, PasswordChecklist, passwordOk } from '@/components/auth/AuthShell';
import { invitationApi, TeamApiError, type InviteInspect } from '@/lib/admin-team-api';
import { RoleCapabilities, roleLabel, useTt } from '@/components/admin/team/teamUi';
import { cn } from '@/lib/utils';

type View = 'checking' | 'form' | 'done' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED' | 'INVALID' | 'EXISTS' | 'OFFLINE';

/**
 * Accept an Atlantis team invitation. The secret is read from the URL fragment
 * (#token=…), removed from the address bar at once, and only ever sent in a POST body.
 * The server validates it, creates the account with the invited role and consumes
 * the invitation in one step; the invitee chooses their own password.
 */
export default function TeamInvitePage() {
    const tt = useTt();
    const { fmt } = useLanguage();
    const [token, setToken] = React.useState('');
    const [view, setView] = React.useState('checking' as View);
    const [info, setInfo] = React.useState(null as Extract<InviteInspect, { state: 'PENDING' }> | null);
    const [name, setName] = React.useState('');
    const [pw, setPw] = React.useState('');
    const [confirmPw, setConfirmPw] = React.useState('');
    const [show, setShow] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const t = hash.get('token') || '';
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
        if (!t) { setView('INVALID'); return; }
        setToken(t);
        invitationApi.inspect(t)
            .then((r) => {
                if (r.state !== 'PENDING') { setView(r.state); return; }
                setInfo(r); setName(r.name || '');
                setView(r.accountExists ? 'EXISTS' : 'form');
            })
            .catch((e) => setView(e instanceof TeamApiError && e.code === 'NETWORK' ? 'OFFLINE' : 'INVALID'));
    }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !info) return;
        if (!name.trim()) { setError(tt('vName')); return; }
        if (!passwordOk(pw, { email: info.email, name })) { setError(tt('acceptWeak')); return; }
        if (pw !== confirmPw) { setError(tt('acceptMismatch')); return; }
        setBusy(true); setError('');
        try {
            await invitationApi.accept({ token, name: name.trim(), password: pw });
            setView('done');
        } catch (err) {
            const code = err instanceof TeamApiError ? err.code : undefined;
            if (code === 'EXPIRED') setView('EXPIRED');
            else if (code === 'USED') setView('ACCEPTED');
            else if (code === 'REVOKED') setView('REVOKED');
            else if (code === 'ACCOUNT_EXISTS') setView('EXISTS');
            else if (code === 'INVALID') setView('INVALID');
            else if (code === 'WEAK_PASSWORD') setError(err instanceof TeamApiError && err.message ? err.message : tt('acceptWeak'));
            else setError(code === 'NETWORK' ? tt('errNetwork') : tt('errGeneric'));
        } finally { setBusy(false); }
    };

    const problem = (title: string, body: string, cta?: { href: string; label: string }) => (<>
        <span className="w-12 h-12 rounded-2xl bg-[#FFFBEB] dark:bg-amber-500/10 text-[#B45309] flex items-center justify-center"><AlertTriangle size={22} aria-hidden /></span>
        <h1 className="mt-4 font-sans text-[22px] leading-tight font-semibold text-heading">{title}</h1>
        <p className="mt-2 text-[14.5px] text-ink-2">{body}</p>
        {cta && <Link href={cta.href} className={cn(authPrimary, 'mt-6')}>{cta.label}</Link>}
    </>);

    return (
        <AuthShell>
            <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-6 sm:p-8 text-start" data-no-translate aria-live="polite">
                {view === 'checking' && <p className="flex items-center gap-2 text-[14px] text-ink-3"><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />{tt('acceptChecking')}</p>}
                {view === 'INVALID' && problem(tt('acceptInvalidTitle'), tt('acceptInvalidBody'))}
                {view === 'OFFLINE' && problem(tt('acceptOfflineTitle'), tt('errNetwork'))}
                {view === 'EXPIRED' && problem(tt('acceptExpiredTitle'), tt('acceptExpiredBody'))}
                {view === 'REVOKED' && problem(tt('acceptRevokedTitle'), tt('acceptRevokedBody'))}
                {view === 'ACCEPTED' && problem(tt('acceptUsedTitle'), tt('acceptUsedBody'), { href: '/auth/login', label: tt('signIn') })}
                {view === 'EXISTS' && problem(tt('acceptExistsTitle'), tt('acceptExistsBody'), { href: '/auth/login', label: tt('signIn') })}
                {view === 'done' && (<>
                    <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><CheckCircle2 size={24} aria-hidden /></span>
                    <h1 className="mt-4 font-sans text-[22px] leading-tight font-semibold text-heading">{tt('acceptDoneTitle')}</h1>
                    <p className="mt-2 text-[14.5px] text-ink-2">{tt('acceptDoneBody', { email: info?.email || '' })}</p>
                    <Link href="/auth/login" className={cn(authPrimary, 'mt-6')}>{tt('signIn')}</Link>
                </>)}
                {view === 'form' && info && (<>
                    <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><UserPlus size={22} aria-hidden /></span>
                    <h1 className="mt-4 font-sans text-[22px] leading-tight font-semibold text-heading">{tt('acceptTitle')}</h1>
                    <p className="mt-2 text-[14.5px] text-ink-2">{tt('acceptLead', { role: roleLabel(tt, info.role) })}</p>
                    <div className="mt-4 rounded-xl bg-surface-2 ring-1 ring-line p-3">
                        <RoleCapabilities role={info.role} compact />
                    </div>
                    <p className="mt-3 text-[12.5px] text-ink-3">{tt('acceptExpires', { date: fmt.date(info.expiresAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
                    <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
                        <div>
                            <label htmlFor="ti-email" className={authLabel}>{tt('fEmail')}</label>
                            <input id="ti-email" className={authInput} value={info.email} readOnly disabled dir="ltr" />
                        </div>
                        <div>
                            <label htmlFor="ti-name" className={authLabel}>{tt('fName')}</label>
                            <input id="ti-name" className={authInput} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
                        </div>
                        <div>
                            <label htmlFor="ti-pw" className={authLabel}>{tt('acceptPassword')}</label>
                            <div className="relative">
                                <input id="ti-pw" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className={cn(authInput, 'pe-11')} />
                                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? tt('hidePassword') : tt('showPassword')} className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-ink-3 hover:text-ink">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                            </div>
                            <PasswordChecklist value={pw} email={info.email} name={name} />
                        </div>
                        <div>
                            <label htmlFor="ti-confirm" className={authLabel}>{tt('acceptConfirm')}</label>
                            <input id="ti-confirm" type={show ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" className={authInput} />
                        </div>
                        {error && <FormAlert>{error}</FormAlert>}
                        <button type="submit" disabled={busy} className={authPrimary}>{busy ? <><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />{tt('acceptSaving')}</> : tt('acceptSubmit')}</button>
                    </form>
                </>)}
            </div>
        </AuthShell>
    );
}
