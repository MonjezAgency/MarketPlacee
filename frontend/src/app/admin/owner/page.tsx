'use client';

/**
 * Owner control panel (/admin/owner, OWNER only — backend OwnerGuard).
 * Dictionary section `adminOwnerPanel`.
 *
 * Honesty notes:
 *  - "Paid orders" is the sum of Order.totalAmount (goods at buyer prices, EUR)
 *    on orders with paymentStatus PAID (owner.service getDashboardStats). It is
 *    NOT Atlantis revenue; the Founder Overview (/admin) defines that.
 *  - The per-member permission ticks are stored (User.permissions) but no
 *    controller uses PermissionsGuard yet, so they grant nothing. The page says so.
 *  - Team KYC is recorded but TeamKycGuard is not applied anywhere, so KYC does
 *    not block admin access. The page no longer claims it does.
 *  - Every success message waits for the server's OK.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Crown, Users, ShieldCheck, ShieldX, AlertTriangle,
    Package, ShoppingCart, Activity,
    Lock, Unlock, CheckCircle, XCircle,
    Eye, ChevronDown, ChevronUp, Search, RefreshCw, Info,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';

type Tk = (k: string, v?: Record<string, string | number>) => string;

// Permission keys accepted by PATCH /owner/team/:id/permissions (stored only).
const PERMISSION_GROUPS: { key: string; perms: string[] }[] = [
    { key: 'users', perms: ['users.view', 'users.approve', 'users.block', 'users.delete'] },
    { key: 'kyc', perms: ['kyc.view', 'kyc.approve', 'kyc.reject'] },
    { key: 'products', perms: ['products.view', 'products.approve', 'products.reject', 'products.delete'] },
    { key: 'orders', perms: ['orders.view', 'orders.manage', 'orders.refund'] },
    { key: 'finance', perms: ['finance.view', 'finance.audit', 'finance.escrow', 'finance.payouts'] },
    { key: 'support', perms: ['disputes.view', 'disputes.resolve', 'support.view', 'support.reply'] },
    { key: 'placements', perms: ['placements.view', 'placements.approve', 'placements.reject'] },
    { key: 'security', perms: ['security.view', 'security.manage'] },
    { key: 'logistics', perms: ['logistics.view', 'logistics.manage'] },
    { key: 'settings', perms: ['settings.view', 'settings.manage'] },
];

/** perm key → dictionary key for its label. */
function permLabelKey(perm: string): string {
    if (perm === 'disputes.view') return 'perm_viewDisputes';
    if (perm === 'support.view') return 'perm_viewSupport';
    if (perm === 'settings.manage') return 'perm_edit';
    const action = perm.split('.')[1];
    return `perm_${action}`;
}

const TEAM_ROLES = ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];

