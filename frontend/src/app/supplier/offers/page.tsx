'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Tag,
    Plus,
    Layout,
    BarChart3,
    MoreHorizontal,
    Edit2,
    Pause,
    Play,
    Trash2,
    ChevronRight,
    Upload,
    Target,
    Settings,
    CheckCircle2,
    X,
    TrendingUp,
    MousePointer2,
    Eye,
    DollarSign,
    Info,
    Smartphone,
    Monitor
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import toast from 'react-hot-toast';

// Colors System
const COLORS = {
    primaryDark: '#0B1F3A',
    accentBlue: '#2EC4B6',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    background: '#F8FAFC',
    border: '#E5E7EB',
    textPrimary: '#0F172A',
    textSecondary: '#64748B'
};

// Mock Analytics Data
const ANALYTICS_DATA = [
    { name: 'Mon', impressions: 4000, clicks: 240, conversions: 24 },
    { name: 'Tue', impressions: 3000, clicks: 139, conversions: 18 },
    { name: 'Wed', impressions: 2000, clicks: 980, conversions: 50 },
    { name: 'Thu', impressions: 2780, clicks: 390, conversions: 35 },
    { name: 'Fri', impressions: 1890, clicks: 480, conversions: 42 },
    { name: 'Sat', impressions: 2390, clicks: 380, conversions: 30 },
    { name: 'Sun', impressions: 3490, clicks: 430, conversions: 38 },
];

const AD_TYPES = [
    {
        id: 'HERO',
        title: 'HERO',
        price: 500,
        description: 'Maximum visibility. Homepage hero placement.',
        color: '#2EC4B6',
        estimated: '45k'
    },
    {
        id: 'FEATURED',
        title: 'FEATURED',
        price: 300,
        description: 'Feature your products in search and category sections.',
        color: '#8B5CF6',
        estimated: '28k'
    },
    {
        id: 'BANNER',
        title: 'BANNER',
        price: 200,
        description: 'Display banner on footer and sidebar across pages.',
        color: '#F59E0B',
        estimated: '15k'
    },
    {
        id: 'LISTING',
        title: 'LISTING',
        price: 100,
        description: 'Highlight your products in specific categories.',
        color: '#EF4444',
        estimated: '10k'
    }
];

