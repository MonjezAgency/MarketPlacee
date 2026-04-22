'use client';
import * as React from 'react';
import { apiFetch } from '@/lib/api';
import {
    CreditCard,
    TrendingUp,
    ShieldCheck,
    Building2,
    DollarSign,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Download,
    Filter,
    MoreHorizontal
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

import { formatPrice } from '@/lib/currency';

export default function AdminBillingPage() {
    const [stats, setStats] = React.useState<any>(null);
    const [viesProfiles, setViesProfiles] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsRes, viesRes] = await Promise.all([
                    apiFetch('/finance/reports/revenue?period=month'),
                    apiFetch('/finance/tax-exemptions')
                ]);
                
                if (statsRes.ok) setStats(await statsRes.json());
                if (viesRes.ok) setViesProfiles(await viesRes.json());
            } catch (err) {
                console.error("Failed to fetch billing data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const STAT_CARDS = [
        { label: 'Total Volume', value: stats ? formatPrice(stats.totalRevenue) : '—', trend: stats?.conversionRate ? `${stats.conversionRate}% Conv.` : '0%', isUp: true, icon: DollarSign, color: 'emerald' },
        { label: 'Platform Profit', value: stats ? formatPrice(stats.platformRevenue) : '—', trend: '+5% Fee', isUp: true, icon: TrendingUp, color: 'blue' },
        { label: 'Active Requests', value: viesProfiles.filter(v => v.status === 'PENDING').length.toString(), trend: 'Tax Compliance', isUp: true, icon: ShieldCheck, color: 'amber' },
        { label: 'Settled Orders', value: stats?.paidOrders?.toString() || '0', trend: 'Completed', isUp: true, icon: Building2, color: 'rose' },
    return (
        <div className="max-w-[1200px] mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-[#0F1111] dark:text-white tracking-tight">Billing & Financials</h1>
                    <p className="text-[#555] dark:text-[#999] font-medium text-sm">Monitor platform revenue, VIES profiles, and transaction analytics.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={async () => {
                            const res = await apiFetch('/orders/export/excel');
                            if (res.ok) {
                                const blob = await res.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `financials-report-${new Date().toISOString().split('T')[0]}.xlsx`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                            }
                        }}
                        className="h-11 px-6 bg-[#0A1A2F] text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-[1.02] transition-all shadow-lg active:scale-[0.98]"
                    >
                        <Download size={14} /> Export Report
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {STAT_CARDS.map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[24px] p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
                    >
                        <div className="absolute -end-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <stat.icon size={120} className={cn(stat.isUp ? "text-emerald-500" : "text-rose-500")} />
                        </div>
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className={cn("p-3 rounded-xl",
                                    stat.color === 'emerald' && "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
                                    stat.color === 'blue' && "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
                                    stat.color === 'amber' && "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
                                    stat.color === 'rose' && "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
                                )}>
                                    <stat.icon size={18} />
                                </div>
                                <div className={cn("flex items-center gap-1 text-[10px] font-black uppercase tracking-tighter px-2 py-1 rounded-full",
                                    stat.isUp ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                                )}>
                                    {stat.isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                    {stat.trend}
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-[#888] uppercase tracking-[0.2em]">{stat.label}</p>
                                <p className="text-2xl font-black text-[#0F1111] dark:text-white mt-1">{stat.value}</p>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* VIES Validation Profiles */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 space-y-8 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck size={18} className="text-[#FF8A00]" />
                                Recent VIES Profiles
                            </h3>
                            <button className="text-[10px] font-black text-[#FF8A00] uppercase tracking-widest hover:underline">View All</button>
                        </div>

                        <div className="space-y-4">
                            {viesProfiles.length === 0 ? (
                                <div className="py-20 text-center opacity-30 font-black uppercase tracking-widest text-xs">No Recent VIES Activity</div>
                            ) : (
                                viesProfiles.slice(0, 5).map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 bg-[#F8FAFC] dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 group hover:border-[#FF8A00]/30 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#131921] border border-[#EAEDED] dark:border-white/10 flex items-center justify-center font-black text-xs text-[#0A1A2F] dark:text-white">
                                                ID
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-[#0A1A2F] dark:text-white truncate max-w-[150px]">{item.certificateType || 'Tax Certificate'}</p>
                                                <p className="text-[10px] font-bold text-[#888]">{item.userId.slice(-12)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="hidden md:block text-end">
                                                <p className="text-[10px] font-bold text-[#888] uppercase tracking-tighter">Status</p>
                                                <p className="text-[10px] font-black text-[#0A1A2F] dark:text-white tracking-widest">{item.status}</p>
                                            </div>
                                            <div className={cn("w-2 h-2 rounded-full", item.status === 'APPROVED' ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-amber-500")} />
                                            <button className="text-[#888] hover:text-[#0A1A2F] dark:hover:text-white transition-colors">
                                                <MoreHorizontal size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Performance Table (Static Preview) */}
                    <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <DollarSign size={18} className="text-[#1BC7C9]" />
                                Revenue Performance
                            </h3>
                            <div className="flex items-center gap-2 bg-[#F8FAFC] dark:bg-white/5 p-1 rounded-xl border border-[#EAEDED] dark:border-white/10">
                                <button className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white dark:bg-[#131921] shadow-sm text-[#0A1A2F] dark:text-white">Weekly</button>
                                <button className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#888]">Monthly</button>
                            </div>
                        </div>

                        <div className="flex items-end justify-between h-48 gap-4 pt-4">
                            {[40, 65, 35, 80, 55, 90, 70, 45, 85, 60, 75, 50].map((h, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    transition={{ delay: i * 0.05, duration: 1 }}
                                    className={cn("flex-1 rounded-t-lg relative group min-w-[12px]",
                                        i === 5 || i === 8 ? "bg-[#FF8A00] shadow-[0_-4px_12px_rgba(255,138,0,0.3)]" : "bg-[#EAEDED] dark:bg-white/10"
                                    )}
                                >
                                    <div className="absolute -top-8 start-1/2 -translate-x-1/2 bg-[#0A1A2F] text-white text-[8px] font-black px-1.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                        ${h * 2}k
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        <div className="flex justify-between mt-6 text-[9px] font-black text-[#888] uppercase tracking-widest border-t border-[#EAEDED] dark:border-white/10 pt-4">
                            <span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span>
                        </div>
                    </div>
                </div>

                {/* Profit & Fee Breakdown */}
                <div className="space-y-8">
                    <div className="bg-[#0A1A2F] rounded-[32px] p-8 text-white space-y-8 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 end-0 w-32 h-32 bg-[#FF8A00]/20 blur-[60px] rounded-full" />

                        <div className="space-y-2 relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B0B0C8]">Account Overview</p>
                            <h3 className="text-2xl font-black tracking-tight">Financial Health</h3>
                        </div>

                        <div className="space-y-6 relative z-10">
                            {[
                                { label: 'Platform Volume', val: stats ? formatPrice(stats.totalRevenue) : '$0.00', pct: 100, color: '#FFFFFF' },
                                { label: 'Supplier Share', val: stats ? formatPrice(stats.supplierRevenue) : '$0.00', pct: 95, color: '#1BC7C9' },
                                { label: 'Net Commission', val: stats ? formatPrice(stats.platformRevenue) : '$0.00', pct: 5, color: '#FF8A00' },
                            ].map((item, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                        <span className="text-[#B0B0C8]">{item.label}</span>
                                        <span style={{ color: item.color }}>{item.val}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${item.pct}%` }}
                                            transition={{ duration: 1, delay: 0.5 }}
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: item.color }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={async () => {
                                const res = await apiFetch('/orders/export/excel');
                                if (res.ok) {
                                    const blob = await res.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `bank-statement-${new Date().toISOString().split('T')[0]}.xlsx`;
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                }
                            }}
                            className="w-full h-14 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl flex items-center justify-center gap-3 transition-all relative z-10"
                        >
                            <Download size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Download Statement</span>
                        </button>
                    </div>

                    {/* Info Card */}
                    <div className="bg-[#FEF8E8] dark:bg-[#FF8A00]/5 border border-[#FF8A00]/10 rounded-[32px] p-8 space-y-6">
                        <div className="w-12 h-12 rounded-2xl bg-[#FF8A00]/20 flex items-center justify-center text-[#FF8A00]">
                            <Search size={24} />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-sm font-black text-[#0A1A2F] dark:text-white uppercase tracking-widest">Audit Protocol</h4>
                            <p className="text-[11px] text-[#555] dark:text-[#999] font-medium leading-relaxed">
                                All financial data is synchronized with your regional Atlantis Node. VAT profiles are verified against the EU VIES protocol every 24 hours.
                            </p>
                        </div>
                        <ul className="space-y-2">
                            {['Auto-Invoice Generation', 'KYB / KYC Verification'].map((l, i) => (
                                <li key={i} className="flex items-center gap-2 text-[10px] font-black text-[#0A1A2F] dark:text-white uppercase tracking-tighter">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#FF8A00]" />
                                    {l}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
