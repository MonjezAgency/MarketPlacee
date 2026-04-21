'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutList, Send, Clock, CheckCircle, XCircle, AlertCircle, Plus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Product } from '@/lib/types';
import { fetchProducts } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface PlacementRequest {
    id: string;
    slot: 'HERO' | 'FEATURED' | 'BANNER';
    product: string;
    duration: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt: string;
}

const SLOT_PRICES = {
    'HERO': 500,
    'FEATURED': 300,
    'BANNER': 200
};

export default function SupplierPlacementsPage() {
    const { user } = useAuth();
    const [requests, setRequests] = React.useState<PlacementRequest[]>([
        { id: 'REQ-01', slot: 'HERO', product: 'Coca-Cola Case', duration: '7 Days', status: 'APPROVED', requestedAt: '2026-02-15' },
        { id: 'REQ-02', slot: 'FEATURED', product: 'Pepsi Bulk', duration: '14 Days', status: 'PENDING', requestedAt: '2026-02-20' },
    ]);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [formData, setFormData] = React.useState({
        slot: 'HERO' as 'HERO' | 'FEATURED' | 'BANNER',
        product: '',
        duration: '7 Days'
    });
    const [myProducts, setMyProducts] = React.useState<Product[]>([]);

    React.useEffect(() => {
        fetchProducts().then(data => {
            setMyProducts(data);
            if (data.length > 0) {
                setFormData(prev => ({ ...prev, product: data[0].name }));
            }
        });
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newReq: PlacementRequest = {
            id: `REQ-${Math.floor(Math.random() * 1000)}`,
            ...formData,
            status: 'PENDING',
            requestedAt: new Date().toISOString().split('T')[0]
        };
        setRequests([newReq, ...requests]);
        setIsFormOpen(false);
    };

    return (
        <div className="space-y-10 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Visibility Booster</h1>
                    <p className="text-muted-foreground font-medium">Request premium placements for your products to increase sales.</p>
                </div>

                <button
                    onClick={() => setIsFormOpen(true)}
                    className="h-12 px-6 bg-primary text-primary-foreground font-black text-sm rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap flex items-center justify-center gap-2"
                >
                    <Plus size={18} strokeWidth={2.5} /> New Placement Request
                </button>
            </div>

            {/* Pricing Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(SLOT_PRICES).map(([slot, price]) => (
                    <div key={slot} className="bg-card border border-border p-6 rounded-2xl flex flex-col justify-between">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-3">{slot} SLOT</p>
                        <p className="text-3xl font-black text-foreground">${price}<span className="text-xs text-muted-foreground tracking-normal font-medium ms-2">per week</span></p>
                        <p className="text-xs text-muted-foreground font-medium mt-2">Maximized visibility on homepage.</p>
                    </div>
                ))}
            </div>

            {/* Requests Table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border bg-accent/5">
                    <h2 className="text-lg font-black text-foreground tracking-tight">Request History</h2>
                </div>
                {requests.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-start border-collapse">
                            <thead>
                                <tr className="bg-muted/30">
                                    <th className="px-6 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-start whitespace-nowrap">Request ID</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-start whitespace-nowrap">Product</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-start whitespace-nowrap">Slot Type</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-start whitespace-nowrap">Duration</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-start whitespace-nowrap">Status</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-end whitespace-nowrap">Requested</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {requests.map((req) => (
                                    <tr key={req.id} className="hover:bg-muted/10 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-black text-primary">{req.id}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-foreground truncate max-w-[200px]">{req.product}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                                                <span className="text-xs font-bold text-muted-foreground">{req.slot}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-medium text-foreground">{req.duration}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                                                req.status === 'APPROVED' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                                                    req.status === 'PENDING' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                                                        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                                            )}>
                                                {req.status === 'APPROVED' ? <CheckCircle size={12} /> : req.status === 'PENDING' ? <Clock size={12} /> : <XCircle size={12} />}
                                                {req.status}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-end">
                                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{req.requestedAt}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-16 text-center space-y-3 bg-muted/5">
                        <LayoutList className="mx-auto text-muted-foreground opacity-50" size={48} />
                        <p className="text-muted-foreground font-bold text-sm">No Active Requests</p>
                    </div>
                )}
            </div>

            {/* Request Modal */}
            <AnimatePresence>
                {isFormOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6"
                    >
                        <motion.form
                            onSubmit={handleSubmit}
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-card w-full max-w-xl rounded-2xl border border-border overflow-hidden shadow-2xl p-8 space-y-6"
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-black text-foreground tracking-tight">Request Placement</h2>
                                <button type="button" onClick={() => setIsFormOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1 bg-muted/50 rounded-full">
                                    <XCircle size={20} />
                                </button>
                            </div>

                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Product</label>
                                    <select
                                        value={formData.product}
                                        onChange={e => setFormData({ ...formData, product: e.target.value })}
                                        className="w-full h-12 bg-background rounded-xl border border-border px-4 outline-none focus:border-primary/50 text-sm font-medium"
                                    >
                                        {myProducts.slice(0, 10).map(p => (
                                            <option key={p.id} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Placement Slot</label>
                                        <select
                                            value={formData.slot}
                                            onChange={e => setFormData({ ...formData, slot: e.target.value as 'HERO' | 'FEATURED' | 'BANNER' })}
                                            className="w-full h-12 bg-background rounded-xl border border-border px-4 outline-none focus:border-primary/50 text-sm font-medium"
                                        >
                                            <option value="HERO">Hero Slot</option>
                                            <option value="FEATURED">Featured Slot</option>
                                            <option value="BANNER">Footer Banner</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Duration</label>
                                        <select
                                            value={formData.duration}
                                            onChange={e => setFormData({ ...formData, duration: e.target.value })}
                                            className="w-full h-12 bg-background rounded-xl border border-border px-4 outline-none focus:border-primary/50 text-sm font-medium"
                                        >
                                            <option value="7 Days">7 Days</option>
                                            <option value="14 Days">14 Days</option>
                                            <option value="30 Days">30 Days</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 flex items-start gap-3">
                                    <Info className="text-primary shrink-0 mt-0.5" size={18} />
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-black text-foreground">Estimated Cost: ${SLOT_PRICES[formData.slot]}</p>
                                        <p className="text-xs text-muted-foreground font-medium">Payment will be deducted from your next settlement upon approval.</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl shadow-md hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                            >
                                <Send size={16} /> Submit Request
                            </button>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
