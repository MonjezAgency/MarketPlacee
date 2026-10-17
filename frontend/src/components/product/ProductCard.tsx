'use client';

import Link from 'next/link';
import { Star, Check, ShieldCheck, ShoppingCart, ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import { getAdminDefaultUnit, getAdminMarkups, computeCardPrice, DEFAULT_MARKUPS, type Markups } from '@/lib/card-pricing';
import { useCart } from '@/lib/cart';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { type Product } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { formatPrice } from '@/lib/currency';
import { PromoBadge, WasPrice, percentOff, promoPriceOf, runningPromotion } from '@/components/promotions/PromotionPrice';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { translateText } from '@/lib/translator';
import { getDisplayCategory } from '@/lib/product-utils';
import { Trans } from '@/components/i18n/Trans';

export default function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
    const { currency } = useCurrency();
    const [isAdded, setIsAdded] = useState(false);
    const reduceMotion = useReducedMotion();
    const { addItem } = useCart();
    const { user, isLoggedIn } = useAuth();
    const { locale, t, meta } = useLanguage();
    const tl = (key: string, vars?: Record<string, string | number>) => t('landing', key, vars);

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
    const isOwnProduct = !!(user?.role?.toUpperCase() === 'SUPPLIER' && product.supplierId && user?.id === product.supplierId);

    // Admin-configured default display unit (truck / pallet / carton)
    const [, setDefaultUnit] = useState<'truck' | 'pallet' | 'carton'>('truck');
    const [markups, setMarkups] = useState<Markups>(DEFAULT_MARKUPS);
    useEffect(() => { getAdminDefaultUnit().then(setDefaultUnit); }, []);
    useEffect(() => { getAdminMarkups().then(setMarkups); }, []);

    // Per-case price at the cheapest reachable tier — see lib/card-pricing.
    const listCardPrice = computeCardPrice(product, markups, isOwnProduct);
    // Running special offer (server-attached only while it runs): same % off, rounded once, as the checkout.
    const promo = runningPromotion(product as any);
    const cardPrice = promo && listCardPrice > 0 ? promoPriceOf(listCardPrice, promo.discountPercent) : listCardPrice;

    const rating = product.rating || 0;
    const reviews = product.reviewsCount || 0;
    // Only from real review data — never by grid position.
    const isBestSeller = (product.rating ?? 0) >= 4.5 && (product.reviewsCount ?? 0) >= 5;

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

    // MOQ in its real unit (moq + moqUnit), never a made-up "pcs".
    const moqN = Number(product.moq) || 0;
    const moqUnitKey = ({ PIECE: 'moqPieces', CASE: 'moqCases', PALLET: 'moqPallets', TRUCK: 'moqTrucks' } as Record<string, string>)[String(product.moqUnit || 'PIECE').toUpperCase()] || 'moqPieces';
    const moqText = moqN > 0 ? tl(moqUnitKey, { count: moqN }) : null;

    return (
        // Card animation tuning: short fade-up, delay capped at ~0.18 s so
        // cards past the first row land together. Hover lifts only the
        // image well (Parallel-style) so the grid stays calm.
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            // Lift via framer-motion: its inline transform would override a CSS
            // hover:-translate-y class, so the hover lift must live here.
            whileHover={reduceMotion ? undefined : { y: -4, transition: { duration: 0.25, ease: 'easeOut' } }}
            transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.18) }}
            className="group relative flex flex-col h-full text-start rounded-[20px] p-2.5 -m-2.5 transition-[transform,box-shadow,background-color] duration-300 ease-out hover:bg-surface hover:shadow-[0_20px_44px_-14px_rgba(14,124,116,0.28),0_0_0_1px_rgba(46,196,182,0.18)] focus-within:bg-surface focus-within:shadow-[0_20px_44px_-14px_rgba(14,124,116,0.28),0_0_0_1px_rgba(46,196,182,0.18)] motion-reduce:transform-none"
        >
            {/* ── Image well — large, white, centred ─────────────────── */}
            <Link
                href={`/products/${product.id}`}
                className="relative block aspect-square rounded-2xl bg-media border border-line overflow-clip transition-colors duration-300 group-hover:border-line-strong"
                onMouseEnter={() => setIsHoveringImg(true)}
                onMouseLeave={() => setIsHoveringImg(false)}
            >
                {(product.image || (product.images && product.images.length > 0)) ? (
                    <img
                        src={allImages ? allImages[imgIndex] : (product.image || (product.images && product.images[0]) || '')}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        className="absolute inset-0 m-auto w-auto h-auto max-w-[82%] max-h-[82%] object-contain mix-blend-multiply transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-ink-4">
                        <ImageIcon size={40} strokeWidth={1.25} />
                    </div>
                )}

                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#0B1F3A]/[0.07] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                {/* Image index dots (when multiple images and hovering) */}
                {allImages && isHoveringImg && (
                    <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1 z-10">
                        {allImages.map((_, i) => (
                            <div key={i} className={cn('w-1.5 h-1.5 rounded-full transition-all duration-300', i === imgIndex ? 'bg-cta scale-125' : 'bg-[#CBD5E1]')} />
                        ))}
                    </div>
                )}

                {/* Floating badges */}
                <div className="absolute top-3 start-3 flex flex-col items-start gap-1.5">
                    {isBestSeller && (
                        <span className="inline-flex items-center gap-1 bg-[#FFF4E5] text-[#B45309] border border-[#FDE3BF] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide rtl:tracking-normal">
                            <Star className="w-2.5 h-2.5 fill-current" /> {tl('topRated')}
                        </span>
                    )}
                    {product.bulkSave && (
                        <span className="bg-[#ECFDF5] dark:bg-emerald-500/15 text-[#047857] border border-[#BBF7D0] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide rtl:tracking-normal">
                            {tl('bulkSave')}
                        </span>
                    )}
                </div>

                {/* "Your listing" — only the owning supplier sees this pill. */}
                {isOwnProduct && (
                    <span className="absolute top-3 end-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cta text-cta-fg text-[10px] font-bold uppercase tracking-wide rtl:tracking-normal shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {tl('yourListing')}
                    </span>
                )}

                {isOutOfStock && (
                    <div className="absolute inset-0 bg-media/75 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <span className="bg-cta text-cta-fg px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest rtl:tracking-normal">{tl('outOfStock')}</span>
                    </div>
                )}
            </Link>

            {/* ── Details ───────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 pt-3 px-0.5">
                {/* Seller / brand row */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    {(user?.role === 'ADMIN' || isOwnProduct) ? (
                        <span className="text-[12px] font-bold text-ink truncate">{product.brand}</span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#2EC4B6]" /> {tl('soldByAtlantis')}
                        </span>
                    )}
                    {rating > 0 && (
                        <span className="inline-flex items-center gap-1 text-[12px] text-ink-2 shrink-0">
                            <Star className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]" />
                            {reviews > 0 ? reviews : ''}
                        </span>
                    )}
                </div>

                {/* Title */}
                <Link href={`/products/${product.id}`}>
                    <h3 className="font-sans text-[14px] font-semibold leading-snug line-clamp-2 h-[2.75em] text-ink hover:text-teal transition-colors">
                        {translatedName}
                    </h3>
                </Link>

                {/* Barcode (link code) — always one line, so every card in a row lines up. */}
                <p className="mt-1 h-[18px] text-[12px] leading-[18px] text-ink-3 tabular-nums tracking-wide truncate" title={product.ean || undefined}>
                    {product.ean ? <bdi dir="ltr">{product.ean}</bdi> : tl('noLinkCode')}
                </p>

                {/* Price & Min Order */}
                <div className="mt-auto pt-2.5">
                    <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-0.5">
                        {/* Stable headline price — the cheapest reachable
                            per-case tier. No animation on the number: B2B
                            buyers want a steady price they can read at a glance. */}
                        {!isLoggedIn || product.pricesHidden ? (
                            <Link href={`/auth/login?redirect=${encodeURIComponent(`/products/${product.id}`)}`} onClick={(e) => e.stopPropagation()}
                                className="text-[13px] font-semibold text-teal hover:underline">
                                {tl('signInForPrice')}
                            </Link>
                        ) : cardPrice > 0 ? (
                            <div className="min-w-0">
                                <div className="flex items-baseline gap-1 min-w-0">
                                    <span className="text-[17px] font-bold text-ink tabular-nums tracking-tight">
                                        <bdi>{formatPrice(cardPrice, currency, meta.intl)}</bdi>
                                    </span>
                                    <span className="text-[12px] text-ink-3 font-medium">{tl('perCase')}</span>
                                </div>
                                {promo && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <WasPrice className="text-[12px]"><bdi>{formatPrice(listCardPrice, currency, meta.intl)}</bdi></WasPrice>
                                        <PromoBadge pct={percentOff(listCardPrice, cardPrice)} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            // No list price on file — never show €0.00.
                            <span className="text-[14px] font-semibold text-ink-2">{tl('priceOnRequest')}</span>
                        )}
                        <span className="text-[11px] text-ink-3 shrink-0 pb-0.5">
                            {moqText ? <Trans text={tl('moq', { qty: moqText })} tags={{ b: (c) => <span className="font-semibold text-ink">{c}</span> }} /> : tl('noMoq')}
                        </span>
                    </div>

                    <button
                        onClick={handleAddToCart}
                        disabled={isOutOfStock || isAdded}
                        className={cn(
                            "mt-2.5 w-full h-9 rounded-lg flex items-center justify-center gap-1.5 text-[12.5px] font-semibold transition-colors duration-200 disabled:cursor-not-allowed",
                            isAdded
                                ? "bg-[#2EC4B6] text-white"
                                : isOutOfStock
                                    ? "bg-surface-3 text-ink-4"
                                    : "bg-cta text-white hover:bg-cta-hover active:bg-cta"
                        )}
                    >
                        {isAdded ? (
                            <Check size={15} className="animate-in zoom-in duration-300" />
                        ) : (
                            <>
                                <ShoppingCart size={15} /> {tl('addToCart')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
