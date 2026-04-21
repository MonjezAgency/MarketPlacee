'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    Users, Package, DollarSign, Clock, TrendingUp, 
    ArrowUpRight, ArrowDownRight, UserCheck, 
    ShoppingCart, BarChart3, Activity, 
    Wallet, Briefcase, Globe, Zap
} from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, 
    Tooltip, ResponsiveContainer, BarChart, Bar,
    PieChart, Pie, Cell
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';

const REVENUE_DATA = [
    { name: 'Jan', revenue: 45000, items: 1200 },
    { name: 'Feb', revenue: 52000, items: 1400 },
    { name: 'Mar', revenue: 48000, items: 1300 },
    { name: 'Apr', revenue: 61000, items: 1600 },
    { name: 'May', revenue: 55000, items: 1500 },
    { name: 'Jun', revenue: 67000, items: 1800 },
    { name: 'Jul', revenue: 72000, items: 2100 },
];

const CATEGORY_DATA = [
    { name: 'catBeverages', value: 4520, color: '#0A1A2F' },
    { name: 'catSnacks', value: 2840, color: '#FF8A00' },
    { name: 'catHygiene', value: 1800, color: '#1BC7C9' },
    { name: 'catOther', value: 1200, color: '#F2F4F7' },
];

const TRAFFIC_DATA = [
    { name: 'daySun', visitors: 4200, invoices: 2400 },
    { name: 'dayMon', visitors: 3800, invoices: 1398 },
    { name: 'dayTue', visitors: 5600, invoices: 9800 },
    { name: 'dayWed', visitors: 4780, invoices: 3908 },
    { name: 'dayThu', visitors: 3890, invoices: 4800 },
    { name: 'dayFri', visitors: 4390, invoices: 3800 },
    { name: 'daySat', visitors: 5490, invoices: 4300 },
];

const TOP_PRODUCTS = [
    { id: 1, name: 'Coca-Cola Classic 330ml', sales: '12,450', revenue: 'EGP 18,675', growth: '+12%', image: 'https://picsum.photos/seed/cola/100/100' },
    { id: 2, name: 'Red Bull Energy 250ml', sales: '9,820', revenue: 'EGP 24,550', growth: '+18%', image: 'https://picsum.photos/seed/redbull/100/100' },
    { id: 3, name: 'Lipton Ice Tea Lemon', sales: '8,140', revenue: 'EGP 10,175', growth: '+5%', image: 'https://picsum.photos/seed/lipton/100/100' },
    { id: 4, name: 'Pepsi Zero Sugar', sales: '7,650', revenue: 'EGP 11,475', growth: '+22%', image: 'https://picsum.photos/seed/pepsi/100/100' },
    { id: 5, name: 'Almarai Fresh Milk 1L', sales: '6,420', revenue: 'EGP 8,025', growth: '+8%', image: 'https://picsum.photos/seed/milk/100/100' },
    { id: 6, name: 'Gatorade Blue Bolt', sales: '5,210', revenue: 'EGP 9,115', growth: '+15%', image: 'https://picsum.photos/seed/gator/100/100' },
    { id: 7, name: 'Aquafina Water 500ml', sales: '4,840', revenue: 'EGP 2,420', growth: '+3%', image: 'https://picsum.photos/seed/water/100/100' },
    { id: 8, name: 'Starbucks Frappuccino', sales: '4,120', revenue: 'EGP 16,480', growth: '+30%', image: 'https://picsum.photos/seed/coffee/100/100' },
    { id: 9, name: 'Nescafe Gold 200g', sales: '3,850', revenue: 'EGP 28,875', growth: '+10%', image: 'https://picsum.photos/seed/nes/100/100' },
    { id: 10, name: 'Oreo Biscuits Pack', sales: '3,420', revenue: 'EGP 5,130', growth: '+6%', image: 'https://picsum.photos/seed/oreo/100/100' },
];

