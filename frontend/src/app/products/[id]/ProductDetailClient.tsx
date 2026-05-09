'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Star, Plus, Minus, Check, Truck,
    ShieldCheck, RotateCcw, ChevronRight, Share2,
    Heart, Info, Package, Sparkles, ArrowLeft, ShoppingCart, X, ChevronLeft,
    Shield, CheckCircle2, Download, FileText, FileBadge
} from 'lucide-react';
import { type Product, ProductStatus } from '@/lib/types';
import { fetchProductById, apiFetch, fetchProductsWithFilters } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateText } from '@/lib/translator';
import { motion, AnimatePresence } from 'framer-motion';
import ReviewSection from '@/components/product/ReviewSection';
// PricingAssistant removed from buyer-facing PDP — keep import commented
// out so a future re-enable doesn't have to re-locate the path.
// import PricingAssistant from '@/components/product/PricingAssistant';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useWishlist } from '@/hooks/useWishlist';
import { getDisplayCategory } from '@/lib/product-utils';
import ImageLightbox from '@/components/ImageLightbox';


export default function ProductDetailClient() {
    const { id } = useParams();
    const { addItem, items: cartItems } = useCart();
    const [quantity, setQuantity] = useState(1);
    const [isAdded, setIsAdded] = useState(false);
    const router = useRouter();
    const { t, locale } = useLanguage();
    const isAr = locale === 'ar';
    const { user, isLoggedIn } = useAuth();
    const [localRating, setLocalRating] = useState(0);
    const [localReviewsCount, setLocalReviewsCount] = useState(0);

    const { isSaved, toggle: toggleWishlist } = useWishlist();
    const [translatedName, setTranslatedName] = useState('');
    const [translatedDesc, setTranslatedDesc] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<string>('');
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
    const [selectedUnit, setSelectedUnit] = useState<'truck' | 'pallet' | 'carton' | undefined>(undefined);
    const [adminDefaultUnit, setAdminDefaultUnit] = useState<'truck' | 'pallet' | 'carton'>('truck');
    const [markups, setMarkups] = useState<{ piece: number; pallet: number; container: number }>({ piece: 1.10, pallet: 1.05, container: 1.02 });
    const [activeTab, setActiveTab] = useState('Description');
    const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    // ── Tier pricing memo ─────────────────────────────────────────────────────
    // Computes the customer-visible price for the currently selected unit tier
    // (truck / pallet / carton). Used both in handleAdd() and in the pricing UI.
    // Duplicated from the JSX IIFE so that handleAdd() always has the right price.
    const tierData = useMemo(() => {
        if (!currentProduct) return { tierPrice: 0, activeLabel: 'Unit', activeKey: 'carton' as const };
        const p = currentProduct;
        const piecesPerCase   = p.unitsPerCase || 0;
        const casesPerPallet  = p.casesPerPallet || 0;
        const piecesPerPallet = p.unitsPerPallet || (piecesPerCase * casesPerPallet) || 0;
        const palletsPerTruck = p.palletsPerShipment || 0;
        const baseUnit        = String(p.unit || 'piece').toLowerCase();

        const rawBase = p.basePrice != null ? p.basePrice : p.price / markups.piece;
        let basePerPiece = rawBase;
        if ((baseUnit.includes('case') || baseUnit.includes('carton') || baseUnit.includes('box')) && piecesPerCase > 0)
            basePerPiece = rawBase / piecesPerCase;
        else if (baseUnit.includes('pallet') && piecesPerPallet > 0)
            basePerPiece = rawBase / piecesPerPallet;
        else if ((baseUnit.includes('truck') || baseUnit.includes('container') || baseUnit.includes('shipment') || baseUnit.includes('delivery')) && piecesPerPallet > 0 && palletsPerTruck > 0)
            basePerPiece = rawBase / (piecesPerPallet * palletsPerTruck);

        const cartonPrice = piecesPerCase > 0   ? basePerPiece * piecesPerCase * markups.piece          : null;
        const palletPrice = piecesPerPallet > 0  ? basePerPiece * piecesPerPallet * markups.pallet       : null;
        const truckPrice  = (piecesPerPallet > 0 && palletsPerTruck > 0)
            ? basePerPiece * piecesPerPallet * palletsPerTruck * markups.container : null;
        const perPiece    = basePerPiece * markups.piece;

        const options: Array<{ key: 'truck' | 'pallet' | 'carton'; label: string; price: number | null }> = [];
        if (truckPrice  !== null) options.push({ key: 'truck',  label: 'Truck',         price: truckPrice  });
        if (palletPrice !== null) options.push({ key: 'pallet', label: 'Pallet',        price: palletPrice });
        if (cartonPrice !== null) options.push({ key: 'carton', label: 'Case',          price: cartonPrice });
        // B2B marketplace — no single-piece option.
        if (options.length === 0) options.push({ key: 'carton', label: p.unit || 'Case', price: p.price });

        const initialSelected = options.find(o => o.key === adminDefaultUnit)?.key ?? options[0].key;
        const active          = options.find(o => o.key === (selectedUnit ?? initialSelected)) || options[0];
        const tierPrice       = active.price != null ? active.price : perPiece;

        return { tierPrice, activeLabel: active.label, activeKey: active.key };
    }, [currentProduct, markups, selectedUnit, adminDefaultUnit]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const { scrollLeft, clientWidth } = scrollContainerRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
            scrollContainerRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    // ── Cart-driven tier lock ─────────────────────────────────────────────────
    // If this exact product is already in the cart, the buyer locked in a tier
    // (Truck / Pallet / Carton) when they added it. The PDP must enforce that
    // tier on every subsequent visit until they remove the item — buyers can
    // not mix Truck-priced quantities with Pallet-priced quantities for the
    // same SKU. The other two tier buttons render as disabled with a tooltip
    // explaining how to switch.
    const lockedTier: 'truck' | 'pallet' | 'carton' | null = useMemo(() => {
        if (!currentProduct) return null;
        const existing = cartItems.find(it => it.id === currentProduct.id);
        return existing?.tier ?? null;
    }, [cartItems, currentProduct]);

    useEffect(() => {
        if (lockedTier && selectedUnit !== lockedTier) {
            setSelectedUnit(lockedTier);
        }
    }, [lockedTier, selectedUnit]);

    // Fetch admin-configured default display unit + tier markups once on mount
    useEffect(() => {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-production-a2b5.up.railway.app';
        Promise.all([
            fetch(`${apiBase}/config/default-unit`).then(r => r.json()).catch(() => ({})),
            fetch(`${apiBase}/config/markup`).then(r => r.json()).catch(() => ({})),
        ]).then(([unitData, markupData]) => {
            if (unitData?.unit && ['truck', 'pallet', 'carton'].includes(unitData.unit)) {
                setAdminDefaultUnit(unitData.unit as 'truck' | 'pallet' | 'carton');
            }
            if (markupData?.piece) {
                setMarkups({
                    piece: Number(markupData.piece) || 1.10,
                    pallet: Number(markupData.pallet) || 1.05,
                    container: Number(markupData.container) || 1.02,
                });
            }
        });
    }, []);

    useEffect(() => {
        if (!id) return;
        setIsLoading(true);
        fetchProductById(id as string).then(data => {
            setCurrentProduct(data);
            setIsLoading(false);
        });
    }, [id]);

    useEffect(() => {
        if (currentProduct) {
            setLocalRating(currentProduct.rating || 0);
            setLocalReviewsCount(currentProduct.reviewsCount || 0);

            const allImages = currentProduct.images && currentProduct.images.length > 0
                ? currentProduct.images
                : [currentProduct.image].filter(Boolean) as string[];
            if (allImages.length > 0 && !selectedImage) {
                setSelectedImage(allImages[0]);
            }

            if (locale !== 'en') {
                // Check for stored translations in variants
                const storedTranslations = currentProduct.variants?.find((v: any) => v.name === '__translations')?.values?.[0];
                let usedStored = false;
                if (storedTranslations) {
                    try {
                        const parsed = JSON.parse(storedTranslations);
                        if (parsed[locale]) {
                            setTranslatedName(parsed[locale].name || currentProduct.name);
                            setTranslatedDesc(parsed[locale].description || currentProduct.description || '');
                            usedStored = true;
                        }
                    } catch (e) {}
                }

                if (!usedStored) {
                    translateText(currentProduct.name, locale).then(setTranslatedName);
                    translateText(currentProduct.description || '', locale).then(setTranslatedDesc);
                }
            } else {
                setTranslatedName(currentProduct.name);
                setTranslatedDesc(currentProduct.description || '');
            }

            // Load Related Products (Amazon Style)
            const loadRelated = async () => {
                try {
                    // Try to fetch by category first
                    let products = currentProduct.category 
                        ? await fetchProductsWithFilters({ category: currentProduct.category })
                        : [];
                    
                    let filtered = products.filter(p => p.id !== currentProduct.id).slice(0, 6);
                    
                    if (filtered.length === 0) {
                        // Fallback to all approved products if category is empty
                        const allProducts = await fetchProductsWithFilters({});
                        filtered = allProducts.filter(p => p.id !== currentProduct.id).slice(0, 10);
                    }
                    
                    setRelatedProducts(filtered);
                } catch (err) {
                    console.error('Failed to fetch related products:', err);
                }
            };
            loadRelated();
        }
    }, [locale, currentProduct]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 pt-20 bg-[#F8FAFC]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-[#14B8A6] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">{t('common', 'loading')}</p>
                </div>
            </div>
        );
    }

    const product = currentProduct;

    if (!product) {
        return (
            <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 bg-white border border-slate-200 rounded-[24px] flex items-center justify-center mx-auto mb-8 shadow-sm">
                        <Package className="text-slate-300" size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Product Not Found</h2>
                    <p className="text-slate-500 mb-8 text-sm">The item you are looking for might have been moved or is no longer available.</p>
                    <Link href="/categories">
                        <Button className="rounded-xl h-11 px-8 bg-[#14B8A6] hover:bg-[#0D9488] font-bold text-xs uppercase tracking-wider">
                            Browse Catalog
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    const handleAdd = () => {
        if (!isLoggedIn) {
            router.push('/auth/login?redirect=' + encodeURIComponent(window.location.pathname));
            return;
        }
        addItem({
            id: product.id,
            name: product.name,
            brand: product.brand || 'Atlantis Premium',
            // Use the tier-selected price (truck / pallet / carton) instead of
            // the raw product.price, which was always the per-piece DB price.
            price: tierData.tierPrice,
            image: product.image || '',
            unit: tierData.activeLabel,
            category: product.category || 'Uncategorized',
            // Lock the buyer to this tier for any future PDP visit on the
            // same product. To switch tier they have to remove the line.
            tier: tierData.activeKey,
        }, quantity);
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2500);
    };

    const breadcrumbs = [
        { label: 'Home', href: '/' },
        { label: 'Inventory', href: '/categories' },
        { label: getDisplayCategory(product), href: `/categories?category=${encodeURIComponent(getDisplayCategory(product))}` },
        { label: product.name, href: '#' },
    ];

    const allImages = product.images && product.images.length > 0 ? product.images : [product.image].filter(Boolean) as string[];

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-inter text-[#111827] pt-12 pb-16">
            {/* Enterprise Layout - 1440px Grid */}
            <div className="max-w-[1440px] mx-auto px-12 mb-6 flex items-center justify-between">
                <nav className="flex items-center gap-2 text-[12px] font-medium text-[#6B7280]">
                    {breadcrumbs.map((bc, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <ChevronRight size={12} className="opacity-30" />}
                            <Link href={bc.href} className={cn("hover:text-[#14B8A6] transition-colors truncate max-w-[250px]", i === breadcrumbs.length - 1 && "text-[#111827] font-bold")}>
                                {bc.label}
                            </Link>
                        </React.Fragment>
                    ))}
                </nav>
                <div className="flex items-center gap-2 px-3 py-1 bg-[#14B8A6]/10 border border-[#14B8A6]/20 rounded-full">
                    <Sparkles size={12} className="text-[#14B8A6]" />
                    <span className="text-[10px] font-black text-[#14B8A6] uppercase tracking-widest">B2B Optimized Page v2</span>
                </div>
            </div>

            <main className="max-w-[1440px] mx-auto px-12">
                {/* 1. Hero Section Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mb-12">
                    
                    {/* LEFT: Product Media */}
                    <div className="lg:col-span-4">
                        <div
                            onClick={() => {
                                const i = allImages.findIndex(u => u === selectedImage);
                                setLightboxIndex(i >= 0 ? i : 0);
                            }}
                            className="w-full aspect-square bg-white border border-[#E5E7EB] rounded-[24px] flex items-center justify-center p-8 relative group overflow-hidden shadow-sm cursor-zoom-in"
                            title="Click to zoom"
                        >
                            <AnimatePresence mode="wait">
                                <motion.img
                                    key={selectedImage}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 1.05 }}
                                    src={selectedImage}
                                    alt={product.name}
                                    className="w-full h-full object-contain drop-shadow-2xl select-none transition-transform duration-300 group-hover:scale-105"
                                />
                            </AnimatePresence>
                            
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleWishlist(product.id); }}
                                className={cn(
                                    "absolute top-6 right-6 w-12 h-12 rounded-full border flex items-center justify-center transition-all z-10 shadow-sm cursor-pointer",
                                    isSaved(product.id) ? "bg-red-50 border-red-100 text-red-500" : "bg-white border-slate-100 text-slate-300 hover:text-red-500"
                                )}
                            >
                                <Heart size={20} fill={isSaved(product.id) ? 'currentColor' : 'none'} />
                            </button>
                        </div>
                        
                        {allImages.length > 1 && (
                            <div className="flex flex-wrap gap-3 mt-4">
                                {allImages.map((img, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedImage(img)}
                                        className={cn(
                                            "w-20 h-20 rounded-[12px] border-2 bg-white flex items-center justify-center p-2 transition-all overflow-hidden shadow-sm",
                                            selectedImage === img ? "border-[#14B8A6]" : "border-[#E5E7EB] hover:border-[#14B8A6]/50"
                                        )}
                                    >
                                        <img src={img} className="max-h-full object-contain" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* MIDDLE: Product Information */}
                    <div className="lg:col-span-5 flex flex-col">
                        <div className="flex flex-col gap-6">
                            <div className="flex">
                                <span className="text-[12px] font-bold text-[#14B8A6] bg-[#14B8A6]/5 px-4 py-1.5 rounded-full uppercase tracking-widest border border-[#14B8A6]/10">
                                    {getDisplayCategory(product)}
                                </span>
                            </div>

                            <h1 className="text-[36px] font-bold text-[#111827] leading-[44px] tracking-tight">
                                {translatedName || product.name}
                            </h1>

                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={18} className={i < Math.floor(localRating) ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#E5E7EB]"} />
                                    ))}
                                </div>
                                <span className="text-[15px] font-semibold text-[#6B7280]">
                                    {localRating.toFixed(1)} <span className="opacity-50 mx-1">|</span> {localReviewsCount} verified reviews
                                </span>
                            </div>

                            {/* Pricing block with unit toggle (Truck / Pallet / Carton)
                                The base product.price is for whatever unit was configured at creation
                                time. Other unit prices are derived using conversion factors. Different
                                markups per unit are applied server-side at order-time; here we surface
                                the indicative buy-tier price so buyers can compare. */}
                            {(() => {
                                const piecesPerCase = product.unitsPerCase || 0;
                                const casesPerPallet = product.casesPerPallet || 0;
                                const piecesPerPallet = product.unitsPerPallet || (piecesPerCase * casesPerPallet) || 0;
                                const palletsPerTruck = product.palletsPerShipment || 0;
                                const baseUnit = String(product.unit || 'piece').toLowerCase();

                                // ── Step 1: resolve per-piece BASE price (supplier raw, before markup) ──
                                // product.basePrice is the supplier raw price.
                                // If absent, reverse from product.price ÷ piece markup multiplier.
                                const rawBase = product.basePrice != null
                                    ? product.basePrice
                                    : product.price / markups.piece;

                                let basePerPiece = rawBase;
                                if ((baseUnit.includes('case') || baseUnit.includes('carton') || baseUnit.includes('box')) && piecesPerCase > 0)
                                    basePerPiece = rawBase / piecesPerCase;
                                else if (baseUnit.includes('pallet') && piecesPerPallet > 0)
                                    basePerPiece = rawBase / piecesPerPallet;
                                else if ((baseUnit.includes('truck') || baseUnit.includes('container') || baseUnit.includes('shipment') || baseUnit.includes('delivery')) && piecesPerPallet > 0 && palletsPerTruck > 0)
                                    basePerPiece = rawBase / (piecesPerPallet * palletsPerTruck);

                                // ── Step 2: customer-visible tier prices (base × qty × tier markup) ──
                                // Each tier uses its own markup: piece/carton → piece markup,
                                // pallet → pallet markup, truck → container markup.
                                const cartonPrice = piecesPerCase > 0
                                    ? basePerPiece * piecesPerCase * markups.piece
                                    : null;
                                const palletPrice = piecesPerPallet > 0
                                    ? basePerPiece * piecesPerPallet * markups.pallet
                                    : null;
                                const truckPrice = (piecesPerPallet > 0 && palletsPerTruck > 0)
                                    ? basePerPiece * piecesPerPallet * palletsPerTruck * markups.container
                                    : null;

                                // Fallback per-piece customer price (with piece markup applied)
                                const perPiece = basePerPiece * markups.piece;

                                // qty = number of cartons inside the tier (so price/qty = per-carton price)
                                // For 'piece', qty is fractional (1 / piecesPerCase) so the per-carton math
                                // and the per-piece view stay consistent.
                                const options: Array<{ key: 'truck'|'pallet'|'carton'; label: string; emoji: string; price: number | null; qty: number }> = [];
                                if (truckPrice !== null)  options.push({ key: 'truck',  label: 'Truck',  emoji: '🚛', price: truckPrice,  qty: (casesPerPallet * palletsPerTruck) || 1 });
                                if (palletPrice !== null) options.push({ key: 'pallet', label: 'Pallet', emoji: '📦', price: palletPrice, qty: casesPerPallet || 1 });
                                if (cartonPrice !== null) options.push({ key: 'carton', label: 'Case',   emoji: '🗃️', price: cartonPrice, qty: 1 });
                                // B2B marketplace — no single-piece option.
                                if (options.length === 0) options.push({ key: 'carton', label: product.unit || 'Case', emoji: '📦', price: product.price, qty: 1 });

                                // Default: use admin-configured unit, fall back to the largest available
                                const initialSelected = options.find(o => o.key === adminDefaultUnit)?.key ?? options[0].key;
                                if (selectedUnit === undefined) {
                                    setTimeout(() => setSelectedUnit(initialSelected), 0);
                                }
                                const active = options.find(o => o.key === (selectedUnit ?? initialSelected)) || options[0];

                                // ── MOQ enforcement ──────────────────────────────────────────────────────
                                // Convert MOQ (in pieces) to the selected unit. Minimum = 1 always.
                                const moqPieces = product.moq || 1;
                                const piecesPerActiveUnit =
                                    active.key === 'carton' ? (piecesPerCase || 1)
                                    : active.key === 'pallet' ? (piecesPerCase || 1) * (casesPerPallet || 1)
                                    : (piecesPerCase || 1) * (casesPerPallet || 1) * (palletsPerTruck || 1);
                                const minUnits = Math.max(1, Math.ceil(moqPieces / piecesPerActiveUnit));

                                // tierPrice = full price for the selected tier (carton total, pallet total, or truck total)
                                const tierPrice = active.price != null ? active.price : perPiece;
                                // customTotal = grand total for quantity tiers ordered (tierTotal × qty)
                                const customTotal = tierPrice * quantity;

                                return (
                                    <div className="flex flex-col gap-4 py-5 border-y border-[#E5E7EB]">

                                        {/* Unit tabs — Truck / Pallet / Carton.
                                            If the buyer already added this product to the cart at
                                            a specific tier, the OTHER two tiers render as disabled
                                            with a tooltip — Atlantis enforces one tier per SKU
                                            per cart so prices can't be mixed across tiers. */}
                                        <div className="grid grid-cols-3 gap-2">
                                            {options.map((opt) => {
                                                const isLockedOut = !!lockedTier && lockedTier !== opt.key;
                                                return (
                                                <button
                                                    key={opt.key}
                                                    disabled={isLockedOut}
                                                    title={isLockedOut
                                                        ? 'This product is already in your cart as ' +
                                                          (lockedTier === 'truck' ? 'Truck' : lockedTier === 'pallet' ? 'Pallet' : 'Case') +
                                                          '. Remove it from the cart first to switch tier.'
                                                        : undefined}
                                                    onClick={() => {
                                                        if (isLockedOut) return;
                                                        // Compute minUnits for the NEW unit type before switching
                                                        const ppuNew =
                                                            opt.key === 'carton' ? (piecesPerCase || 1)
                                                            : opt.key === 'pallet' ? (piecesPerCase || 1) * (casesPerPallet || 1)
                                                            : (piecesPerCase || 1) * (casesPerPallet || 1) * (palletsPerTruck || 1);
                                                        const minNew = Math.max(1, Math.ceil(moqPieces / ppuNew));
                                                        setSelectedUnit(opt.key);
                                                        setQuantity(minNew);
                                                    }}
                                                    className={cn(
                                                        'flex flex-col items-center py-3 px-2 rounded-2xl border-2 text-center transition-all',
                                                        active.key === opt.key
                                                            ? 'border-[#0F172A] bg-[#0F172A] text-white shadow-lg'
                                                            : isLockedOut
                                                                ? 'border-[#E5E7EB] bg-[#F8FAFC] text-[#CBD5E1] cursor-not-allowed opacity-60'
                                                                : 'border-[#E5E7EB] bg-white text-[#475569] hover:border-[#0F172A]/40'
                                                    )}
                                                >
                                                    <span className="text-[20px] mb-0.5">{opt.emoji}</span>
                                                    <span className="text-[11px] font-black uppercase tracking-widest">{opt.label}</span>
                                                    {opt.price != null && (
                                                        <span className={cn('text-[11px] font-semibold mt-0.5', active.key === opt.key ? 'text-white/70' : 'text-[#9CA3AF]')}>
                                                            {formatPrice(opt.price)} / {opt.label.toLowerCase()}
                                                        </span>
                                                    )}
                                                </button>
                                                );
                                            })}
                                        </div>
                                        {lockedTier && (
                                            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-semibold">
                                                <span className="text-[14px]">🔒</span>
                                                <span>Locked to <strong>{lockedTier === 'truck' ? 'Truck' : lockedTier === 'pallet' ? 'Pallet' : 'Case'}</strong> — this product is already in your cart at that tier. Remove it from the cart to switch tier.</span>
                                            </div>
                                        )}

                                        {/* Selected unit price + quantity multiplier */}
                                        <div className="flex items-end justify-between gap-4">
                                            <div>
                                                <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-1">
                                                    {quantity > 1 ? `${quantity} × ${active.label}` : `Per ${active.label}`}
                                                </p>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-[40px] font-black text-[#111827] tracking-tighter leading-none">
                                                        {formatPrice(tierPrice)}
                                                    </span>
                                                    <span className="text-[15px] font-medium text-[#6B7280]">/ {active.label.toLowerCase()}</span>
                                                </div>
                                                {quantity > 1 && (
                                                    <p className="text-[12px] text-[#9CA3AF] mt-0.5">
                                                        Total: <strong className="text-[#111827]">{formatPrice(customTotal)}</strong>
                                                    </p>
                                                )}
                                            </div>

                                            {/* Quantity selector */}
                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => setQuantity(q => Math.max(minUnits, q - 1))}
                                                        disabled={quantity <= minUnits}
                                                        className="w-9 h-9 rounded-full border border-[#E5E7EB] flex items-center justify-center font-bold text-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed text-[#475569] hover:border-[#0F172A] hover:text-[#0F172A]"
                                                    >−</button>
                                                    <span className="w-10 text-center text-[15px] font-black text-[#111827]">{quantity}</span>
                                                    <button
                                                        onClick={() => setQuantity(q => q + 1)}
                                                        className="w-9 h-9 rounded-full border border-[#E5E7EB] flex items-center justify-center text-[#475569] hover:border-[#0F172A] hover:text-[#0F172A] font-bold text-lg transition-all"
                                                    >+</button>
                                                </div>
                                                {minUnits > 1 && (
                                                    <p className="text-[10px] text-amber-600 font-semibold">
                                                        Min. {minUnits} {active.label.toLowerCase()}{minUnits > 1 ? 's' : ''}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Breakdown hint (multi-unit orders) */}
                                        {quantity > 1 && (
                                            <p className="text-[12px] text-[#6B7280] bg-[#F8FAFC] rounded-xl px-3 py-2 leading-relaxed">
                                                {quantity} {active.label.toLowerCase()}{quantity > 1 ? 's' : ''} × {formatPrice(active.price ?? product.price)} = <strong className="text-[#111827]">{formatPrice(customTotal)}</strong>
                                                {active.key === 'truck' && palletsPerTruck > 0 && <span className="ml-2 text-[#9CA3AF]">({quantity * (casesPerPallet * palletsPerTruck)} cartons total)</span>}
                                                {active.key === 'pallet' && casesPerPallet > 0 && <span className="ml-2 text-[#9CA3AF]">({quantity * casesPerPallet} cartons total)</span>}
                                                {active.key === 'carton' && piecesPerCase > 0 && <span className="ml-2 text-[#9CA3AF]">({quantity * piecesPerCase} pcs)</span>}
                                            </p>
                                        )}

                                        <div className="flex items-center gap-2 text-emerald-600">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[12px] font-bold uppercase tracking-widest">In Active Distribution</span>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="grid grid-cols-2 gap-x-10 gap-y-8 py-2">
                                <div className="space-y-1.5">
                                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest">Min. Sourcing</p>
                                    <p className="text-[18px] font-bold text-[#111827] capitalize">
                                        {(() => {
                                            const qty = product.moq ?? product.minOrder ?? 1;
                                            const u = String(product.moqUnit || 'PIECE').toUpperCase();
                                            const unitLabel: Record<string, string> = {
                                                PIECE: qty === 1 ? 'piece' : 'pieces',
                                                CASE: qty === 1 ? 'case' : 'cases',
                                                PALLET: qty === 1 ? 'pallet' : 'pallets',
                                                TRUCK: qty === 1 ? 'truck' : 'trucks',
                                            };
                                            return `${qty} ${unitLabel[u] || (qty === 1 ? 'unit' : 'units')}`;
                                        })()}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest">Unit Type</p>
                                    <p className="text-[18px] font-bold text-[#111827] capitalize">
                                        {(() => {
                                            const u = selectedUnit ?? adminDefaultUnit;
                                            if (u === 'truck')  return 'Truck';
                                            if (u === 'pallet') return 'Pallet';
                                            return 'Case';
                                        })()}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest">Inventory Status</p>
                                    <p className={cn("text-[18px] font-bold", product.readyForDispatch ? "text-[#14B8A6]" : "text-amber-500")}>
                                        {product.readyForDispatch ? 'Immediate Availability' : 'Made to Order'}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest">Reference SKU</p>
                                    <p className="text-[18px] font-bold text-[#111827] font-mono">ATL-{product.id.slice(0, 8).toUpperCase()}</p>
                                </div>
                            </div>


                            <div className="flex flex-col gap-5 pt-6">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center h-14 bg-white border border-[#E5E7EB] rounded-2xl p-1 shrink-0 shadow-sm">
                                        <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-12 h-full flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 transition-colors">
                                            <Minus size={18} />
                                        </button>
                                        <span className="w-14 text-center font-bold text-lg">{quantity}</span>
                                        <button onClick={() => setQuantity(quantity + 1)} className="w-12 h-full flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 transition-colors">
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                    <Button
                                        onClick={handleAdd}
                                        className="h-14 flex-1 bg-[#14B8A6] hover:bg-[#0D9488] text-white font-bold text-md rounded-2xl transition-all shadow-xl shadow-[#14B8A6]/20 flex items-center justify-center gap-3"
                                    >
                                        {isAdded ? <><Check size={20} /> Added to Order</> : <><ShoppingCart size={20} /> {isLoggedIn ? 'Add to Procurement List' : 'Login to Order'}</>}
                                    </Button>
                                </div>

                                {/* AI Pricing Assistant — REMOVED from buyer-facing PDP.
                                    Buyers shouldn't have a "why is this price?" tool —
                                    that exposes markup math and invites haggling. The
                                    component is still imported for the admin variants
                                    if/when those are wired up. */}
                            </div>

                            <div className="pt-8 border-t border-[#E5E7EB] space-y-4">
                                <div className="flex items-start gap-3 p-4 bg-[#14B8A6]/5 border border-[#14B8A6]/10 rounded-2xl">
                                    <ShieldCheck size={20} className="text-[#14B8A6] shrink-0 mt-0.5" />
                                    <p className="text-[13px] font-semibold text-[#0D9488] leading-relaxed">
                                        {isAr 
                                            ? 'إصدار احترافي مُحسّن لعمليات التوريد B2B. يتميز بوثائق توزيع معتمدة ومعايير امتثال للمؤسسات.'
                                            : 'Professional-grade variant natively optimized for B2B procurement. Features verified distribution documentation and enterprise compliance standards.'
                                        }
                                    </p>
                                </div>
                                <p className="text-[15px] text-[#4B5563] leading-[24px]">
                                    {translatedDesc || product.description || (isAr ? 'لا يوجد وصف متاح حالياً لهذا المنتج.' : 'No detailed description provided for this variant yet.')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Stacked Cards */}
                    <div className="lg:col-span-3 space-y-4">
                        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-8 shadow-sm">
                            <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2 mb-6">
                                <ShieldCheck size={20} className="text-[#14B8A6]" />
                                Platform Assurance
                            </h3>
                            <ul className="space-y-4">
                                {[
                                    'Atlantis Verified Product',
                                    'Quality Checked',
                                    'Secure Payment',
                                    'Certified Distribution'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-[14px] font-medium text-[#4B5563]">
                                        <CheckCircle2 size={16} className="text-[#14B8A6]" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-8 shadow-sm">
                            <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2 mb-6">
                                <Truck size={20} className="text-[#14B8A6]" />
                                Logistics & Delivery
                            </h3>
                            <div className="space-y-6">
                                {(() => {
                                    // EU country list — used to gate the 30-day returns + standard transit time
                                    const EU_COUNTRIES = new Set([
                                        'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','GB','UK','UNITED KINGDOM','EU','EUROPE'
                                    ]);
                                    const country = (user?.country || '').toUpperCase().trim();
                                    const isEU = country && EU_COUNTRIES.has(country);
                                    const returnsLabel = isEU ? 'Returns: 30 Days' : 'Returns: 5–10 Days';
                                    const returnsSub = isEU ? 'Hassle-free corporate returns (EU)' : 'Standard returns window for non-EU shipments';
                                    return (
                                        <>
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                                                    <Package size={18} className="text-slate-400" />
                                                </div>
                                                <div>
                                                    <p className="text-[13px] font-bold text-[#111827]">Delivery: calculated at checkout</p>
                                                    <p className="text-[11px] text-[#6B7280]">
                                                        {product.readyForDispatch ? 'Ready to ship' : `Made to order (${product.leadTime || 7}d lead time)`}
                                                        {user?.country ? ` • Shipping to ${user.country}` : ''}
                                                        {' • Transit depends on carrier, weight, route'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                                                    <RotateCcw size={18} className="text-slate-400" />
                                                </div>
                                                <div>
                                                    <p className="text-[13px] font-bold text-[#111827]">{returnsLabel}</p>
                                                    <p className="text-[11px] text-[#6B7280]">{returnsSub}</p>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Bottom Section: Tabs */}
                <div className="mt-12 bg-white border border-[#E5E7EB] rounded-[24px] shadow-sm overflow-hidden">
                    <div className="flex border-b border-[#E5E7EB] px-8">
                        {['Description', 'Specifications', 'Reviews'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "h-16 px-8 text-[12px] font-bold uppercase tracking-widest transition-all border-b-2",
                                    activeTab === tab ? "border-[#14B8A6] text-[#14B8A6]" : "border-transparent text-slate-400 hover:text-slate-600"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="p-10">
                        {activeTab === 'Description' && (
                                <div className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#111827]">Product Overview</h3>
                                    <p className="text-[15px] text-[#4B5563] leading-relaxed">
                                        {translatedDesc || product.description || 'This product is curated and verified by Atlantis for enterprise-scale distribution.'}
                                    </p>
                                    <ul className="space-y-4 pt-4">
                                        {[
                                            'Official Product of Atlantis',
                                            'Full Export Documentation Pack',
                                            'Premium Quality Manufacturing',
                                            'Quality & Safety Certified'
                                        ].map((li, i) => (
                                            <li key={i} className="flex items-center gap-3 text-[14px] font-medium text-[#4B5563]">
                                                <CheckCircle2 size={18} className="text-[#14B8A6]" />
                                                {li}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                        )}

                        {activeTab === 'Specifications' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Logistics & Physical</h4>
                                    <div className="space-y-4">
                                        {[
                                            // Don't append "kg" if the weight already contains a unit (g, kg, ml, etc).
                                            // Suppliers commonly type "100g" or "1.5kg" directly.
                                            { label: 'Weight per Unit', value: product.weight ? (/[a-z]/i.test(String(product.weight)) ? String(product.weight) : `${product.weight} kg`) : 'N/A' },
                                            { label: 'Units per Pallet', value: `${product.unitsPerPallet || 'N/A'} pcs` },
                                            { label: 'Pallet per Truck', value: product.palletsPerShipment || 'N/A' },
                                            { label: 'Unit Type', value: product.unit || 'Standard' }
                                        ].map((item, i) => (
                                            <div key={i} className="flex justify-between py-3 border-b border-slate-200 last:border-0">
                                                <span className="text-[13px] font-medium text-slate-500">{item.label}</span>
                                                <span className="text-[13px] font-bold text-[#111827]">{item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Trade & Quality</h4>
                                    <div className="space-y-4">
                                        {[
                                            { label: 'Country of Origin', value: product.origin || 'N/A' },
                                            { label: 'BBD', value: product.shelfLife || 'N/A' },
                                            { label: 'Barcode (EAN)', value: product.ean || 'N/A' },
                                            { label: 'Brand Status', value: 'Verified by Atlantis' }
                                        ].map((item, i) => (
                                            <div key={i} className="flex justify-between py-3 border-b border-slate-200 last:border-0">
                                                <span className="text-[13px] font-medium text-slate-500">{item.label}</span>
                                                <span className="text-[13px] font-bold text-[#111827]">{item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {activeTab === 'Reviews' && (
                            <ReviewSection
                                productId={product.id}
                                onReviewSubmitted={(newRating, newCount) => {
                                    setLocalRating(newRating);
                                    setLocalReviewsCount(newCount);
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* 3. Recommended Products - Amazon Style */}
                {relatedProducts.length > 0 && (
                    <div className="mt-20 pt-10 border-t border-[#E5E7EB]">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-[24px] font-bold text-[#111827]">Products related to this item</h2>
                                <p className="text-[13px] text-[#6B7280] font-medium uppercase tracking-widest mt-1">Discover more from the collection</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => scroll('left')}
                                        className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <button 
                                        onClick={() => scroll('right')}
                                        className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                                <div className="w-px h-6 bg-slate-200 mx-2" />
                                <Link href={`/categories?category=${product.category || ''}`} className="text-[13px] font-bold text-[#14B8A6] hover:underline uppercase tracking-widest">
                                    View All
                                </Link>
                            </div>
                        </div>

                        <div 
                            ref={scrollContainerRef}
                            className="flex overflow-x-auto gap-6 no-scrollbar snap-x snap-mandatory"
                            style={{ scrollBehavior: 'smooth' }}
                        >
                            {relatedProducts.map((p) => (
                                <Link 
                                    key={p.id} 
                                    href={`/products/${p.id}`} 
                                    className="group bg-white border border-[#E5E7EB] rounded-[20px] p-4 hover:shadow-xl transition-all flex flex-col shrink-0 w-[240px] snap-start"
                                >
                                    <div className="aspect-square rounded-xl overflow-hidden mb-4 bg-slate-50 flex items-center justify-center p-4">
                                        <img src={p.image} alt={p.name} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        {(user?.role === 'ADMIN' || (user?.role === 'SUPPLIER' && p.supplierId === user?.id)) ? (
                                            <p className="text-[10px] font-bold text-[#14B8A6] uppercase tracking-widest truncate">{p.brand}</p>
                                        ) : (
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Sold by Atlantis</p>
                                        )}
                                        <h3 className="text-[13px] font-bold text-[#111827] line-clamp-2 leading-snug group-hover:text-[#14B8A6] transition-colors">{p.name}</h3>
                                        <div className="flex items-center gap-1">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} size={10} className={i < Math.floor(p.rating || 0) ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#E5E7EB]"} />
                                            ))}
                                            <span className="text-[10px] text-[#6B7280] font-medium ml-1">({p.reviewsCount || 0})</span>
                                        </div>
                                    </div>
                                    <div className="pt-4 mt-auto border-t border-slate-100 flex items-center justify-between">
                                        <span className="text-[15px] font-bold text-[#111827]">{formatPrice(p.price)}</span>
                                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#14B8A6] group-hover:text-white transition-all">
                                            <ShoppingCart size={14} />
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Image lightbox — click any product image to open */}
            <ImageLightbox
                images={allImages}
                startIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
                alt={product.name}
            />
        </div>
    );
}
