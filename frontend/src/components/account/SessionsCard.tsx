'use client';

import * as React from 'react';
import { MonitorSmartphone, Shield, Loader2, LogOut, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SettingsCard } from '@/components/account/AccountCards';
import { cn } from '@/lib/utils';

type Session = { id: string; device: string | null; ip: string | null; createdAt: string; lastSeenAt: string; current: boolean };

const ago = (iso: string) => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 2) return 'Active now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Every active sign-in on this account (from the server), with sign-out per device. */
export function SessionsCard() {
    const { logout } = useAuth();
    const [rows, setRows] = React.useState<Session[] | null>(null);
    const [err, setErr] = React.useState('');
    const [busy, setBusy] = React.useState<string | null>(null);

    const load = React.useCallback(() => apiFetch('/auth/sessions')
        .then(async (r) => { if (!r.ok) throw new Error(); setRows(await r.json()); })
        .catch(() => { setRows([]); setErr('Couldn’t load your sessions.'); }), []);
    React.useEffect(() => { load(); }, [load]);

    const act = async (key: string, path: string, method: string) => {
        setBusy(key); setErr('');
        try { const r = await apiFetch(path, { method }); if (!r.ok) throw new Error(); await load(); }
        catch { setErr('That didn’t work. Try again.'); }
        finally { setBusy(null); }
    };
    const others = (rows ?? []).filter((r) => !r.current);

    return (
        <SettingsCard icon={<MonitorSmartphone size={17} />} title="Devices & sessions" desc="Every active sign-in on your account. Sign out any you don’t recognise.">
            {rows === null ? <div className="h-20 rounded-xl bg-surface-2 animate-pulse" aria-busy="true" /> : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] text-ink-3 inline-flex items-center gap-1.5"><Shield size={14} /> {rows.length} active {rows.length === 1 ? 'session' : 'sessions'}</p>
                        {rows.length > 0 && (
                            <button type="button" disabled={!!busy} onClick={() => { if (confirm('Sign out of every other device?')) act('all', '/auth/sessions/revoke-others', 'POST'); }}
                                className="text-[13px] font-semibold text-ink-2 hover:text-ink disabled:opacity-50">
                                {busy === 'all' ? <Loader2 size={13} className="inline animate-spin" /> : null} Sign out all other devices
                            </button>
                        )}
                    </div>
                    <ul className="rounded-xl ring-1 ring-line divide-y divide-line">
                        {rows.map((s) => (
                            <li key={s.id} className="flex items-center gap-3 px-3.5 py-3">
                                <span className="w-9 h-9 shrink-0 rounded-lg bg-surface-2 flex items-center justify-center text-ink-3"><Shield size={16} /></span>
                                <span className="flex-1 min-w-0">
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="text-[14px] font-medium text-ink">{s.device || 'Unknown device'}</span>
                                        {s.current && <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-md bg-teal-soft text-teal">This device</span>}
                                    </span>
                                    <span className="block text-[12.5px] text-ink-3">{ago(s.lastSeenAt)}{s.ip ? ` · ${s.ip}` : ''}</span>
                                </span>
                                {s.current ? (
                                    <button type="button" onClick={() => logout()} className="text-[13px] font-medium text-ink-3 hover:text-ink inline-flex items-center gap-1"><LogOut size={13} /> Sign out</button>
                                ) : (
                                    <button type="button" disabled={!!busy} onClick={() => act(s.id, `/auth/sessions/${s.id}`, 'DELETE')} className={cn('text-[13px] font-semibold text-ink-2 hover:text-[#B91C1C] disabled:opacity-50')}>
                                        {busy === s.id ? <Loader2 size={13} className="inline animate-spin" /> : 'Sign out'}
                                    </button>
                                )}
                            </li>
                        ))}
                        {rows.length === 0 && <li className="px-3.5 py-3 text-[13px] text-ink-3">No sessions recorded yet — sign in again to start tracking this device.</li>}
                    </ul>
                    <p className="text-[12px] text-ink-4">Sign-ins from before device tracking started aren’t listed; “Sign out all other devices” ends those too.</p>
                    {err && <p role="alert" className="text-[13px] text-[#B91C1C] inline-flex items-center gap-1.5"><AlertCircle size={14} />{err}</p>}
                </div>
            )}
        </SettingsCard>
    );
}