const TOP_SUPPLIERS = [
    { id: 1, name: 'Global Bev Distribution', volume: 'EGP 428,500', orders: 1240, rating: 4.9 },
    { id: 2, name: 'Emirates Refreshments', volume: 'EGP 312,400', orders: 980, rating: 4.8 },
    { id: 3, name: 'United Foods Group', volume: 'EGP 284,000', orders: 850, rating: 4.7 },
    { id: 4, name: 'Arabian Snacks Co', volume: 'EGP 215,600', orders: 720, rating: 4.6 },
    { id: 5, name: 'Prime Logistics', volume: 'EGP 198,200', orders: 640, rating: 4.9 },
    { id: 6, name: 'Desert Oasis Drinks', volume: 'EGP 165,400', orders: 580, rating: 4.5 },
    { id: 7, name: 'Gulf Trading Elite', volume: 'EGP 142,800', orders: 490, rating: 4.7 },
    { id: 8, name: 'Zand Food Services', volume: 'EGP 128,500', orders: 420, rating: 4.8 },
    { id: 9, name: 'Al-Khair Distribution', volume: 'EGP 112,000', orders: 380, rating: 4.4 },
    { id: 10, name: 'Horizon Wholesalers', volume: 'EGP 98,400', orders: 320, rating: 4.6 },
];

