'use client';
import { apiFetch } from '@/lib/api';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, ArrowLeft, Percent, Calendar, CheckCircle2, Box, Tag, Search, Image as ImageIcon, Building2, Globe2 } from 'lucide-react';
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
        images?: string[];
        sku?: string;
        ean?: string;
        supplierId?: string;
        supplier?: { id: string; name?: string; companyName?: string; email?: string };
    };
    price: number;
    startDate: string;
    endDate: string;
}

type Scope = 'ALL' | 'ATLANTIS';

// Atlantis-owned products: the supplier user that represents the platform itself.
// We treat any supplier whose name or company contains "atlantis" as the platform.
const isAtlantisSupplier = (s?: Placement['product']['supplier']) => {
    if (!s) return false;
    const haystack = `${s.name ?? ''} ${s.companyName ?? ''} ${s.email ?? ''}`.toLowerCase();
    return haystack.includes('atlantis');
};

export default function CreateCouponPage() {
    const router = useRouter();
    const [placements, setPlacements] = useState<Placement[]>([]);
    const [isLoadingPlacements, setIsLoadingPlacements] = useState(true);

    const [selectedPlacementId, setSelectedPlacementId] = useState('');
    const [code, setCode] = useState('');
    const [discountPercent, setDiscountPercent] = useState('');
    const [expirationDate, setExpirationDate] = useState('');
    const [scope, setScope] = useState<Scope>('ALL');
    const [search, setSearch] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchPlacements = async () => {
            try {
                const res = await apiFetch('/placements');

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

    // Filter placements by scope + search
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return placements
            .filter(p => {
                if (scope === 'ATLANTIS' && !isAtlantisSupplier(p.product?.supplier)) return false;
                if (!q) return true;
                const fields = [
                    p.product?.name,
                    p.product?.sku,
                    p.product?.ean,
                    p.product?.supplier?.name,
                    p.product?.supplier?.companyName,
                ]
                    .filter(Boolean)
                    .map(s => String(s).toLowerCase());
                return fields.some(f => f.includes(q));
            });
    }, [placements, scope, search]);

    // Reset selection when filters change and current isn't visible anymore
    useEffect(() => {
        if (selectedPlacementId && !filtered.some(p => p.id === selectedPlacementId)) {
            setSelectedPlacementId('');
        }
    }, [filtered, selectedPlacementId]);

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
            const res = await apiFetch('/coupons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    placementId: selectedPlacementId,
                    code: code.toUpperCase(),
                    discountPercent: parseFloat(discountPercent),
                    expirationDate: expirationDate,
                }),
            });

            if (res.ok) {
                router.push('/admin/coupons');
            } else {
                const data = await res.json().catch(() => null);
                setError(data?.message || 'Failed to create coupon.');
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

                    {/* Scope toggle + Search */}
                    <div className="space-y-4">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <Box size={14} /> Connect to Offer (Placement)
                        </label>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex rounded-2xl border border-border/50 bg-muted p-1">
                                <button
                                    type="button"
                                    onClick={() => setScope('ALL')}
                                    className={cn(
                                        'h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-colors',
                                        scope === 'ALL' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <Globe2 size={14} /> All platform
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setScope('ATLANTIS')}
                                    className={cn(
                                        'h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-colors',
                                        scope === 'ATLANTIS' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <Building2 size={14} /> Atlantis only
                                </button>
                            </div>

                            <div className="relative flex-1 min-w-[220px]">
                                <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by name, SKU, EAN, or supplier…"
                                    className="w-full h-10 ps-10 pe-4 rounded-xl border border-border/50 bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                            </div>
                        </div>

                        {isLoadingPlacements ? (
                            <div className="h-32 bg-muted animate-pulse rounded-2xl w-full border border-border/50" />
                        ) : filtered.length === 0 ? (
                            <div className="p-6 rounded-2xl border border-dashed border-border/60 bg-muted/30 text-center">
                                <p className="text-sm text-muted-foreground">
                                    {placements.length === 0
                                        ? "No active offers available right now."
                                        : "No offers match the current filter."}
                                </p>
                            </div>
                        ) : (
                            <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-border/50 bg-background/40 divide-y divide-border/40">
                                {filtered.map((p) => {
                                    const selected = selectedPlacementId === p.id;
                                    const supplierLabel =
                                        p.product?.supplier?.companyName ||
                                        p.product?.supplier?.name ||
                                        'Unknown supplier';
                                    const isAtlantis = isAtlantisSupplier(p.product?.supplier);
                                    const img = p.product?.images?.[0];
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setSelectedPlacementId(p.id)}
                                            className={cn(
                                                'w-full flex items-center gap-4 p-4 text-start transition-colors',
                                                selected ? 'bg-primary/10' : 'hover:bg-muted/60'
                                            )}
                                        >
                                            <div className="w-14 h-14 shrink-0 rounded-xl bg-muted flex items-center justify-center overflow-hidden border border-border/50">
                                                {img ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={img} alt="" className="w-full h-full object-contain" />
                                                ) : (
                                                    <ImageIcon size={20} className="text-muted-foreground/50" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-bold text-foreground truncate">
                                                        {p.product?.name || 'Unknown Product'}
                                                    </p>
                                                    {isAtlantis && (
                                                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-600">
                                                            Atlantis
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                                    {supplierLabel}
                                                    {p.product?.sku && <> · SKU {p.product.sku}</>}
                                                    {p.product?.ean && <> · EAN {p.product.ean}</>}
                                                </p>
                                            </div>
                                            <div className="text-end shrink-0">
                                                <p className="text-sm font-black text-foreground">€{p.product?.price?.toFixed?.(2) ?? p.product?.price}</p>
                                                {selected ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary mt-1">
                                                        <CheckCircle2 size={12} /> Selected
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground">Tap to select</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
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
                            disabled={isSubmitting || !selectedPlacementId}
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
                                    {selectedPlacementId ? 'Publish Coupon' : 'Select an offer first'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.form>
        </div>
    );
}
