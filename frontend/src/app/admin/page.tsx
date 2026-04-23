'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    Users, Package, DollarSign, Clock, TrendingUp, TrendingDown,
    ArrowUpRight, ArrowDownRight, UserCheck, 
    ShoppingCart, BarChart3, Activity, 
    Wallet, Briefcase, Globe, Zap, AlertCircle,
    RotateCcw, MousePointer2, Plus, ArrowRight,
    Search, Filter, MoreHorizontal, ChevronRight,
    LayoutDashboard, UserCheck2, RefreshCcw, Star
} from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, 
    Tooltip, ResponsiveContainer, BarChart, Bar,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';

// ─── Constants for Fallback ────────────────────────────────────────────────
// These will only be used if the API returns absolutely nothing and we want to show empty states

const ACTIVITY_FEED: any[] = [];

const EMPTY_REVENUE_DATA = [
    { name: 'Mon', revenue: 0 },
    { name: 'Tue', revenue: 0 },
    { name: 'Wed', revenue: 0 },
    { name: 'Thu', revenue: 0 },
    { name: 'Fri', revenue: 0 },
    { name: 'Sat', revenue: 0 },
    { name: 'Sun', revenue: 0 },
];

const EMPTY_STATUS_DATA = [
    { name: 'Completed', value: 0, color: '#0D9488' },
    { name: 'Pending', value: 0, color: '#3B82F6' },
    { name: 'Cancelled', value: 0, color: '#F59E0B' },
    { name: 'Returned', value: 0, color: '#EF4444' },
];

// ─── Sub-Components ─────────────────────────────────────────────────────────

