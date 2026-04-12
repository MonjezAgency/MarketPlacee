'use client';
import { apiFetch } from '@/lib/api';


import { useState, useEffect } from 'react';
import {
    Monitor, Sparkles, TrendingUp, Zap,
    Info, Check, ArrowRight, ShieldCheck, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const API_URL = '/api';

const PLACEMENT_SLOTS = [
    {
        id: 'hero',
        name: 'Homepage Hero Banner',
        desc: 'Maximum visibility. 100% width spot on the main landing page.',
        cost: '$250/day',
        icon: Monitor,
        color: 'text-primary',
        bg: 'bg-primary/10'
    },
    {
        id: 'featured',
        name: 'Featured Product Grid',
        desc: 'Priority ranking in the "Trending Now" section.',
        cost: '$120/day',
        icon: Sparkles,
        color: 'text-secondary',
        bg: 'bg-secondary/10'
    },
    {
        id: 'sidebar',
        name: 'Category Sidebar Ad',
        desc: 'Targeted visibility in specific beverage categories.',
        cost: '$75/day',
        icon: TrendingUp,
        color: 'text-accent',
        bg: 'bg-accent/10'
    },
];

export default function SupplierPlacement() {
    const [selectedSlot, setSelectedSlot] = useState(PLACEMENT_SLOTS[0]);
    const [selectedProduct, setSelectedProduct] = useState('');
    const [myProducts, setMyProducts] = useState<any[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                
                const res = await apiFetch(`/products/my-products`, {
                });
                if (res.ok) {
                    const data = await res.json();
                    setMyProducts(data);
                }
            } catch (err) {
                console.error('Failed to load products for placement:', err);
            } finally {
                setIsLoadingProducts(false);
            }
        };
        fetchProducts();
    }, []);

    return (
        <div className="space-y-10 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight">Atlantis Placements</h1>
                    <p className="text-foreground/60">Boost your products to the top of Atlantis.</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20">
                    <ShieldCheck className="w-5 h-5 text-success" />
                    <span className="text-xs font-black uppercase tracking-widest text-success">Partner Verified</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Slot Selection */}
                <div className="space-y-6">
                    <h2 className="text-xl font-bold">1. Select Placement Spot</h2>
                    <div className="space-y-4">
                        {PLACEMENT_SLOTS.map((slot) => (
                            <div
                                key={slot.id}
                                className={cn(
                                    "p-6 rounded-[2rem] border-2 cursor-pointer transition-all hover:shadow-lg flex items-start gap-4",
                                    selectedSlot.id === slot.id ? "border-primary bg-primary/5 shadow-xl shadow-primary/10 scale-[1.02]" : "border-border/50 bg-surface hover:border-primary/30"
                                )}
                                onClick={() => setSelectedSlot(slot)}
                            >
                                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", slot.bg)}>
                                    <slot.icon className={cn("w-7 h-7", slot.color)} />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-black text-lg">{slot.name}</h3>
                                        <Badge variant={selectedSlot.id === slot.id ? 'default' : 'outline'}>{slot.cost}</Badge>
                                    </div>
                                    <p className="text-sm text-foreground/60 leading-relaxed">{slot.desc}</p>
                                </div>
                                {selectedSlot.id === slot.id && (
                                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white">
                                        <Check className="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="pt-8 space-y-6">
                        <h2 className="text-xl font-bold">2. Select Product</h2>
                        <select
                            className="w-full h-14 rounded-2xl border border-border/50 bg-surface px-6 text-lg focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground"
                            value={selectedProduct}
                            onChange={(e) => setSelectedProduct(e.target.value)}
                        >
                            <option value="" className="text-black bg-white dark:text-white dark:bg-gray-900">
                                {isLoadingProducts ? 'Loading products...' : 'Choose a product from inventory...'}
                            </option>
                            {myProducts.map(p => (
                                <option key={p.id} value={p.id} className="text-black bg-white dark:text-white dark:bg-gray-900">
                                    {p.name} {p.status !== 'APPROVED' ? `(${p.status})` : ''}
                                </option>
                            ))}
                        </select>
                        {myProducts.length === 0 && !isLoadingProducts && (
                            <p className="text-xs text-muted-foreground">No products found. Add products first from the Overview tab.</p>
                        )}
                    </div>
                </div>

                {/* Live Preview & Summary */}
                <div className="space-y-6">
                    <h2 className="text-xl font-bold">Live Preview</h2>
                    <div className="bg-muted/50 border border-border/50 rounded-[3rem] p-8 aspect-square flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute top-0 end-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" />

                        {/* Mock UI Preview */}
                        <div className="w-full h-full bg-surface border border-border/50 rounded-2xl shadow-2xl relative z-10 p-6 space-y-4">
                            <div className="h-8 w-1/3 bg-muted rounded-lg" />
                            <div className={cn(
                                "w-full rounded-2xl flex items-center justify-center border-2 border-dashed border-primary/30 text-primary-foreground relative overflow-hidden",
                                selectedSlot.id === 'hero' ? "h-40 bg-gradient-to-br from-primary to-secondary" :
                                    selectedSlot.id === 'featured' ? "h-64 bg-surface border-primary" : "h-32 bg-accent/20"
                            )}>
                                <div className="text-center space-y-2 px-6">
                                    <Zap className="w-8 h-8 mx-auto animate-bounce-in" />
                                    <p className="font-black text-sm uppercase tracking-widest">Your Boosted Product Here</p>
                                    <p className="text-[10px] opacity-80">This is how your placement will appear to customers.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="h-4 bg-muted rounded w-3/4" />
                                <div className="h-4 bg-muted rounded w-1/2" />
                            </div>
                        </div>

                        <div className="absolute bottom-12 inset-x-12 p-6 bg-surface/90 backdrop-blur-md rounded-2xl border border-border/50 shadow-xl flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase text-foreground/40">Daily Cost</p>
                                <p className="text-2xl font-black text-primary">{selectedSlot.cost}</p>
                            </div>
                            <Button className="rounded-full h-12 px-8 font-black shadow-lg shadow-primary/20">
                                Submit Request
                                <ArrowRight className="w-4 h-4 ms-2" />
                            </Button>
                        </div>
                    </div>

                    <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 flex items-start gap-4">
                        <Info className="w-6 h-6 text-primary shrink-0" />
                        <div className="space-y-1">
                            <p className="text-sm font-black text-primary uppercase tracking-tight">Important Note</p>
                            <p className="text-xs text-foreground/60 leading-relaxed">
                                Placements are subject to Admin approval. Approved requests start at 12:00 AM UTC on the following day.
                                Cancellations must be made 24 hours in advance.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
