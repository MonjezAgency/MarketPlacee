'use client';

import Link from 'next/link';
import { Star, Check, ShieldCheck, ShoppingCart, ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

// ── Module-level singletons: fetch admin config once across all card instances ─
let _defaultUnit: 'truck' | 'pallet' | 'carton' | null = null;
let _defaultUnitPromise: Promise<'truck' | 'pallet' | 'carton'> | null = null;

function getAdminDefaultUnit(): Promise<'truck' | 'pallet' | 'carton'> {
    if (_defaultUnit) return Promise.resolve(_defaultUnit);
    if (!_defaultUnitPromise) {
        const base = process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-production-a2b5.up.railway.app';
        _defaultUnitPromise = fetch(`${base}/config/default-unit`)
            .then(r => r.json())
            .then(d => {
                const u = d?.unit;
                _defaultUnit = (['truck', 'pallet', 'carton'].includes(u) ? u : 'truck') as typeof _defaultUnit;
                return _defaultUnit!;
            })
            .catch(() => { _defaultUnit = 'truck'; return _defaultUnit!; });
    }
    return _defaultUnitPromise;
}

let _markups: { piece: number; pallet: number; container: number } | null = null;
let _markupsPromise: Promise<{ piece: number; pallet: number; container: number }> | null = null;

function getAdminMarkups(): Promise<{ piece: number; pallet: number; container: number }> {
    if (_markups) return Promise.resolve(_markups);
    if (!_markupsPromise) {
        const base = process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-production-a2b5.up.railway.app';
        _markupsPromise = fetch(`${base}/config/markup`)
            .then(r => r.json())
            .then(d => {
                _markups = {
                    piece: Number(d?.piece) || 1.10,
                    pallet: Number(d?.pallet) || 1.05,
                    container: Number(d?.container) || 1.02,
                };
                return _markups!;
            })
            .catch(() => { _markups = { piece: 1.10, pallet: 1.05, container: 1.02 }; return _markups!; });
    }
    return _markupsPromise;
}
import { useCart } from '@/lib/cart';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { type Product } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { translateText } from '@/lib/translator';
import { getDisplayCategory } from '@/lib/product-utils';

export default function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
    const { currency } = useCurrency();
    const [isAdded, setIsAdded] = useState(false);
    const { addItem } = useCart();
    const { user, isLoggedIn } = useAuth();
    const { locale } = useLanguage();

    const [translatedName, setTranslatedName] = useState(product.name);
    const isOutOfStock = product.inStock === false || (product.stock !== undefined && product.stock <= 0);

    // Image auto-rotate on hover
    const allImages = product.images && product.images.length > 1 ? product.images : null;
    const [imgIndex, setImgIndex] = useState(0);
    const [isHoveringImg, setIsHoveringImg] = useState(false);
    const rotateTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (isHoveringImg && allImages) {
            rotateTimer.current = setInterval(() => {
                setImgIndex(i => (i + 1) % allImages.length);
            }, 1500);
        } else {
            if (rotateTimer.current) clearInterval(rotateTimer.current);
            setImgIndex(0);
        }
        return () => { if (rotateTimer.current) clearInterval(rotateTimer.current); };
    }, [isHoveringImg, allImages]);

    useEffect(() => {
        const rawName = product.name?.trim() || '';
        if (!rawName) {
            setTranslatedName('');
            return;
        }

        if (locale === 'en') {
            setTranslatedName(rawName);
            return;
        }

        // Check for stored translations in variants
        const storedTranslations = product.variants?.find((v: any) => v.name === '__translations')?.values?.[0];
        if (storedTranslations) {
            try {
                const parsed = JSON.parse(storedTranslations);
                if (parsed[locale]?.name) {
                    setTranslatedName(parsed[locale].name);
                    return;
                }
            } catch (e) {}
        }

        // Fallback to dynamic translation
        translateText(rawName, locale).then(setTranslatedName);
    }, [locale, product.name, product.variants]);

    // Suppliers see their own base price (no markup)
    const isOwnProduct = user?.role?.toUpperCase() === 'SUPPLIER' && product.supplierId && user?.id === product.supplierId;
    const displayPrice = isOwnProduct && product.basePrice ? product.basePrice : product.price;

    // Admin-configured default display unit (truck / pallet / carton)
    const [defaultUnit, setDefaultUnit] = useState<'truck' | 'pallet' | 'carton'>('truck');
    const [markups, setMarkups] = useState<{ piece: number; pallet: number; container: number }>({ piece: 1.10, pallet: 1.05, container: 1.02 });
    useEffect(() => { getAdminDefaultUnit().then(setDefaultUnit); }, []);
    useEffect(() => { getAdminMarkups().then(setMarkups); }, []);

    // Compute unit-tier price for the card
    const piecesPerCase = product.unitsPerCase || 0;
    const casesPerPallet = product.casesPerPallet || 0;
    const piecesPerPallet = product.unitsPerPallet || (piecesPerCase * casesPerPallet) || 0;
    const palletsPerTruck = product.palletsPerShipment || 0;

    // ── Resolve per-piece BASE price (supplier raw, before markup) ────────────
    // Suppliers viewing their own product see raw base prices (no markup).
    // Everyone else: derive base from product.basePrice or reverse from product.price ÷ piece markup.
    const baseUnit = String(product.unit || 'piece').toLowerCase();

    const rawBase = isOwnProduct
        ? displayPrice
        : (product.basePrice != null ? product.basePrice : displayPrice / markups.piece);

    let basePerPiece = rawBase;
    if ((baseUnit.includes('case') || baseUnit.includes('carton') || baseUnit.includes('box')) && piecesPerCase > 0)
        basePerPiece = rawBase / piecesPerCase;
    else if (baseUnit.includes('pallet') && piecesPerPallet > 0)
        basePerPiece = rawBase / piecesPerPallet;
    else if ((baseUnit.includes('truck') || baseUnit.includes('container') || baseUnit.includes('shipment')) && piecesPerPallet > 0 && palletsPerTruck > 0)
        basePerPiece = rawBase / (piecesPerPallet * palletsPerTruck);

    // Tier-specific markup multipliers (suppliers see base prices, no markup)
    const mPiece     = isOwnProduct ? 1 : markups.piece;
    const mPallet    = isOwnProduct ? 1 : markups.pallet;
    const mContainer = isOwnProduct ? 1 : markups.container;

    const cartonPrice = piecesPerCase > 0 ? basePerPiece * piecesPerCase * mPiece : null;
    const palletPrice = piecesPerPallet > 0 ? basePerPiece * piecesPerPallet * mPallet : null;
    const truckPrice  = (piecesPerPallet > 0 && palletsPerTruck > 0) ? basePerPiece * piecesPerPallet * palletsPerTruck * mContainer : null;

    // Tier list — only include tiers we can compute.
    type Tier = { key: 'truck' | 'pallet' | 'carton'; label: string; price: number };
    const tiers: Tier[] = [];
    if (truckPrice !== null)  tiers.push({ key: 'truck',  label: 'truck',  price: truckPrice });
    if (palletPrice !== null) tiers.push({ key: 'pallet', label: 'pallet', price: palletPrice });
    if (cartonPrice !== null) tiers.push({ key: 'carton', label: 'ctn',    price: cartonPrice });
    if (tiers.length === 0)   tiers.push({ key: 'carton', label: String(product.unit || 'unit'), price: displayPrice });

    // Headline price is FIXED on the admin-configured default unit (truck by
    // default). The user explicitly didn't want the price cycling on the
    // card — they want a stable headline so buyers see one canonical bulk
    // price, and tier switching belongs on the product detail page where
    // we get a real engagement signal (PDP click). The animated dots below
    // are purely decorative — they hint that more tiers exist.
    const headlineTier = tiers.find(t => t.key === defaultUnit) || tiers[0];
    const cardPrice = headlineTier.price;
    const cardUnit  = headlineTier.label;
    const headlineIndex = Math.max(0, tiers.findIndex(t => t.key === headlineTier.key));

    // Decorative dots — animate which dot is highlighted but don't change
    // the displayed price. Pauses on hover so the indicator is steady when
    // the buyer is looking at the card.
    const [dotIndex, setDotIndex] = useState(headlineIndex);
    useEffect(() => {
        setDotIndex(headlineIndex);
    }, [headlineIndex]);
    useEffect(() => {
        if (tiers.length <= 1) return;
        if (isHoveringImg) return;
        const id = setInterval(() => {
            setDotIndex(i => (i + 1) % tiers.length);
        }, 3500);
        return () => clearInterval(id);
    }, [tiers.length, isHoveringImg]);

    const rating = product.rating || 0;
    const reviews = product.reviewsCount || 0;
    const isBestSeller = index % 4 === 0;

    const handleAddToCart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isLoggedIn) {
            window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname);
            return;
        }
        if (isAdded) return;

        addItem({
            id: product.id,
            name: product.name,
            brand: product.brand || 'Premium',
            price: product.price,
            image: product.image || '',
            unit: product.unit || 'pcs',
        });

        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="group bg-card text-card-foreground rounded-lg border border-border/60 hover:shadow-lg transition-shadow duration-300 flex flex-col h-full overflow-hidden"
        >
            <div
                className="relative p-4 flex justify-center items-center h-[200px] border-b border-border/30 bg-white"
                onMouseEnter={() => setIsHoveringImg(true)}
                onMouseLeave={() => setIsHoveringImg(false)}
            >
                { (product.image || (product.images && product.images.length > 0)) ? (
                    <img
                        src={allImages ? allImages[imgIndex] : (product.image || (product.images && product.images[0]) || '')}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        className="max-h-[160px] max-w-full object-contain mix-blend-multiply transition-opacity duration-300"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="w-full h-[160px] flex items-center justify-center text-muted-foreground/30">
                        {/* Empty layout as requested */}
                    </div>
                )}
                {/* Image index dots (when multiple images and hovering) */}
                {allImages && isHoveringImg && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
                        {allImages.map((_, i) => (
                            <div key={i} className={cn('w-1.5 h-1.5 rounded-full transition-all duration-300', i === imgIndex ? 'bg-primary scale-125' : 'bg-border')} />
                        ))}
                    </div>
                )}

                {/* Floating Badges */}
                <div className="absolute top-2 start-2 flex flex-col gap-1.5">
                    {isBestSeller && (
                        <div className="bg-[#E47911] text-white px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider">
                            Top Rated
                        </div>
                    )}
                    {product.bulkSave && (
                        <div className="bg-emerald-600 text-white px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider">
                            Bulk Save
                        </div>
                    )}
                </div>

                {isOutOfStock && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <span className="bg-[#0B1F3A] text-white px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest">Out of Stock</span>
                    </div>
                )}
            </div>

            <div className="flex flex-col flex-1 p-4">
                {/* Brand & Stats */}
                <div className="flex items-center justify-between mb-2">
                    {(user?.role === 'ADMIN' || isOwnProduct) ? (
                        <span className="text-[11px] font-bold uppercase tracking-widest text-primary/80">{product.brand}</span>
                    ) : (
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Verified Supplier</span>
                    )}
                    <div className="flex items-center gap-1">
                        {rating > 0 ? (
                            <>
                                <Star className="w-3 h-3 fill-[#FFA41C] text-[#FFA41C]" />
                                <span className="text-xs text-[#007185] cursor-pointer hover:underline hover:text-[#C45500]">{reviews > 0 ? reviews : ''}</span>
                            </>
                        ) : (
                            <span className="text-xs text-muted-foreground/50"></span>
                        )}
                    </div>
                </div>

                {/* Title */}
                <Link href={`/products/${product.id}`} className="group/title">
                    <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-3 text-foreground hover:text-[#C45500] transition-colors">
                        {translatedName}
                    </h3>
                </Link>

                {/* Price & Min Order */}
                <div className="mt-auto space-y-3">
                    <div className="flex items-baseline gap-1 flex-wrap">
                        {/* Stable headline price — always the admin default
                            tier (truck unless changed). No animation on the
                            number itself: B2B buyers want a steady canonical
                            price they can read at a glance. */}
                        <span className="text-xl font-bold text-foreground">
                            {formatPrice(cardPrice, currency)}
                        </span>
                        <span className="text-muted-foreground text-xs font-medium">
                            / {cardUnit}
                        </span>
                        {isOwnProduct && (
                            <span className="ms-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Your Price</span>
                        )}
                    </div>
                    {/* Decorative tier-availability indicator. Animates
                        through dots as a hint that there are more bulk
                        tiers, but the price above stays stable. Tier
                        switching happens only on the product detail page
                        (= a real PDP click for analytics). */}
                    {tiers.length > 1 && (
                        <div className="flex items-center gap-1" aria-hidden="true">
                            {tiers.map((t, i) => (
                                <span
                                    key={t.key}
                                    className={cn(
                                        'h-[3px] rounded-full transition-all duration-500',
                                        i === dotIndex
                                            ? 'bg-[#0B1F3A] w-5'
                                            : 'bg-slate-200 w-2',
                                    )}
                                />
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Min Order</span>
                            <span className="text-xs font-bold">{product.minOrder} pcs</span>
                        </div>

                        <button
                            onClick={handleAddToCart}
                            disabled={isOutOfStock || isAdded}
                            className={cn(
                                "h-9 px-4 rounded-full flex items-center justify-center gap-2 transition-all duration-300 text-xs font-bold w-1/2",
                                isAdded
                                    ? "bg-accent text-accent-foreground"
                                    : "bg-[#FFD814] text-black hover:bg-[#F7CA00] border border-[#FCD200]"
                            )}
                        >
                            {isAdded ? (
                                <Check size={14} className="animate-in zoom-in duration-300" />
                            ) : (
                                "Add to Cart"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
