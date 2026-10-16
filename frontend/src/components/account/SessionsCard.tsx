'use client';

import * as React from 'react';
import { MonitorSmartphone, Shield, Loader2, LogOut, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SettingsCard } from '@/components/account/AccountCards';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

type Session = { id: string; device: string | null; ip: string | null; createdAt: string | null; lastSeenAt: string; current: boolean; legacy?: boolean };

/** "Active now" / "5 min ago" / "3 h ago" / a date, in the reader's language. */
function useAgo() {
    const { t, fmt, meta } = useLanguage();
    return React.useCallback((iso: string) => {
        const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
        if (m < 2) return t('supplierMoney', 'sessActiveNow');
        let rtf: Intl.RelativeTimeFormat | null = null;
        try { rtf = new Intl.RelativeTimeFormat(meta.intl, { numeric: 'always', style: 'short' }); } catch { /* fall through to a date */ }
        if (rtf && m < 60) return rtf.format(-m, 'minute');
        const h = Math.round(m / 60);
        if (rtf && h < 24) return rtf.format(-h, 'hour');
        return fmt.date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
    }, [t, fmt, meta.intl]);
}

/** Every active sign-in on this account (from the server), with sign-out per device. */
export function SessionsCard() {
    const { logout } = useAuth();
    const { t } = useLanguage();
    const tr = (key: string, vars?: Record<string, string | number>) => t('supplierMoney', key, vars);
    const ago = useAgo();
    const [rows, setRows] = React.useState<Session[] | null>(null);
    const [err, setErr] = React.useState('');
    const [busy, setBusy] = React.useState<string | null>(null);

    const load = React.useCallback(() => apiFetch('/auth/sessions')
        .then(async (r) => { if (!r.ok) throw new Error(); setRows(await r.json()); })
        .catch(() => { setRows([]); setErr(t('supplierMoney', 'sessLoadError')); }), [t]);
    React.useEffect(() => { load(); }, [load]);

    const act = async (key: string, path: string, method: string) => {
        setBusy(key); setErr('');
        try { const r = await apiFetch(path, { method }); if (!r.ok) throw new Error(); await load(); }
        catch { setErr(tr('sessActionError')); }
        finally { setBusy(null); }
    };
    const others = (rows ?? []).filter((r) => !r.current);

    return (
        <SettingsCard icon={<MonitorSmartphone size={17} />} title={tr('sessTitle')} desc={tr('sessDesc')}>
            {rows === null ? <div className="h-20 rounded-xl bg-surface-2 animate-pulse" aria-busy="true" /> : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] text-ink-3 inline-flex items-center gap-1.5"><Shield size={14} /> {tr('sessCount', { count: rows.length })}</p>
                        {rows.length > 0 && (
                            <button type="button" disabled={!!busy} onClick={() => { if (confirm(tr('sessConfirmAll'))) act('all', '/auth/sessions/revoke-others', 'POST'); }}
                                className="text-[13px] font-semibold text-ink-2 hover:text-ink disabled:opacity-50">
                                {busy === 'all' ? <Loader2 size={13} className="inline animate-spin" /> : null} {tr('sessSignOutAll')}
                            </button>
                        )}
                    </div>
                    <ul className="rounded-xl ring-1 ring-line divide-y divide-line">
                        {rows.map((s) => (
                            <li key={s.id} className="flex items-center gap-3 px-3.5 py-3">
                                <span className="w-9 h-9 shrink-0 rounded-lg bg-surface-2 flex items-center justify-center text-ink-3"><Shield size={16} /></span>
                                <span className="flex-1 min-w-0">
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="text-[14px] font-medium text-ink">{s.device ? <bdi>{s.device}</bdi> : tr('sessUnknownDevice')}</span>
                                        {s.current && <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-md bg-teal-soft text-teal">{tr('sessThisDevice')}</span>}
                                        {s.legacy && <span className="text-[11.5px] text-ink-4">{tr('sessLegacy')}</span>}
                                    </span>
                                    <span className="block text-[12.5px] text-ink-3">{ago(s.lastSeenAt)}{s.ip ? <> · <bdi dir="ltr">{s.ip}</bdi></> : null}</span>
                                </span>
                                {s.current ? (
                                    <button type="button" onClick={() => logout()} className="text-[13px] font-medium text-ink-3 hover:text-ink inline-flex items-center gap-1"><LogOut size={13} className="rtl:-scale-x-100" /> {tr('sessSignOut')}</button>
                                ) : (
                                    <button type="button" disabled={!!busy} onClick={() => act(s.id, `/auth/sessions/${s.id}`, 'DELETE')} className={cn('text-[13px] font-semibold text-ink-2 hover:text-[#B91C1C] disabled:opacity-50')}>
                                        {busy === s.id ? <Loader2 size={13} className="inline animate-spin" /> : tr('sessSignOut')}
                                    </button>
                                )}
                            </li>
                        ))}
                        {rows.length === 0 && <li className="px-3.5 py-3 text-[13px] text-ink-3">{tr('sessEmpty')}</li>}
                    </ul>
                    <p className="text-[12px] text-ink-4">{tr('sessNote', { action: tr('sessSignOutAll') })}</p>
                    {err && <p role="alert" className="text-[13px] text-[#B91C1C] inline-flex items-center gap-1.5"><AlertCircle size={14} />{err}</p>}
                </div>
            )}
        </SettingsCard>
    );
}
