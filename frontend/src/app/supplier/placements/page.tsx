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
                    <h1 className="text-3xl font-black text-white tracking-tight">Visibility Booster</h1>
                    <p className="text-white/40 font-medium">Request premium placements for your products to increase sales.</p>
                </div>

                <button
                    onClick={() => setIsFormOpen(true)}
                    className="h-12 px-6 bg-primary text-[#131921] font-black text-sm rounded-xl hover:scale-105 transition-transform shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                    <Plus size={18} strokeWidth={3} /> New Placement Request
                </button>
            </div>

            {/* Pricing Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(SLOT_PRICES).map(([slot, price]) => (
                    <div key={slot} className="bg-[#131921] border border-white/5 p-6 rounded-2xl space-y-2">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{slot} SLOT</p>
                        <p className="text-2xl font-black text-white">${price}<span className="text-xs text-white/20 font-medium ms-2">per week</span></p>
                        <p className="text-xs text-white/40 font-medium italic">Maximized visibility on homepage.</p>
                    </div>
                ))}
            </div>

            {/* Requests Table */}
            <div className="bg-[#131921] border border-white/5 rounded-3xl overflow-hidden">
                <div className="p-8 border-b border-white/5">
                    <h2 className="text-xl font-black text-white tracking-tight">Request History</h2>
                </div>
                {requests.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-start border-collapse">
                            <thead>
                                <tr className="bg-white/20">
                                    <th className="px-8 py-4 text-[10px] font-black text-white/40 uppercase tracking-widest">Request ID</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-white/40 uppercase tracking-widest">Product</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-white/40 uppercase tracking-widest">Slot Type</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-white/40 uppercase tracking-widest">Duration</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-white/40 uppercase tracking-widest">Status</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-end">Requested</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {requests.map((req) => (
                                    <tr key={req.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-8 py-6">
                                            <span className="text-xs font-black text-primary">{req.id}</span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">{req.product}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                <span className="text-xs font-black text-white/80">{req.slot}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className="text-xs font-bold text-white/60">{req.duration}</span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                                                req.status === 'APPROVED' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                                    req.status === 'PENDING' ? "bg-amber-400/10 text-amber-400 border-amber-400/20" :
                                                        "bg-red-500/10 text-red-500 border-red-500/20"
                                            )}>
                                                {req.status === 'APPROVED' ? <CheckCircle size={10} /> : req.status === 'PENDING' ? <Clock size={10} /> : <XCircle size={10} />}
                                                {req.status}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-end">
                                            <span className="text-[11px] font-medium text-white/20 whitespace-nowrap">{req.requestedAt}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-20 text-center space-y-4">
                        <LayoutList className="mx-auto text-white/10" size={64} />
                        <p className="text-white/30 font-bold uppercase tracking-widest text-sm">No Active Requests</p>
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
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-[#131921] w-full max-w-xl rounded-3xl border border-white/10 overflow-hidden shadow-3xl p-8 space-y-8"
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-black text-white tracking-tight">Request Placement</h2>
                                <button type="button" onClick={() => setIsFormOpen(false)} className="text-white/40 hover:text-white transition-colors">
                                    <XCircle size={24} />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-white/30 uppercase tracking-widest">Select Product</label>
                                    <select
                                        value={formData.product}
                                        onChange={e => setFormData({ ...formData, product: e.target.value })}
                                        className="w-full h-14 bg-white/5 rounded-xl border border-white/5 px-6 outline-none focus:border-primary/50 text-white font-medium appearance-none"
                                    >
                                        {myProducts.slice(0, 10).map(p => (
                                            <option key={p.id} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-white/30 uppercase tracking-widest">Placement Slot</label>
                                        <select
                                            value={formData.slot}
                                            onChange={e => setFormData({ ...formData, slot: e.target.value as 'HERO' | 'FEATURED' | 'BANNER' })}
                                            className="w-full h-14 bg-white/5 rounded-xl border border-white/5 px-6 outline-none focus:border-primary/50 text-white font-medium appearance-none"
                                        >
                                            <option value="HERO">Hero Slot</option>
                                            <option value="FEATURED">Featured Slot</option>
                                            <option value="BANNER">Footer Banner</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-white/30 uppercase tracking-widest">Duration</label>
                                        <select
                                            value={formData.duration}
                                            onChange={e => setFormData({ ...formData, duration: e.target.value })}
                                            className="w-full h-14 bg-white/5 rounded-xl border border-white/5 px-6 outline-none focus:border-primary/50 text-white font-medium appearance-none"
                                        >
                                            <option value="7 Days">7 Days</option>
                                            <option value="14 Days">14 Days</option>
                                            <option value="30 Days">30 Days</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/20 flex items-start gap-4">
                                    <Info className="text-primary mt-1" size={20} />
                                    <div className="space-y-1">
                                        <p className="text-sm font-black text-white">Estimated Cost: ${SLOT_PRICES[formData.slot]}</p>
                                        <p className="text-[10px] text-white/40 font-medium">Payment will be deducted from your next settlement upon approval.</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full h-14 bg-primary text-[#131921] font-black rounded-xl shadow-xl shadow-primary/10 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                            >
                                <Send size={18} /> Submit Request
                            </button>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