export default function OffersAndAdsPage() {
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [currentStep, setCurrentStep] = React.useState(1);
    const [campaigns, setCampaigns] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [selectedPlacement, setSelectedPlacement] = React.useState<string | null>(null);

    React.useEffect(() => {
        const loadData = async () => {
            try {
                const res = await apiFetch('/ads/my-ads');
                if (res.ok) {
                    const data = await res.json();
                    setCampaigns(data);
                }
            } catch (err) {
                console.error('Failed to load campaigns:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 5));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-[#2EC4B6]/10 pb-20">
            {/* 1. HEADER SECTION */}
            <header className="h-[88px] border-b border-[#E5E7EB] bg-white px-8 flex items-center justify-between sticky top-0 z-40">
                <div>
                    <h1 className="text-[32px] font-bold text-[#0F172A] leading-tight tracking-tight">Offers & Ad Placements</h1>
                    <p className="text-[14px] text-[#64748B] font-medium mt-1">Boost your visibility and reach enterprise buyers through optimized campaigns.</p>
                </div>
                <button 
                    onClick={() => {
                        setCurrentStep(1);
                        setIsModalOpen(true);
                    }}
                    className="h-12 px-6 bg-[#0B1F3A] text-white font-bold rounded-xl flex items-center gap-2 hover:bg-[#152D4F] transition-all active:scale-95 shadow-lg shadow-[#0B1F3A]/10"
                >
                    <Plus size={18} strokeWidth={3} /> Launch Campaign
                </button>
            </header>

            <div className="max-w-[1200px] mx-auto px-8 py-10 space-y-[48px]">
                
                {/* 2. OFFERS & ADS CARDS */}
                <section className="space-y-[24px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[24px]">
                        {AD_TYPES.map((type) => (
                            <motion.div
                                key={type.id}
                                whileHover={{ y: -4, boxShadow: '0 12px 30px rgba(0,0,0,0.06)' }}
                                className="bg-white border border-[#E5E7EB] rounded-[16px] p-[24px] h-[220px] flex flex-col group transition-all"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: type.color }} />
                                    <span className="text-[12px] font-bold text-[#64748B] uppercase tracking-widest">{type.title}</span>
                                </div>
                                <div className="mt-auto">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-bold text-[#0F172A]">${type.price}</span>
                                        <span className="text-[#64748B] text-[12px] font-medium">/ month</span>
                                    </div>
                                    <div className="h-px bg-[#E5E7EB] w-full my-[16px]" />
                                    <p className="text-[14px] text-[#64748B] leading-snug">{type.description}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* 3. PLACEMENT VISUAL MAP */}
                <section className="space-y-[16px]">
                    <h2 className="text-[20px] font-semibold text-[#0F172A]">Placement Preview</h2>
                    <div className="bg-[#F1F5F9] rounded-[16px] h-[320px] relative p-8 border border-[#E5E7EB] overflow-hidden group">
                        {/* Mock Wireframe */}
                        <div className="w-full h-full border-2 border-dashed border-[#E5E7EB] rounded-lg flex gap-4">
                            {/* Sidebar Wireframe */}
                            <div className="w-48 h-full bg-white/50 rounded-md border border-[#E5E7EB]/50 hidden md:block p-4 space-y-4">
                                <div className="h-4 w-2/3 bg-slate-200 rounded" />
                                <div className="h-4 w-1/2 bg-slate-200 rounded" />
                                <div className="h-24 w-full bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-md flex items-center justify-center relative cursor-help" title="Estimated impressions: 15k / week">
                                    <span className="text-[10px] font-bold text-[#F59E0B] uppercase">Banner</span>
                                </div>
                            </div>
                            {/* Main Content Wireframe */}
                            <div className="flex-1 space-y-4">
                                {/* Hero Wireframe */}
                                <div className="h-24 w-full bg-[#2EC4B6]/10 border border-[#2EC4B6]/20 rounded-md flex items-center justify-center relative cursor-help" title="Estimated impressions: 45k / week">
                                    <span className="text-[12px] font-bold text-[#2EC4B6] uppercase">Hero Ad Placement</span>
                                </div>
                                {/* Featured Row */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="h-32 bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 rounded-md flex items-center justify-center relative cursor-help" title="Estimated impressions: 28k / week">
                                        <span className="text-[10px] font-bold text-[#8B5CF6] uppercase">Featured</span>
                                    </div>
                                    <div className="h-32 bg-white rounded-md border border-[#E5E7EB]" />
                                    <div className="h-32 bg-white rounded-md border border-[#E5E7EB]" />
                                </div>
                                {/* Grid Row */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="h-32 bg-white rounded-md border border-[#E5E7EB]" />
                                    <div className="h-32 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-md flex items-center justify-center relative cursor-help" title="Estimated impressions: 10k / week">
                                        <span className="text-[10px] font-bold text-[#EF4444] uppercase">Listing</span>
                                    </div>
                                    <div className="h-32 bg-white rounded-md border border-[#E5E7EB]" />
                                </div>
                            </div>
                        </div>
                        {/* Interactive overlay instructions */}
                        <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-[12px] font-medium text-[#64748B] flex items-center gap-2">
                            <Info size={14} /> Hover over zones to see reach
                        </div>
                    </div>
                </section>

                {/* 4. ACTIVE CAMPAIGNS TABLE */}
                <section className="space-y-[16px]">
                    <h2 className="text-[20px] font-semibold text-[#0F172A]">Active Campaigns</h2>
                    <div className="bg-white border border-[#E5E7EB] rounded-[16px] overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] h-[48px]">
                                    <th className="px-8 text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Campaign Name</th>
                                    <th className="px-8 text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Placement Type</th>
                                    <th className="px-8 text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Budget</th>
                                    <th className="px-8 text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Status</th>
                                    <th className="px-8 text-[12px] font-bold text-[#64748B] uppercase tracking-wider">CTR</th>
                                    <th className="px-8 text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Impressions</th>
                                    <th className="px-8 text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E5E7EB]">
                                {campaigns.length > 0 ? campaigns.map((campaign) => (
                                    <tr key={campaign.id} className="h-[64px] hover:bg-slate-50 transition-colors group">
                                        <td className="px-8 font-semibold text-[#0F172A]">{campaign.product?.name || 'Spring Collection Boost'}</td>
                                        <td className="px-8">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6]" />
                                                <span className="text-[14px] font-medium text-[#64748B]">{campaign.placementType}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 font-medium text-[#0F172A]">${campaign.price || '500'}</td>
                                        <td className="px-8">
                                            <span className={cn(
                                                "px-3 py-1 rounded-full text-[12px] font-bold",
                                                campaign.status === 'ACTIVE' ? "bg-[#22C55E]/10 text-[#22C55E]" : 
                                                campaign.status === 'PENDING' ? "bg-slate-100 text-slate-500" : 
                                                "bg-[#3B82F6]/10 text-[#3B82F6]"
                                            )}>
                                                {campaign.status}
                                            </span>
                                        </td>
                                        <td className="px-8 text-[14px] font-medium text-[#0F172A]">2.4%</td>
                                        <td className="px-8 text-[14px] font-medium text-[#0F172A]">12,450</td>
                                        <td className="px-8">
                                            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button className="p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 rounded-lg transition-colors" title="Edit">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button className="p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 rounded-lg transition-colors" title="Pause">
                                                    <Pause size={16} />
                                                </button>
                                                <button className="p-2 text-[#64748B] hover:text-[#2EC4B6] hover:bg-[#2EC4B6]/10 rounded-lg transition-colors" title="View Analytics">
                                                    <BarChart3 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={7} className="px-8 py-12 text-center">
                                            <div className="flex flex-col items-center gap-3 opacity-50">
                                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                                                    <Layout size={24} className="text-[#64748B]" />
                                                </div>
                                                <p className="text-[14px] font-medium text-[#64748B]">No campaigns yet — launch your first campaign</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* 5. ANALYTICS SECTION */}
                <section className="space-y-[16px]">
                    <h2 className="text-[20px] font-semibold text-[#0F172A]">Campaign Performance Analytics</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-[24px]">
                        {/* Left: Performance Chart */}
                        <div className="lg:col-span-8 bg-white border border-[#E5E7EB] rounded-[16px] p-6 h-[380px] flex flex-col">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-[#2EC4B6]" />
                                        <span className="text-[12px] font-bold text-[#64748B] uppercase">Impressions</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                                        <span className="text-[12px] font-bold text-[#64748B] uppercase">Clicks</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                                        <span className="text-[12px] font-bold text-[#64748B] uppercase">Conversions</span>
                                    </div>
                                </div>
                                <select className="bg-slate-50 border border-[#E5E7EB] rounded-lg px-3 py-1 text-[12px] font-semibold text-[#64748B] outline-none">
                                    <option>Last 7 Days</option>
                                    <option>Last 30 Days</option>
                                </select>
                            </div>
                            <div className="flex-1 w-full min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={ANALYTICS_DATA} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorImp" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2EC4B6" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="#2EC4B6" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94A3B8'}} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94A3B8'}} />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }}
                                        />
                                        <Area type="monotone" dataKey="impressions" stroke="#2EC4B6" strokeWidth={3} fillOpacity={1} fill="url(#colorImp)" />
                                        <Area type="monotone" dataKey="clicks" stroke="#8B5CF6" strokeWidth={3} fill="transparent" />
                                        <Area type="monotone" dataKey="conversions" stroke="#F59E0B" strokeWidth={3} fill="transparent" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Right: KPI Cards */}
                        <div className="lg:col-span-4 space-y-[16px]">
                            {[
                                { label: 'Total Impressions', value: '142.8k', trend: '+12.5%', icon: Eye, color: '#2EC4B6' },
                                { label: 'Avg. CTR', value: '2.48%', trend: '+0.4%', icon: MousePointer2, color: '#8B5CF6' },
                                { label: 'Conversion Rate', value: '1.2%', trend: '-0.2%', icon: TrendingUp, color: '#F59E0B' },
                                { label: 'Total Spend', value: '$1,240', trend: 'Budget tracking', icon: DollarSign, color: '#0F172A' },
                            ].map((kpi) => (
                                <div key={kpi.label} className="bg-white border border-[#E5E7EB] rounded-[16px] p-[16px] h-[100px] flex items-center gap-4 group hover:border-[#2EC4B6]/30 transition-colors">
                                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center transition-colors group-hover:bg-[#2EC4B6]/10">
                                        <kpi.icon size={20} style={{ color: kpi.color }} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider leading-none mb-1">{kpi.label}</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[20px] font-bold text-[#0F172A]">{kpi.value}</span>
                                            <span className={cn(
                                                "text-[10px] font-bold",
                                                kpi.trend.startsWith('+') ? "text-[#22C55E]" : 
                                                kpi.trend.startsWith('-') ? "text-[#EF4444]" : "text-[#64748B]"
                                            )}>{kpi.trend}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>

            {/* 6. CAMPAIGN CREATION FLOW (MODAL) */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-[#0B1F3A]/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-[640px] rounded-[20px] overflow-hidden relative z-10 shadow-2xl"
                        >
                            {/* Modal Header */}
                            <div className="px-8 py-6 border-b border-[#E5E7EB] flex items-center justify-between">
                                <div>
                                    <h3 className="text-[20px] font-bold text-[#0F172A]">Launch New Campaign</h3>
                                    <div className="flex items-center gap-1 mt-1">
                                        {[1, 2, 3, 4, 5].map((step) => (
                                            <div 
                                                key={step} 
                                                className={cn(
                                                    "h-1 rounded-full transition-all duration-300",
                                                    step === currentStep ? "w-8 bg-[#2EC4B6]" : 
                                                    step < currentStep ? "w-4 bg-[#22C55E]" : "w-4 bg-slate-200"
                                                )} 
                                            />
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-[#64748B] transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-8 min-h-[400px]">
                                {currentStep === 1 && (
                                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                                        <div className="space-y-2">
                                            <h4 className="text-[16px] font-semibold text-[#0F172A]">Step 1: Select Placement Type</h4>
                                            <p className="text-[13px] text-[#64748B]">Choose where your ad will appear to maximize engagement.</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {AD_TYPES.map((type) => (
                                                <button
                                                    key={type.id}
                                                    onClick={() => setSelectedPlacement(type.id)}
                                                    className={cn(
                                                        "p-5 rounded-xl border text-left transition-all relative overflow-hidden group",
                                                        selectedPlacement === type.id 
                                                            ? "border-[#2EC4B6] bg-[#2EC4B6]/5 shadow-md shadow-[#2EC4B6]/10" 
                                                            : "border-[#E5E7EB] hover:border-[#2EC4B6]/30 hover:bg-slate-50"
                                                    )}
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                                        <Layout size={16} className={selectedPlacement === type.id ? "text-[#2EC4B6]" : "text-[#64748B]"} />
                                                    </div>
                                                    <p className="text-[14px] font-bold text-[#0F172A]">{type.title}</p>
                                                    <p className="text-[11px] font-medium text-[#64748B] mt-1 line-clamp-1">{type.description}</p>
                                                    <p className="text-[12px] font-bold text-[#0F172A] mt-3">${type.price} / mo</p>
                                                    {selectedPlacement === type.id && (
                                                        <div className="absolute top-2 right-2 text-[#2EC4B6]">
                                                            <CheckCircle2 size={16} />
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === 2 && (
                                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                                        <div className="space-y-2">
                                            <h4 className="text-[16px] font-semibold text-[#0F172A]">Step 2: Upload Creative</h4>
                                            <p className="text-[13px] text-[#64748B]">Ensure your visuals meet the dimension requirements for the selected slot.</p>
                                        </div>
                                        <div className="aspect-[16/7] border-2 border-dashed border-[#E5E7EB] rounded-2xl flex flex-col items-center justify-center bg-slate-50 group hover:bg-[#2EC4B6]/5 hover:border-[#2EC4B6]/30 transition-all cursor-pointer p-8 text-center">
                                            <div className="w-16 h-16 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                                                <Upload size={24} className="text-[#64748B] group-hover:text-[#2EC4B6]" />
                                            </div>
                                            <p className="text-[14px] font-bold text-[#0F172A]">Drag and drop your ad creative</p>
                                            <p className="text-[12px] text-[#64748B] mt-1">Recommended size: 1920x600px for Hero (JPG/PNG)</p>
                                            <button className="mt-6 px-6 py-2 bg-white border border-[#E5E7EB] rounded-lg text-[13px] font-bold text-[#0F172A] hover:border-[#2EC4B6] transition-colors">
                                                Browse Files
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3 p-4 bg-[#F59E0B]/10 rounded-xl border border-[#F59E0B]/20">
                                            <Info size={18} className="text-[#F59E0B]" />
                                            <p className="text-[12px] text-[#0F172A] leading-relaxed">
                                                <b>Pro-Tip:</b> Use high-contrast imagery with minimal text for maximum reach.
                                            </p>
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === 3 && (
                                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                                        <div className="space-y-2">
                                            <h4 className="text-[16px] font-semibold text-[#0F172A]">Step 3: Set Campaign Budget</h4>
                                            <p className="text-[13px] text-[#64748B]">Define how much you're willing to spend on this specific campaign.</p>
                                        </div>
                                        <div className="space-y-6">
                                            <div className="p-6 bg-slate-50 border border-[#E5E7EB] rounded-2xl">
                                                <div className="flex items-center justify-between mb-4">
                                                    <span className="text-[12px] font-bold text-[#64748B] uppercase">Placement Price</span>
                                                    <span className="text-[14px] font-bold text-[#0F172A]">$500.00</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[12px] font-bold text-[#64748B] uppercase">Additional Boost</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[12px] font-medium text-[#64748B]">$</span>
                                                        <input 
                                                            type="number" 
                                                            className="w-24 h-10 border border-[#E5E7EB] rounded-lg px-3 text-[14px] font-bold text-[#0F172A] outline-none focus:border-[#2EC4B6]"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="h-px bg-[#E5E7EB] my-4" />
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[14px] font-bold text-[#0F172A]">Total Monthly Budget</span>
                                                    <span className="text-[20px] font-black text-[#2EC4B6]">$500.00</span>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[12px] font-bold text-[#0F172A]">Daily Limit (Optional)</span>
                                                    <span className="text-[12px] font-medium text-[#64748B]">$16.67 / day</span>
                                                </div>
                                                <input type="range" className="w-full accent-[#2EC4B6]" />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === 4 && (
                                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                                        <div className="space-y-2">
                                            <h4 className="text-[16px] font-semibold text-[#0F172A]">Step 4: Precision Targeting</h4>
                                            <p className="text-[13px] text-[#64748B]">Reach the specific buyer segments most likely to convert.</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-3">
                                                <label className="text-[12px] font-bold text-[#0F172A] flex items-center gap-2">
                                                    <Target size={14} className="text-[#2EC4B6]" /> Business Category
                                                </label>
                                                <select className="w-full h-12 bg-white border border-[#E5E7EB] rounded-xl px-4 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#2EC4B6]">
                                                    <option>Industrial Equipment</option>
                                                    <option>Raw Materials</option>
                                                    <option>Supply Chain Solutions</option>
                                                    <option>Consumer Electronics (Wholesale)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[12px] font-bold text-[#0F172A] flex items-center gap-2">
                                                    <Target size={14} className="text-[#2EC4B6]" /> Region
                                                </label>
                                                <select className="w-full h-12 bg-white border border-[#E5E7EB] rounded-xl px-4 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#2EC4B6]">
                                                    <option>Middle East & Africa</option>
                                                    <option>Europe</option>
                                                    <option>North America</option>
                                                    <option>Asia Pacific</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[12px] font-bold text-[#0F172A]">Buyer Device Targeting</label>
                                            <div className="flex gap-4">
                                                <button className="flex-1 h-14 border border-[#2EC4B6] bg-[#2EC4B6]/5 rounded-xl flex items-center justify-center gap-3 text-[13px] font-bold text-[#0F172A]">
                                                    <Monitor size={18} className="text-[#2EC4B6]" /> Desktop
                                                </button>
                                                <button className="flex-1 h-14 border border-[#E5E7EB] bg-white rounded-xl flex items-center justify-center gap-3 text-[13px] font-bold text-[#64748B] hover:border-[#E5E7EB]">
                                                    <Smartphone size={18} /> Mobile
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === 5 && (
                                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                                        <div className="text-center space-y-4">
                                            <div className="w-20 h-20 bg-[#22C55E]/10 rounded-full flex items-center justify-center mx-auto shadow-sm">
                                                <CheckCircle2 size={40} className="text-[#22C55E]" />
                                            </div>
                                            <div className="space-y-1">
                                                <h4 className="text-[20px] font-bold text-[#0F172A]">Ready to Launch?</h4>
                                                <p className="text-[14px] text-[#64748B]">Review your campaign details before activation.</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-[#E5E7EB] rounded-2xl overflow-hidden divide-y divide-[#E5E7EB]">
                                            <div className="px-6 py-4 flex justify-between">
                                                <span className="text-[12px] font-bold text-[#64748B] uppercase">Campaign</span>
                                                <span className="text-[13px] font-bold text-[#0F172A]">Industrial Supply Hero Ad</span>
                                            </div>
                                            <div className="px-6 py-4 flex justify-between">
                                                <span className="text-[12px] font-bold text-[#64748B] uppercase">Placement</span>
                                                <span className="text-[13px] font-bold text-[#0F172A]">Hero (Homepage)</span>
                                            </div>
                                            <div className="px-6 py-4 flex justify-between">
                                                <span className="text-[12px] font-bold text-[#64748B] uppercase">Budget</span>
                                                <span className="text-[13px] font-bold text-[#2EC4B6]">$500.00 / month</span>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-center text-[#64748B]">
                                            By clicking Launch, you agree to Atlantis's Advertising Terms of Service.
                                        </p>
                                    </motion.div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="px-8 py-6 bg-slate-50 border-t border-[#E5E7EB] flex items-center justify-between">
                                <button 
                                    onClick={prevStep}
                                    disabled={currentStep === 1}
                                    className="px-6 py-2.5 font-bold text-[14px] text-[#64748B] hover:text-[#0F172A] disabled:opacity-30 transition-colors"
                                >
                                    {currentStep === 1 ? 'Cancel' : 'Back'}
                                </button>
                                <button 
                                    onClick={currentStep === 5 ? () => setIsModalOpen(false) : nextStep}
                                    className="h-12 px-10 bg-[#0B1F3A] text-white font-bold rounded-xl flex items-center gap-2 hover:bg-[#152D4F] transition-all shadow-lg shadow-[#0B1F3A]/10"
                                >
                                    {currentStep === 5 ? 'Activate Campaign' : 'Next Step'} <ChevronRight size={18} />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
