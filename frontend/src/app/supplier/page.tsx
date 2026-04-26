'use client';
import { apiFetch } from '@/lib/api';


import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Package, ShoppingCart, Eye, TrendingUp, ArrowUpRight, Plus, Loader2, Clock, Lock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import { useAuth } from '@/lib/auth';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import Link from 'next/link';

const REVENUE_SPARKLINE: any[] = [];
const ORDERS_SPARKLINE: any[] = [];

export default function SupplierOverviewPage() {
    const { t } = useLanguage();
    const { user } = useAuth();
    const [dashboardStats, setDashboardStats] = React.useState<any>(null);
    const [dateRange, setDateRange] = React.useState('7d');
    const [isDateOpen, setIsDateOpen] = React.useState(false);

    // MOCK: In a real app, user.createdAt comes from the DB
    // We'll use a fallback or mock it for the demo logic
    const joinedAt = user?.createdAt ? new Date(user.createdAt) : new Date('2025-05-20'); 
    
    const RANGES = [
        { id: 'today', label: 'Today', days: 0 },
        { id: '7d', label: 'Last 7 Days', days: 7 },
        { id: '30d', label: 'Last 30 Days', days: 30 },
        { id: '90d', label: 'Last 90 Days', days: 90 },
        { id: 'all', label: 'All Time', days: Infinity },
    ];

    const filteredRanges = RANGES.filter(range => {
        const now = new Date();
        const diffDays = Math.ceil((now.getTime() - joinedAt.getTime()) / (1000 * 60 * 60 * 24));
        if (range.id === 'all' || range.id === 'today') return true;
        return diffDays >= range.days;
    });

    const getRangeLabel = () => {
        return RANGES.find(r => r.id === dateRange)?.label || 'Last 7 Days';
    };

    const getDateString = () => {
        const now = new Date();
        const start = new Date();
        const range = RANGES.find(r => r.id === dateRange);
        
        if (range?.id === 'all') return `Since ${joinedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        if (range?.id === 'today') return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        start.setDate(now.getDate() - (range?.days || 7));
        return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    };

    React.useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await apiFetch(`/dashboard/supplier?range=${dateRange}`);
                if (res.ok) {
                    const data = await res.json();
                    setDashboardStats(data);
                }
            } catch (err) {
                console.error('Failed to fetch dashboard stats:', err);
            }
        };
        fetchStats();
    }, [dateRange]);

    const KPI_DATA = [
        { label: 'Revenue (MTD)', value: dashboardStats?.totalRevenue ? formatPrice(dashboardStats.totalRevenue) : '€0.00', trend: '+0.0%', icon: BarChart3, color: 'text-[#10B981]' },
        { label: 'Active Products', value: dashboardStats?.activeProductsCount?.toString() || '0', trend: 'Stable', icon: Package, color: 'text-[#0EA5A4]' },
        { label: 'Total Orders', value: dashboardStats?.totalOrders?.toString() || '0', trend: '+0.0%', icon: ShoppingCart, color: 'text-blue-500' },
        { label: 'Digital Impressions', value: dashboardStats?.impressions?.toString() || '0', trend: '+0.0%', icon: Eye, color: 'text-[#FF8A00]' },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Welcome & Action Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                    <h2 className="text-[28px] font-black text-[#0F172A] tracking-tight">
                        Welcome back, {user?.name?.split(' ')[0] || 'Monjez'}! 👋
                    </h2>
                    <p className="text-[#64748B] text-sm font-medium mt-1">
                        Here's what's happening with your business {dateRange === 'today' ? 'today' : 'over this period'}.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <button 
                            onClick={() => setIsDateOpen(!isDateOpen)}
                            className="flex items-center gap-3 px-5 py-3 bg-white border border-[#E2E8F0] rounded-xl text-sm font-bold text-[#64748B] hover:border-[#0EA5A4] transition-all shadow-sm group"
                        >
                            <Clock size={18} className="text-[#0EA5A4]" />
                            <div className="flex flex-col items-start leading-none">
                                <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-1">{getRangeLabel()}</span>
                                <span className="text-[#0F172A]">{getDateString()}</span>
                            </div>
                        </button>

                        <AnimatePresence>
                            {isDateOpen && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setIsDateOpen(false)} />
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute right-0 mt-2 w-[220px] bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl z-30 overflow-hidden"
                                    >
                                        <div className="p-2">
                                            {filteredRanges.map((range) => (
                                                <button
                                                    key={range.id}
                                                    onClick={() => {
                                                        setDateRange(range.id);
                                                        setIsDateOpen(false);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                                                        dateRange === range.id 
                                                            ? 'bg-[#0EA5A4]/10 text-[#0EA5A4]' 
                                                            : 'text-[#64748B] hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {range.label}
                                                    {dateRange === range.id && <div className="w-1.5 h-1.5 rounded-full bg-[#0EA5A4]" />}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                    
                    <Link href="/supplier/products" className="flex items-center gap-2 px-6 py-3 bg-[#0EA5A4] text-white font-bold text-sm rounded-xl hover:shadow-lg hover:shadow-[#0EA5A4]/20 transition-all active:scale-95">
                        <Plus size={18} strokeWidth={3} /> Add New Product
                    </Link>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {KPI_DATA.map((kpi, i) => (
                    <motion.div
                        key={kpi.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white p-5 rounded-[16px] border border-[#E2E8F0] h-[140px] flex flex-col justify-between group hover:border-[#0EA5A4]/30 transition-colors"
                    >
                        <div className="flex items-center justify-between">
                            <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] flex items-center justify-center text-[#64748B] group-hover:bg-[#0EA5A4]/10 group-hover:text-[#0EA5A4] transition-colors">
                                <kpi.icon size={20} />
                            </div>
                            <div className="text-[12px] font-bold text-[#10B981] bg-[#10B981]/5 px-2 py-0.5 rounded-full flex items-center gap-1">
                                {kpi.trend} <ArrowUpRight size={12} />
                            </div>
                        </div>
                        <div className="flex items-end justify-between">
                            <div className="space-y-0.5">
                                <p className="text-[13px] font-medium text-[#64748B]">{kpi.label}</p>
                                <p className="text-2xl font-bold text-[#0F172A] tracking-tight">{kpi.value}</p>
                            </div>
                            <div className="w-20 h-10">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={[{v:10}, {v:15}, {v:12}, {v:18}, {v:20}]}>
                                        <Area type="monotone" dataKey="v" stroke={i === 0 ? '#10B981' : '#0EA5A4'} strokeWidth={2} fillOpacity={0.1} fill={i === 0 ? '#10B981' : '#0EA5A4'} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Analytics & Payments Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Analytics */}
                <div className="lg:col-span-2 bg-white p-6 rounded-[16px] border border-[#E2E8F0] h-[320px] flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#0EA5A4]/10 flex items-center justify-center text-[#0EA5A4]">
                                <TrendingUp size={18} />
                            </div>
                            <h3 className="text-base font-bold text-[#0F172A]">Monthly Revenue</h3>
                        </div>
                        <select className="text-xs font-bold text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1 outline-none">
                            <option>Last 7 Days</option>
                            <option>Last 30 Days</option>
                        </select>
                    </div>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={REVENUE_SPARKLINE.length > 0 ? REVENUE_SPARKLINE : [{month:'Mon', value:0}, {month:'Tue', value:0}, {month:'Wed', value:0}, {month:'Thu', value:0}, {month:'Fri', value:0}]}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0EA5A4" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#0EA5A4" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94A3B8'}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94A3B8'}} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                                <Area type="monotone" dataKey="value" stroke="#0EA5A4" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* CRITICAL: LOCKED PAYMENT MODULE */}
                <div className="relative group overflow-hidden">
                    <div className="bg-white p-6 rounded-[16px] border border-[#E2E8F0] h-full min-h-[320px]">
                        <div className="space-y-6">
                            <h3 className="text-base font-bold text-[#0F172A]">Payment Methods</h3>
                            <div className="space-y-4 opacity-20 grayscale">
                                <div className="h-14 bg-slate-50 rounded-xl border border-dashed border-slate-200" />
                                <div className="h-14 bg-slate-50 rounded-xl border border-dashed border-slate-200" />
                                <div className="h-14 bg-slate-50 rounded-xl border border-dashed border-slate-200" />
                            </div>
                        </div>
                    </div>

                    {/* LOCKED OVERLAY SYSTEM */}
                    <div className="absolute inset-0 z-10 bg-[#0F172A]/55 backdrop-blur-[4px] flex flex-col items-center justify-center text-center p-8 rounded-[16px]">
                        <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center mb-6 border border-white/20">
                            <Lock size={32} className="text-white" />
                        </div>
                        <h4 className="text-[18px] font-bold text-white mb-2">Payments Coming Soon</h4>
                        <p className="text-[13px] text-[#E2E8F0] mb-8 leading-relaxed max-w-[200px]">
                            This feature will be enabled once payment systems are activated.
                        </p>
                        <button className="px-8 py-3 bg-[#1E293B] text-[#94A3B8] font-bold text-[13px] rounded-xl cursor-not-allowed border border-white/5 shadow-2xl">
                            Enable Payments
                        </button>
                    </div>
                </div>
            </div>

            {/* Top Selling Products Table */}
            <div className="bg-white rounded-[16px] border border-[#E2E8F0] overflow-hidden">
                <div className="px-8 py-6 border-b border-[#E2E8F0] flex items-center justify-between">
                    <h3 className="text-base font-bold text-[#0F172A]">Top 5 Selling Products</h3>
                    <Link href="/supplier/analytics" className="text-[12px] font-bold text-[#0EA5A4] hover:underline">View Sales Report →</Link>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                <th className="px-8 py-4 text-left text-[11px] font-bold text-[#64748B] uppercase tracking-wider">#</th>
                                <th className="px-8 py-4 text-left text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Product</th>
                                <th className="px-8 py-4 text-left text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Price</th>
                                <th className="px-8 py-4 text-left text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Sales (Units)</th>
                                <th className="px-8 py-4 text-left text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Revenue</th>
                                <th className="px-8 py-4 text-left text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Trend</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                            {dashboardStats?.topProducts?.length > 0 ? dashboardStats.topProducts.map((product: any, idx: number) => (
                                <tr key={product.productId} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-medium text-[#64748B]">{idx + 1}</td>
                                    <td className="px-8 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                                                {product.image ? <img src={product.image} className="w-full h-full object-cover" /> : <Package className="w-full h-full p-2 text-slate-400" />}
                                            </div>
                                            <span className="text-sm font-bold text-[#0F172A]">{product.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-4 text-sm font-semibold text-[#0F172A]">€{product.price || '0.00'}</td>
                                    <td className="px-8 py-4 text-sm font-bold text-[#0F172A]">{product.totalQuantitySold} units</td>
                                    <td className="px-8 py-4 text-sm font-bold text-[#10B981]">{formatPrice(product.totalRevenue)}</td>
                                    <td className="px-8 py-4">
                                        <div className="w-16 h-6">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={[{v:10}, {v:12}, {v:15}]}>
                                                    <Area type="monotone" dataKey="v" stroke="#10B981" fillOpacity={0.1} fill="#10B981" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-8 py-16 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center">
                                                <Package size={32} className="text-slate-300" />
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-[#0F172A]">No sales yet</p>
                                                <p className="text-sm text-[#64748B]">Start adding products to see your top selling items here.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
