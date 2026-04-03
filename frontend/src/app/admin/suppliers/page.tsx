'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Package, Search, Building2, ShieldCheck, X, 
    Mail, Phone, Globe, Link as LinkIcon, 
    MoreVertical, ChevronRight, Briefcase, 
    Users, Verified, ShieldAlert, Activity,
    Calendar, ArrowUpRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Supplier {
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

export default function AdminSuppliersPage() {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedSupplier, setSelectedSupplier] = React.useState<Supplier | null>(null);
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState<'ALL' | 'ACTIVE' | 'PENDING'>('ALL');

    const loadSuppliers = async () => {
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data.filter((u: any) => u.role === 'SUPPLIER'));
            }
        } catch (err) {
            console.error("Failed to load suppliers:", err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadSuppliers();
        const interval = setInterval(loadSuppliers, 15000);
        return () => clearInterval(interval);
    }, []);

    const filteredSuppliers = suppliers.filter(s => {
        const matchesSearch = (s.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (s.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (s.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        
        const matchesTab = activeTab === 'ALL' ? true : 
                          activeTab === 'ACTIVE' ? s.status === 'ACTIVE' : 
                          s.status === 'PENDING_APPROVAL';
        
        return matchesSearch && matchesTab;
    });

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black text-foreground tracking-tighter uppercase leading-none">Vendor Network</h1>
                    <p className="text-muted-foreground font-black text-[11px] uppercase tracking-[0.4em] opacity-70">Supply Chain Integrity & Enterprise Partners</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute start-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Identify supplier by name or entity..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-16 ps-16 pe-8 bg-card rounded-[2rem] border border-border/50 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground font-bold text-sm min-w-[350px] transition-all shadow-xl"
                        />
                    </div>
                </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card-strong p-8 overflow-hidden relative group">
                    <div className="absolute top-0 end-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><Building2 size={120} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Partnerships</p>
                    <h2 className="text-5xl font-black tracking-tighter">{suppliers.length}</h2>
                    <div className="flex items-center gap-2 mt-4 text-primary font-black text-[10px] uppercase tracking-widest">
                        <ArrowUpRight size={14} /> Global Supply Nodes
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-emerald-500">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Compliance Verified</p>
                    <h2 className="text-5xl font-black tracking-tighter text-emerald-500">{suppliers.filter(s => s.status === 'ACTIVE').length}</h2>
                    <div className="flex items-center gap-2 mt-4 text-emerald-500 font-black text-[10px] uppercase tracking-widest">
                        <ShieldCheck size={14} /> Active Protocols
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-amber-500">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Approval Velocity</p>
                    <h2 className="text-5xl font-black tracking-tighter text-amber-500">{suppliers.filter(s => s.status === 'PENDING_APPROVAL').length}</h2>
                    <div className="flex items-center gap-2 mt-4 text-amber-500 font-black text-[10px] uppercase tracking-widest">
                        <Activity size={14} /> Critical items pending
                    </div>
                </div>
            </div>

            {/* Navigation Filter */}
            <div className="flex items-center gap-3 p-2 glass rounded-[2.5rem] w-fit shadow-2xl">
                {[
                    { id: 'ALL', label: 'Entire Network', icon: Users },
                    { id: 'ACTIVE', label: 'Verified Status', icon: Verified },
                    { id: 'PENDING', label: 'Verification Queue', icon: ShieldAlert },
                ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as 'ALL' | 'ACTIVE' | 'PENDING')}
                            className={cn(
                                "flex items-center gap-3 px-8 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.1em] transition-all",
                                activeTab === tab.id
                                    ? "bg-primary text-primary-foreground shadow-xl shadow-primary/30"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            )}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Supplier Elite Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <AnimatePresence mode="popLayout">
                    {filteredSuppliers.map((supplier, i) => (
                        <motion.div
                            key={supplier.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: i * 0.05 }}
                            className="glass-card-strong p-8 group transition-all hover:-translate-y-2 hover:shadow-[0_20px_60px_rgba(0,0,0,0.3)] border-primary/10 hover:border-primary/30 cursor-pointer overflow-hidden relative"
                            onClick={() => setSelectedSupplier(supplier)}
                        >
                            <div className="absolute top-0 end-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Briefcase size={80} className="rotate-12" />
                            </div>
                            
                            <div className="flex justify-between items-start mb-8 relative z-10">
                                <div className="relative group-hover:scale-110 transition-transform duration-500">
                                    <div className="absolute -inset-2 bg-primary blur-xl opacity-20 group-hover:opacity-40 animate-pulse rounded-full" />
                                    {supplier.avatar ? (
                                        <img src={supplier.avatar} className="w-16 h-16 rounded-2xl object-cover relative z-10 border-2 border-card" alt={supplier.name} />
                                    ) : (
                                        <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center text-2xl font-black text-primary relative z-10 border-2 border-card uppercase">
                                            {supplier.name[0]}
                                        </div>
                                    )}
                                </div>
                                <div className={cn(
                                    "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-lg",
                                    supplier.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                )}>
                                    {supplier.status === 'ACTIVE' ? 'Verified' : 'Pending'}
                                </div>
                            </div>

                            <div className="space-y-6 relative z-10">
                                <div>
                                    <h3 className="text-2xl font-black text-foreground group-hover:text-primary transition-colors tracking-tighter leading-none mb-2">{supplier.name}</h3>
                                    <p className="text-[11px] text-muted-foreground font-black uppercase tracking-widest opacity-60 flex items-center gap-1">
                                        <Mail size={10} /> {supplier.email}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-6 border-y border-border/10">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Entity Unit</p>
                                        <p className="text-sm font-black text-foreground truncate">{supplier.companyName || 'Private Partner'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Phone Link</p>
                                        <p className="text-sm font-black text-foreground">{supplier.phone || 'Registry Missing'}</p>
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

            {/* Deep Layered Profile Modal */}
            <AnimatePresence>
                {selectedSupplier && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setSelectedSupplier(null)} className="absolute inset-0 bg-background/80 backdrop-blur-3xl" />
                        
                        <motion.div 
                            initial={{ scale: 0.9, y: 50, opacity: 0 }} 
                            animate={{ scale: 1, y: 0, opacity: 1 }} 
                            exit={{ scale: 0.9, y: 50, opacity: 0 }}
                            className="glass-card-strong w-full max-w-4xl relative z-10 overflow-hidden flex flex-col md:flex-row h-[750px] shadow-[0_0_120px_rgba(0,0,0,0.6)] border-primary/20"
                        >
                            {/* Left Side: Partner Identity */}
                            <div className="w-full md:w-[40%] bg-primary/5 p-12 flex flex-col items-center justify-center text-center space-y-8 border-e border-border/10">
                                <div className="relative">
                                    <div className="absolute -inset-4 bg-gradient-to-tr from-primary to-secondary opacity-30 blur-2xl rounded-full" />
                                    {selectedSupplier.avatar ? (
                                        <img src={selectedSupplier.avatar} className="w-44 h-44 rounded-[3.5rem] object-cover relative z-10 border-4 border-card shadow-2xl" />
                                    ) : (
                                        <div className="w-44 h-44 rounded-[3.5rem] bg-card flex items-center justify-center text-7xl font-black text-primary relative z-10 border-4 border-card shadow-2xl uppercase">
                                            {selectedSupplier.name[0]}
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-4xl font-black uppercase tracking-tighter leading-none">{selectedSupplier.name}</h2>
                                    <div className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                                        <ShieldCheck size={14} /> Registered Partner
                                    </div>
                                </div>
                                <div className="w-full space-y-4 pt-10 border-t border-border/10">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Network ID</p>
                                        <p className="text-xs font-black uppercase tracking-tighter">AT-SP-{selectedSupplier.id.substring(0, 8).toUpperCase()}</p>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Registry Date</p>
                                        <p className="text-xs font-black tracking-tighter">{new Date(selectedSupplier.createdAt).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: Operational Records */}
                            <div className="flex-1 p-12 flex flex-col h-full bg-card/10 overflow-y-auto">
                                <div className="flex-1 space-y-12">
                                    <section className="space-y-8">
                                        <h3 className="text-sm font-black uppercase tracking-[0.3em] flex items-center gap-3 border-b border-border/10 pb-6 whitespace-nowrap">
                                            <Globe className="text-primary" /> Global Contact Profile
                                        </h3>
                                        <div className="grid grid-cols-1 gap-6">
                                            <div className="glass p-6 rounded-3xl flex items-center gap-6 group hover:border-primary/20 transition-all">
                                                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                                    <Mail size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Corporate Email</p>
                                                    <p className="text-lg font-black">{selectedSupplier.email}</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-6">
                                                <div className="glass p-6 rounded-3xl group hover:border-primary/20 transition-all">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Entity Unit</p>
                                                    <p className="text-base font-black truncate">{selectedSupplier.companyName || 'Private Partner'}</p>
                                                </div>
                                                <div className="glass p-6 rounded-3xl group hover:border-primary/20 transition-all">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Direct Line</p>
                                                    <p className="text-base font-black truncate">{selectedSupplier.phone || 'Unverified'}</p>
                                                </div>
                                            </div>
                                            {selectedSupplier.website && (
                                                <a href={selectedSupplier.website} target="_blank" className="glass p-6 rounded-3xl flex items-center justify-between group hover:border-primary transition-all">
                                                    <div className="flex items-center gap-6">
                                                        <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                                            <Globe size={24} />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Digital Presence</p>
                                                            <p className="text-base font-black">{selectedSupplier.website}</p>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="text-primary group-hover:translate-x-2 transition-transform" />
                                                </a>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                <div className="pt-12 mt-12 border-t border-border/20 flex gap-6">
                                    <button className="h-20 flex-1 flex items-center justify-center gap-4 rounded-[2rem] border-2 border-border/20 text-muted-foreground font-black uppercase text-xs tracking-[0.2em] hover:bg-muted hover:text-foreground transition-all">
                                        Suspend Partner
                                    </button>
                                    <button className="h-20 flex-1 flex items-center justify-center gap-4 rounded-[2rem] bg-primary text-white font-black uppercase text-xs tracking-[0.3em] hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-primary/30">
                                        Manage Integration
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setSelectedSupplier(null)} className="absolute top-8 end-8 w-14 h-14 glass rounded-full flex items-center justify-center hover:rotate-90 transition-transform duration-500">
                                <X size={28} />
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