const ROLE_COLORS: Record<string, string> = {
    ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    MODERATOR: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    SUPPORT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    EDITOR: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    DEVELOPER: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    LOGISTICS: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

const roleLabel = (tk: Tk, r: string) => (TEAM_ROLES.includes(r) ? tk(`role_${r}`) : r);
const statusLabel = (tk: Tk, s: string) => (s === 'ACTIVE' || s === 'BLOCKED' ? tk(`status_${s}`) : s);

function KycBadge({ status, tk }: { status: string; tk: Tk }) {
    if (status === 'VERIFIED')
        return <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle size={12} /> {tk('kyc_VERIFIED')}</span>;
    if (status === 'PENDING')
        return <span className="flex items-center gap-1 text-xs font-bold text-yellow-600"><AlertTriangle size={12} /> {tk('kyc_PENDING')}</span>;
    return <span className="flex items-center gap-1 text-xs font-bold text-red-500"><XCircle size={12} /> {tk('kycOther', { status: status || '—' })}</span>;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
    return (
        <div className="bg-white dark:bg-white/5 rounded-2xl p-5 border border-gray-100 dark:border-white/10 flex items-start gap-4">
            <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={22} className="text-white" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">{value}</p>
                {sub && <p className="text-xs text-gray-500">{sub}</p>}
            </div>
        </div>
    );
}

/** Result of one PATCH: ok, or the server's message. */
async function patch(path: string, body?: unknown): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
        const res = await apiFetch(path, { method: 'PATCH', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
        if (res.ok) return { ok: true };
        const d = await res.json().catch(() => ({}));
        const m = d?.message;
        return { ok: false, reason: typeof m === 'string' ? m : Array.isArray(m) ? m.join(', ') : '' };
    } catch {
        return { ok: false, reason: '' };
    }
}

function MemberCard({ member, tk, onSave, onSuspend, onActivate, onKycApprove, onKycReject }: {
    member: any; tk: Tk;
    onSave: (id: string, perms: string[], role: string | null) => unknown;
    onSuspend: (m: any) => void; onActivate: (id: string) => void;
    onKycApprove: (id: string) => void; onKycReject: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [perms, setPerms] = useState<string[]>(Array.isArray(member.permissions) ? member.permissions : []);
    const [saving, setSaving] = useState(false);
    const [newRole, setNewRole] = useState(member.role);
    const panelId = `owner-member-${member.id}`;

    const toggle = (perm: string) => setPerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
    const selectAll = (group: string[]) => setPerms(prev => Array.from(new Set([...prev, ...group])));
    const clearAll = (group: string[]) => setPerms(prev => prev.filter(p => !group.includes(p)));

    const handleSave = async () => {
        setSaving(true);
        await onSave(member.id, perms, newRole !== member.role ? newRole : null);
        setSaving(false);
    };

    return (
        <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={tk('detailsToggle', { name: member.name || member.email || '' })}
                className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-start"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-black text-sm" aria-hidden>
                        {member.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{member.name}</p>
                        <p className="text-xs text-gray-500 truncate"><bdi dir="ltr">{member.email}</bdi></p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className={`text-xs font-black px-3 py-1 rounded-full ${ROLE_COLORS[member.role] || 'bg-gray-100 text-gray-600'}`}>
                        {roleLabel(tk, member.role)}
                    </span>
                    <KycBadge status={member.kycStatus} tk={tk} />
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${member.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {statusLabel(tk, member.status)}
                    </span>
                    {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
            </button>

            {expanded && (
                <div id={panelId} className="border-t border-gray-100 dark:border-white/10 px-5 py-5 space-y-5">
                    {member.kycStatus !== 'VERIFIED' && (
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/30 rounded-xl p-4">
                            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-400">
                                <AlertTriangle size={16} />
                                <span className="text-sm font-bold">{tk('kycNotVerified')}</span>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => onKycApprove(member.id)} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-700">
                                    {tk('kycApprove')}
                                </button>
                                <button type="button" onClick={() => onKycReject(member.id)} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700">
                                    {tk('kycReject')}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <label htmlFor={`${panelId}-role`} className="text-xs font-black text-gray-500 uppercase tracking-wider">{tk('role')}</label>
                        <select
                            id={`${panelId}-role`}
                            value={newRole}
                            onChange={e => setNewRole(e.target.value)}
                            className="text-xs font-bold border border-gray-200 dark:border-white/20 rounded-lg px-3 py-1.5 bg-white dark:bg-white/5"
                        >
                            {TEAM_ROLES.map(r => <option key={r} value={r}>{roleLabel(tk, r)}</option>)}
                        </select>
                    </div>

                    <div>
                        <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">{tk('permsTitle')}</p>
                        <p className="mb-3 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10 p-3 text-xs text-slate-600 dark:text-slate-300">
                            <Info size={14} className="mt-0.5 shrink-0" /> {tk('permsNotice')}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {PERMISSION_GROUPS.map(group => (
                                <div key={group.key} className="border border-gray-100 dark:border-white/10 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-black text-gray-700 dark:text-white">{tk(`group_${group.key}`)}</span>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => selectAll(group.perms)} className="text-[11px] text-blue-600 hover:underline font-bold">{tk('selectAll')}</button>
                                            <button type="button" onClick={() => clearAll(group.perms)} className="text-[11px] text-red-600 hover:underline font-bold">{tk('clearAll')}</button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {group.perms.map(perm => (
                                            <button
                                                type="button"
                                                key={perm}
                                                aria-pressed={perms.includes(perm)}
                                                onClick={() => toggle(perm)}
                                                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                                                    perms.includes(perm)
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                                                }`}
                                            >
                                                {tk(permLabelKey(perm))}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-white/10">
                        <div className="flex gap-2">
                            {member.status === 'ACTIVE' ? (
                                <button type="button" onClick={() => onSuspend(member)}
                                    className="flex items-center gap-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-700/30 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100">
                                    <Lock size={12} /> {tk('suspend')}
                                </button>
                            ) : (
                                <button type="button" onClick={() => onActivate(member.id)}
                                    className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 border border-emerald-200 dark:border-emerald-700/30 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100">
                                    <Unlock size={12} /> {tk('activate')}
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-5 py-2 rounded-xl transition-colors disabled:opacity-60"
                        >
                            {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                            {tk('save')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function OwnerDashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const { t, fmt } = useLanguage();
    const tk: Tk = useCallback((k: string, v?: Record<string, string | number>) => t('adminOwnerPanel', k, v), [t]);
    const [stats, setStats] = useState<any>(null);
    const [team, setTeam] = useState<any[]>([]);
    const [auditLog, setAuditLog] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'audit'>('overview');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (user && user.role !== 'OWNER') router.replace('/admin');
    }, [user, router]);

    const load = useCallback(async () => {
        setLoading(true);
        const read = async (path: string) => {
            try { const r = await apiFetch(path); return r.ok ? await r.json() : null; } catch { return null; }
        };
        const [s, tm, a] = await Promise.all([read('/owner/dashboard'), read('/owner/team'), read('/owner/audit-log?limit=30')]);
        setStats(s && s.users ? s : null);
        setTeam(Array.isArray(tm) ? tm : []);
        setAuditLog(Array.isArray(a) ? a : []);
        setLoadError(!s || !Array.isArray(tm) || !Array.isArray(a));
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };
    const fail = (reason: string) => showToast(reason ? tk('actionFailed', { reason }) : tk('actionFailedUnknown'), 'error');

    const handleSave = async (userId: string, perms: string[], newRole: string | null) => {
        const p = await patch(`/owner/team/${userId}/permissions`, { permissions: perms });
        if (!p.ok) { showToast(p.reason ? tk('actionFailed', { reason: p.reason }) : tk('saveFailed'), 'error'); return; }
        if (newRole) {
            const r = await patch(`/owner/team/${userId}/role`, { role: newRole });
            if (!r.ok) { showToast(r.reason ? tk('actionFailed', { reason: r.reason }) : tk('saveFailed'), 'error'); load(); return; }
        }
        showToast(tk('saved'));
        load();
    };

    const handleSuspend = async (member: any) => {
        if (!window.confirm(tk('confirmSuspend', { name: member.name || member.email || '' }))) return;
        const r = await patch(`/owner/team/${member.id}/suspend`);
        if (r.ok) { showToast(tk('suspended')); load(); } else fail(r.reason);
    };

    const handleActivate = async (userId: string) => {
        const r = await patch(`/owner/team/${userId}/activate`);
        if (r.ok) { showToast(tk('activated')); load(); } else fail(r.reason);
    };

    const handleKycApprove = async (userId: string) => {
        const r = await patch(`/owner/team/${userId}/kyc/approve`);
        if (r.ok) { showToast(tk('kycApproved')); load(); } else fail(r.reason);
    };

    const handleKycReject = async (userId: string) => {
        const reason = window.prompt(tk('rejectReason'));
        if (!reason || !reason.trim()) return;
        const r = await patch(`/owner/team/${userId}/kyc/reject`, { reason: reason.trim() });
        if (r.ok) { showToast(tk('kycRejected')); load(); } else fail(r.reason);
    };

    const q = search.toLowerCase();
    const filteredTeam = team.filter(m => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q));
    const eur = (n: number) => fmt.number(n, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

    if (loading) return (
        <div className="flex items-center justify-center h-64" role="status">
            <RefreshCw size={28} className="animate-spin text-blue-500" />
        </div>
    );

    const tabs = [
        { id: 'overview' as const, label: tk('tabOverview'), icon: Activity },
        { id: 'team' as const, label: tk('tabTeam'), icon: Users },
        { id: 'audit' as const, label: tk('tabAudit'), icon: Eye },
    ];
    const quick = [
        { label: tk('qKyc'), href: '/admin/support?view=kyc', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700' },
        { label: tk('qOrders'), href: '/admin/orders', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700' },
        { label: tk('qDisputes'), href: '/admin/support?view=disputes', color: 'bg-red-50 dark:bg-red-900/20 text-red-700' },
        { label: tk('qSecurity'), href: '/admin/security', color: 'bg-gray-50 dark:bg-gray-900/20 text-gray-700' },
        { label: tk('qFinance'), href: '/admin/finance', color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700' },
        { label: tk('qSettings'), href: '/admin/settings', color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700' },
    ];

    return (
        <div className="space-y-6 max-w-7xl mx-auto text-start">
            {toast && (
                <div role="status" aria-live="polite" className={`fixed top-6 end-6 z-50 px-5 py-3 rounded-2xl font-bold text-sm shadow-xl ${
                    toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {toast.msg}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <Crown size={28} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white">{tk('title')}</h1>
                        <p className="text-sm text-gray-500">{tk('intro')}</p>
                    </div>
                </div>
                <button type="button" onClick={load} className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-gray-800 border border-gray-200 dark:border-white/20 px-4 py-2 rounded-xl">
                    <RefreshCw size={14} /> {tk('refresh')}
                </button>
            </div>

            {loadError && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-red-50 ring-1 ring-red-200 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span className="flex-1">{tk('loadFailed')}</span>
                </div>
            )}

            <div role="tablist" aria-label={tk('tabsAria')} className="flex flex-wrap gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-2xl w-fit max-w-full">
                {tabs.map(tab => (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                            activeTab === tab.id ? 'bg-white dark:bg-white/10 text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        <tab.icon size={15} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && stats && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <StatCard icon={Users} label={tk('statAccounts')} value={fmt.number(stats.users.total)}
                            sub={tk('statAccountsSub', { suppliers: fmt.number(stats.users.suppliers), buyers: fmt.number(stats.users.customers) })} color="bg-blue-500" />
                        <StatCard icon={ShoppingCart} label={tk('statPaid')} value={eur(Number(stats.orders.revenue) || 0)}
                            sub={tk('statPaidSub', { count: fmt.number(stats.orders.total) })} color="bg-emerald-500" />
                        <StatCard icon={Package} label={tk('statProducts')} value={fmt.number(stats.products.total)}
                            sub={tk('statProductsSub', { count: fmt.number(stats.products.pending) })} color="bg-purple-500" />
                        <StatCard icon={AlertTriangle} label={tk('statDisputes')} value={fmt.number(stats.disputes.open)}
                            sub={tk('statDisputesSub')} color="bg-red-500" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-white/5 rounded-2xl p-5 border border-gray-100 dark:border-white/10">
                            <h2 className="font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <Users size={16} /> {tk('teamStatus')}
                            </h2>
                            <dl className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-sm text-gray-600">{tk('teamTotal')}</dt>
                                    <dd className="font-black text-gray-900 dark:text-white tabular-nums">{fmt.number(stats.users.team)}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-sm text-gray-600 flex items-center gap-1"><ShieldX size={14} className="text-red-500" /> {tk('teamNoKyc')}</dt>
                                    <dd className={`font-black tabular-nums ${(stats.kyc?.teamUnverified ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {fmt.number(stats.kyc?.teamUnverified ?? 0)}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-sm text-gray-600">{tk('kycPending')}</dt>
                                    <dd className="font-black text-yellow-600 tabular-nums">{fmt.number(stats.kyc?.pending ?? 0)}</dd>
                                </div>
                            </dl>
                            <p className="mt-4 p-3 bg-slate-50 dark:bg-white/5 rounded-xl text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                                <Info size={14} className="mt-0.5 shrink-0" /> {tk('teamNoKycNote')}
                            </p>
                        </div>

                        <div className="bg-white dark:bg-white/5 rounded-2xl p-5 border border-gray-100 dark:border-white/10">
                            <h2 className="font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <ShieldCheck size={16} /> {tk('quick')}
                            </h2>
                            <div className="grid grid-cols-2 gap-2">
                                {quick.map(item => (
                                    <Link key={item.href} href={item.href}
                                        className={`${item.color} text-xs font-black px-3 py-2.5 rounded-xl text-center hover:opacity-80 transition-opacity`}>
                                        {item.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'team' && (
                <div className="space-y-4">
                    <div className="relative">
                        <Search size={16} className="absolute end-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
                        <input
                            type="search"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={tk('searchLabel')}
                            aria-label={tk('searchLabel')}
                            className="w-full pe-10 ps-4 py-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/20 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-200"
                        />
                    </div>
                    <p className="text-xs text-gray-500 font-bold">
                        {tk('teamCount', { count: filteredTeam.length })} · {tk('teamPageHint')}{' '}
                        <Link href="/admin/team" className="text-blue-600 hover:underline">{tk('teamPageLink')}</Link>
                    </p>
                    <div className="space-y-3">
                        {filteredTeam.map(member => (
                            <MemberCard
                                key={member.id}
                                member={member}
                                tk={tk}
                                onSave={handleSave}
                                onSuspend={handleSuspend}
                                onActivate={handleActivate}
                                onKycApprove={handleKycApprove}
                                onKycReject={handleKycReject}
                            />
                        ))}
                        {filteredTeam.length === 0 && (
                            <div className="text-center py-12 text-gray-500 text-sm">{tk('teamEmpty')}</div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'audit' && (
                <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
                        <h2 className="font-black text-gray-900 dark:text-white">{tk('auditTitle')}</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{tk('auditIntro')}</p>
                    </div>
                    <ul className="divide-y divide-gray-50 dark:divide-white/5">
                        {auditLog.map((log: any) => (
                            <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/5">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 shrink-0 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs font-black text-gray-600 dark:text-gray-300" aria-hidden>
                                        {log.admin?.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-800 dark:text-white">
                                            {log.admin?.name}
                                            <span className="text-gray-500 font-normal mx-1">{tk('auditDid')}</span>
                                            <bdi dir="ltr" className="text-blue-600">{log.action}</bdi>
                                        </p>
                                        <p className="text-xs text-gray-500"><bdi dir="ltr">{log.entityType} · {log.entityId?.slice(-8)}</bdi></p>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-500">
                                    {fmt.date(log.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </li>
                        ))}
                        {auditLog.length === 0 && (
                            <li className="text-center py-12 text-gray-500 text-sm">{tk('auditEmpty')}</li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
