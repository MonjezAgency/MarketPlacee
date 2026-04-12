'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
    TrendingUp, DollarSign, ShoppingCart, Package,
    ArrowUpRight, Loader2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/currency';
import { apiFetch } from '@/lib/api';

const PIE_COLORS = ['#FF9900', '#1BC7C9', '#10b981', '#3b82f6', '#8b5cf6', '#f43f5e'];

const PERIODS: { label: string; days: number }[] = [
    { label: '7d',   days: 7   },
    { label: '30d',  days: 30  },
    { label: '90d',  days: 90  },
    { label: 'Year', days: 365 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl text-sm">
            <p className="font-black text-foreground mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ color: p.color }} className="font-bold">
                    {p.name === 'revenue' ? formatPrice(p.value) : `${p.value} orders`}
                </p>
            ))}
        </div>
    );
};

export default function SupplierAnalyticsPage() {
    const [periodDays, setPeriodDays] = React.useState(30);
    const [data, setData]             = React.useState<any>(null);
    const [isLoading, setIsLoading]   = React.useState(true);

    const fetchAnalytics = React.useCallback(async (days: number) => {
        setIsLoading(true);
        try {
            const res = await apiFetch(`/orders/supplier/analytics?days=${days}`);
            if (res.ok) setData(await res.json());
        } catch { /* offline */ }
        finally { setIsLoading(false); }
    }, []);

    React.useEffect(() => { fetchAnalytics(periodDays); }, [fetchAnalytics, periodDays]);

    const kpis = data ? [
        {
            label: 'Total Revenue',
            value: formatPrice(data.totalRevenue),
            icon: DollarSign,
            color: 'emerald',
            sub: `${data.totalOrders} orders in period`,
        },
        {
            label: 'Orders Placed',
            value: String(data.totalOrders),
            icon: ShoppingCart,
            color: 'blue',
            sub: `${data.deliveredOrders} delivered`,
        },
        {
            label: 'Conversion Rate',
            value: `${data.conversionRate}%`,
            icon: CheckCircle2,
            color: 'purple',
            sub: 'placed → delivered',
        },
        {
            label: 'Active Products',
            value: String(data.activeProducts),
            icon: Package,
            color: 'orange',
            sub: 'approved in marketplace',
        },
    ] : [];

    const COLOR_MAP: Record<string, string> = {
        emerald: 'text-emerald-500 bg-emerald-500/10',
        blue:    'text-blue-500 bg-blue-500/10',
        purple:  'text-purple-500 bg-purple-500/10',
        orange:  'text-[#FF9900] bg-[#FF9900]/10',
    };

    return (
        <div className="space-y-10 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Analytics</h1>
                    <p className="text-muted-foreground font-medium">Real-time view of your sales performance and product trends.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/50">
                        {PERIODS.map((p) => (
                            <button
                                key={p.label}
                                onClick={() => setPeriodDays(p.days)}
                                className={cn(
                                    'px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all',
                                    periodDays === p.days
                                        ? 'bg-card text-foreground shadow-sm border border-border/50'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => fetchAnalytics(periodDays)}
                        className="w-9 h-9 rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin text-primary' : ''} />
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : !data ? (
                <div className="flex flex-col items-center gap-3 py-32 text-muted-foreground">
                    <TrendingUp className="w-12 h-12 opacity-20" />
                    <p className="font-bold">No analytics data yet. Start getting orders to see your stats.</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {kpis.map((kpi, i) => {
                            const Icon = kpi.icon;
                            return (
                                <motion.div
                                    key={kpi.label}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.08 }}
                                    className="bg-card p-6 rounded-2xl border border-border/50 shadow-sm"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', COLOR_MAP[kpi.color])}>
                                            <Icon size={20} />
                                        </div>
                                        <ArrowUpRight size={14} className="text-emerald-500" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{kpi.label}</p>
                                    <p className="text-2xl font-black text-foreground tracking-tight mt-1">{kpi.value}</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">{kpi.sub}</p>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Revenue Chart */}
                    {data.monthlyData && data.monthlyData.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-card rounded-3xl border border-border/50 p-8 shadow-sm"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                                        <TrendingUp size={20} className="text-[#FF9900]" /> Revenue & Orders Over Time
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">Breakdown of your revenue and order volume</p>
                                </div>
                            </div>
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={data.monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#FF9900" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#FF9900" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradOrd" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                                    <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="revenue" stroke="#FF9900" strokeWidth={2.5} fill="url(#gradRev)" name="revenue" />
                                    <Area type="monotone" dataKey="orders"  stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradOrd)" name="orders" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </motion.div>
                    )}

                    {/* Bottom Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Category Pie */}
                        {data.categoryBreakdown && data.categoryBreakdown.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="bg-card rounded-3xl border border-border/50 p-8 shadow-sm"
                            >
                                <h3 className="text-lg font-black text-foreground mb-1">Revenue by Category</h3>
                                <p className="text-xs text-muted-foreground mb-6">Distribution of revenue across your product categories</p>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={data.categoryBreakdown}
                                            cx="50%" cy="50%"
                                            innerRadius={55} outerRadius={90}
                                            paddingAngle={3} dataKey="value"
                                        >
                                            {data.categoryBreakdown.map((_: any, i: number) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(v: any) => [formatPrice(v), 'Revenue']}
                                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }}
                                        />
                                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, fontWeight: 700 }}>{v}</span>} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </motion.div>
                        )}

                        {/* Top Products Bar */}
                        {data.topProducts && data.topProducts.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.35 }}
                                className="bg-card rounded-3xl border border-border/50 p-8 shadow-sm"
                            >
                                <h3 className="text-lg font-black text-foreground mb-1">Top Products by Revenue</h3>
                                <p className="text-xs text-muted-foreground mb-6">Your best-selling products in this period</p>
                                <div className="space-y-4">
                                    {data.topProducts.map((p: any, i: number) => (
                                        <div key={p.id} className="flex items-center gap-3">
                                            <span className="w-5 text-[10px] font-black text-muted-foreground text-center shrink-0">#{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold truncate">{p.name}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div
                                                        className="h-1.5 rounded-full bg-[#FF9900]/80"
                                                        style={{ width: `${Math.min(100, (p.revenue / data.topProducts[0].revenue) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-end shrink-0">
                                                <p className="text-sm font-black text-primary">{formatPrice(p.revenue)}</p>
                                                <p className="text-[10px] text-muted-foreground">{p.orders} units</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
