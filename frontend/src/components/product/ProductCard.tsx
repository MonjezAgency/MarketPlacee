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

    // Atlantis listing card pricing rule:
    //   The card always shows a PER-CASE price (not the full truck total).
    //   The markup applied to that per-case price is the TRUCK markup —
    //   i.e. the cheapest possible per-case price, which is what the buyer
    //   would pay if they bought a full truck. This tells them "from this
    //   price per case", and clicking through to the PDP lets them see
    //   what the per-case price becomes at Pallet or Case tier.
    const basePerCase = piecesPerCase > 0 ? basePerPiece * piecesPerCase : basePerPiece;
    const truckTierAvailable  = piecesPerCase > 0 && piecesPerPallet > 0 && palletsPerTruck > 0;
    const palletTierAvailable = piecesPerCase > 0 && piecesPerPallet > 0;
    const caseTierAvailable   = piecesPerCase > 0;

    // Pick the cheapest available tier markup — Truck if reachable,
    // otherwise Pallet, otherwise Case. Cards still represent the best
    // possible per-case price the buyer can unlock.
    let cardPrice: number;
    if (truckTierAvailable)       cardPrice = basePerCase * mContainer;
    else if (palletTierAvailable) cardPrice = basePerCase * mPallet;
    else if (caseTierAvailable)   cardPrice = basePerCase * mPiece;
    else                           cardPrice = displayPrice;
    const cardUnit = 'case';

    const rating = product.rating || 0;
    const reviews = product.reviewsCount || 0;
    const isBestSeller = index % 4 === 0;

    const handleAddToCart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isLoggedIn) {
            window.location.href = '/auth/login?redirect=' + encodeURIComponent(`/products/${product.id}`);
            return;
        }
        // Tier matters — Atlantis enforces tier-locked carts (Truck /
        // Pallet / Case). The card can't add directly because we don't
        // know which tier the buyer wants. Route them to the PDP where
        // the tier picker is, so the right markup is applied and the
        // tier gets locked into the cart line. This also gives us a
        // real engagement signal per tier click on the PDP.
        window.location.href = `/products/${product.id}`;
    };

    return (
        // Card animation tuning:
        //   • Mount: short fade-up. The previous `delay: index * 0.05`
        //     stacked linearly with the row index, so a card at #20 was
        //     waiting one full second before appearing. We cap at
        //     ~0.18 s so any card past the first 6 lands together —
        //     the customer sees the grid feel responsive on scroll.
        //   • Mount duration trimmed to 0.18 s (was Framer default 0.5).
        //   • Hover: a single transition-all duration-200 promotes
        //     shadow + transform together so the card lifts smoothly
        //     in one frame group instead of separate shadow/colour
        //     animations colliding.
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.18) }}
            className="group bg-card text-card-foreground rounded-lg border border-border/60 hover:shadow-md hover:border-border hover:-translate-y-0.5 transition-all duration-200 ease-out flex flex-col h-full overflow-hidden will-change-transform"
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
                        className="max-h-[160px] max-w-full object-contain mix-blend-multiply transition-opacity duration-150 group-hover:scale-[1.02] transition-transform"
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

                {/* ── "Your listing" badge ────────────────────────────────
                    Only the supplier who owns this product sees this pill.
                    Customers, anonymous visitors, and other suppliers
                    never see it — to them the product looks exactly the
                    same as any other Atlantis listing. Operator-requested
                    so a supplier browsing the public catalog can tell
                    "this row is mine" at a glance. Top-right corner so it
                    doesn't collide with Top Rated / Bulk Save chips on
                    the top-left. */}
                {isOwnProduct && (
                    <div className="absolute top-2 end-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[#0B1F3A] text-white text-[10px] font-bold uppercase tracking-wider shadow-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Your listing
                    </div>
                )}

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
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Sold by Atlantis</span>
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
                        {/* "Your Price" badge intentionally removed — the
                            "Your listing" pill in the image corner is enough
                            to tell the supplier this is their product. The
                            old "Your Price" label hinted that buyers see a
                            DIFFERENT price (i.e. revealed the platform
                            markup), which the operator wants kept private.
                            Supplier just sees the price plainly now —
                            no inside-baseball signal. */}
                    </div>

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