export default function AdminOverviewPage() {
    const { locale, t } = useLanguage();
    const isAr = locale === 'ar';
    const [stats, setStats] = React.useState({ 
        pendingUsers: 0, 
        pendingOrdersCount: 0,
        activeProducts: 0, 
        totalSales: 0,
        loading: true 
    });
    const [showConfirm, setShowConfirm] = React.useState(false);
    const [approving, setApproving] = React.useState(false);

    const fetchStats = React.useCallback(async () => {
        try {
            setStats(prev => ({ ...prev, loading: true }));
            const [usersRes, productsRes, ordersStatsRes] = await Promise.all([
                apiFetch('/users?status=PENDING_APPROVAL&limit=1'),
                apiFetch('/products?limit=1'),
                apiFetch('/orders/stats')
            ]);

            if (usersRes.ok && productsRes.ok) {
                const usersData = await usersRes.json();
                const productsData = await productsRes.json();
                const ordersStats = ordersStatsRes.ok ? await ordersStatsRes.json() : null;

                setStats({
                    pendingUsers: usersData.total || 0,
                    pendingOrdersCount: ordersStats?.pending || 0,
                    activeProducts: productsData.total || 0,
                    totalSales: ordersStats?.totalRevenue || 0,
                    loading: false
                });
            }
        } catch (err) {
            console.error("Failed to fetch admin stats:", err);
            setStats(prev => ({ ...prev, loading: false }));
        }
    }, [isAr]);

    const executeApproveAll = async () => {
        setShowConfirm(false);
        setApproving(true);
        const tid = toast.loading(isAr ? 'جاري تفعيل الحسابات...' : 'Approving users...');
        
        try {
            const res = await apiFetch('/users/approve-all', { method: 'POST' });
            const result = await res.json();

            if (res.ok) {
                if (result.failed > 0) {
                    toast.error(
                        isAr 
                            ? `تم تفعيل ${result.approved}، وفشل ${result.failed}`
                            : `Approved ${result.approved}, failed ${result.failed}`, 
                        { id: tid }
                    );
                } else {
                    toast.success(
                        isAr ? `تم تفعيل جميع المستخدمين (${result.approved})` : `Successfully approved all ${result.approved} users`,
                        { id: tid }
                    );
                }
                fetchStats();
            } else {
                toast.error(isAr ? 'فشلت العملية' : 'Bulk approval failed', { id: tid });
            }
        } catch (err) {
            toast.error(isAr ? 'خطأ في الاتصال' : 'Connection error', { id: tid });
        } finally {
            setApproving(false);
        }
    };

    React.useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    return (
        <div className="space-y-10 animate-in fade-in duration-700 pb-20">
            {/* Upper Grid - High-Impact Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Total Sales Command Center */}
                <div className="lg:col-span-3 glass-card-strong p-8 flex flex-col justify-between overflow-hidden relative group min-h-[420px]">
                    <div className="absolute top-0 end-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                        <TrendingUp size={240} className="text-secondary rotate-12" />
                    </div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <Globe size={18} />
                                </div>
                                <p className={cn("text-[10px] font-black uppercase text-muted-foreground", !isAr && "tracking-[0.4em]")}>{t('admin', 'globalSettlementLedger')}</p>
                            </div>
                            <h2 className="text-5xl font-black tracking-tighter font-heading mb-4 select-none">EGP {stats.totalSales.toLocaleString('ar-EG')}</h2>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-4 py-1.5 rounded-full font-black text-xs">
                                    <ArrowUpRight size={16} />
                                    <span>+64.54%</span>
                                </div>
                                <p className="text-xs font-bold text-muted-foreground italic truncate">{t('admin', 'projectedVsReactive')}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
                            <div className="glass p-6 rounded-3xl border-primary/10 hover:border-primary/30 transition-all group/stat">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{t('admin', 'activeSkus')}</p>
                                <p className="text-2xl font-black font-heading group-hover:text-primary transition-colors">
                                    {stats.loading ? '...' : (stats.activeProducts >= 1000 ? (stats.activeProducts/1000).toFixed(1) + 'k' : stats.activeProducts)}
                                </p>
                            </div>
                            <div className="glass p-6 rounded-3xl border-secondary/10 hover:border-secondary/30 transition-all group/stat relative overflow-hidden flex flex-col justify-between">
                                {stats.pendingOrdersCount > 0 && (
                                    <Link 
                                        href="/admin/orders"
                                        className="absolute top-0 end-0 px-3 py-1 bg-secondary text-secondary-foreground text-[9px] font-black rounded-es-xl transition-colors hover:bg-secondary/90 active:scale-95"
                                    >
                                        {isAr ? 'عرض' : 'VIEW'}
                                    </Link>
                                )}
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{t('admin', 'pendingApprovals')}</p>
                                <p className="text-2xl font-black font-heading group-hover:text-secondary transition-colors">
                                    {stats.loading ? '...' : stats.pendingOrdersCount}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="h-56 mt-auto -mx-8 -mb-8 opacity-80 hover:opacity-100 transition-opacity">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={REVENUE_DATA}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--secondary))" strokeWidth={6} fillOpacity={1} fill="url(#colorRev)" />
                                <Tooltip 
                                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '1rem' }}
                                    itemStyle={{ color: 'hsl(var(--primary))', fontWeight: '900' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Platform Activity Mini-Dashboard */}
                <div className="space-y-8 flex flex-col">
                    <div className="glass-card p-8 flex-1 flex flex-col justify-between border-s-4 border-primary relative overflow-hidden">
                         <div className="absolute top-4 end-4 text-primary/5">
                            <Activity size={80} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-6">{t('admin', 'activityIndex')}</p>
                            <div className="grid grid-cols-7 gap-1.5">
                                {Array.from({ length: 35 }).map((_, i) => (
                                    <div 
                                        key={i} 
                                        className="aspect-square rounded-sm transition-all cursor-help hover:scale-125"
                                        style={{ backgroundColor: `hsl(var(--secondary) / ${Math.random() * 0.9 + 0.1})` }}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-between items-center mt-6">
                                <span className={cn("text-[9px] font-black text-muted-foreground uppercase", !isAr && "tracking-widest")}>{t('admin', 'efficiencyLow')}</span>
                                <span className={cn("text-[9px] font-black text-secondary uppercase", !isAr && "tracking-widest")}>{t('admin', 'peakFlow')}</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card-strong p-8 bg-gradient-to-br from-primary/5 to-secondary/5 border-none shadow-2xl relative overflow-hidden group">
                        <div className="absolute -bottom-4 -end-4 text-orange-500/10 group-hover:scale-110 transition-transform">
                            <Zap size={100} />
                        </div>
                        <p className={cn("text-[10px] font-black uppercase mb-4 text-muted-foreground", !isAr && "tracking-[0.2em]")}>{t('admin', 'quickActionTerminal')}</p>
                        <div className="space-y-3">
                            <Link href="/admin/billing" className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl text-xs hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                <Briefcase size={14} />
                                {t('admin', 'auditFullLedger')}
                            </Link>
                            <Link href="/admin/orders" className="w-full py-3 bg-accent text-accent-foreground font-bold rounded-xl text-xs hover:bg-accent/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                <ShoppingCart size={14} />
                                {t('admin', 'settlePendingInvoices')}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Leaderboards Tier - THE TOP 10s */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                {/* Top 10 Products */}
                <div className="glass-card-strong p-8 border-t-4 border-accent">
                    <div className="flex items-center justify-between mb-10">
                        <div>
                            <h3 className="text-2xl font-black font-heading tracking-tighter uppercase">{t('admin', 'topSellingProducts')}</h3>
                            <p className={cn("text-[10px] text-muted-foreground font-black uppercase mt-1", !isAr && "tracking-widest")}>{t('admin', 'globalSkuRanking')}</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                            <Package size={24} />
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        {TOP_PRODUCTS.map((prod, idx) => (
                            <div key={prod.id} className="flex items-center justify-between p-4 hover:bg-muted/50 rounded-2xl transition-all border border-transparent hover:border-border group/row">
                                <div className="flex items-center gap-6">
                                    <span className={cn(
                                        "text-lg font-black w-8 h-8 flex items-center justify-center rounded-lg select-none transition-colors",
                                        idx === 0 ? "bg-accent text-accent-foreground" : idx < 3 ? "bg-primary/10 text-primary" : "text-muted-foreground"
                                    )}>
                                        {idx + 1}
                                    </span>
                                    <div className="w-12 h-12 rounded-xl border border-border overflow-hidden bg-white shadow-sm group-hover/row:scale-110 transition-transform">
                                        <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black font-heading group-hover/row:text-primary transition-colors">{prod.name}</p>
                                        <p className={cn("text-[10px] text-muted-foreground uppercase font-bold", !isAr && "tracking-widest")}>{prod.sales} {t('admin', 'unitsDispatched')}</p>
                                    </div>
                                </div>
                                <div className="text-end">
                                    <p className="text-sm font-black font-heading">{prod.revenue}</p>
                                    <p className="text-[10px] text-emerald-500 font-extrabold">{prod.growth} {t('admin', 'growth')}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top 10 Suppliers */}
                <div className="glass-card-strong p-8 border-t-4 border-secondary">
                    <div className="flex items-center justify-between mb-10">
                        <div>
                            <h3 className="text-2xl font-black font-heading tracking-tighter uppercase">{t('admin', 'elitePartners')}</h3>
                            <p className={cn("text-[10px] text-muted-foreground font-black uppercase mt-1", !isAr && "tracking-widest")}>{t('admin', 'topPerformersMarketCap')}</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary">
                            <Users size={24} />
                        </div>
                    </div>

                    <div className="space-y-3">
                        {TOP_SUPPLIERS.map((sup, idx) => (
                            <div key={sup.id} className="flex items-center justify-between p-4 hover:bg-muted/50 rounded-2xl transition-all border border-transparent hover:border-border group/row">
                                <div className="flex items-center gap-6">
                                    <span className={cn(
                                        "text-lg font-black w-8 h-8 flex items-center justify-center rounded-lg select-none transition-colors",
                                        idx === 0 ? "bg-secondary text-secondary-foreground" : idx < 3 ? "bg-primary/10 text-primary" : "text-muted-foreground"
                                    )}>
                                        {idx + 1}
                                    </span>
                                    <div className="w-12 h-12 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary group-hover/row:bg-primary group-hover/row:text-white transition-all">
                                        <UserCheck size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black font-heading group-hover/row:text-primary transition-colors">{sup.name}</p>
                                        <p className={cn("text-[10px] text-muted-foreground uppercase font-bold", !isAr && "tracking-widest")}>{sup.orders} {t('admin', 'complianceOrders')}</p>
                                    </div>
                                </div>
                                <div className="text-end">
                                    <p className="text-sm font-black font-heading">{sup.volume}</p>
                                    <p className="text-[10px] text-amber-500 font-extrabold">{sup.rating} {t('admin', 'rating')}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Visual Analytics Tier - Charts & Heatmaps */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Category Saturation Pie */}
                <div className="glass-card p-8">
                    <div className="flex items-center justify-between mb-10">
                        <p className={cn("text-[10px] font-black uppercase text-muted-foreground", !isAr && "tracking-[0.3em]")}>{t('admin', 'marketSegmentation')}</p>
                        <BarChart3 size={16} className="text-muted-foreground" />
                    </div>
                    <div className="h-72 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={CATEGORY_DATA}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={95}
                                    paddingAngle={8}
                                    dataKey="value"
                                >
                                    {CATEGORY_DATA.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ background: 'hsl(var(--card))', border: 'none', borderRadius: '1rem', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                                    labelFormatter={(label: any) => t('admin', String(label))}
                                    formatter={(value: any, name: any) => [value, t('admin', String(name))]}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-4xl font-black font-heading tracking-tighter">10.4K</span>
                            <span className={cn("text-[10px] font-black text-muted-foreground uppercase mt-4", !isAr && "tracking-widest")}>{t('admin', 'totalSkus')}</span>
                        </div>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                        {CATEGORY_DATA.map((item) => (
                            <div key={item.name} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors cursor-default">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                <div className="overflow-hidden">
                                    <p className={cn("text-[10px] font-black text-muted-foreground uppercase truncate", !isAr && "tracking-widest")}>{t('admin', item.name)}</p>
                                    <p className="text-xs font-black tracking-tight">{((item.value / 10360) * 100).toFixed(1)}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Operational Flow - WITH CLARIFIED LEGENDS */}
                <div className="lg:col-span-2 glass-card-strong p-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                        <div>
                            <h3 className="text-2xl font-black font-heading tracking-tighter uppercase mb-1">{t('admin', 'operationalFlow')}</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-secondary" />
                                    <span className={cn("text-[10px] font-black uppercase text-muted-foreground", !isAr && "tracking-widest")}>{t('admin', 'visitors')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-accent" />
                                    <span className={cn("text-[10px] font-black uppercase text-muted-foreground", !isAr && "tracking-widest")}>{t('admin', 'invoices')}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-muted/50 p-2 rounded-2xl border border-border">
                            <span className="px-4 py-1.5 bg-primary text-primary-foreground text-[10px] font-black rounded-xl cursor-not-allowed uppercase">{t('admin', 'weekly')}</span>
                            <span className="px-4 py-1.5 text-[10px] font-black text-muted-foreground hover:text-primary transition-colors cursor-pointer uppercase">{t('admin', 'monthly')}</span>
                        </div>
                    </div>

                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={TRAFFIC_DATA}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.1)" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fontWeight: 900, fill: 'hsl(var(--muted-foreground))' }}
                                    tickFormatter={(tick) => t('admin', tick)}
                                />
                                <Tooltip 
                                    cursor={{ fill: 'hsl(var(--primary) / 0.05)' }} 
                                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '1rem' }}
                                    labelFormatter={(label: any) => t('admin', String(label))}
                                    formatter={(value: any, name: any) => [value, t('admin', String(name))]}
                                />
                                <Bar dataKey="visitors" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} barSize={24} />
                                <Bar dataKey="invoices" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} barSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 p-6 glass rounded-3xl border-primary/5">
                        <div className="text-center">
                            <p className="text-2xl font-black font-heading text-primary">32.4k</p>
                            <p className={cn("text-[9px] font-black text-muted-foreground uppercase mt-1", !isAr && "tracking-widest")}>{t('admin', 'totalHits')}</p>
                        </div>
                        <div className="text-center border-s border-border/50">
                            <p className="text-2xl font-black font-heading text-secondary">2.8%</p>
                            <p className={cn("text-[9px] font-black text-muted-foreground uppercase mt-1", !isAr && "tracking-widest")}>{t('admin', 'bounceRate')}</p>
                        </div>
                        <div className="text-center border-s border-border/50">
                            <p className="text-2xl font-black font-heading text-accent">84%</p>
                            <p className={cn("text-[9px] font-black text-muted-foreground uppercase mt-1", !isAr && "tracking-widest")}>{t('admin', 'invoiceYield')}</p>
                        </div>
                        <div className="text-center border-s border-border/50">
                            <p className="text-2xl font-black font-heading text-emerald-500">2.1s</p>
                            <p className={cn("text-[9px] font-black text-muted-foreground uppercase mt-1", !isAr && "tracking-widest")}>{t('admin', 'avgLatency')}</p>
                        </div>
                    </div>
                </div>
            </div>
            {/* [FINAL FIX]: Confirmation Modal */}
            {showConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="glass-card-strong max-w-md w-full p-10 text-center space-y-6"
                    >
                        <div className="w-20 h-20 bg-orange-500/10 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <UserCheck size={40} />
                        </div>
                        <h3 className="text-2xl font-black font-heading uppercase tracking-tighter">
                            {isAr ? `تفعيل ${stats.pendingUsers} مستخدم؟` : `Approve ${stats.pendingUsers} Users?`}
                        </h3>
                        <p className="text-sm text-muted-foreground font-bold leading-relaxed">
                            {isAr 
                                ? 'سيتم تفعيل جميع الحسابات المعلقة التي أكملت بيانات الشركة. سيصلهم بريد إلكتروني ترحيبي فوراً.' 
                                : 'This will activate all pending accounts that have completed their company details. Welcome emails will be sent immediately.'}
                        </p>
                        <div className="flex gap-4 pt-4">
                            <button 
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 py-4 glass hover:bg-muted/50 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                            >
                                {t('common', 'cancel')}
                            </button>
                            <button 
                                onClick={executeApproveAll}
                                className="flex-1 py-4 bg-primary text-primary-foreground rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
                            >
                                {isAr ? 'تأكيد التفعيل' : 'CONFIRM APPROVAL'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
