'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, ArrowLeft, Percent, Calendar, CheckCircle2, Box, Tag } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Placement {
    id: string;
    status: string;
    product: {
        id: string;
        name: string;
        price: number;
    };
    price: number;
    startDate: string;
    endDate: string;
}

export default function CreateCouponPage() {
    const router = useRouter();
    const [placements, setPlacements] = useState<Placement[]>([]);
    const [isLoadingPlacements, setIsLoadingPlacements] = useState(true);

    const [selectedPlacementId, setSelectedPlacementId] = useState('');
    const [code, setCode] = useState('');
    const [discountPercent, setDiscountPercent] = useState('');
    const [expirationDate, setExpirationDate] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchPlacements = async () => {
            try {
                const token = localStorage.getItem('bev-token');
                if (!token) return;

                const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/placements', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setPlacements(data.filter((p: Placement) => p.status === 'ACTIVE'));
                }
            } catch (err) {
                console.error("Failed to fetch placements:", err);
            } finally {
                setIsLoadingPlacements(false);
            }
        };

        fetchPlacements();
    }, []);

    const handleGenerateRandomCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setCode(result);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/coupons', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    placementId: selectedPlacementId,
                    code: code.toUpperCase(),
                    discountPercent: parseFloat(discountPercent),
                    expirationDate: expirationDate
                })
            });

            if (res.ok) {
                router.push('/admin/coupons');
            } else {
                const data = await res.json();
                setError(data.message || 'Failed to create coupon.');
            }
        } catch (err) {
            setError('An unexpected error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-20 space-y-8">
            {/* Header */}
            <div>
                <Link href="/admin/coupons" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 text-sm font-bold uppercase tracking-widest">
                    <ArrowLeft size={16} /> Back to Coupons
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-4">
                            <Ticket className="text-primary w-10 h-10" />
                            Launch Coupon
                        </h1>
                        <p className="text-muted-foreground font-medium mt-2 text-lg">Attach exclusive discounts to your active Product Offers.</p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <motion.form
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border/50 rounded-[40px] p-8 md:p-12 shadow-2xl relative overflow-hidden"
            >
                {/* Decorative background blur */}
                <div className="absolute top-0 end-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none -me-40 -mt-40" />

                <div className="relative z-10 space-y-10">
                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl font-medium flex justify-center items-center">
                            {error}
                        </div>
                    )}

                    {/* Offer Selection */}
                    <div className="space-y-4">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <Box size={14} /> Connect to Offer (Placement)
                        </label>
                        {isLoadingPlacements ? (
                            <div className="h-16 bg-muted animate-pulse rounded-2xl w-full border border-border/50" />
                        ) : (
                            <div className="relative group">
                                <select
                                    required
                                    value={selectedPlacementId}
                                    onChange={(e) => setSelectedPlacementId(e.target.value)}
                                    className="w-full h-16 bg-muted border border-border/50 rounded-2xl ps-12 pe-6 text-foreground appearance-none outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium"
                                >
                                    <option value="" disabled className="bg-background text-muted-foreground">Select an active offer...</option>
                                    {placements.map(p => (
                                        <option key={p.id} value={p.id} className="bg-card text-foreground py-2">
                                            {p.product?.name || 'Unknown Product'} - ${p.product?.price}
                                        </option>
                                    ))}
                                </select>
                                <Tag size={20} className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary pointer-events-none transition-colors" />
                            </div>
                        )}
                        {placements.length === 0 && !isLoadingPlacements && (
                            <p className="text-sm text-destructive mt-2">You don't have any active offers available right now.</p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Coupon Code */}
                        <div className="space-y-4">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest flex justify-between items-center">
                                <span className="flex items-center gap-2"><Ticket size={14} /> Promotional Code</span>
                                <button type="button" onClick={handleGenerateRandomCode} className="text-primary hover:text-foreground transition-colors">
                                    Generate Random
                                </button>
                            </label>
                            <div className="relative group">
                                <input
                                    required
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                                    className="w-full h-16 bg-muted border border-border/50 rounded-2xl ps-12 pe-6 text-2xl font-black text-foreground uppercase outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="SUMMER24"
                                />
                                <Ticket size={20} className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                            </div>
                        </div>

                        {/* Discount Percentage */}
                        <div className="space-y-4">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                <Percent size={14} /> Discount Percentage
                            </label>
                            <div className="relative group">
                                <input
                                    required
                                    type="number"
                                    min="1"
                                    max="100"
                                    step="1"
                                    value={discountPercent}
                                    onChange={(e) => setDiscountPercent(e.target.value)}
                                    className="w-full h-16 bg-muted border border-border/50 rounded-2xl ps-12 pe-12 text-2xl font-black text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="20"
                                />
                                <Percent size={20} className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                                <span className="absolute end-6 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">% OFF</span>
                            </div>
                        </div>
                    </div>

                    {/* Expiration Date */}
                    <div className="space-y-4">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <Calendar size={14} /> Expiration Date
                        </label>
                        <div className="relative group">
                            <input
                                required
                                type="date"
                                min={new Date().toISOString().split('T')[0]}
                                value={expirationDate}
                                onChange={(e) => setExpirationDate(e.target.value)}
                                className="w-full h-16 bg-muted border border-border/50 rounded-2xl ps-12 pe-6 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium custom-calendar-icon"
                            />
                            <Calendar size={20} className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors pointer-events-none" />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-8 border-t border-border/50">
                        <button
                            type="submit"
                            disabled={isSubmitting || placements.length === 0}
                            className="w-full h-16 bg-primary text-primary-foreground font-black text-xl rounded-2xl hover:scale-[1.02] transition-transform shadow-2xl shadow-primary/20 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
                        >
                            {isSubmitting ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full border-2 border-primary-foreground/20 border-t-primary-foreground animate-spin" />
                                    Generating...
                                </div>
                            ) : (
                                <>
                                    <CheckCircle2 size={24} />
                                    Publish Coupon
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.form>
        </div>
    );
}
