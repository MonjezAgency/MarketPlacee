'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchSupplierAds, requestAdPlacement, deleteAdPlacement, fetchMyProducts } from '@/lib/api';
import {
    Tag,
    Plus,
    Search,
    Calendar,
    Clock,
    Zap,
    CircleDollarSign,
    Info,
    CheckCircle2,
    XCircle,
    LayoutList,
    Image as ImageIcon,
    Edit2,
    Trash,
    Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

type OfferType = 'Flash Sale' | 'Bundle' | 'Discount';
type OfferSlot = 'HERO' | 'FEATURED' | 'BANNER' | 'LISTING';

interface OfferPlacement {
    id: string;
    title: string;
    type: OfferType;
    slot: OfferSlot;
    price: number;
    status: 'ACTIVE' | 'PENDING' | 'REJECTED' | 'EXPIRED';
    startDate?: string;
    startTime?: string;
    expiry: string;
    impressions: number;
}

const SLOT_PRICES = {
    'HERO': 500,
    'FEATURED': 300,
    'BANNER': 200,
    'LISTING': 100
};

const SLOT_DIMENSIONS = {
    'HERO': '1920 x 600px',
    'FEATURED': '800 x 800px',
    'BANNER': '1200 x 200px',
    'LISTING': '400 x 400px'
};

export default function SupplierOffersPage() {
    const [offers, setOffers] = React.useState<OfferPlacement[]>([]);
    const [loading, setLoading] = React.useState(true);

    const loadOffers = React.useCallback(async () => {
        setLoading(true);
        const data = await fetchSupplierAds();
        setOffers(data.map(item => ({
            id: item.id,
            title: item.product?.name || 'Untitled Campaign',
            type: (item.placementType === 'HERO' ? 'Flash Sale' : item.placementType === 'FEATURED' ? 'Bundle' : 'Discount') as OfferType,
            slot: item.placementType as OfferSlot,
            price: item.price,
            status: item.status as any,
            expiry: item.endDate,
            impressions: Math.floor(Math.random() * 1000) // Impressions mock until backend tracking is ready
        })));
        setLoading(false);
    }, []);

    React.useEffect(() => {
        loadOffers();
    }, [loadOffers]);

    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [formData, setFormData] = React.useState<{
        title: string;
        type: OfferType;
        slot: OfferSlot;
        startDate: string;
        startTime: string;
        expiry: string;
        image: File | null;
    }>({
        title: '',
        type: 'Discount',
        slot: 'FEATURED',
        startDate: '',
        startTime: '',
        expiry: '',
        image: null
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        try {
            // Find productId by title or similar if needed, but the form should ideally select products
            // For now, we'll assume the title is helpful or we'll need to update the form to pick a productId
            const products = await fetchMyProducts();
            const product = products.find(p => p.name === formData.title) || products[0];

            if (!product) {
                alert('Please ensure you have products before requesting ads.');
                return;
            }

            await requestAdPlacement({
                productId: product.id,
                type: formData.slot,
                durationDays: 30 // Default duration
            });

            setIsModalOpen(false);
            setEditingId(null);
            loadOffers();
        } catch (err) {
            console.error('Failed to create offer:', err);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to cancel this placement?')) {
            const success = await deleteAdPlacement(id);
            if (success) loadOffers();
        }
    };

    const openEditModal = (offer: OfferPlacement) => {
        setFormData({
            title: offer.title,
            type: offer.type,
            slot: offer.slot,
            startDate: offer.startDate || '',
            startTime: offer.startTime || '',
            expiry: offer.expiry,
            image: null
        });
        setEditingId(offer.id);
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-12 max-w-[1400px] mx-auto pb-24 px-6 lg:px-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 relative z-10">
                <div className="space-y-2">
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground tracking-tight flex items-center gap-4">
                        <span className="p-3 bg-primary/10 rounded-2xl border border-primary/20 shadow-lg shadow-primary/20">
                            <Tag className="text-primary w-8 h-8" />
                        </span>
                        Offers & Ad Placements
                    </h1>
                    <p className="text-muted-foreground font-medium text-lg max-w-2xl ps-16">Supercharge your visibility. Deploy performance-driven campaigns directly to enterprise buyers.</p>
                </div>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                        setEditingId(null);
                        setFormData({
                            title: '',
                            type: 'Discount' as any,
                            slot: 'FEATURED' as 'HERO' | 'FEATURED' | 'BANNER' | 'LISTING',
                            startDate: '',
                            startTime: '',
                            expiry: '',
                            image: null
                        });
                        setIsModalOpen(true);
                    }}
                    className="h-14 px-8 bg-primary text-primary-foreground font-black text-base rounded-2xl shadow-2xl shadow-primary/30 flex items-center gap-3 overflow-hidden relative group"
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                    <span className="relative z-10 flex items-center gap-2"><Plus size={20} strokeWidth={3} /> Launch Campaign</span>
                </motion.button>
            </div>

            {/* Pricing Tiers */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
                {Object.entries(SLOT_PRICES).map(([slot, price], index) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        key={slot}
                        className="relative group overflow-hidden bg-card border border-border/50 rounded-[2rem] p-8 hover:border-primary/30 transition-all duration-500 shadow-sm"
                    >
                        <div className={cn(
                            "absolute -top-24 -end-24 w-48 h-48 rounded-full blur-[80px] opacity-0 group-hover:opacity-30 transition-opacity duration-700",
                            slot === 'HERO' ? "bg-primary" : slot === 'FEATURED' ? "bg-purple-500" : slot === 'BANNER' ? "bg-blue-500" : "bg-emerald-500"
                        )} />

                        <div className="relative z-10 space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-2.5 h-2.5 rounded-full",
                                        slot === 'HERO' ? "bg-primary" : slot === 'FEATURED' ? "bg-purple-500" : slot === 'BANNER' ? "bg-blue-500" : "bg-emerald-500"
                                    )} />
                                    <p className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em]">{slot}</p>
                                </div>
                                <ImageIcon size={20} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                            </div>

                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-bold text-muted-foreground">$</span>
                                <h3 className="text-5xl font-black text-foreground tracking-tighter">{price}</h3>
                            </div>

                            <p className="text-sm font-medium text-muted-foreground leading-relaxed border-t border-border/50 pt-5 min-h-[80px]">
                                {slot === 'HERO' && "Maximum platform visibility. Premium homepage hero section display."}
                                {slot === 'FEATURED' && "High visibility in search results and category featured sections."}
                                {slot === 'BANNER' && "Consistent brand awareness via footer and sidebar banner placements."}
                                {slot === 'LISTING' && "Highlighted standard product listing within specific categories."}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent my-12" />

            {/* Offers Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 relative z-10">
                <AnimatePresence>
                    {offers.map((offer, index) => (
                        <motion.div
                            layout
                            key={offer.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-card border border-border/50 rounded-[2.5rem] p-8 hover:border-primary/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group overflow-hidden relative shadow-sm"
                        >
                            <div className="absolute top-0 end-0 w-64 h-64 bg-primary/5 rounded-full -me-32 -mt-32 blur-[100px] group-hover:bg-primary/10 transition-colors duration-700" />

                            <div className="flex justify-between items-start mb-8 relative z-10">
                                <div className="flex items-start gap-4">
                                    <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center border border-border/50 shadow-inner overflow-hidden">
                                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-transparent flex items-center justify-center">
                                            <Zap className="text-primary group-hover:scale-110 transition-transform duration-500" size={24} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-black text-foreground line-clamp-1 group-hover:text-primary transition-colors">{offer.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded text-[10px] font-black text-primary-foreground bg-primary uppercase tracking-widest leading-none">{offer.type}</span>
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{offer.slot} SLOT</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={cn(
                                    "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                                    offer.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                        offer.status === 'PENDING' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                                            "bg-red-500/10 text-red-500 border-red-500/20"
                                )}>
                                    {offer.status}
                                </div>
                            </div>

                            <div className="bg-muted/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 mb-8 relative z-10 border border-border/50 shadow-inner">
                                <div className="flex flex-col gap-1 w-[calc(50%-0.5rem)] sm:w-auto">
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                        <CircleDollarSign size={12} className="text-emerald-500" />
                                        Investment
                                    </div>
                                    <p className="text-xl font-black text-foreground tracking-tight">${offer.price}</p>
                                </div>
                                <div className="flex flex-col gap-1 w-[calc(50%-0.5rem)] sm:w-auto sm:border-s border-border/50 sm:ps-6">
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                        <Calendar size={12} className="text-amber-500" />
                                        Expires
                                    </div>
                                    <p className="text-sm font-bold text-foreground/80 mt-1">{new Date(offer.expiry).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                </div>
                                <div className="flex flex-col gap-1 w-full sm:w-auto sm:border-s border-border/50 sm:ps-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-border/50">
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                        <Eye size={12} className="text-blue-500" />
                                        Platform Views
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <p className="text-xl font-black text-emerald-500">{offer.impressions.toLocaleString()}</p>
                                        <span className="text-[10px] text-muted-foreground font-bold uppercase">Imp</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 relative z-10">
                                <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                                    <Clock size={12} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Updated 2h ago</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => openEditModal(offer)} className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:bg-muted rounded-xl bg-muted/50">
                                        <Edit2 size={16} />
                                    </button>
                                    <button onClick={() => handleDelete(offer.id)} className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors hover:bg-red-500/10 rounded-xl bg-muted/50">
                                        <Trash size={16} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Create Offer Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center p-6"
                    >
                        <motion.form
                            onSubmit={handleSubmit}
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-card w-full max-w-xl max-h-[85vh] overflow-y-auto no-scrollbar rounded-[40px] border border-border/50 shadow-2xl p-10 space-y-8"
                        >
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-black text-foreground tracking-tight">{editingId ? 'Edit Offer' : 'Create New Offer'}</h2>
                                    <p className="text-muted-foreground text-xs font-medium">Configure your promotion and ad placement.</p>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="w-10 h-10 bg-muted rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                                    <XCircle size={24} />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">Offer Title</label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="e.g. Weekend Beverage Special"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-6 outline-none focus:border-primary/50 text-foreground font-medium placeholder:text-muted-foreground/50"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">Offer Type</label>
                                        <select
                                            value={formData.type}
                                            onChange={e => setFormData({ ...formData, type: e.target.value as OfferType })}
                                            className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-6 outline-none focus:border-primary/50 text-foreground font-medium appearance-none"
                                        >
                                            <option value="Discount">Percentage Discount</option>
                                            <option value="Bundle">Product Bundle</option>
                                            <option value="Flash Sale">Flash Sale</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">Placement Slot</label>
                                        <select
                                            value={formData.slot}
                                            onChange={e => setFormData({ ...formData, slot: e.target.value as OfferSlot })}
                                            className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-6 outline-none focus:border-primary/50 text-foreground font-medium appearance-none"
                                        >
                                            <option value="HERO">Hero Slot ($500)</option>
                                            <option value="FEATURED">Featured Slot ($300)</option>
                                            <option value="BANNER">Banner Slot ($200)</option>
                                            <option value="LISTING">Listing Slot ($100)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest flex items-center justify-between">
                                        <span>Ad Creative (Image Upload)</span>
                                        <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-md">Required Size: {SLOT_DIMENSIONS[formData.slot]}</span>
                                    </label>
                                    <div className="border border-dashed border-border rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors cursor-pointer relative overflow-hidden group">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={e => setFormData({ ...formData, image: e.target.files?.[0] || null })}
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        />
                                        {formData.image ? (
                                            <div className="text-primary font-bold z-20 flex items-center gap-2">
                                                <CheckCircle2 size={20} />
                                                {formData.image.name}
                                            </div>
                                        ) : (
                                            <>
                                                <ImageIcon size={32} className="text-muted-foreground/40 mb-3 group-hover:text-primary transition-colors z-20" />
                                                <p className="text-sm font-medium text-foreground z-20">Click or drag image to upload</p>
                                                <p className="text-xs text-muted-foreground mt-1 z-20">PNG, JPG up to 5MB</p>
                                                <p className="text-xs font-black text-primary mt-3 uppercase tracking-widest z-20">Optimum Dimensions: {SLOT_DIMENSIONS[formData.slot]}</p>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">Start Date</label>
                                        <input
                                            required
                                            type="date"
                                            value={formData.startDate}
                                            onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                            className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-4 outline-none focus:border-primary/50 text-foreground font-medium"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">Start Time</label>
                                        <input
                                            required
                                            type="time"
                                            value={formData.startTime}
                                            onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                            className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-4 outline-none focus:border-primary/50 text-foreground font-medium"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">Expiry Date</label>
                                        <input
                                            required
                                            type="date"
                                            value={formData.expiry}
                                            onChange={e => setFormData({ ...formData, expiry: e.target.value })}
                                            className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-4 outline-none focus:border-primary/50 text-foreground font-medium"
                                        />
                                    </div>
                                </div>

                                {formData.slot === 'HERO' && (
                                    <div className="p-6 bg-primary/10 rounded-3xl border border-primary/20 flex items-start gap-4 animate-in fade-in slide-in-from-top-2">
                                        <Info className="text-primary mt-1" size={24} />
                                        <div className="space-y-1">
                                            <p className="text-sm font-black text-foreground">Admin Approval Required</p>
                                            <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">Hero placements are highly competitive and require review by our moderation team. Your offer will go live once approved.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="w-full h-16 bg-primary text-primary-foreground font-black rounded-2xl shadow-xl shadow-primary/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 group"
                            >
                                <CircleDollarSign size={20} className="group-hover:rotate-12 transition-transform" />
                                {editingId ? 'Update & Re-submit Offer' : 'Pay & Launch Offer'}
                            </button>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
