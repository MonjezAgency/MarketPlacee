'use client';

import React, { useEffect, useState } from 'react';
import {
    Crown, Users, ShieldCheck, ShieldX, AlertTriangle,
    Package, ShoppingCart, DollarSign, Activity,
    Edit2, Lock, Unlock, CheckCircle, XCircle,
    Eye, ChevronDown, ChevronUp, Search, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ── Permission groups for the UI ──────────────────────────────────────────────
const PERMISSION_GROUPS = [
    {
        label: 'المستخدمون', color: 'blue',
        perms: ['users.view', 'users.approve', 'users.block', 'users.delete'],
    },
    {
        label: 'التحقق KYC', color: 'purple',
        perms: ['kyc.view', 'kyc.approve', 'kyc.reject'],
    },
    {
        label: 'المنتجات', color: 'green',
        perms: ['products.view', 'products.approve', 'products.reject', 'products.delete'],
    },
    {
        label: 'الطلبات', color: 'orange',
        perms: ['orders.view', 'orders.manage', 'orders.refund'],
    },
    {
        label: 'المالية', color: 'yellow',
        perms: ['finance.view', 'finance.audit', 'finance.escrow', 'finance.payouts'],
    },
    {
        label: 'الدعم والنزاعات', color: 'red',
        perms: ['disputes.view', 'disputes.resolve', 'support.view', 'support.reply'],
    },
    {
        label: 'الإعلانات', color: 'pink',
        perms: ['placements.view', 'placements.approve', 'placements.reject'],
    },
    {
        label: 'الأمان', color: 'gray',
        perms: ['security.view', 'security.manage'],
    },
    {
        label: 'الشحن', color: 'teal',
        perms: ['logistics.view', 'logistics.manage'],
    },
    {
        label: 'الإعدادات', color: 'indigo',
        perms: ['settings.view', 'settings.manage'],
    },
];

const PERM_LABELS: Record<string, string> = {
    'users.view': 'عرض', 'users.approve': 'موافقة', 'users.block': 'حجب', 'users.delete': 'حذف',
    'kyc.view': 'عرض', 'kyc.approve': 'موافقة', 'kyc.reject': 'رفض',
    'products.view': 'عرض', 'products.approve': 'موافقة', 'products.reject': 'رفض', 'products.delete': 'حذف',
    'orders.view': 'عرض', 'orders.manage': 'إدارة', 'orders.refund': 'استرداد',
    'finance.view': 'عرض', 'finance.audit': 'السجل', 'finance.escrow': 'Escrow', 'finance.payouts': 'Payouts',
    'disputes.view': 'عرض', 'disputes.resolve': 'حل', 'support.view': 'عرض', 'support.reply': 'رد',
    'placements.view': 'عرض', 'placements.approve': 'موافقة', 'placements.reject': 'رفض',
    'security.view': 'عرض', 'security.manage': 'إدارة',
    'logistics.view': 'عرض', 'logistics.manage': 'إدارة',
    'settings.view': 'عرض', 'settings.manage': 'تعديل',
};

const ROLE_COLORS: Record<string, string> = {
    ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    MODERATOR: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    SUPPORT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    EDITOR: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    DEVELOPER: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    LOGISTICS: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

function KycBadge({ status }: { status: string }) {
    if (status === 'VERIFIED')
        return <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle size={12} /> Verified</span>;
    if (status === 'PENDING')
        return <span className="flex items-center gap-1 text-xs font-bold text-yellow-600"><AlertTriangle size={12} /> Pending</span>;
    return <span className="flex items-center gap-1 text-xs font-bold text-red-500"><XCircle size={12} /> {status}</span>;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: any) {
    return (
        <div className="bg-white dark:bg-white/5 rounded-2xl p-5 border border-gray-100 dark:border-white/10 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={22} className="text-white" />
            </div>
            <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{value}</p>
                {sub && <p className="text-xs text-gray-400">{sub}</p>}
            </div>
        </div>
    );
}

// ── Member Permission Editor ───────────────────────────────────────────────────
function MemberCard({ member, onSave, onSuspend, onActivate, onKycApprove, onKycReject }: any) {
    const [expanded, setExpanded] = useState(false);
    const [perms, setPerms] = useState<string[]>(Array.isArray(member.permissions) ? member.permissions : []);
    const [saving, setSaving] = useState(false);
    const [roleEdit, setRoleEdit] = useState(false);
    const [newRole, setNewRole] = useState(member.role);

    const toggle = (perm: string) => {
        setPerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
    };

    const selectAll = (group: string[]) => {
        setPerms(prev => {
            const all = new Set(prev);
            group.forEach(p => all.add(p));
            return Array.from(all);
        });
    };

    const clearAll = (group: string[]) => {
        setPerms(prev => prev.filter(p => !group.includes(p)));
    };

    const handleSave = async () => {
        setSaving(true);
        await onSave(member.id, perms, newRole !== member.role ? newRole : null);
        setSaving(false);
    };

    return (
        <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-black text-sm">
                        {member.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                        <p className="font-bold text-gray-900 dark:text-white text-sm">{member.name}</p>
                        <p className="text-xs text-gray-400">{member.email}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-xs font-black px-3 py-1 rounded-full ${ROLE_COLORS[member.role] || 'bg-gray-100 text-gray-600'}`}>
                        {member.role}
                    </span>
                    <KycBadge status={member.kycStatus} />
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${member.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {member.status}
                    </span>
                    {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-gray-100 dark:border-white/10 px-5 py-5 space-y-5">

                    {/* KYC Alert */}
                    {member.kycStatus !== 'VERIFIED' && (
                        <div className="flex items-center justify-between bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/30 rounded-xl p-4">
                            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                                <AlertTriangle size={16} />
                                <span className="text-sm font-bold">
                                    هذا العضو لم يكمل التحقق من الهوية — لن يتمكن من الوصول للوحة التحكم
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => onKycApprove(member.id)}
                                    className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-700">
                                    موافقة KYC
                                </button>
                                <button onClick={() => onKycReject(member.id)}
                                    className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700">
                                    رفض
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Role changer */}
                    <div className="flex items-center gap-3">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-wider">الدور:</label>
                        <select
                            value={newRole}
                            onChange={e => setNewRole(e.target.value)}
                            className="text-xs font-bold border border-gray-200 dark:border-white/20 rounded-lg px-3 py-1.5 bg-white dark:bg-white/5"
                        >
                            {['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    {/* Permissions Grid */}
                    <div>
                        <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">الصلاحيات:</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {PERMISSION_GROUPS.map(group => (
                                <div key={group.label} className="border border-gray-100 dark:border-white/10 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-black text-gray-700 dark:text-white">{group.label}</span>
                                        <div className="flex gap-2">
                                            <button onClick={() => selectAll(group.perms)} className="text-[10px] text-blue-500 hover:underline font-bold">الكل</button>
                                            <button onClick={() => clearAll(group.perms)} className="text-[10px] text-red-500 hover:underline font-bold">مسح</button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {group.perms.map(perm => (
                                            <button
                                                key={perm}
                                                onClick={() => toggle(perm)}
                                                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                                                    perms.includes(perm)
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-200'
                                                }`}
                                            >
                                                {PERM_LABELS[perm] || perm}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-white/10">
                        <div className="flex gap-2">
                            {member.status === 'ACTIVE' ? (
                                <button onClick={() => onSuspend(member.id)}
                                    className="flex items-center gap-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-700/30 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100">
                                    <Lock size={12} /> تعليق الحساب
                                </button>
                            ) : (
                                <button onClick={() => onActivate(member.id)}
                                    className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border border-emerald-200 dark:border-emerald-700/30 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100">
                                    <Unlock size={12} /> إعادة تفعيل
                                </button>
                            )}
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-5 py-2 rounded-xl transition-all disabled:opacity-60"
                        >
                            {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                            حفظ التغييرات
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OwnerDashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [team, setTeam] = useState<any[]>([]);
    const [auditLog, setAuditLog] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'audit'>('overview');
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const token = typeof window !== 'undefined' ? localStorage.getItem('bev-token') : null;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    useEffect(() => {
        if (user && user.role !== 'OWNER') router.replace('/admin');
    }, [user]);

    const load = async () => {
        setLoading(true);
        try {
            const [s, t, a] = await Promise.all([
                fetch(`${API}/owner/dashboard`, { headers }).then(r => r.json()),
                fetch(`${API}/owner/team`, { headers }).then(r => r.json()),
                fetch(`${API}/owner/audit-log?limit=30`, { headers }).then(r => r.json()),
            ]);
            setStats(s);
            setTeam(Array.isArray(t) ? t : []);
            setAuditLog(Array.isArray(a) ? a : []);
        } catch { }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleSave = async (userId: string, perms: string[], newRole: string | null) => {
        try {
            await fetch(`${API}/owner/team/${userId}/permissions`, {
                method: 'PATCH', headers,
                body: JSON.stringify({ permissions: perms }),
            });
            if (newRole) {
                await fetch(`${API}/owner/team/${userId}/role`, {
                    method: 'PATCH', headers,
                    body: JSON.stringify({ role: newRole }),
                });
            }
            showToast('تم حفظ التغييرات بنجاح ✅');
            load();
        } catch { showToast('حدث خطأ أثناء الحفظ', 'error'); }
    };

    const handleSuspend = async (userId: string) => {
        await fetch(`${API}/owner/team/${userId}/suspend`, { method: 'PATCH', headers });
        showToast('تم تعليق الحساب'); load();
    };

    const handleActivate = async (userId: string) => {
        await fetch(`${API}/owner/team/${userId}/activate`, { method: 'PATCH', headers });
        showToast('تم تفعيل الحساب'); load();
    };

    const handleKycApprove = async (userId: string) => {
        await fetch(`${API}/owner/team/${userId}/kyc/approve`, { method: 'PATCH', headers });
        showToast('تم التحقق من الهوية ✅'); load();
    };

    const handleKycReject = async (userId: string) => {
        const reason = prompt('سبب الرفض:');
        if (!reason) return;
        await fetch(`${API}/owner/team/${userId}/kyc/reject`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ reason }),
        });
        showToast('تم رفض KYC'); load();
    };

    const filteredTeam = team.filter(m =>
        m.name?.toLowerCase().includes(search.toLowerCase()) ||
        m.email?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <RefreshCw size={28} className="animate-spin text-blue-500" />
        </div>
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl font-bold text-sm shadow-xl transition-all ${
                    toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {toast.msg}
                </div>
            )}

            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <Crown size={28} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white">لوحة تحكم المالك</h1>
                        <p className="text-sm text-gray-400">تحكم كامل في المنصة والفريق والصلاحيات</p>
                    </div>
                </div>
                <button onClick={load} className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-700 border border-gray-200 dark:border-white/20 px-4 py-2 rounded-xl">
                    <RefreshCw size={14} /> تحديث
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-2xl w-fit">
                {[
                    { id: 'overview', label: 'نظرة عامة', icon: Activity },
                    { id: 'team', label: 'الفريق والصلاحيات', icon: Users },
                    { id: 'audit', label: 'سجل العمليات', icon: Eye },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            activeTab === tab.id
                                ? 'bg-white dark:bg-white/10 text-blue-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <tab.icon size={15} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── TAB: OVERVIEW ── */}
            {activeTab === 'overview' && stats && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard icon={Users} label="إجمالي المستخدمين" value={stats.users.total}
                            sub={`${stats.users.suppliers} مورد · ${stats.users.customers} مشتري`} color="bg-blue-500" />
                        <StatCard icon={DollarSign} label="الإيرادات الكلية" value={`$${stats.orders.revenue?.toLocaleString() ?? 0}`}
                            sub={`${stats.orders.total} طلب`} color="bg-emerald-500" />
                        <StatCard icon={Package} label="المنتجات" value={stats.products.total}
                            sub={`${stats.products.pending} في الانتظار`} color="bg-purple-500" />
                        <StatCard icon={AlertTriangle} label="نزاعات مفتوحة" value={stats.disputes.open}
                            sub="تحتاج مراجعة" color="bg-red-500" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Team Status */}
                        <div className="bg-white dark:bg-white/5 rounded-2xl p-5 border border-gray-100 dark:border-white/10">
                            <h3 className="font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <Users size={16} /> حالة الفريق
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500">إجمالي الفريق</span>
                                    <span className="font-black text-gray-900 dark:text-white">{stats.users.team}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500 flex items-center gap-1"><ShieldX size={14} className="text-red-500" /> بدون KYC</span>
                                    <span className={`font-black ${stats.kyc.teamUnverified > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {stats.kyc.teamUnverified}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500">KYC عملاء في الانتظار</span>
                                    <span className="font-black text-yellow-500">{stats.kyc.pending}</span>
                                </div>
                            </div>
                            {stats.kyc.teamUnverified > 0 && (
                                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-xs text-red-600 font-bold flex items-center gap-2">
                                    <AlertTriangle size={14} />
                                    {stats.kyc.teamUnverified} عضو في الفريق لم يكمل KYC ولا يستطيع الوصول
                                </div>
                            )}
                        </div>

                        {/* Quick access */}
                        <div className="bg-white dark:bg-white/5 rounded-2xl p-5 border border-gray-100 dark:border-white/10">
                            <h3 className="font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <ShieldCheck size={16} /> وصول سريع
                            </h3>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'موافقة KYC', href: '/admin/kyc', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700' },
                                    { label: 'الطلبات', href: '/admin/orders', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700' },
                                    { label: 'النزاعات', href: '/admin/disputes', color: 'bg-red-50 dark:bg-red-900/20 text-red-700' },
                                    { label: 'الأمان', href: '/admin/security', color: 'bg-gray-50 dark:bg-gray-900/20 text-gray-700' },
                                    { label: 'المالية', href: '/admin/finance', color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700' },
                                    { label: 'الإعدادات', href: '/admin/settings', color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700' },
                                ].map(item => (
                                    <a key={item.href} href={item.href}
                                        className={`${item.color} text-xs font-black px-3 py-2.5 rounded-xl text-center hover:opacity-80 transition-opacity`}>
                                        {item.label}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: TEAM ── */}
            {activeTab === 'team' && (
                <div className="space-y-4">
                    <div className="relative">
                        <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="ابحث عن عضو..."
                            className="w-full pr-10 pl-4 py-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/20 rounded-xl text-sm font-medium outline-none"
                        />
                    </div>
                    <p className="text-xs text-gray-400 font-bold">
                        {filteredTeam.length} عضو · أعضاء بدون KYC لن يتمكنوا من الوصول للوحة التحكم
                    </p>
                    <div className="space-y-3">
                        {filteredTeam.map(member => (
                            <MemberCard
                                key={member.id}
                                member={member}
                                onSave={handleSave}
                                onSuspend={handleSuspend}
                                onActivate={handleActivate}
                                onKycApprove={handleKycApprove}
                                onKycReject={handleKycReject}
                            />
                        ))}
                        {filteredTeam.length === 0 && (
                            <div className="text-center py-12 text-gray-400 text-sm">لا يوجد أعضاء</div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB: AUDIT LOG ── */}
            {activeTab === 'audit' && (
                <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
                        <h3 className="font-black text-gray-900 dark:text-white">سجل عمليات الفريق</h3>
                        <p className="text-xs text-gray-400 mt-0.5">كل إجراء يقوم به أي عضو في الفريق</p>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-white/5">
                        {auditLog.map((log: any) => (
                            <div key={log.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs font-black text-gray-600 dark:text-gray-300">
                                        {log.admin?.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-800 dark:text-white">
                                            {log.admin?.name}
                                            <span className="text-gray-400 font-normal mx-1">قام بـ</span>
                                            <span className="text-blue-600">{log.action}</span>
                                        </p>
                                        <p className="text-xs text-gray-400">{log.entityType} · {log.entityId?.slice(-8)}</p>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {new Date(log.createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                        {auditLog.length === 0 && (
                            <div className="text-center py-12 text-gray-400 text-sm">لا يوجد سجلات بعد</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
