'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, Plus, Search, Ticket, Trash2, Box, Calendar } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface Coupon {
    id: string;
    code: string;
    discountPercent: number;
    expirationDate: string;
    isActive: boolean;
    placement: {
        id: string;
        product: {
            name: string;
        }
    };
    createdAt: string;
}

export default function AdminCouponsPage() {
    const router = useRouter();
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchCoupons = async () => {
            try {
                const token = localStorage.getItem('bev-token');
                if (!token) return;

                const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/coupons', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setCoupons(data);
                }
            } catch (err) {
                console.error("Failed to fetch coupons:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCoupons();
    }, []);

    const filtered = coupons.filter(c => c.code.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-10 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <div>
                        <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
                            <Ticket className="text-secondary w-8 h-8" />
                            Coupons Management
                        </h1>
                        <p className="text-muted-foreground font-medium mt-1">Generate and monitor promotional codes attached to active Offers.</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-secondary transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Search by code..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-12 ps-12 pe-6 bg-card rounded-xl border border-border/50 outline-none focus:border-secondary/50 text-foreground text-sm w-[250px] transition-all shadow-sm"
                        />
                    </div>

                    <Link href="/admin/coupons/new" className="h-12 px-6 bg-secondary text-secondary-foreground font-black text-sm rounded-xl hover:scale-105 transition-transform shadow-lg shadow-secondary/20 flex items-center gap-2">
                        <Plus size={18} strokeWidth={3} /> Create Coupon
                    </Link>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-12 h-12 rounded-full border-4 border-border/50 border-t-secondary animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-card border border-border/50 rounded-3xl p-20 flex flex-col items-center justify-center text-center space-y-6 shadow-sm">
                    <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/50">
                        <Ticket size={40} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-foreground">No promotional codes generated</h3>
                        <p className="text-muted-foreground mt-2">Deploy your first coupon strategy to boost engagement.</p>
                    </div>
                    <Link href="/admin/coupons/new" className="h-12 px-8 bg-muted text-foreground font-bold rounded-xl hover:bg-muted/80 transition-colors flex items-center gap-2">
                        <Plus size={18} /> Create Now
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {filtered.map((coupon) => (
                            <motion.div
                                key={coupon.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-card border border-border/50 rounded-3xl overflow-hidden group hover:border-secondary/30 transition-all hover:shadow-2xl hover:shadow-secondary/10 shadow-sm"
                            >
                                <div className="p-6 border-b border-border/50 bg-secondary/10 relative overflow-hidden">
                                    <div className="absolute top-0 end-0 p-4 opacity-10 rotate-12 scale-150">
                                        <Ticket size={100} />
                                    </div>
                                    <div className="relative z-10 flex justify-between items-start">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-secondary mb-1">Promo Code</p>
                                            <h3 className="text-3xl font-black text-foreground tracking-widest">{coupon.code}</h3>
                                        </div>
                                        <div className="bg-secondary text-secondary-foreground font-black px-3 py-1 rounded-lg shadow-lg">
                                            {coupon.discountPercent}% OFF
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 space-y-5">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-1.5"><Box size={12} /> Connected Product</p>
                                            <p className="text-sm font-medium text-foreground truncate px-3 py-2 bg-muted/50 rounded-lg border border-border/50">
                                                {coupon.placement?.product?.name || "Unknown Product"}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-1.5"><Calendar size={12} /> Expiry Date</p>
                                                <p className="text-sm font-medium text-foreground">{new Date(coupon.expirationDate).toLocaleDateString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Status</p>
                                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
