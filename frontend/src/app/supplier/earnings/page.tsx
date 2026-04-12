'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
    DollarSign,
    Clock,
    ShieldCheck,
    ArrowUpRight,
    Loader2,
    RefreshCw,
    Download,
    Filter,
    ArrowDownToLine,
    Wallet,
    Info,
    History
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

export default function SupplierEarningsPage() {
    const [data, setData] = React.useState<any>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    const fetchEarnings = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/payments/my-earnings');
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (err) {
            console.error('Failed to fetch earnings:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchEarnings();
    }, [fetchEarnings]);

    const stats = data ? [
        {
            label: 'Total Earned',
            value: formatPrice(data.totalEarned),
            icon: DollarSign,
            color: 'emerald',
            sub: 'Payouts sent to your account'
        },
        {
            label: 'Pending Escrow',
            value: formatPrice(data.pendingEscrow),
            icon: Clock,
            color: 'amber',
            sub: 'Funds held in secure escrow'
        },
        {
            label: 'Marketplace Fees',
            value: formatPrice(data.totalPlatformFees),
            icon: ShieldCheck,
            color: 'blue',
            sub: 'Total platform deductions'
        }
    ] : [];

    return (
        <div className="space-y-10 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Earnings & Settlements</h1>
                    <p className="text-muted-foreground font-medium">Track your marketplace revenue, pending funds, and financial history.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={fetchEarnings}
                        className="p-2.5 rounded-xl bg-card border border-border hover:bg-muted transition-colors text-muted-foreground"
                    >
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                    <button className="px-6 py-2.5 bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-lg shadow-primary/20 flex items-center gap-2">
                        <Download size={14} /> Export CSV
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Hydrating Financial Data...</p>
                </div>
            ) : !data ? (
                <div className="bg-card rounded-[32px] border border-border p-20 flex flex-col items-center text-center space-y-4">
                    <Wallet size={48} className="text-muted-foreground opacity-20" />
                    <h3 className="text-xl font-black text-foreground">No Financial History</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto text-sm font-medium">Start selling to see your earnings and escrow balance here.</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {stats.map((stat, i) => {
                            const Icon = stat.icon;
                            return (
                                <motion.div
                                    key={stat.label}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="bg-card p-8 rounded-[32px] border border-border/60 shadow-sm relative overflow-hidden group"
                                >
                                    <div className={cn(
                                        "absolute top-0 end-0 w-32 h-32 blur-[60px] -me-16 -mt-16 pointer-events-none transition-opacity opacity-20 group-hover:opacity-40",
                                        stat.color === 'emerald' ? 'bg-emerald-500' : 
                                        stat.color === 'amber' ? 'bg-amber-500' : 'bg-blue-500'
                                    )} />
                                    
                                    <div className="flex items-center justify-between mb-6">
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center",
                                            stat.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500' : 
                                            stat.color === 'amber' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
                                        )}>
                                            <Icon size={24} />
                                        </div>
                                        <ArrowUpRight size={16} className="text-muted-foreground opacity-50" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</p>
                                    <p className="text-3xl font-black text-foreground tracking-tight mt-1">{stat.value}</p>
                                    <p className="text-xs text-muted-foreground mt-2 font-medium">{stat.sub}</p>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Escrow Explained Alert */}
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
                        <Info size={18} className="text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-xs font-black text-primary uppercase tracking-widest">How Payouts Work</p>
                            <p className="text-[11px] text-primary/80 font-medium leading-relaxed">
                                Our platform uses a secure escrow system. When a buyer pays, funds are held by Stripe (Pending Escrow). 
                                Once the order is marked as <span className="font-black underline px-1">DELIVERED</span>, 
                                funds are automatically released to your connected Stripe account minus the platform fee.
                            </p>
                        </div>
                    </div>

                    {/* Transaction History */}
                    <div className="bg-card rounded-[32px] border border-border overflow-hidden shadow-sm">
                        <div className="px-8 py-6 border-b border-border flex items-center justify-between">
                            <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                                <History size={20} className="text-primary" /> Recent Settlements
                            </h3>
                            <button className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                                <Filter size={14} /> Filter
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-start">
                                <thead>
                                    <tr className="bg-muted/30">
                                        <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order ID</th>
                                        <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date</th>
                                        <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Status</th>
                                        <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-end">Gross Amount</th>
                                        <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-end">Platform Fee</th>
                                        <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-end">Your Payout</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {data.transactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-8 py-12 text-center text-muted-foreground text-sm font-medium">
                                                No transactions found for this period.
                                            </td>
                                        </tr>
                                    ) : (
                                        data.transactions.map((tx: any) => (
                                            <tr key={tx.id} className="hover:bg-muted/20 transition-colors group">
                                                <td className="px-8 py-6">
                                                    <p className="font-black text-foreground text-xs uppercase tracking-tighter">#{tx.orderId.slice(-8)}</p>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <p className="text-xs font-bold text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex justify-center">
                                                        <span className={cn(
                                                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                                            tx.status === 'RELEASED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                                            tx.status === 'CAPTURED' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                                            "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                        )}>
                                                            {tx.status}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-end">
                                                    <p className="text-xs font-bold text-muted-foreground">{formatPrice(tx.amount)}</p>
                                                </td>
                                                <td className="px-8 py-6 text-end">
                                                    <p className="text-xs font-bold text-red-500 opacity-60">-{formatPrice(tx.platformFee)}</p>
                                                </td>
                                                <td className="px-8 py-6 text-end">
                                                    <div className="flex flex-col items-end">
                                                        <p className="text-sm font-black text-emerald-500">{formatPrice(tx.supplierAmount)}</p>
                                                        {tx.status === 'RELEASED' && (
                                                            <p className="text-[9px] font-black text-emerald-500/50 uppercase flex items-center gap-1 mt-0.5">
                                                                <ArrowDownToLine size={8} /> Settled
                                                            </p>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
