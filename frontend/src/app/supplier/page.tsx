'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Package, ShoppingCart, Eye, TrendingUp, ArrowUpRight, Plus, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import { useAuth } from '@/lib/auth';
import { formatPrice } from '@/lib/currency';

const REVENUE_SPARKLINE = [
    { month: 'Feb', value: 3100 },
    { month: 'Mar', value: 4900 },
    { month: 'Apr', value: 4200 },
    { month: 'May', value: 6100 },
    { month: 'Jun', value: 5400 },
    { month: 'Jul', value: 8420 },
];

const ORDERS_SPARKLINE = [
    { month: 'Feb', value: 28 },
    { month: 'Mar', value: 44 },
    { month: 'Apr', value: 38 },
    { month: 'May', value: 55 },
    { month: 'Jun', value: 48 },
    { month: 'Jul', value: 78 },
];

export default function SupplierOverviewPage() {
    const { user } = useAuth();
    const [dashboardStats, setDashboardStats] = React.useState<any>(null);

    React.useEffect(() => {
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('bev-token') || '';
                const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                const res = await fetch(`${API_URL}/dashboard/supplier`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setDashboardStats(data);
                }
            } catch (err) {
                console.error('Failed to fetch dashboard stats:', err);
            }
        };
        fetchStats();
    }, []);

    const STATS = [
        { label: 'Revenue (MTD)', value: '$8,420.00', trend: '+18.4%', up: true, icon: BarChart3, color: 'text-emerald-500' },
        { label: 'Active Products', value: '24', trend: 'Stable', up: true, icon: Package, color: 'text-primary' },
        { label: 'Total Orders', value: '156', trend: '+22%', up: true, icon: ShoppingCart, color: 'text-blue-500' },
        { label: 'Digital Impressions', value: '4.2k', trend: '+12%', up: true, icon: Eye, color: 'text-purple-500' },
    ];

    return (
        <div className="space-y-10 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Business Hub</h1>
                    <p className="text-muted-foreground font-medium">Performance metrics for your wholesale catalog.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="px-6 py-2.5 bg-primary text-primary-foreground font-black text-sm rounded-xl hover:scale-105 transition-transform shadow-lg shadow-primary/20 flex items-center gap-2">
                        <Plus size={18} strokeWidth={3} /> Add New Product
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {STATS.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-card p-6 rounded-2xl border border-border/50 shadow-sm"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className={`w-12 h-12 rounded-xl bg-muted flex items-center justify-center ${stat.color}`}>
                                    <Icon size={24} />
                                </div>
                                <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-tighter ${stat.up ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {stat.trend} <ArrowUpRight size={14} />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
                                <p className="text-2xl font-black text-foreground tracking-tight">{stat.value}</p>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-card p-6 rounded-2xl border border-border/50 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Monthly Revenue</p>
                            <p className="text-2xl font-black text-foreground">$8,420</p>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase">
                            +18.4% <ArrowUpRight size={12} />
                        </span>
                    </div>
                    <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={REVENUE_SPARKLINE} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FF9900" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#FF9900" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                            <Tooltip
                                formatter={(v) => [formatPrice(v as number), 'Revenue']}
                                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 11 }}
                            />
                            <Area type="monotone" dataKey="value" stroke="#FF9900" strokeWidth={2.5} fill="url(#grad1)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </motion.div>

                {/* Orders Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card p-6 rounded-2xl border border-border/50 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Monthly Orders</p>
                            <p className="text-2xl font-black text-foreground">78</p>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase">
                            +22% <ArrowUpRight size={12} />
                        </span>
                    </div>
                    <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={ORDERS_SPARKLINE} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                            <Tooltip
                                formatter={(v) => [v, 'Orders']}
                                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 11 }}
                            />
                            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </motion.div>
            </div>

            {/* Main Content Grid: Top 5 Best-Selling Products */}
            <div className="bg-card rounded-3xl border border-border/50 p-8 space-y-8 shadow-sm">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-foreground tracking-tight flex items-center gap-3">
                        <TrendingUp className="text-primary" /> Top 5 Best-Selling Products
                    </h3>
                    <button className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">View Sales Report</button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-start">
                        <thead>
                            <tr className="bg-muted/30">
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Product</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Sold</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Revenue generated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {!dashboardStats?.topProducts && (
                                <tr>
                                    <td colSpan={3} className="px-8 py-10 text-center">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                    </td>
                                </tr>
                            )}
                            {dashboardStats?.topProducts?.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-8 py-10 text-center text-muted-foreground text-sm font-bold">
                                        No sales data available yet.
                                    </td>
                                </tr>
                            )}
                            {dashboardStats?.topProducts?.map((product: any) => (
                                <tr key={product.productId} className="hover:bg-muted/20 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            {product.image ? (
                                                <img src={product.image} alt="" className="w-10 h-10 rounded-xl object-cover border border-border/50 shadow-sm" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shadow-sm">
                                                    <Package size={16} />
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-bold text-sm text-foreground">{product.name}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <p className="font-black text-foreground">{product.totalQuantitySold} <span className="text-[10px] text-muted-foreground uppercase">Units</span></p>
                                    </td>
                                    <td className="px-8 py-6">
                                        <p className="font-black text-emerald-500">{formatPrice(product.totalRevenue)}</p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
