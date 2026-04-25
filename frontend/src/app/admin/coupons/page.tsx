'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, Plus, Filter, Edit, 
    MoreVertical, Ticket, Calendar, 
    CheckCircle2, Clock, AlertCircle,
    TrendingUp, MousePointer2, Users,
    DollarSign, X, ChevronRight,
    Percent, Tag, ArrowUpRight,
    Zap, Hash, LayoutDashboard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface Coupon {
    id: string;
    code: string;
    type: 'PERCENTAGE' | 'FIXED';
    value: number;
    usageLimit?: number;
    usageCount: number;
    minOrderValue?: number;
    startDate: string;
    endDate: string;
    status: 'ACTIVE' | 'EXPIRED' | 'SCHEDULED';
    applyTo: 'ALL' | 'CATEGORY' | 'SKUS';
}

export default function AdminCouponsPage() {
    const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
    const [coupons, setCoupons] = React.useState<Coupon[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [userSearch, setUserSearch] = React.useState('');

    // Mock/Fetch Data
    const loadCoupons = async () => {
        setIsLoading(true);
        try {
            // In a real app: const res = await apiFetch('/coupons');
            // Mocking data for high-end preview as requested
            const mockData: Coupon[] = [
                {
                    id: '1',
                    code: 'WELCOME20',
                    type: 'PERCENTAGE',
                    value: 20,
                    usageCount: 142,
                    usageLimit: 500,
                    minOrderValue: 1000,
                    startDate: '2024-01-01',
                    endDate: '2024-12-31',
                    status: 'ACTIVE',
                    applyTo: 'ALL'
                },
                {
                    id: '2',
                    code: 'SUMMER_B2B',
                    type: 'FIXED',
                    value: 500,
                    usageCount: 89,
                    usageLimit: 200,
                    minOrderValue: 5000,
                    startDate: '2024-06-01',
                    endDate: '2024-08-31',
                    status: 'SCHEDULED',
                    applyTo: 'CATEGORY'
                },
                {
                    id: '3',
                    code: 'EXPIRED10',
                    type: 'PERCENTAGE',
                    value: 10,
                    usageCount: 500,
                    usageLimit: 500,
                    minOrderValue: 500,
                    startDate: '2023-01-01',
                    endDate: '2023-12-31',
                    status: 'EXPIRED',
                    applyTo: 'SKUS'
                }
            ];
            setCoupons(mockData);
        } catch (err) {
            toast.error('Failed to load coupons');
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        loadCoupons();
    }, []);

    const [applyTo, setApplyTo] = React.useState<'all' | 'category' | 'sku'>('all');

    // Real-time Action Handlers
    const toggleStatus = (id: string) => {
        setCoupons(prev => prev.map(c => {
            if (c.id === id) {
                const newStatus = c.status === 'ACTIVE' ? 'EXPIRED' : 'ACTIVE';
                toast.success(`Coupon ${c.code} is now ${newStatus}`);
                return { ...c, status: newStatus as any };
            }
            return c;
        }));
    };

    const deleteCoupon = (id: string) => {
        if (!confirm('Are you sure you want to delete this coupon?')) return;
        setCoupons(prev => prev.filter(c => c.id !== id));
        toast.success('Coupon deleted successfully');
    };

    const filteredCoupons = coupons.filter(c => 
        c.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-20 font-inter">
            {/* Header Section */}
            <div className="bg-white border-b border-[#E6EAF0] px-8 py-6 sticky top-0 z-30">
                <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-[24px] font-[700] text-[#0F172A] leading-tight">Coupons & Promotions</h1>
                        <p className="text-[14px] text-[#6B7280] mt-1">Manage discount logic across B2B orders</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
                            <input 
                                type="text"
                                placeholder="Search coupons..."
                                className="w-[260px] h-[40px] pl-10 pr-4 bg-[#F1F5F9] border-none rounded-[10px] text-sm focus:ring-2 focus:ring-[#00BFA6]/20 outline-none transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button className="h-[40px] px-4 rounded-[10px] bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] transition-all">
                            <Filter size={18} />
                        </button>
                        <button 
                            onClick={() => setIsDrawerOpen(true)}
                            className="h-[40px] px-4 rounded-[10px] bg-[#00BFA6] text-white font-bold text-sm flex items-center gap-2 hover:bg-[#00A892] shadow-lg shadow-[#00BFA6]/20 transition-all active:scale-95"
                        >
                            <Plus size={18} />
                            Create Coupon
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-[1440px] mx-auto px-8 py-6 space-y-6">
                {/* KPI Cards Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[16px]">
                    {[
                        { label: 'Active Coupons', value: '12', icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                        { label: 'Expired Coupons', value: '45', icon: Clock, color: 'text-slate-400', bg: 'bg-slate-50' },
                        { label: 'Total Redemptions', value: '1,284', icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
                        { label: 'Revenue Impact', value: '$42.5k', icon: DollarSign, color: 'text-teal-600', bg: 'bg-teal-50' }
                    ].map((card, i) => (
                        <div key={i} className="h-[110px] p-[20px] bg-white border border-[#E6EAF0] rounded-[16px] flex flex-col justify-between hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                                <span className="text-[12px] font-medium text-[#6B7280]">{card.label}</span>
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", card.bg)}>
                                    <card.icon size={16} className={card.color} />
                                </div>
                            </div>
                            <p className="text-[20px] font-bold text-[#0F172A]">{card.value}</p>
                        </div>
                    ))}
                </div>

                {/* Table Section */}
                <div className="bg-white border border-[#E6EAF0] rounded-[16px] overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#F8FAFC] border-bottom border-[#E6EAF0]">
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Code</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Type</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Discount</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Usage</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Validity</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCoupons.map((coupon) => (
                                    <tr key={coupon.id} className="h-[64px] border-b border-[#E6EAF0] hover:bg-[#F7F9FB] transition-colors group">
                                        <td className="px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                                    <Tag size={14} className="text-slate-500" />
                                                </div>
                                                <span className="text-sm font-bold text-[#0F172A] tracking-tight">{coupon.code}</span>
                                            </div>
                                        </td>
                                        <td className="px-6">
                                            <span className="text-xs font-semibold text-[#475569]">{coupon.type}</span>
                                        </td>
                                        <td className="px-6">
                                            <span className="text-sm font-black text-[#0F172A]">
                                                {coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : `$${coupon.value}`}
                                            </span>
                                        </td>
                                        <td className="px-6">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between text-[10px] font-bold text-[#6B7280]">
                                                    <span>{coupon.usageCount} / {coupon.usageLimit || '∞'}</span>
                                                </div>
                                                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-[#00BFA6] rounded-full" 
                                                        style={{ width: `${coupon.usageLimit ? (coupon.usageCount / coupon.usageLimit) * 100 : 0}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6">
                                            <span className="text-xs text-[#6B7280] font-medium">
                                                {new Date(coupon.startDate).toLocaleDateString()} - {new Date(coupon.endDate).toLocaleDateString()}
                                            </span>
                                        </td>
                                        <td className="px-6">
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider",
                                                coupon.status === 'ACTIVE' ? "bg-[#22C55E]/10 text-[#22C55E]" :
                                                coupon.status === 'EXPIRED' ? "bg-[#94A3B8]/10 text-[#94A3B8]" :
                                                "bg-[#3B82F6]/10 text-[#3B82F6]"
                                            )}>
                                                {coupon.status}
                                            </span>
                                        </td>
                                        <td className="px-6 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => deleteCoupon(coupon.id)}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#EF4444] hover:bg-red-50 transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                <div 
                                                    onClick={() => toggleStatus(coupon.id)}
                                                    className={cn(
                                                        "w-10 h-5 rounded-full relative cursor-pointer transition-colors duration-300",
                                                        coupon.status === 'ACTIVE' ? "bg-[#22C55E]" : "bg-slate-300"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300",
                                                        coupon.status === 'ACTIVE' ? "left-[22px]" : "left-[2px]"
                                                    )} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Create Coupon Drawer */}
            <AnimatePresence>
                {isDrawerOpen && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsDrawerOpen(false)}
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                        />
                        <motion.div 
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 right-0 w-[480px] h-full bg-white z-50 shadow-2xl border-l border-[#E6EAF0] overflow-y-auto"
                        >
                            <div className="p-8 space-y-8">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-[20px] font-bold text-[#0F172A]">Create Coupon</h2>
                                        <p className="text-sm text-[#6B7280]">Setup new discount logic</p>
                                    </div>
                                    <button 
                                        onClick={() => setIsDrawerOpen(false)}
                                        className="w-10 h-10 rounded-xl bg-[#F8FAFC] flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">Coupon Code</label>
                                        <div className="relative">
                                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <input 
                                                type="text" 
                                                placeholder="e.g. SUMMER50"
                                                className="w-full h-12 pl-12 pr-4 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] transition-all font-bold tracking-widest"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">Discount Type</label>
                                            <select className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] transition-all text-sm appearance-none">
                                                <option>Percentage (%)</option>
                                                <option>Fixed Amount ($)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">Value</label>
                                            <input 
                                                type="number" 
                                                placeholder="20"
                                                className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] transition-all text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">Min. Order Value</label>
                                            <input 
                                                type="number" 
                                                placeholder="1000"
                                                className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] transition-all text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">Usage Limit</label>
                                            <input 
                                                type="number" 
                                                placeholder="500"
                                                className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] transition-all text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">Start Date</label>
                                            <input 
                                                type="date" 
                                                className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] transition-all text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">End Date</label>
                                            <input 
                                                type="date" 
                                                className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] transition-all text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">Apply To</label>
                                        <div className="space-y-2">
                                            {[
                                                { id: 'all', label: 'All Orders', desc: 'Apply to entire catalog' },
                                                { id: 'category', label: 'Specific Category', desc: 'Choose a primary category' },
                                                { id: 'sku', label: 'Specific SKUs', desc: 'Enter product IDs manually' }
                                            ].map((opt) => (
                                                <label key={opt.id} className={cn(
                                                    "flex items-center gap-4 p-4 border rounded-xl cursor-pointer transition-all group",
                                                    applyTo === opt.id ? "bg-[#00BFA6]/5 border-[#00BFA6]" : "bg-[#F8FAFC] border-[#E6EAF0] hover:border-[#00BFA6]/50"
                                                )}>
                                                    <input 
                                                        type="radio" 
                                                        name="applyTo" 
                                                        value={opt.id} 
                                                        checked={applyTo === opt.id}
                                                        onChange={() => setApplyTo(opt.id as any)}
                                                        className="w-4 h-4 text-[#00BFA6] focus:ring-[#00BFA6]" 
                                                    />
                                                    <div>
                                                        <p className="text-sm font-bold text-[#0F172A]">{opt.label}</p>
                                                        <p className="text-[11px] text-[#6B7280]">{opt.desc}</p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>

                                        {/* Conditional Inputs */}
                                        <AnimatePresence>
                                            {applyTo === 'category' && (
                                                <motion.div 
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="space-y-2 pt-2"
                                                >
                                                    <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Select Category</label>
                                                    <select className="w-full h-11 px-4 bg-white border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] text-sm appearance-none">
                                                        <option>Electronics</option>
                                                        <option>Fashion</option>
                                                        <option>Home & Living</option>
                                                        <option>Automotive</option>
                                                    </select>
                                                </motion.div>
                                            )}
                                            {applyTo === 'sku' && (
                                                <motion.div 
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="space-y-2 pt-2"
                                                >
                                                    <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Select Product (SKU)</label>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                        <input 
                                                            type="text" 
                                                            placeholder="Search products by name or SKU..."
                                                            className="w-full h-11 pl-10 pr-4 bg-white border border-[#E6EAF0] rounded-xl outline-none focus:border-[#00BFA6] text-sm"
                                                        />
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-[#E6EAF0] flex gap-3">
                                    <button 
                                        onClick={() => setIsDrawerOpen(false)}
                                        className="flex-1 h-12 rounded-xl bg-white border border-[#E6EAF0] text-sm font-bold text-[#6B7280] hover:bg-[#F8FAFC] transition-all"
                                    >
                                        Discard
                                    </button>
                                    <button className="flex-2 px-8 h-12 rounded-xl bg-[#00BFA6] text-white text-sm font-bold shadow-lg shadow-[#00BFA6]/20 hover:bg-[#00A892] transition-all active:scale-95">
                                        Publish Coupon
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