function DashboardKPICard({ icon: Icon, label, value, subtext, trend, trendValue, color, iconColor, sparklineColor }: any) {
    const isUp = trend === 'up';
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-default group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", color)}>
                    <Icon size={20} className={iconColor} />
                </div>
                {trend && (
                    <div className={cn(
                        "flex items-center gap-1 text-[11px] font-bold",
                        isUp ? "text-emerald-500" : "text-red-500"
                    )}>
                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {trendValue}%
                    </div>
                )}
            </div>
            <div>
                <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
                <p className="text-2xl font-semibold text-slate-900 tracking-tight leading-none mb-2">{value}</p>
                <p className="text-[11px] text-slate-400 font-medium">{subtext}</p>
            </div>
            <div className="mt-4 h-8 w-full opacity-60 group-hover:opacity-100 transition-opacity">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={EMPTY_REVENUE_DATA.map(d => ({ v: Math.random() * 100 }))}>
                        <Area type="monotone" dataKey="v" stroke={sparklineColor} fill={sparklineColor} fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminOverviewPage() {
    const { locale, t } = useLanguage();
    const isAr = locale === 'ar';
    const [stats, setStats] = React.useState({ 
        pendingUsers: 0, 
        pendingOrdersCount: 0,
        activeProducts: 0, 
        totalSales: 0,
        activeDisputes: 0,
        totalRefunds: 0,
        loading: true 
    });

    const [revenueData, setRevenueData] = React.useState<any[]>([]);
    const [topProducts, setTopProducts] = React.useState<any[]>([]);
    const [topSuppliers, setTopSuppliers] = React.useState<any[]>([]);

    const fetchStats = React.useCallback(async () => {
        try {
            setStats(prev => ({ ...prev, loading: true }));
            const [usersRes, productsRes, ordersStatsRes, disputesRes, analyticsRes] = await Promise.all([
                apiFetch('/users?status=PENDING_APPROVAL&limit=1'),
                apiFetch('/products?limit=1'),
                apiFetch('/orders/stats'),
                apiFetch('/disputes/stats').catch(() => null),
                apiFetch('/orders/admin-analytics').catch(() => null)
            ]);

            const usersData = usersRes.ok ? await usersRes.json() : { total: 0 };
            const productsData = productsRes.ok ? await productsRes.json() : { total: 0 };
            const ordersStats = ordersStatsRes.ok ? await ordersStatsRes.json() : null;
            const disputesData = disputesRes?.ok ? await disputesRes.json() : null;
            const analyticsData = analyticsRes?.ok ? await analyticsRes.json() : null;

            setStats({
                pendingUsers: usersData.total || 0,
                pendingOrdersCount: ordersStats?.pending || 0,
                activeProducts: productsData.total || 0,
                totalSales: ordersStats?.totalRevenue || 0,
                activeDisputes: disputesData?.OPEN || 0,
                totalRefunds: ordersStats?.cancelled || 0, // Simplified mapping
                loading: false
            });

            if (analyticsData) {
                if (analyticsData.revenueData?.length > 0) setRevenueData(analyticsData.revenueData);
                if (analyticsData.topProducts?.length > 0) setTopProducts(analyticsData.topProducts);
                if (analyticsData.topSuppliers?.length > 0) setTopSuppliers(analyticsData.topSuppliers);
            }
        } catch (err) {
            setStats(prev => ({ ...prev, loading: false }));
        }
    }, []);

    const handleExportReport = async () => {
        const tid = toast.loading('Generating platform report...');
        try {
            const data = [
                ['Metric', 'Value'],
                ['Total Sales', stats.totalSales.toString()],
                ['Pending Orders', stats.pendingOrdersCount.toString()],
                ['Active Products', stats.activeProducts.toString()],
                ['Pending Users', stats.pendingUsers.toString()],
                ['Active Disputes', stats.activeDisputes.toString()]
            ];

            const csvContent = data.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `atlantis-report-${new Date().toISOString().split('T')[0]}.csv`);
            link.click();
            toast.success('Report exported successfully', { id: tid });
        } catch (err) {
            toast.error('Failed to export report', { id: tid });
        }
    };

    React.useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Admin Overview</h1>
                    <p className="text-sm text-slate-500 mt-1">Welcome back, Admin! Here's what's happening with your marketplace today.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                        <Clock size={16} />
                        May 20, 2025 - May 26, 2025
                    </button>
                    <button 
                        onClick={handleExportReport}
                        className="h-10 px-4 bg-teal-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20"
                    >
                        <Activity size={16} />
                        Export Report
                    </button>
                </div>
            </div>

            {/* KPI Row (6 Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                <DashboardKPICard 
                    icon={DollarSign} label="Total Revenue" value={`$${stats.totalSales.toLocaleString()}`} 
                    subtext="vs last week" trend="up" trendValue={12.5} 
                    color="bg-teal-50" iconColor="text-teal-600" sparklineColor="#0D9488"
                />
                <DashboardKPICard 
                    icon={ShoppingCart} label="Total Orders" value={stats.pendingOrdersCount.toLocaleString()} 
                    subtext="vs last week" trend="up" trendValue={8.2} 
                    color="bg-blue-50" iconColor="text-blue-600" sparklineColor="#2563EB"
                />
                <DashboardKPICard 
                    icon={RotateCcw} label="Cancelled Orders" value={stats.totalRefunds} 
                    subtext="Total cancellations" trend="up" trendValue={3.7} 
                    color="bg-orange-50" iconColor="text-orange-600" sparklineColor="#EA580C"
                />
                <DashboardKPICard 
                    icon={AlertCircle} label="Active Disputes" value={stats.activeDisputes} 
                    subtext="vs last week" trend="up" trendValue={14.3} 
                    color="bg-red-50" iconColor="text-red-600" sparklineColor="#DC2626"
                />
                <DashboardKPICard 
                    icon={Package} label="Top Product" value={topProducts[0]?.name?.slice(0, 8) + '...' || 'N/A'} 
                    subtext={`${topProducts[0]?.sales || 0} units sold`} trend="up" trendValue={6.1} 
                    color="bg-slate-50" iconColor="text-slate-600" sparklineColor="#475569"
                />
                <DashboardKPICard 
                    icon={MousePointer2} label="Conversion Rate" value="3.42%" 
                    subtext="vs last week" trend="up" trendValue={6.1} 
                    color="bg-emerald-50" iconColor="text-emerald-600" sparklineColor="#059669"
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-12 gap-8">
                
                {/* LEFT COLUMN (65%) */}
                <div className="col-span-12 lg:col-span-8 space-y-8">
                    
                    {/* Revenue Analytics */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div>
                                <h3 className="text-base font-semibold text-slate-900">Revenue Analytics</h3>
                                <p className="text-xs text-slate-500 mt-1">Daily revenue trends across all regions</p>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100">
                                {['Daily', 'Weekly', 'Monthly'].map((t) => (
                                    <button key={t} className={cn(
                                        "px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all",
                                        t === 'Weekly' ? "bg-teal-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
                                    )}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={revenueData.length > 0 ? revenueData : EMPTY_REVENUE_DATA}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0D9488" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#0D9488" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        itemStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#0D9488' }}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="#0D9488" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Orders & Status Breakdown */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-base font-semibold text-slate-900 mb-6">Orders & Status Breakdown</h3>
                        <div className="flex flex-col gap-6">
                            <div className="h-4 w-full flex rounded-full overflow-hidden bg-slate-100">
                                {(stats.pendingOrdersCount > 0 ? EMPTY_STATUS_DATA : EMPTY_STATUS_DATA).map((s) => (
                                    <div key={s.name} style={{ width: `0%`, backgroundColor: s.color }} className="h-full transition-all hover:opacity-80" />
                                ))}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {EMPTY_STATUS_DATA.map((s) => (
                                    <div key={s.name} className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{s.name}</span>
                                        </div>
                                        <p className="text-xl font-semibold text-slate-900">0</p>
                                        <p className="text-[10px] text-slate-400 font-medium">0.0%</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Top Selling Products */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-slate-900">Top Selling Products</h3>
                            <button className="text-xs font-bold text-teal-600 hover:underline">View All</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-start">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-3 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product</th>
                                        <th className="px-6 py-3 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sales Volume</th>
                                        <th className="px-6 py-3 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue</th>
                                        <th className="px-6 py-3 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trend</th>
                                        <th className="px-6 py-3 text-end"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {topProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400 italic">
                                                No high-volume products found in this period.
                                            </td>
                                        </tr>
                                    ) : topProducts.map((prod, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <img src={prod.image || 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?w=100&h=100&fit=crop'} className="w-10 h-10 rounded-lg object-cover border border-slate-100" />
                                                    <span className="text-xs font-semibold text-slate-900">{prod.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-medium text-slate-600">{(prod.sales || 0).toLocaleString()}</td>
                                            <td className="px-6 py-4 text-xs font-bold text-slate-900">${(prod.revenue || 0).toLocaleString()}</td>
                                            <td className="px-6 py-4">
                                                <div className={cn(
                                                    "flex items-center gap-1 text-[11px] font-bold text-emerald-500"
                                                )}>
                                                    <ArrowUpRight size={14} />
                                                    {prod.trend || '0.0%'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-end">
                                                <button className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                                                    <MoreHorizontal size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN (35%) */}
                <div className="col-span-12 lg:col-span-4 space-y-8">
                    
                    {/* Top Suppliers / Vendors */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-slate-900">Top Suppliers</h3>
                            <button className="text-xs font-bold text-teal-600 hover:underline">View All</button>
                        </div>
                        <div className="p-4 space-y-4">
                            {topSuppliers.length === 0 ? (
                                <p className="text-center py-10 text-xs text-slate-400 italic">No supplier activity recorded yet.</p>
                            ) : topSuppliers.map((sup, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold bg-teal-500")}>
                                            {sup.name[0]}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-900">{sup.name}</p>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <Star size={10} className="fill-amber-400 text-amber-400" />
                                                <span className="text-[10px] text-slate-500 font-bold">Top Performance</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-end">
                                        <p className="text-xs font-bold text-slate-900">${(sup.revenue || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-400 font-medium">{sup.orders || 0} Orders</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Financial Health */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Financial Health</h3>
                        <div className="space-y-4">
                            <div className="p-4 bg-teal-50/50 border border-teal-100 rounded-xl">
                                <div className="flex items-center gap-2 text-teal-600 mb-1">
                                    <DollarSign size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Net Revenue</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="text-xl font-bold text-slate-900">${stats.totalSales.toLocaleString()}</p>
                                    <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold">
                                        <TrendingUp size={12} />
                                        +15.3%
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-xl">
                                    <div className="flex items-center gap-2 text-orange-600 mb-1">
                                        <Briefcase size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Expenses</span>
                                    </div>
                                    <p className="text-lg font-bold text-slate-900">$24,680</p>
                                    <p className="text-[9px] text-red-500 font-bold mt-1">+7.6% increase</p>
                                </div>
                                <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl">
                                    <div className="flex items-center gap-2 text-red-600 mb-1">
                                        <RotateCcw size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Refund Ratio</span>
                                    </div>
                                    <p className="text-lg font-bold text-slate-900">2.34%</p>
                                    <p className="text-[9px] text-emerald-500 font-bold mt-1">-0.6% vs last week</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions Panel */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Quick Actions</h3>
                        <div className="grid grid-cols-1 gap-3">
                            <Link href="/admin/products/new" className="flex items-center gap-3 h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all">
                                <div className="w-6 h-6 bg-teal-500/10 text-teal-600 rounded-lg flex items-center justify-center">
                                    <Plus size={14} />
                                </div>
                                Add New Product
                            </Link>
                            <Link href="/admin/orders" className="flex items-center gap-3 h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all">
                                <div className="w-6 h-6 bg-blue-500/10 text-blue-600 rounded-lg flex items-center justify-center">
                                    <ShoppingCart size={14} />
                                </div>
                                View All Orders
                            </Link>
                            <Link href="/admin/users?role=SUPPLIER" className="flex items-center gap-3 h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all">
                                <div className="w-6 h-6 bg-orange-500/10 text-orange-600 rounded-lg flex items-center justify-center">
                                    <UserCheck2 size={14} />
                                </div>
                                Manage Suppliers
                            </Link>
                        </div>
                    </div>

                    {/* Recent Alerts & Activity */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-slate-900">Recent Alerts</h3>
                            <button className="text-xs font-bold text-teal-600 hover:underline">View All</button>
                        </div>
                        <div className="p-4 space-y-1">
                            {ACTIVITY_FEED.length === 0 ? (
                                <p className="text-center py-10 text-xs text-slate-400 italic">No recent activity recorded.</p>
                            ) : ACTIVITY_FEED.map((item) => (
                                <div key={item.id} className="flex items-start gap-4 p-3 hover:bg-slate-50 rounded-xl transition-all group">
                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", item.bg)}>
                                        <item.icon size={16} className={item.color} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-medium text-slate-600 leading-relaxed line-clamp-2">{item.text}</p>
                                        <p className="text-[10px] text-slate-400 font-bold mt-1">{item.time}</p>
                                    </div>
                                    <button className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-900 transition-all">
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
}
