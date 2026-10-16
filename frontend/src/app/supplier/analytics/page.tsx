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
import { useLanguage } from '@/contexts/LanguageContext';

const PIE_COLORS = ['#FF9900', '#1BC7C9', '#10b981', '#3b82f6', '#8b5cf6', '#f43f5e'];

/** Period labels are dictionary keys, translated at render time. */
const PERIODS: { key: string; days: number }[] = [
    { key: 'period7',    days: 7   },
    { key: 'period30',   days: 30  },
    { key: 'period90',   days: 90  },
    { key: 'periodYear', days: 365 },
];

/** English short month names, used only to read the server's "Oct 25" bucket keys. */
const EN_MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2000, i, 1)));

/** Server month buckets look like "Oct 25" (en-US); show them in the reader's language. */
function useMonthLabel() {
    const { fmt } = useLanguage();
    return React.useCallback((raw: string) => {
        const [mon, yy] = String(raw ?? '').split(' ');
        const idx = EN_MONTHS.indexOf(mon);
        const year = Number(yy);
        if (idx < 0 || !Number.isFinite(year)) return String(raw ?? '');
        return fmt.date(new Date(2000 + year, idx, 1), { month: 'short', year: '2-digit' });
    }, [fmt]);
}

const CustomTooltip = ({ active, payload, label }: any) => {
    const { t, meta } = useLanguage();
    const monthLabel = useMonthLabel();
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl text-sm text-start">
            <p className="font-black text-foreground mb-1">{monthLabel(label)}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ color: p.color }} className="font-bold">
                    {p.name === 'revenue' ? formatPrice(p.value, undefined, meta.intl) : t('supplierMoney', 'anOrdersCount', { count: p.value })}
                </p>
            ))}
        </div>
    );
};

export default function SupplierAnalyticsPage() {
    const [periodDays, setPeriodDays] = React.useState(30);
    const [data, setData]             = React.useState<any>(null);
    const [isLoading, setIsLoading]   = React.useState(true);
    const { t, fmt, meta, dir } = useLanguage();
    const tr = (key: string, vars?: Record<string, string | number>) => t('supplierMoney', key, vars);
    const price = (n: number) => formatPrice(n, undefined, meta.intl);
    const monthLabel = useMonthLabel();

    const fetchAnalytics = React.useCallback(async (days: number) => {
        setIsLoading(true);
        try {
            const res = await apiFetch(`/orders/supplier/analytics?days=${days}`);
            if (res.ok) setData(await res.json());
        } catch (_e) { /* offline */ }
        finally { setIsLoading(false); }
    }, []);

    React.useEffect(() => { fetchAnalytics(periodDays); }, [fetchAnalytics, periodDays]);

    const kpis = data ? [
        {
            label: tr('anRevenue'),
            value: price(data.totalRevenue),
            icon: DollarSign,
            color: 'emerald',
            sub: tr('anRevenueSub', { count: data.totalOrders }),
        },
        {
            label: tr('anOrders'),
            value: fmt.number(Number(data.totalOrders) || 0),
            icon: ShoppingCart,
            color: 'blue',
            sub: tr('anOrdersSub', { count: fmt.number(Number(data.deliveredOrders) || 0) }),
        },
        {
            label: tr('anConversion'),
            value: fmt.number((Number(data.conversionRate) || 0) / 100, { style: 'percent', maximumFractionDigits: 1 }),
            icon: CheckCircle2,
            color: 'purple',
            sub: tr('anConversionSub'),
        },
        {
            label: tr('anActive'),
            value: fmt.number(Number(data.activeProducts) || 0),
            icon: Package,
            color: 'orange',
            sub: tr('anActiveSub'),
        },
    ] : [];

    const COLOR_MAP: Record<string, string> = {
        emerald: 'text-emerald-500 bg-emerald-500/10',
        blue:    'text-blue-500 bg-blue-500/10',
        purple:  'text-purple-500 bg-purple-500/10',
        orange:  'text-[#FF9900] bg-[#FF9900]/10',
    };

    return (
        <div className="space-y-10 max-w-7xl mx-auto" data-no-translate>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">{tr('anTitle')}</h1>
                    <p className="text-muted-foreground font-medium">{tr('anSubtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div role="group" aria-label={tr('anPeriodGroup')} className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/50">
                        {PERIODS.map((p) => (
                            <button
                                key={p.key}
                                onClick={() => setPeriodDays(p.days)}
                                aria-pressed={periodDays === p.days}
                                className={cn(
                                    'px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap',
                                    periodDays === p.days
                                        ? 'bg-card text-foreground shadow-sm border border-border/50'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {tr(p.key)}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => fetchAnalytics(periodDays)}
                        aria-label={tr('refresh')}
                        title={tr('refresh')}
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
                    <p className="font-bold">{tr('anEmpty')}</p>
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
                                        <ArrowUpRight size={14} className="text-emerald-500 rtl:-scale-x-100" />
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
                                        <TrendingUp size={20} className="text-[#FF9900]" /> {tr('anChartTitle')}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">{tr('anChartSub')}</p>
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
                                    <XAxis dataKey="month" reversed={dir === 'rtl'} tickFormatter={(v) => monthLabel(v)} tick={{ fontSize: 11, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                    <YAxis orientation={dir === 'rtl' ? 'right' : 'left'} tickFormatter={(v) => fmt.number(Number(v) || 0, { notation: 'compact', maximumFractionDigits: 1 })} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
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
                                <h3 className="text-lg font-black text-foreground mb-1">{tr('anCategoryTitle')}</h3>
                                <p className="text-xs text-muted-foreground mb-6">{tr('anCategorySub')}</p>
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
                                            formatter={(v: any) => [price(Number(v) || 0), tr('anRevenueLabel')]}
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
                                <h3 className="text-lg font-black text-foreground mb-1">{tr('anTopTitle')}</h3>
                                <p className="text-xs text-muted-foreground mb-6">{tr('anTopSub')}</p>
                                <div className="space-y-4">
                                    {data.topProducts.map((p: any, i: number) => (
                                        <div key={p.id} className="flex items-center gap-3">
                                            <span className="w-5 text-[10px] font-black text-muted-foreground text-center shrink-0"><bdi>#{fmt.number(i + 1)}</bdi></span>
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
                                                <p className="text-sm font-black text-primary">{price(p.revenue)}</p>
                                                <p className="text-[10px] text-muted-foreground">{tr('anUnits', { count: p.orders })}</p>
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
