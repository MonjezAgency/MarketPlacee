'use client';
import { apiFetch } from '@/lib/api';


import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, Building2, UserCircle2, Mail, 
    Download, MoreVertical, X, Shield, 
    CircleDollarSign, Phone, Globe, Link as LinkIcon,
    ChevronRight, ArrowUpRight, Users, Verified,
    ShieldAlert, Activity, CreditCard, Landmark
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Buyer {
    id: string;
    name: string;
    email: string;
    phone?: string;
    companyName?: string;
    website?: string;
    socialLinks?: string;
    avatar?: string;
    status: string;
    role: string;
    createdAt: string;
}

export default function AdminBuyersPage() {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedBuyer, setSelectedBuyer] = React.useState<Buyer | null>(null);
    const [buyers, setBuyers] = React.useState<Buyer[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState<'ALL' | 'ACTIVE' | 'PENDING'>('ALL');

    const loadBuyers = async () => {
        try {
            
            const res = await apiFetch('/users', {
            });
            if (res.ok) {
                const result = await res.json();
                const usersData = Array.isArray(result) ? result : (result.users || []);
                setBuyers(usersData.filter((u: any) => u.role === 'CUSTOMER'));
            }
        } catch (err) {
            console.error("Failed to load buyers:", err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadBuyers();
        const interval = setInterval(loadBuyers, 15000);
        return () => clearInterval(interval);
    }, []);

    const filteredBuyers = buyers.filter(b => {
        const matchesSearch = (b.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (b.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (b.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        
        const matchesTab = activeTab === 'ALL' ? true : 
                          activeTab === 'ACTIVE' ? b.status === 'ACTIVE' : 
                          b.status === 'PENDING_APPROVAL';
        
        return matchesSearch && matchesTab;
    });

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {/* Elite Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black text-foreground tracking-tighter uppercase leading-none">Procurement Hub</h1>
                    <p className="text-muted-foreground font-black text-[11px] uppercase tracking-[0.4em] opacity-70">Corporate Accounts & Institutional Buyers</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute start-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Identify buyer or corporate entity..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-16 ps-16 pe-8 bg-card rounded-[2rem] border border-border/50 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground font-bold text-sm min-w-[350px] transition-all shadow-xl"
                        />
                    </div>
                </div>
            </div>

            {/* Network Vital Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card-strong p-8 overflow-hidden relative group">
                    <div className="absolute top-0 end-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><Landmark size={120} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Corporate Registries</p>
                    <h2 className="text-5xl font-black tracking-tighter">{buyers.length}</h2>
                    <div className="flex items-center gap-2 mt-4 text-primary font-black text-[10px] uppercase tracking-widest">
                        <ArrowUpRight size={14} /> Global Procurement Units
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-emerald-500">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Active Buying Power</p>
                    <h2 className="text-5xl font-black tracking-tighter text-emerald-500">{buyers.filter(b => b.status === 'ACTIVE').length}</h2>
                    <div className="flex items-center gap-2 mt-4 text-emerald-500 font-black text-[10px] uppercase tracking-widest">
                        <Verified size={14} /> Verified Institutional Capital
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-amber-500">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Verification Backlog</p>
                    <h2 className="text-5xl font-black tracking-tighter text-amber-500">{buyers.filter(b => b.status === 'PENDING_APPROVAL').length}</h2>
                    <div className="flex items-center gap-2 mt-4 text-amber-500 font-black text-[10px] uppercase tracking-widest">
                        <Activity size={14} /> Critical items pending
                    </div>
                </div>
            </div>

            {/* Segment Controller */}
            <div className="flex items-center gap-3 p-2 glass rounded-[2.5rem] w-fit shadow-2xl">
                {[
                    { id: 'ALL', label: 'Global Directory', icon: Users },
                    { id: 'ACTIVE', label: 'Verified Partners', icon: Shield },
                    { id: 'PENDING', label: 'Vetting Area', icon: ShieldAlert },
                ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as 'ALL' | 'ACTIVE' | 'PENDING')}
                            className={cn(
                                "flex items-center gap-3 px-8 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.1em] transition-all",
                                activeTab === tab.id
                                    ? "bg-primary text-primary-foreground shadow-xl shadow-primary/30 scale-105"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            )}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Buyer Elite Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <AnimatePresence mode="popLayout">
                    {filteredBuyers.map((buyer, i) => (
                        <motion.div
                            key={buyer.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: i * 0.05 }}
                            className="glass-card-strong p-8 group transition-all hover:-translate-y-2 hover:shadow-[0_20px_60px_rgba(0,0,0,0.3)] border-primary/10 hover:border-primary/30 cursor-pointer overflow-hidden relative"
                            onClick={() => setSelectedBuyer(buyer)}
                        >
                            <div className="absolute top-0 end-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <CreditCard size={80} className="-rotate-12" />
                            </div>
                            
                            <div className="flex justify-between items-start mb-8 relative z-10">
                                <div className="relative group-hover:scale-110 transition-transform duration-500">
                                    <div className="absolute -inset-2 bg-primary blur-xl opacity-20 group-hover:opacity-40 animate-pulse rounded-full" />
                                    {buyer.avatar ? (
                                        <img src={buyer.avatar} className="w-16 h-16 rounded-2xl object-cover relative z-10 border-2 border-card" alt={buyer.name} />
                                    ) : (
                                        <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center text-2xl font-black text-primary relative z-10 border-2 border-card uppercase">
                                            {buyer.name[0]}
                                        </div>
                                    )}
                                </div>
                                <div className={cn(
                                    "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-lg",
                                    buyer.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                )}>
                                    {buyer.status === 'ACTIVE' ? 'Verified' : 'Pending'}
                                </div>
                            </div>

                            <div className="space-y-6 relative z-10">
                                <div>
                                    <h3 className="text-2xl font-black text-foreground group-hover:text-primary transition-colors tracking-tighter leading-none mb-2">{buyer.name}</h3>
                                    <p className="text-[11px] text-muted-foreground font-black uppercase tracking-widest opacity-60 flex items-center gap-1">
                                        <Mail size={10} /> {buyer.email}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-6 border-y border-border/10">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Entity Corp</p>
                                        <p className="text-sm font-black text-foreground truncate">{buyer.companyName || 'Institutional'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Registry ID</p>
                                        <p className="text-sm font-black text-foreground">{buyer.id.substring(0, 8).toUpperCase()}</p>
                                    </div>
                                </div>

                                <button className="w-full h-14 glass rounded-2xl font-black text-[10px] uppercase tracking-widest group-hover:bg-primary group-hover:text-white transition-all flex items-center justify-center gap-3">
                                    Entity Dossier <ChevronRight size={16} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Institutional Side-Drawer */}
            <AnimatePresence>
                {selectedBuyer && (
                    <div className="fixed inset-0 z-[200] flex justify-end">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setSelectedBuyer(null)} className="absolute inset-0 bg-background/60 backdrop-blur-3xl" />
                        
                        <motion.div 
                            initial={{ x: '100%' }} 
                            animate={{ x: 0 }} 
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="bg-card w-full max-w-xl h-full relative z-10 border-s border-primary/20 shadow-[-50px_0_100px_rgba(0,0,0,0.5)] overflow-y-auto no-scrollbar flex flex-col"
                        >
                            <div className="p-12 space-y-12">
                                <div className="flex justify-between items-start">
                                    <div className="relative">
                                        <div className="absolute -inset-4 bg-primary blur-2xl opacity-20 rounded-full" />
                                        {selectedBuyer.avatar ? (
                                            <img src={selectedBuyer.avatar} className="w-32 h-32 rounded-[2.5rem] object-cover relative z-10 border-4 border-card shadow-2xl" />
                                        ) : (
                                            <div className="w-32 h-32 rounded-[2.5rem] bg-card flex items-center justify-center text-4xl font-black text-primary relative z-10 border-4 border-card shadow-2xl uppercase">
                                                {selectedBuyer.name[0]}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setSelectedBuyer(null)} className="w-14 h-14 glass rounded-full flex items-center justify-center hover:rotate-90 transition-transform duration-500">
                                        <X size={28} />
                                    </button>
                                </div>

                                <div>
                                    <h2 className="text-4xl font-black uppercase tracking-tighter leading-none mb-3">{selectedBuyer.name}</h2>
                                    <div className="flex gap-3">
                                        <div className="px-5 py-2 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest italic">
                                            Institutional Buyer
                                        </div>
                                        <div className={cn(
                                            "px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                            selectedBuyer.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        )}>
                                            {selectedBuyer.status}
                                        </div>
                                    </div>
                                </div>

                                <section className="space-y-6">
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-3">
                                        <Globe size={16} className="text-primary" /> Corporate Identity
                                    </h3>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="glass p-8 rounded-3xl border-s-4 border-primary">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Registered Entity</p>
                                            <p className="text-xl font-black">{selectedBuyer.companyName || 'Institutional Account'}</p>
                                        </div>
                                        <div className="glass p-8 rounded-3xl">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Corporate Core Email</p>
                                            <p className="text-xl font-black">{selectedBuyer.email}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="glass p-8 rounded-3xl">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Contact Line</p>
                                                <p className="text-lg font-black">{selectedBuyer.phone || 'N/A'}</p>
                                            </div>
                                            <div className="glass p-8 rounded-3xl">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Joined Network</p>
                                                <p className="text-lg font-black">{new Date(selectedBuyer.createdAt).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <div className="pt-12 mt-12 border-t border-border/10 flex flex-col gap-4">
                                    <button className="h-20 w-full flex items-center justify-center gap-4 rounded-[2rem] bg-primary text-white font-black uppercase text-xs tracking-[0.3em] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-primary/40">
                                        Modify Entity Permissions
                                    </button>
                                    <button className="h-20 w-full flex items-center justify-center gap-4 rounded-[2rem] border-2 border-red-500/20 text-red-500 font-black uppercase text-xs tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all">
                                        Freeze Corporate Assets
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
