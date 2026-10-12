'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Star, Plus, Minus, Check, Truck,
    ShieldCheck, RotateCcw, ChevronRight, Share2,
    Heart, Info, Package, Sparkles, ArrowLeft, ShoppingCart, X, ChevronLeft,
    Shield, CheckCircle2, Download, FileText, FileBadge, Barcode
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
import { cn, prettifyVariantSignature } from '@/lib/utils';
import { useWishlist } from '@/hooks/useWishlist';
import { getDisplayCategory } from '@/lib/product-utils';
import ImageLightbox from '@/components/ImageLightbox';
import { brandLogo } from '@/lib/brand-logos';
import { computeCardPrice } from '@/lib/card-pricing';
import { round2, minUnitsFor as serverMinUnits, type LoadKind } from '@/lib/wholesale';
import MixBuilder from '@/components/product/MixBuilder';
import MixDiscovery from '@/components/product/MixDiscovery';
import { ProductRail } from '@/components/product/ProductRail';
import { useMixSelection } from '@/lib/useMixSelection';


export default function ProductDetailClient() {
    const { id } = useParams();
    const { addItem, items: cartItems } = useCart();
    const [quantity, setQuantity] = useState(1);
    const [isAdded, setIsAdded] = useState(false);
    // Mix composer post-add prompt: after a buyer fills a truck/pallet
    // and adds it to cart, ask whether they want to build another of
    // the same tier. If yes, we keep them on the page with a fresh
    // empty composer; if no, we route to /cart.
    const [showAddAnotherPrompt, setShowAddAnotherPrompt] = useState(false);
    // Variant picks the buyer makes on this PDP — e.g.
    //   { "Size": "Large", "Flavour": "Vanilla" }
    // Mandatory before Add to Cart: every group with values must have
    // a selection. Carried into the cart line so the same product at
    // a different variant combo is a SEPARATE line, not a merge.
    const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
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
    const [markups, setMarkups] = useState<{ piece: number; pallet: number; container: number; mix: number }>({ piece: 1.10, pallet: 1.05, container: 1.02, mix: 1.15 });
    // Mix composer state — when on, the buyer fills the active tier
    // (truck/pallet) with a custom split of variants instead of a
    // single-variant quantity. mixQuantities is keyed by variant
    // signature and counts in the tier's sub-unit (pallets-per-truck
    // or cases-per-pallet).
    const [isMixing, setIsMixing] = useState(false);
    const [mixQuantities, setMixQuantities] = useState<Record<string, number>>({});
    const [activeTab, setActiveTab] = useState('Description');
    // Cross-product mixed pallet / truckload (server-saved MixedLoad).
    // Mixed pallet / truckload: pending selection shared by the inline carousels
    // and the full "View all" picker. Nothing is added until the buyer confirms.
    const mix = useMixSelection();
    const [mixPickerOpen, setMixPickerOpen] = useState(false);
    const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    // ── Tier pricing memo ─────────────────────────────────────────────────────
    // Atlantis pricing rule: the headline number on every tier button AND in
    // the main pricing block is always a PER-CASE price. What changes between
    // tiers is the markup multiplier — Truck applies the lowest (container)
    // markup, Pallet the middle one, Case the highest (piece). The buyer's
    // quantity counter then counts in the chosen unit (1 truck, 2 pallets,
    // 5 cases…) and the line total is per-case × cases-in-unit × qty.
    //
    // Returns:
    //   perCasePrice   — what the buyer sees as "€X / case" for the active tier
    //   perUnitTotal   — full price of ONE selected unit (truck / pallet / case),
    //                    used as `price` when the line goes into the cart so
    //                    cart total = perUnitTotal × quantity stays correct.
    //   activeLabel    — "Truck" | "Pallet" | "Case" for UI copy.
    //   activeKey      — canonical tier key used for cart locking.
    //   casesInUnit    — multiplier from per-case to per-unit, also used in the
    //                    "X cartons total" breakdown line.
    // ── Role detection — must run BEFORE tierData useMemo so the
    //    markup multipliers can fork on visitor role. Previously these
    //    lived below tierData and tierData kept applying full markup
    //    even when the visitor was the supplier-owner — that's why the
    //    operator screenshot showed tier prices €8.32 / €8.71 / €11.88
    //    on a "Your listing" product card. With the flags lifted, the
    //    multiplier branch inside tierData (further down) now reads
    //    them and clamps to 1.0 for supplier-owner + admin.
    const isSupplierOwner =
        user?.role?.toUpperCase() === 'SUPPLIER' &&
        (currentProduct as any)?.supplierId &&
        user?.id === (currentProduct as any)?.supplierId;
    const isAdminUser = ['ADMIN', 'OWNER'].includes(
        (user?.role || '').toUpperCase(),
    );
    const useRawPricesRole = isSupplierOwner || isAdminUser;

    const tierData = useMemo(() => {
        const fallback = {
            perCasePrice: 0, perUnitTotal: 0, activeLabel: 'Case',
            activeKey: 'carton' as const, casesInUnit: 1,
            basePerCase: 0,
        };
        if (!currentProduct) return fallback;
        const p = currentProduct;
        const piecesPerCase   = p.unitsPerCase || 0;
        const casesPerPallet  = p.casesPerPallet || 0;
        const piecesPerPallet = p.unitsPerPallet || (piecesPerCase * casesPerPallet) || 0;
        const palletsPerTruck = p.palletsPerShipment || 0;

        // basePrice is ALWAYS the per-case price (the supplier form
        // stores pricePerPiece × unitsPerCase). The old unit-aware
        // reversal divided by pallet/truck pack sizes when `unit`
        // happened to be "truck", which made €8.64/case render as
        // €0.03/case on the public card. We now treat basePrice as
        // the canonical per-case price across the platform.
        const rawBase = p.basePrice != null ? p.basePrice : p.price / markups.piece;
        const basePerPiece = piecesPerCase > 0 ? rawBase / piecesPerCase : rawBase;
        const basePerCase = piecesPerCase > 0 ? basePerPiece * piecesPerCase : basePerPiece;

        // Per-case price for each tier (markup-only difference).
        const truckAvailable = piecesPerCase > 0 && casesPerPallet > 0 && palletsPerTruck > 0;
        const palletAvailable = piecesPerCase > 0 && casesPerPallet > 0;
        const caseAvailable = piecesPerCase > 0;

        // Role-aware markup multipliers.
        //   - Supplier viewing OWN product → raw prices (1.0) so they
        //     never reverse-engineer the spread Atlantis charges buyers.
        //   - Admin → sees CUSTOMER prices (with full markup) on the
        //     tier ladder so they can verify exactly what shoppers see,
        //     plus the admin-only formula panel below for the breakdown.
        //   - Customers → customer prices (with markup) as expected.
        // Previous version stripped the markup for admin too, which made
        // every tier show identical prices and hid the per-tier % spread
        // the operator was trying to audit on the PDP.
        const useRawForTiers = isSupplierOwner;
        const mTruck  = useRawForTiers ? 1 : markups.container;
        const mPallet = useRawForTiers ? 1 : markups.pallet;
        const mCase   = useRawForTiers ? 1 : markups.piece;

        const perCaseTruck  = truckAvailable  ? basePerCase * mTruck  : null;
        const perCasePallet = palletAvailable ? basePerCase * mPallet : null;
        const perCaseCase   = caseAvailable   ? basePerCase * mCase   : null;

        const options: Array<{ key: 'truck' | 'pallet' | 'carton'; label: string; perCasePrice: number | null; casesInUnit: number }> = [];
        if (perCaseTruck  !== null) options.push({ key: 'truck',  label: 'Truck',  perCasePrice: perCaseTruck,  casesInUnit: casesPerPallet * palletsPerTruck });
        if (perCasePallet !== null) options.push({ key: 'pallet', label: 'Pallet', perCasePrice: perCasePallet, casesInUnit: casesPerPallet });
        if (perCaseCase   !== null) options.push({ key: 'carton', label: 'Case',   perCasePrice: perCaseCase,   casesInUnit: 1 });
        if (options.length === 0) {
            options.push({ key: 'carton', label: p.unit || 'Case', perCasePrice: p.price, casesInUnit: 1 });
        }

        const initialSelected = options.find(o => o.key === adminDefaultUnit)?.key ?? options[0].key;
        const active          = options.find(o => o.key === (selectedUnit ?? initialSelected)) || options[0];
        const perCasePrice    = active.perCasePrice ?? 0;
        const perUnitTotal    = perCasePrice * active.casesInUnit;

        return {
            perCasePrice,
            perUnitTotal,
            activeLabel: active.label,
            activeKey: active.key,
            casesInUnit: active.casesInUnit,
            // Exposed for the admin pricing-formula panel below. Same
            // base-per-case the tier prices are derived from, before
            // any markup is applied. Lets the admin see "raw" anchor
            // next to "customer" prices.
            basePerCase,
        };
    }, [currentProduct, markups, selectedUnit, adminDefaultUnit, useRawPricesRole]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const { scrollLeft, clientWidth } = scrollContainerRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
            scrollContainerRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    // ── Mix composer derived data ─────────────────────────────────────────
    //   variantPrices + variantMeta come from /products/:id; we resolve
    //   each variant signature into { image, label, casePrice, palletPrice }
    //   so the composer cards can render uniformly. The capacity depends
    //   on the active tier:
    //     truck  → palletsPerShipment (mix in pallets)
    //     pallet → casesPerPallet     (mix in cases)
    //     case   → no mixing — composer hidden
    const mixData = useMemo(() => {
        if (!currentProduct) return null;
        const p = currentProduct as any;
        const variantsConfig: Array<{ name: string; values: string[] }> =
            Array.isArray(p.variants)
                ? (p.variants as any[]).filter(
                      v =>
                          v &&
                          v.name &&
                          // Strip internal/translation rows so signatures
                          // don't end up containing JSON blobs like
                          // "__translations={\"ar\":…}" — those then
                          // surface as garbage on the cart page.
                          !String(v.name).startsWith('__') &&
                          Array.isArray(v.values) &&
                          v.values.length > 0,
                  )
                : [];
        if (variantsConfig.length === 0) return null;

        // Cartesian product of group values → list of signatures.
        const sorted = [...variantsConfig].sort((a, b) => a.name.localeCompare(b.name));
        let combos: Array<Record<string, string>> = [{}];
        for (const g of sorted) {
            const next: Array<Record<string, string>> = [];
            for (const c of combos) for (const v of g.values) next.push({ ...c, [g.name]: v });
            combos = next;
        }
        const signatures = combos.map(c =>
            Object.keys(c).sort().map(k => `${k}=${c[k]}`).join('|'),
        );

        const prices: Record<string, number> = (p.variantPrices as Record<string, number>) || {};
        const meta: Record<string, {
            image?: string;
            images?: string[];
            useParentImages?: boolean;
            label?: string;
            unitsPerCase?: number;
            casesPerPallet?: number;
            palletsPerShipment?: number;
        }> = (p.variantMeta as any) || {};

        // Fallback price = parent basePrice (per case).
        const fallbackCasePrice = Number(p.basePrice ?? p.price ?? 0);
        const parentCpp = Number(p.casesPerPallet) || 0;
        const parentPpt = Number(p.palletsPerShipment) || 0;
        const parentUpc = Number(p.unitsPerCase) || 0;

        const variants = signatures.map(sig => {
            const m = meta[sig] || {};
            const casePrice = prices[sig] != null ? Number(prices[sig]) : fallbackCasePrice;
            // Per-variant pack sizes — fall back to parent values when blank.
            const upc = Number(m.unitsPerCase) || parentUpc;
            const cpp = Number(m.casesPerPallet) || parentCpp;
            const ppt = Number(m.palletsPerShipment) || parentPpt;
            // Derived prices using THIS variant's pack-size if defined.
            const palletPrice = casePrice * cpp;
            const truckPrice = casePrice * cpp * ppt;
            // Variant image priority:
            //  1. variant's own uploaded image(s) (unless the supplier
            //     explicitly ticked "use parent images")
            //  2. legacy single m.image
            //  3. parent product image (fallback)
            // Operator bug: a blue-edition card was showing the plain
            // Red Bull because we only looked at legacy m.image and
            // never the new m.images[] array.
            const variantImg =
                !m.useParentImages && Array.isArray(m.images) && m.images.length > 0
                    ? m.images[0]
                    : m.image || (p.images?.[0] || '');
            return {
                signature: sig,
                // Human-readable label — strip Name= / __ noise so the
                // card shows "Red Edition — Watermelon" not
                // "Flavour=Red Edition …".
                label: m.label || prettifyVariantSignature(sig) || sig,
                image: variantImg,
                casePrice,
                palletPrice,
                truckPrice,
                unitsPerCase: upc,
                casesPerPallet: cpp,
                palletsPerShipment: ppt,
            };
        });

        return { variants, casesPerPallet: parentCpp, palletsPerShipment: parentPpt };
    }, [currentProduct]);

    // Capacity + unit-label for the active tier in the composer.
    // Mixing happens at the SUB-UNIT level (pallets-in-truck, cases-in-pallet).
    const mixCapacity = useMemo(() => {
        if (!currentProduct) return { unit: 'unit', perVariantPrice: 'casePrice' as 'casePrice' | 'palletPrice', total: 0 };
        const p = currentProduct as any;
        if (tierData.activeKey === 'truck') {
            return {
                unit: 'pallet',
                perVariantPrice: 'palletPrice' as const,
                total: Number(p.palletsPerShipment) || 0,
            };
        }
        if (tierData.activeKey === 'pallet') {
            return {
                unit: 'case',
                perVariantPrice: 'casePrice' as const,
                total: Number(p.casesPerPallet) || 0,
            };
        }
        return { unit: 'unit', perVariantPrice: 'casePrice' as const, total: 0 };
    }, [currentProduct, tierData.activeKey]);

    const mixSummary = useMemo(() => {
        if (!mixData) return null;
        let filled = 0;
        let subtotal = 0;
        const composition: Array<{ signature: string; quantity: number; unitPrice: number }> = [];
        for (const v of mixData.variants) {
            const qty = Math.max(0, Number(mixQuantities[v.signature] || 0));
            if (qty <= 0) continue;
            const unitPrice = mixCapacity.perVariantPrice === 'palletPrice' ? v.palletPrice : v.casePrice;
            filled += qty;
            subtotal += unitPrice * qty;
            composition.push({ signature: v.signature, quantity: qty, unitPrice });
        }
        const totalWithMarkup = subtotal * markups.mix;
        return {
            filled,
            capacity: mixCapacity.total,
            subtotal,
            totalWithMarkup,
            composition,
        };
    }, [mixData, mixQuantities, mixCapacity, markups.mix]);

    // Reset mix when tier changes — capacity changes too.
    useEffect(() => {
        setMixQuantities({});
        setIsMixing(false);
    }, [tierData.activeKey]);

    // Whether the mix composer should be available on this product.
    const mixSupported =
        !!mixData &&
        mixData.variants.length > 1 &&
        (tierData.activeKey === 'truck' || tierData.activeKey === 'pallet') &&
        mixCapacity.total > 0;

    // ── Cart-driven tier lock ─────────────────────────────────────────────────
    // If this exact product is already in the cart, the buyer locked in a tier
    // (Truck / Pallet / Carton) when they added it. The PDP must enforce that
    // tier on every subsequent visit until they remove the item — buyers can
    // not mix Truck-priced quantities with Pallet-priced quantities for the
    // same SKU. The other two tier buttons render as disabled with a tooltip
    // explaining how to switch.
    // isSupplierOwner / isAdminUser are lifted ABOVE tierData useMemo
    // (see top of component) so tier prices fork on visitor role.

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
        const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
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
                    mix: Number(markupData.mix) || 1.15,
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

    // ── Image carousel resolution (must run on EVERY render to keep
    //    the hook count stable; React error #310 was firing because
    //    these were declared after the `if (isLoading) return …`
    //    early return below). When the buyer has picked a variant
    //    AND that variant ships with its own images (useParentImages
    //    OFF), swap to the variant carousel; otherwise fall back to
    //    parent product images. Reads safely against currentProduct
    //    being null during the initial fetch.
    const parentImageList = React.useMemo<string[]>(() => {
        if (!currentProduct) return [];
        if (Array.isArray(currentProduct.images) && currentProduct.images.length > 0) {
            return currentProduct.images;
        }
        return currentProduct.image ? [currentProduct.image] : [];
    }, [currentProduct]);

    const allImages = useMemo<string[]>(() => {
        if (!currentProduct) return parentImageList;
        const meta = (currentProduct as any).variantMeta as
            | Record<string, { images?: string[]; image?: string; useParentImages?: boolean }>
            | undefined;
        if (!meta) return parentImageList;
        const keys = Object.keys(selectedVariants).sort();
        if (keys.length === 0) {
            // No variant picked yet — but if ANY variant carries its
            // own images, surface them alongside parent so the buyer
            // sees what's available before clicking. Operator request:
            // "if supplier uploaded photos for specific varieties, show
            // them in the thumbnail strip even before selection".
            const extras = Object.values(meta)
                .filter(e => e && !e.useParentImages)
                .flatMap(e => (Array.isArray(e!.images) ? e!.images : e!.image ? [e!.image] : []))
                .filter(Boolean) as string[];
            const merged = [...parentImageList, ...extras];
            return Array.from(new Set(merged));
        }
        const sig = keys.map(k => `${k}=${selectedVariants[k]}`).join('|');
        // Exact match first, then case-insensitive fallback —
        // supplier may have saved 'Flavour=Diet' while PDP key is
        // 'FLAVOUR=Diet' depending on how the variant group was named.
        let entry = meta[sig];
        if (!entry) {
            const lower = sig.toLowerCase();
            const match = Object.entries(meta).find(([k]) => k.toLowerCase() === lower);
            if (match) entry = match[1];
        }
        if (!entry || entry.useParentImages) return parentImageList;
        const variantImages: string[] = Array.isArray(entry.images)
            ? entry.images
            : entry.image
              ? [entry.image]
              : [];
        return variantImages.length > 0 ? variantImages : parentImageList;
    }, [currentProduct, selectedVariants, parentImageList]);

    // Keep selectedImage in sync when the carousel array changes
    // (variant swap). Falls through silently while the array is
    // empty (during loading).
    useEffect(() => {
        if (allImages.length === 0) return;
        if (!selectedImage || !allImages.includes(selectedImage)) {
            setSelectedImage(allImages[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allImages.join('|')]);

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-6 bg-surface">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-[#14B8A6] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">{t('common', 'loading')}</p>
                </div>
            </div>
        );
    }

    const product = currentProduct;

    if (!product) {
        // The catalog proxy only serves signed-in members, so a signed-out
        // visitor can't load any product — say that instead of "not found".
        return (
            <div className="min-h-[60vh] bg-surface flex items-center justify-center p-6 text-center">
                <div className="max-w-md">
                    <span className="mx-auto w-14 h-14 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Package size={26} /></span>
                    <h2 className="mt-5 text-[20px] font-bold text-heading">{isLoggedIn ? 'Product not found' : 'Sign in to view this product'}</h2>
                    <p className="mt-2 text-[14px] text-ink-2">{isLoggedIn ? 'It may have been removed or is no longer available.' : 'Atlantis is a members-only wholesale marketplace. Sign in to see products, pack sizes and prices.'}</p>
                    <div className="mt-6 flex justify-center gap-3">
                        {!isLoggedIn && <Link href={`/auth/login?redirect=${encodeURIComponent(`/products/${id}`)}`} className="inline-flex items-center h-10 px-5 rounded-xl bg-cta text-cta-fg text-[13px] font-semibold">Sign in</Link>}
                        <Link href="/categories" className="inline-flex items-center h-10 px-5 rounded-xl ring-1 ring-line text-[13px] font-semibold text-ink">Browse catalog</Link>
                    </div>
                </div>
            </div>
        );
    }

    const handleAdd = () => {
        if (!isLoggedIn) {
            router.push('/auth/login?redirect=' + encodeURIComponent(window.location.pathname));
            return;
        }

        // ── Mix-composer path ────────────────────────────────────────
        // When the buyer used "Mix this <tier>", build a single cart
        // line representing ONE tier-unit (one truck / one pallet)
        // composed of the variant breakdown. The cart treats this as
        // a quantity-1 line with `mixComposition` so checkout can ship
        // the per-variant qty + price snapshot to the order API.
        if (isMixing && mixSummary && mixSummary.filled === mixSummary.capacity) {
            const cartLineId = `${product.id}::mix:${tierData.activeKey}:${Date.now()}`;
            addItem({
                id: cartLineId,
                productId: product.id,
                name: `${product.name} (Mixed ${tierData.activeLabel})`,
                brand: product.brand || 'Atlantis Premium',
                price: mixSummary.totalWithMarkup,
                image: product.image || '',
                unit: tierData.activeLabel,
                category: product.category || 'Uncategorized',
                tier: tierData.activeKey,
                mixComposition: mixSummary.composition as any,
                selectedVariants: undefined,
            } as any, 1);
            setIsAdded(true);
            setTimeout(() => setIsAdded(false), 2500);
            // Operator request: after the buyer adds a mixed truck/pallet,
            // pop a prompt asking "add another?" so volume orders are one
            // click away. They reset the composer to a fresh empty grid
            // and stay on the page; "no" routes them to /cart.
            setShowAddAnotherPrompt(true);
            return;
        }

        // ── Single-variant path (legacy) ─────────────────────────────
        const variantKeys = Object.keys(selectedVariants).sort();
        const variantSig = variantKeys.length
            ? variantKeys.map((k) => `${k}=${selectedVariants[k]}`).join('|')
            : '';
        const cartLineId = variantSig ? `${product.id}::${variantSig}` : product.id;

        addItem({
            id: cartLineId,
            productId: product.id,
            name: product.name,
            brand: product.brand || 'Atlantis Premium',
            price: tierData.perUnitTotal,
            image: product.image || '',
            unit: tierData.activeLabel,
            category: product.category || 'Uncategorized',
            tier: tierData.activeKey,
            selectedVariants: variantKeys.length ? selectedVariants : undefined,
        }, quantity);
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2500);
    };

    // ── Purchase model (all from real product data) ─────────────────────────
    // Same pricing rules as before: basePrice is the canonical per-case price;
    // each packaging tier applies its own admin markup; a supplier viewing
    // their own listing sees raw prices. A tier is offered only when the pack
    // sizes it depends on exist on the product.
    const piecesPerCase = product.unitsPerCase || 0;
    const casesPerPallet = product.casesPerPallet || 0;
    const palletsPerTruck = product.palletsPerShipment || 0;
    const basePerCase = product.basePrice != null ? product.basePrice : product.price / markups.piece;
    const mTruck = isSupplierOwner ? 1 : markups.container;
    const mPallet = isSupplierOwner ? 1 : markups.pallet;
    const mCase = isSupplierOwner ? 1 : markups.piece;
    type PackKey = 'truck' | 'pallet' | 'carton';
    const packOptions: Array<{ key: PackKey; label: string; perCasePrice: number; casesInUnit: number; contents: string }> = [];
    if (piecesPerCase > 0) packOptions.push({ key: 'carton', label: 'Case', perCasePrice: round2(basePerCase * mCase), casesInUnit: 1, contents: `${piecesPerCase.toLocaleString()} units per case` });
    if (piecesPerCase > 0 && casesPerPallet > 0) packOptions.push({ key: 'pallet', label: 'Pallet', perCasePrice: round2(basePerCase * mPallet), casesInUnit: casesPerPallet, contents: `${casesPerPallet.toLocaleString()} cases · ${(casesPerPallet * piecesPerCase).toLocaleString()} units` });
    if (piecesPerCase > 0 && casesPerPallet > 0 && palletsPerTruck > 0) packOptions.push({ key: 'truck', label: 'Truckload', perCasePrice: round2(basePerCase * mTruck), casesInUnit: casesPerPallet * palletsPerTruck, contents: `${palletsPerTruck.toLocaleString()} pallets · ${(casesPerPallet * palletsPerTruck).toLocaleString()} cases` });
    if (packOptions.length === 0) packOptions.push({ key: 'carton', label: product.unit || 'Case', perCasePrice: product.price, casesInUnit: 1, contents: 'Pack size not specified' });

    const initialPack = packOptions.find((o) => o.key === adminDefaultUnit)?.key ?? packOptions[packOptions.length - 1].key;
    if (selectedUnit === undefined) setTimeout(() => setSelectedUnit(initialPack), 0);
    const activePack = packOptions.find((o) => o.key === (selectedUnit ?? initialPack)) || packOptions[0];

    // MOQ (moq + moqUnit) in the selected packaging unit — identical to the server rule.
    const minUnitsFor = (k: PackKey) => serverMinUnits(product, k);
    const minUnits = minUnitsFor(activePack.key);

    // Live wholesale offer (backend-attached), optionally per selected variant.
    const offerVariantKey = Object.keys(selectedVariants).sort().map((k) => `${k}=${selectedVariants[k]}`).join('|');
    // Prices are withheld by the API for signed-out visitors; never render a placeholder number.
    const showPrices = isLoggedIn && !product.pricesHidden;
    const activeOffer = (product as any).activeOffer as { discountPercent?: number; variantDiscounts?: Record<string, number>; validUntil?: string | null } | undefined;
    const offerPct = Math.max(0, Math.min(100, Number(activeOffer ? ((activeOffer.variantDiscounts && offerVariantKey ? activeOffer.variantDiscounts[offerVariantKey] : undefined) ?? activeOffer.discountPercent ?? 0) : 0)));
    const listPerCase = activePack.perCasePrice;
    const perCasePrice = offerPct > 0 ? +(listPerCase * (1 - offerPct / 100)).toFixed(2) : listPerCase;
    const perPackPrice = round2(perCasePrice * activePack.casesInUnit);
    const subtotal = round2(perPackPrice * quantity);
    const perPiece = piecesPerCase > 0 ? perCasePrice / piecesPerCase : null;
    const totalCases = activePack.casesInUnit * quantity;
    const packWord = (n: number) => `${activePack.label.toLowerCase()}${n === 1 ? '' : 's'}`;

    const variantGroups = ((product.variants as any[]) || [])
        .filter((v) => v && typeof v === 'object' && !String(v.name || '').startsWith('__'))
        .map((v) => ({ name: String(v.name || ''), values: Array.isArray(v.values) ? v.values.map((x: any) => String(x)) : v.value ? [String(v.value)] : [] }))
        .filter((g) => g.name && g.values.length > 0);
    const missingVariant = variantGroups.some((g) => !selectedVariants[g.name]);
    const addDisabled = isMixing ? (!mixSummary || mixSummary.filled !== mixCapacity.total) : missingVariant;

    const quoteUnit = activePack.key === 'truck' ? 'trucks' : activePack.key === 'pallet' ? 'pallets' : 'cartons';
    const quoteHref = `/requests?product=${encodeURIComponent(product.id)}&qty=${quantity}&unit=${quoteUnit}`;

    const formatBbd = (raw: unknown): string | null => {
        if (raw === null || raw === undefined || raw === '') return null;
        const s = String(raw).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const num = parseFloat(s);
        if (!isNaN(num) && num > 30000 && num < 70000 && !/-/.test(s)) {
            const d = new Date((num - 25569) * 86400 * 1000);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
        if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        return s;
    };
    const weightLabel = product.weight ? (/[a-z]/i.test(String(product.weight)) ? String(product.weight) : `${product.weight} kg`) : null;
    const moqLabel = (() => {
        const qty = product.moq ?? product.minOrder;
        if (!qty) return null;
        const u = String(product.moqUnit || 'PIECE').toUpperCase();
        const words: Record<string, [string, string]> = { PIECE: ['unit', 'units'], CASE: ['case', 'cases'], PALLET: ['pallet', 'pallets'], TRUCK: ['truckload', 'truckloads'] };
        const [one, many] = words[u] || ['unit', 'units'];
        return `${qty.toLocaleString()} ${qty === 1 ? one : many}`;
    })();
    const availability = product.readyForDispatch
        ? { tone: 'ok' as const, text: 'Ready for dispatch' }
        : product.leadTime
            ? { tone: 'wait' as const, text: `Made to order · ${product.leadTime}-day lead time` }
            : null;

    const keyFacts: Array<[string, string]> = ([
        ['Brand', product.brand],
        ['EAN / Barcode', product.ean],
        ['Country of origin', product.origin],
        ['Goods located (EXW)', product.exwLocation],
        ['Lead time', product.leadTime ? `${product.leadTime} days` : null],
        ['Best before', formatBbd(product.shelfLife)],
        ['Minimum order', moqLabel],
    ] as Array<[string, string | null | undefined]>).filter((r): r is [string, string] => !!r[1]);

    const packagingSpecs: Array<[string, string]> = ([
        ['Units per case', piecesPerCase ? `${piecesPerCase.toLocaleString()}` : null],
        ['Cases per pallet', casesPerPallet ? `${casesPerPallet.toLocaleString()}` : null],
        ['Units per pallet', product.unitsPerPallet ? product.unitsPerPallet.toLocaleString() : (piecesPerCase && casesPerPallet ? (piecesPerCase * casesPerPallet).toLocaleString() : null)],
        ['Pallets per truckload', palletsPerTruck ? `${palletsPerTruck.toLocaleString()}` : null],
        ['Weight per unit', weightLabel],
        ['Selling unit', product.unit ? product.unit.replace(/^./, (c: string) => c.toUpperCase()) : null],
    ] as Array<[string, string | null]>).filter((r): r is [string, string] => !!r[1]);

    const listingStatus = product.status === 'APPROVED' ? 'Approved by Atlantis' : product.status === 'PENDING' ? 'Under review' : product.status === 'REJECTED' ? 'Not approved' : null;
    const hasReviews = localReviewsCount > 0;

    const tabs = ['Overview', 'Specifications'];
    const tabKey = (t: string) => t.split(' ')[0];

    const goToReviews = () => {
        document.getElementById('pdp-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="min-h-screen bg-surface text-ink text-start pb-20">
            <main className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                {/* Breadcrumb + utilities */}
                <div className="flex items-center justify-between gap-4 pt-4 pb-4">
                    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 text-[13px] text-ink-3">
                        <Link href="/" className="hover:text-heading shrink-0">Home</Link>
                        <ChevronRight size={13} className="shrink-0" />
                        <Link href="/categories" className="hover:text-heading shrink-0">Catalog</Link>
                        {product.category && (<>
                            <ChevronRight size={13} className="shrink-0" />
                            <Link href={`/categories?category=${encodeURIComponent(product.category)}`} className="hover:text-heading truncate max-w-[180px]">{getDisplayCategory(product)}</Link>
                        </>)}
                        <ChevronRight size={13} className="shrink-0 hidden sm:block" />
                        <span className="text-ink font-medium truncate hidden sm:block">{product.name}</span>
                    </nav>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={async () => {
                                const url = window.location.href;
                                try { if (navigator.share) await navigator.share({ title: product.name, url }); else await navigator.clipboard.writeText(url); } catch { /* cancelled */ }
                            }}
                            aria-label="Share product"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-3 hover:text-ink"
                        ><Share2 size={16} /></button>
                        <button
                            type="button"
                            onClick={() => toggleWishlist(product.id)}
                            aria-label={isSaved(product.id) ? 'Remove from saved' : 'Save product'}
                            aria-pressed={isSaved(product.id)}
                            className={cn('w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-3', isSaved(product.id) ? 'text-[#E11D48]' : 'text-ink-2 hover:text-ink')}
                        ><Heart size={16} fill={isSaved(product.id) ? 'currentColor' : 'none'} /></button>
                    </div>
                </div>

                {isSupplierOwner && (
                    <div className="mb-4 rounded-xl bg-cta text-cta-fg px-4 py-2.5 flex items-center justify-between gap-3">
                        <p className="text-[12.5px]"><span className="font-semibold">Your listing</span><span className="text-white/60"> — prices shown without the Atlantis markup.</span></p>
                        <Link href={`/supplier/products/${product.id}/edit`} className="inline-flex items-center h-7 px-3 rounded-md bg-white/10 hover:bg-white/20 text-[12px] font-semibold">Edit</Link>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 lg:gap-8">
                    {/* ── Gallery ─────────────────────────────────────────── */}
                    <section aria-label="Product images" className="lg:sticky lg:top-[108px] self-start">
                        <button
                            type="button"
                            onClick={() => { const i = allImages.findIndex((u) => u === selectedImage); setLightboxIndex(i >= 0 ? i : 0); }}
                            className="relative w-full max-w-[420px] mx-auto aspect-square rounded-2xl bg-media ring-1 ring-line overflow-hidden cursor-zoom-in group"
                            aria-label="Enlarge image"
                        >
                            {selectedImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={selectedImage}
                                    alt={product.name}
                                    // Low-res uploads (some are ~100px) are enlarged at most 3×
                                    // so they stay legible without turning into a blurry smear.
                                    onLoad={(e) => { const im = e.currentTarget; const cap = Math.max(im.naturalWidth, im.naturalHeight) * 3; im.style.width = im.style.height = `min(84%, ${cap}px)`; }}
                                    className="absolute inset-0 m-auto w-[84%] h-[84%] object-contain mix-blend-multiply select-none transition-transform duration-300 group-hover:scale-[1.02]"
                                />
                            ) : (
                                <span className="absolute inset-0 flex items-center justify-center text-ink-4"><Package size={56} strokeWidth={1.2} /></span>
                            )}
                        </button>
                        {allImages.length > 1 && (
                            <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide" role="list">
                                {allImages.map((img, i) => (
                                    <button
                                        key={img + i}
                                        type="button"
                                        role="listitem"
                                        onClick={() => setSelectedImage(img)}
                                        aria-label={`Show image ${i + 1}`}
                                        aria-current={selectedImage === img}
                                        className={cn('w-16 h-16 shrink-0 rounded-lg bg-media flex items-center justify-center p-1.5 ring-1 transition-shadow', selectedImage === img ? 'ring-2 ring-[#2EC4B6]' : 'ring-line hover:ring-line-strong')}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img} alt="" className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                    </button>
                                ))}
                            </div>
                        )}
                        <p className="mt-2 text-[12px] text-ink-3">Pictures are for illustration only. Trust the barcode, not the image.</p>
                        {Array.isArray(product.videos) && product.videos.length > 0 && (
                            <div className="mt-4 space-y-2">
                                {product.videos.map((vid, i) => (
                                    <video key={vid + i} src={vid} controls preload="metadata" playsInline className="w-full rounded-xl ring-1 ring-line bg-black aspect-video" />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── Product info + purchase panel ───────────────────── */}
                    <section aria-label="Product details" className="min-w-0">
                        {product.brand && (
                            <Link href={`/categories?brand=${encodeURIComponent(product.brand)}`} className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink hover:text-teal">
                                {brandLogo(product.brand) && (
                                    <span className="w-7 h-7 rounded-full bg-media ring-1 ring-line flex items-center justify-center overflow-hidden shrink-0">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={brandLogo(product.brand)!} alt="" className="max-w-[78%] max-h-[78%] object-contain" />
                                    </span>
                                )}
                                {product.brand}
                            </Link>
                        )}
                        <h1 className="mt-1 text-[20px] sm:text-[22px] font-bold leading-tight tracking-tight text-heading">{translatedName || product.name}</h1>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-3">
                            <span className="inline-flex items-center gap-1.5 tabular-nums">
                                <Barcode size={14} className="text-ink-4" />
                                <span className="text-ink-4">EAN / Barcode</span>
                                {product.ean ? <span className="text-ink font-medium">{product.ean}</span> : <span className="text-ink-4 italic">not provided by supplier</span>}
                            </span>
                            <span className="inline-flex items-center gap-1.5"><span className="text-ink-4">Ref.</span> <span className="font-mono text-[12.5px] text-ink-2">ATL-{product.id.slice(0, 8).toUpperCase()}</span></span>
                            <button type="button" onClick={goToReviews} className="inline-flex items-center gap-1.5 hover:text-ink">
                                {hasReviews ? (
                                    <>
                                        <span className="flex items-center gap-0.5" aria-hidden>
                                            {[...Array(5)].map((_, i) => <Star key={i} size={13} className={i < Math.round(localRating) ? 'fill-[#F59E0B] text-[#F59E0B]' : 'text-[#E2E8F0]'} />)}
                                        </span>
                                        <span className="font-medium text-ink-2 tabular-nums">{localRating.toFixed(1)}</span>
                                        <span>({localReviewsCount} {localReviewsCount === 1 ? 'review' : 'reviews'})</span>
                                    </>
                                ) : <span>No reviews yet</span>}
                            </button>
                        </div>

                        {/* Purchase panel */}
                        <div className="mt-4 rounded-2xl ring-1 ring-line bg-surface">
                            <div className="p-3.5 sm:p-4">
                                <div className="flex items-baseline justify-between gap-3">
                                    <h2 className="text-[13px] font-semibold text-ink">Packaging</h2>
                                    {availability && (
                                        <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-medium', availability.tone === 'ok' ? 'text-[#047857]' : 'text-[#B45309]')}>
                                            <span className={cn('w-1.5 h-1.5 rounded-full', availability.tone === 'ok' ? 'bg-[#10B981]' : 'bg-[#F59E0B]')} />
                                            {availability.text}
                                        </span>
                                    )}
                                </div>
                                <div role="radiogroup" aria-label="Packaging" className={cn('mt-2.5 grid gap-2', packOptions.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : packOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                                    {packOptions.map((opt) => {
                                        const selected = activePack.key === opt.key;
                                        const locked = !!lockedTier && lockedTier !== opt.key;
                                        return (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                disabled={locked || isMixing}
                                                title={locked ? 'Already in your cart at another packaging tier — remove it from the cart to switch.' : undefined}
                                                onClick={() => { setSelectedUnit(opt.key); setQuantity(minUnitsFor(opt.key)); }}
                                                className={cn(
                                                    'text-start rounded-xl px-3 py-2.5 ring-1 transition-shadow disabled:cursor-not-allowed',
                                                    selected ? 'ring-2 ring-[#2EC4B6] bg-teal-soft' : 'ring-line hover:ring-line-strong disabled:opacity-50'
                                                )}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="text-[13.5px] font-semibold text-ink">{opt.label}</span>
                                                    <span className={cn('w-3.5 h-3.5 rounded-full ring-1 flex items-center justify-center', selected ? 'ring-[#0E7C74] bg-[#0E7C74]' : 'ring-line-strong')}>
                                                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-surface" />}
                                                    </span>
                                                </span>
                                                <span className="block mt-0.5 text-[12px] text-ink-3">{opt.contents}</span>
                                                {showPrices && <span className="block mt-1 text-[12.5px] text-ink-2 tabular-nums"><span className="font-semibold">{formatPrice(opt.perCasePrice)}</span> / case</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                                {!packOptions.some((o) => o.key === 'truck') && (
                                    <p className="mt-2 text-[12px] text-ink-3">
                                        Truckload isn’t offered for this product: the supplier hasn’t provided {[
                                            !piecesPerCase && 'units per case', !casesPerPallet && 'cases per pallet', !palletsPerTruck && 'pallets per truckload',
                                        ].filter(Boolean).join(', ')}. Request a quote for larger volumes.
                                    </p>
                                )}
                                {lockedTier && (
                                    <p className="mt-2 text-[12px] text-[#92400E]">Locked to <strong>{lockedTier === 'truck' ? 'Truckload' : lockedTier === 'pallet' ? 'Pallet' : 'Case'}</strong> — this product is already in your cart at that tier.</p>
                                )}

                                {variantGroups.length > 0 && (
                                    <div className="mt-4 space-y-3">
                                        {variantGroups.map((g) => {
                                            const picked = selectedVariants[g.name];
                                            return (
                                                <div key={g.name}>
                                                    <p className="text-[13px] font-semibold text-ink">
                                                        {g.name}: {picked ? <span className="font-normal text-ink-2">{picked}</span> : <span className="font-normal text-[#B91C1C]">choose one</span>}
                                                    </p>
                                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                        {g.values.map((v: string) => (
                                                            <button key={v} type="button" aria-pressed={picked === v} onClick={() => setSelectedVariants((prev) => ({ ...prev, [g.name]: v }))}
                                                                className={cn('h-8 px-3 rounded-lg text-[12.5px] ring-1 transition-shadow', picked === v ? 'ring-2 ring-[#2EC4B6] bg-teal-soft font-semibold text-ink' : 'ring-line text-ink-2 hover:ring-line-strong')}>
                                                                {v}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {!isMixing && (
                                <div className="border-t border-line p-3.5 sm:p-4">
                                    <div className="flex items-end justify-between gap-4">
                                        {!showPrices ? (
                                            <div className="min-w-0">
                                                <p className="text-[12px] text-ink-3">Wholesale price</p>
                                                <Link href={`/auth/login?redirect=${encodeURIComponent(`/products/${product.id}`)}`} className="mt-1 inline-flex text-[15px] font-semibold text-teal hover:underline">Sign in to see prices</Link>
                                                <p className="mt-0.5 text-[12px] text-ink-3">Prices are shown to registered business buyers.</p>
                                            </div>
                                        ) : (
                                        <div className="min-w-0">
                                            <p className="text-[12px] text-ink-3">Price per case · {activePack.label.toLowerCase()} rate</p>
                                            <div className="mt-0.5 flex items-baseline flex-wrap gap-x-2">
                                                <span className="text-[24px] font-bold tracking-tight tabular-nums text-heading leading-none">{formatPrice(perCasePrice)}</span>
                                                {offerPct > 0 && (<>
                                                    <span className="text-[14px] text-ink-4 line-through tabular-nums">{formatPrice(listPerCase)}</span>
                                                    <span className="text-[12px] font-semibold text-[#B91C1C]">−{offerPct}% offer{activeOffer?.validUntil ? ` until ${new Date(activeOffer.validUntil).toLocaleDateString()}` : ''}</span>
                                                </>)}
                                            </div>
                                            {perPiece != null && <p className="mt-1 text-[12.5px] text-ink-3 tabular-nums">{formatPrice(perPiece)} per unit</p>}
                                        </div>
                                        )}
                                        <div className="shrink-0">
                                            <label htmlFor="pdp-qty" className="block text-[12px] text-ink-3 mb-1 text-end">Quantity ({packWord(2)})</label>
                                            <div className="flex items-center h-10 rounded-lg ring-1 ring-line">
                                                <button type="button" onClick={() => setQuantity((q) => Math.max(minUnits, q - 1))} disabled={quantity <= minUnits} aria-label="Decrease quantity" className="w-9 h-full flex items-center justify-center text-ink-2 disabled:opacity-30"><Minus size={15} /></button>
                                                <input
                                                    id="pdp-qty"
                                                    inputMode="numeric"
                                                    value={quantity}
                                                    onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setQuantity(Number.isFinite(n) ? n : minUnits); }}
                                                    onBlur={() => setQuantity((q) => Math.max(minUnits, q || minUnits))}
                                                    className="w-12 h-full text-center bg-transparent outline-none text-[14px] font-semibold tabular-nums"
                                                />
                                                <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="Increase quantity" className="w-9 h-full flex items-center justify-center text-ink-2"><Plus size={15} /></button>
                                            </div>
                                        </div>
                                    </div>
                                    {quantity < minUnits ? (
                                        <p className="mt-2 text-[12px] text-[#B91C1C]" role="alert">Minimum order is {minUnits} {packWord(minUnits)}.</p>
                                    ) : minUnits > 1 ? (
                                        <p className="mt-2 text-[12px] text-ink-3">Minimum order: {minUnits} {packWord(minUnits)}{moqLabel ? ` (${moqLabel})` : ''}.</p>
                                    ) : null}

                                    {showPrices && <dl className="mt-4 rounded-xl bg-surface-2 px-3.5 py-3 space-y-1.5 text-[13px]">
                                        {activePack.casesInUnit > 1 && (
                                            <div className="flex justify-between gap-3"><dt className="text-ink-3">1 {activePack.label.toLowerCase()} = {activePack.casesInUnit.toLocaleString()} cases</dt><dd className="tabular-nums text-ink-2">{formatPrice(perPackPrice)}</dd></div>
                                        )}
                                        <div className="flex justify-between gap-3"><dt className="text-ink-3">{quantity.toLocaleString()} × {packWord(quantity)}{activePack.key !== 'carton' ? ` · ${totalCases.toLocaleString()} cases` : ''}{piecesPerCase ? ` · ${(totalCases * piecesPerCase).toLocaleString()} units` : ''}</dt><dd className="tabular-nums text-ink-2">{formatPrice(subtotal)}</dd></div>
                                        <div className="flex justify-between gap-3"><dt className="text-ink-3">Delivery</dt><dd className="text-ink-3">Calculated at checkout</dd></div>
                                        <div className="flex justify-between gap-3 pt-1.5 border-t border-line"><dt className="font-semibold text-ink">Subtotal</dt><dd className="font-bold tabular-nums text-heading">{formatPrice(subtotal)}</dd></div>
                                    </dl>}
                                </div>
                            )}

                            <div className={cn('p-3.5 sm:p-4 pt-0 sm:pt-0', isMixing && 'pt-3.5 sm:pt-4 border-t border-line')}>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                        type="button"
                                        onClick={handleAdd}
                                        disabled={isLoggedIn && (addDisabled || (!isMixing && quantity < minUnits))}
                                        className="w-full sm:flex-1 shrink-0 h-10 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {isAdded ? <><Check size={16} /> Added to cart</>
                                            : !isLoggedIn ? <>Sign in to order</>
                                            : isMixing ? <><ShoppingCart size={16} /> Add mixed {tierData.activeLabel.toLowerCase()} to cart</>
                                            : <><ShoppingCart size={16} /> Add to cart</>}
                                    </button>
                                    <Link href={quoteHref} className="sm:w-auto h-10 px-4 rounded-xl ring-1 ring-line-strong hover:ring-ink text-[13.5px] font-semibold text-heading inline-flex items-center justify-center gap-2 transition-shadow">
                                        <FileText size={16} /> Request a quote
                                    </Link>
                                </div>
                                {isLoggedIn && missingVariant && !isMixing && <p className="mt-2 text-[12px] text-[#B91C1C]">Choose {variantGroups.filter((g) => !selectedVariants[g.name]).map((g) => g.name).join(', ')} to add to cart.</p>}
                                <p className="mt-2 text-[11.5px] text-ink-4">Prices in EUR, excluding delivery. A quote request goes to the Atlantis sourcing desk for a negotiated price.</p>
                            </div>
                        </div>

                        {/* Mix with other products — inline discovery; nothing is added automatically */}
                        {!isSupplierOwner && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl ring-1 ring-line bg-surface px-4 py-3">
                                <div className="min-w-0">
                                    <p className="text-[13.5px] font-semibold text-ink">Mix with other products</p>
                                    <p className="text-[12.5px] text-ink-3">{mix.kind ? `Building a ${mix.kind === 'PALLET' ? 'mixed pallet' : 'mixed truckload'} · ${mix.selected.length} selected` : 'Combine flavours and products into one mixed pallet or truckload.'}</p>
                                </div>
                                <div role="radiogroup" aria-label="Mix type" className="flex gap-2">
                                    {(['PALLET', 'TRUCK'] as LoadKind[]).map((k) => (
                                        <button key={k} type="button" role="radio" aria-checked={mix.kind === k}
                                            onClick={() => {
                                                if (!isLoggedIn) { router.push('/auth/login?redirect=' + encodeURIComponent(window.location.pathname)); return; }
                                                if (mix.kind === k) return;
                                                if (mix.selected.length && !window.confirm(`Switching to ${k === 'PALLET' ? 'a mixed pallet' : 'a mixed truckload'} clears your ${mix.selected.length} selected item(s), because quantities use a different unit. Continue?`)) return;
                                                mix.setKind(k);
                                            }}
                                            className={cn('h-9 px-3.5 rounded-lg text-[13px] font-semibold transition-shadow', mix.kind === k ? 'ring-2 ring-[#2EC4B6] bg-teal-soft text-ink' : 'ring-1 ring-line-strong hover:ring-ink text-ink')}>
                                            {k === 'PALLET' ? 'Mixed pallet' : 'Mixed truckload'}
                                        </button>
                                    ))}
                                    {mix.kind && (
                                        <button type="button" aria-label="Close mix builder"
                                            onClick={() => { if (mix.selected.length && !window.confirm(`Discard your ${mix.selected.length} selected item(s)?`)) return; mix.setKind(null); setMixPickerOpen(false); }}
                                            className="h-9 w-9 rounded-lg ring-1 ring-line text-ink-3 hover:text-ink flex items-center justify-center"><X size={15} /></button>
                                    )}
                                </div>
                            </div>
                        )}
                        {mix.kind && !isSupplierOwner && (
                            <MixDiscovery product={product} sel={mix} markups={markups} onViewAll={() => setMixPickerOpen(true)} />
                        )}
                        {mix.kind && <MixBuilder open={mixPickerOpen} sel={mix} onClose={() => setMixPickerOpen(false)} />}

                        {/* Build-your-own pallet / truckload (mix variants) */}
                        {mixSupported && (
                            <div className="mt-4">
                                
                                    <div className="rounded-2xl ring-1 ring-line bg-surface p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-semibold text-ink">
                                                    Build-your-own {tierData.activeLabel.toLowerCase()}
                                                </p>
                                                <p className="text-[12px] text-slate-600 mt-1">
                                                    Mix multiple variants inside ONE {tierData.activeLabel.toLowerCase()} (e.g. 5 Diet + 10 Regular + 9 Black). Each variant keeps its own price; a mixing surcharge applies to the subtotal.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsMixing(v => !v)}
                                                className={cn(
                                                    'h-9 px-4 rounded-lg text-[13px] font-semibold shrink-0 transition-colors',
                                                    isMixing
                                                        ? 'bg-cta text-cta-fg hover:bg-cta-hover'
                                                        : 'bg-surface text-heading ring-1 ring-line-strong hover:ring-ink',
                                                )}
                                            >
                                                {isMixing ? 'Stop mixing' : `Mix this ${tierData.activeLabel.toLowerCase()}`}
                                            </button>
                                        </div>

                                        {isMixing && mixData && (
                                            <div className="mt-4 space-y-3">
                                                {/* Mobile-only condensed progress (the full
                                                    "Your Truck Builder" panel lives in the
                                                    sticky right rail on desktop). */}
                                                <div className="lg:hidden flex items-center justify-between gap-3 text-[12px]">
                                                    <span className="font-black text-heading">
                                                        {mixSummary?.filled ?? 0} / {mixCapacity.total} {mixCapacity.unit}s
                                                    </span>
                                                    <span className="font-black text-[#14B8A6]">{formatPrice(mixSummary?.totalWithMarkup || 0)}</span>
                                                </div>
                                                <div className="lg:hidden h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-[#14B8A6] transition-all" style={{ width: `${Math.min(100, ((mixSummary?.filled || 0) / Math.max(1, mixCapacity.total)) * 100)}%` }} />
                                                </div>

                                                {/* Variant cards.

                                                    Operator feedback: with 13+ flavours the previous
                                                    2-column layout truncated the label to "Fla…" so
                                                    buyers couldn't tell variants apart. Switched to
                                                    a column count that adapts to count (≤6 → 1col,
                                                    ≤12 → 2col, more → 3col on xl) and removed the
                                                    `truncate` clamp so the label wraps onto a
                                                    second line. */}
                                                <div
                                                    className={cn(
                                                        'grid gap-3',
                                                        mixData.variants.length <= 4
                                                            ? 'grid-cols-2'
                                                            : mixData.variants.length <= 9
                                                                ? 'grid-cols-2 sm:grid-cols-3'
                                                                : 'grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4',
                                                    )}
                                                >
                                                    {mixData.variants.map(v => {
                                                        const qty = Math.max(0, Number(mixQuantities[v.signature] || 0));
                                                        const unitPrice = mixCapacity.perVariantPrice === 'palletPrice' ? v.palletPrice : v.casePrice;
                                                        const remaining = (mixCapacity.total || 0) - (mixSummary?.filled || 0);
                                                        const canIncrement = remaining > 0;
                                                        const isActive = qty > 0;
                                                        return (
                                                            <div
                                                                key={v.signature}
                                                                className={cn(
                                                                    'bg-surface rounded-2xl border-2 p-3 flex flex-col gap-2 transition-all',
                                                                    isActive
                                                                        ? 'border-[#14B8A6] ring-2 ring-[#14B8A6]/15 shadow-sm'
                                                                        : 'border-slate-100 hover:border-slate-200',
                                                                )}
                                                            >
                                                                <div className="flex items-start gap-3">
                                                                    <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center relative">
                                                                        {v.image ? (
                                                                            // eslint-disable-next-line @next/next/no-img-element
                                                                            <img src={v.image} alt={v.label} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <Package size={20} className="text-slate-300" />
                                                                        )}
                                                                        {isActive && (
                                                                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#14B8A6] text-white flex items-center justify-center">
                                                                                <Check size={10} />
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[12px] font-black text-heading leading-tight line-clamp-2 break-words">{v.label}</p>
                                                                        <p className="text-[12px] text-[#14B8A6] font-bold mt-1">
                                                                            {formatPrice(unitPrice)} <span className="text-slate-400 font-medium">/ {mixCapacity.unit}</span>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setMixQuantities(q => ({ ...q, [v.signature]: Math.max(0, (q[v.signature] || 0) - 1) }))}
                                                                        className="w-8 h-8 rounded-lg border border-slate-200 bg-surface text-slate-500 hover:bg-slate-50 flex items-center justify-center disabled:opacity-30"
                                                                        disabled={qty <= 0}
                                                                    >
                                                                        <Minus size={13} />
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        min={0}
                                                                        max={mixCapacity.total}
                                                                        value={qty}
                                                                        onChange={e => {
                                                                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                                                            const others = Object.entries(mixQuantities)
                                                                                .filter(([k]) => k !== v.signature)
                                                                                .reduce((acc, [, qty]) => acc + Number(qty || 0), 0);
                                                                            const clamped = Math.min(n, Math.max(0, mixCapacity.total - others));
                                                                            setMixQuantities(q => ({ ...q, [v.signature]: clamped }));
                                                                        }}
                                                                        className="flex-1 mx-1 h-8 text-center text-[13px] font-black tabular-nums border border-slate-200 rounded-lg"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setMixQuantities(q => ({ ...q, [v.signature]: (q[v.signature] || 0) + 1 }))}
                                                                        disabled={!canIncrement}
                                                                        className="w-8 h-8 rounded-lg bg-cta text-cta-fg hover:bg-[#14B8A6] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                                    >
                                                                        <Plus size={13} />
                                                                    </button>
                                                                </div>
                                                                <p className="text-[10px] text-slate-400 text-center">
                                                                    {qty} {mixCapacity.unit}{qty === 1 ? '' : 's'} · {formatPrice(unitPrice * qty)}
                                                                </p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {mixSummary && mixSummary.filled !== mixCapacity.total && (
                                                    <p className="text-[11px] text-amber-700 font-bold">
                                                        ⚠ Add {Math.max(0, mixCapacity.total - mixSummary.filled)} more {mixCapacity.unit}s to fill the {tierData.activeLabel.toLowerCase()} before checkout.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                
                            </div>
                        )}
                        {isMixing && (
                            <div className="mt-4">
                                {isMixing && mixData && mixSummary && (() => {
                            const filled = mixSummary.filled;
                            const cap = Math.max(1, mixCapacity.total);
                            const pct = Math.min(100, Math.round((filled / cap) * 100));
                            const remaining = Math.max(0, mixCapacity.total - filled);
                            const isFull = filled === mixCapacity.total && filled > 0;
                            const markupDelta = (mixSummary.totalWithMarkup || 0) - (mixSummary.subtotal || 0);
                            return (
                                <div className="bg-surface border border-line rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-[15px] font-black text-heading flex-1">Your {tierData.activeLabel} Builder</h3>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-[#14B8A6] bg-[#14B8A6]/10 px-2 py-1 rounded-md">{pct}% filled</span>
                                    </div>
                                    {/* Truck that visually fills as pallets are
                                        added — the cargo box fills teal from the
                                        bottom up proportional to % filled so the
                                        buyer feels the truck loading. */}
                                    <div className="rounded-2xl bg-slate-50 border border-slate-100 h-28 flex items-center justify-center px-4">
                                        <svg viewBox="0 0 120 64" className="w-full h-20" aria-label={`${pct}% loaded`}>
                                            {/* cargo box outline */}
                                            <rect x="4" y="10" width="74" height="36" rx="3" fill="#fff" stroke="#0B1F3A" strokeWidth="2.5" />
                                            {/* fill (clipped to cargo box) */}
                                            <clipPath id="cargoClip">
                                                <rect x="6" y="12" width="70" height="32" rx="2" />
                                            </clipPath>
                                            <g clipPath="url(#cargoClip)">
                                                <rect
                                                    x="6"
                                                    y={12 + 32 * (1 - pct / 100)}
                                                    width="70"
                                                    height={32 * (pct / 100)}
                                                    fill="#14B8A6"
                                                    className="transition-all duration-500"
                                                />
                                            </g>
                                            {/* cab */}
                                            <path d="M80 20 h16 l10 12 v14 h-26 z" fill="#0B1F3A" />
                                            <rect x="84" y="24" width="12" height="9" rx="1.5" fill="#9FB4C7" />
                                            {/* wheels */}
                                            <circle cx="26" cy="50" r="7" fill="#0B1F3A" />
                                            <circle cx="26" cy="50" r="3" fill="#9FB4C7" />
                                            <circle cx="92" cy="50" r="7" fill="#0B1F3A" />
                                            <circle cx="92" cy="50" r="3" fill="#9FB4C7" />
                                        </svg>
                                    </div>
                                    <p className="text-center text-[12px] text-slate-500">
                                        <span className="font-black text-heading tabular-nums">{filled}</span> / <span className="tabular-nums">{mixCapacity.total}</span> {mixCapacity.unit}s
                                    </p>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#14B8A6] transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Filled</p>
                                            <p className="text-[15px] font-black text-heading tabular-nums mt-0.5">{filled} {mixCapacity.unit}s</p>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Remaining</p>
                                            <p className="text-[15px] font-black text-amber-600 tabular-nums mt-0.5">{remaining} {mixCapacity.unit}s</p>
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[12px]">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Summary</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Subtotal ({filled} {mixCapacity.unit}s)</span>
                                            <span className="font-mono font-bold text-slate-700">{formatPrice(mixSummary.subtotal || 0)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Mixing markup (×{markups.mix.toFixed(3)})</span>
                                            <span className="font-mono text-slate-500">{formatPrice(markupDelta)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Delivery fee</span>
                                            <span className="font-mono text-slate-400">Calculated at checkout</span>
                                        </div>
                                        
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                            <span className="font-black text-heading text-[14px]">Total</span>
                                            <span className="font-black text-[#14B8A6] text-[18px]">{formatPrice(mixSummary.totalWithMarkup || 0)}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => { if (isFull) { handleAdd(); router.push('/cart'); } }}
                                            disabled={!isFull}
                                            className="w-full h-12 rounded-xl bg-cta hover:bg-[#14B8A6] text-cta-fg font-black uppercase text-[12px] tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-cta"
                                        >
                                            <ShoppingCart size={16} /> Checkout {tierData.activeLabel}
                                        </button>
                                        
                                    </div>
                                    {!isFull && (
                                        <p className="text-[11px] text-amber-700 font-bold text-center">
                                            ⚠ Add {remaining} more {mixCapacity.unit}{remaining === 1 ? '' : 's'} to fill the {tierData.activeLabel.toLowerCase()}.
                                        </p>
                                    )}
                                    
                                </div>
                            );
                        })()}
                            </div>
                        )}

                        {/* Key facts — only fields the product actually has */}
                        {(keyFacts.length > 0 || listingStatus) && (
                            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 text-[12.5px]">
                                {keyFacts.map(([k, v]) => (
                                    <div key={k} className="flex justify-between gap-4 py-2 border-b border-line">
                                        <dt className="text-ink-3">{k}</dt>
                                        <dd className="text-ink font-medium text-end tabular-nums">{v}</dd>
                                    </div>
                                ))}
                                {listingStatus && (
                                    <div className="flex justify-between gap-4 py-2 border-b border-line">
                                        <dt className="text-ink-3">Listing</dt>
                                        <dd className={cn('font-medium text-end inline-flex items-center gap-1.5', product.status === 'APPROVED' ? 'text-[#047857]' : 'text-[#B45309]')}>
                                            {product.status === 'APPROVED' && <ShieldCheck size={14} />} {listingStatus}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        )}
                    </section>
                </div>

                {/* ── Details tabs ─────────────────────────────────────────── */}
                <section id="pdp-details" className="mt-10 scroll-mt-[112px]">
                    <div role="tablist" aria-label="Product information" className="flex gap-6 border-b border-line overflow-x-auto scrollbar-hide">
                        {tabs.map((t) => (
                            <button key={t} role="tab" type="button" aria-selected={activeTab === tabKey(t)} onClick={() => setActiveTab(tabKey(t))}
                                className={cn('h-10 -mb-px border-b-2 text-[13.5px] font-medium whitespace-nowrap transition-colors', activeTab === tabKey(t) ? 'border-[#0E7C74] text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>
                                {t}
                            </button>
                        ))}
                    </div>
                    <div className="py-6">
                        {(activeTab === 'Overview' || activeTab === 'Description') && (
                            (translatedDesc || product.description) ? (
                                <div className="max-w-3xl text-[14px] leading-relaxed text-ink-2 whitespace-pre-line">{translatedDesc || product.description}</div>
                            ) : (
                                <p className="text-[14px] text-ink-3">The supplier hasn’t added a description yet. See Specifications for packaging and trade details.</p>
                            )
                        )}
                        {activeTab === 'Specifications' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                {[['Packaging', packagingSpecs], ['Trade details', keyFacts]].map(([title, rows]) => (
                                    <div key={title as string}>
                                        <h3 className="text-[13px] font-semibold text-ink mb-1">{title as string}</h3>
                                        {(rows as Array<[string, string]>).length ? (
                                            <dl className="text-[13px]">
                                                {(rows as Array<[string, string]>).map(([k, v]) => (
                                                    <div key={k} className="flex justify-between gap-4 py-2 border-b border-line">
                                                        <dt className="text-ink-3">{k}</dt><dd className="text-ink font-medium text-end">{v}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        ) : <p className="text-[13px] text-ink-4 py-2">Not provided by the supplier.</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── Reviews (always visible, below the details) ─────────── */}
                <div id="pdp-reviews" className="mt-2 pt-8 border-t border-line scroll-mt-[112px]">
                    <ReviewSection
                        productId={product.id}
                        onReviewSubmitted={(newRating, newCount) => { setLocalRating(newRating); setLocalReviewsCount(newCount); }}
                    />
                </div>

                {/* ── Related products (same category, real catalog) ───────── */}
                {relatedProducts.length > 0 && (
                    <section className="mt-6 pt-8 border-t border-line">
                        <ProductRail
                            title={<span className="text-[18px] font-bold">More in {getDisplayCategory(product)}</span>}
                            viewAll={{ label: 'View all', href: product.category ? `/categories?category=${encodeURIComponent(product.category)}` : '/categories' }}
                        >
                            {relatedProducts.slice(0, 16).map((p) => {
                                const own = user?.role?.toUpperCase() === 'SUPPLIER' && (p as any).supplierId === user?.id;
                                const price = computeCardPrice(p, markups, !!own);
                                const img = p.images?.[0] || p.image;
                                return (
                                    <div key={p.id} className="snap-start shrink-0 w-[172px] sm:w-[200px]">
                                        <Link href={`/products/${p.id}`} className="group flex flex-col h-full rounded-xl ring-1 ring-line hover:ring-line-strong bg-surface p-2.5 transition-shadow">
                                            <span className="relative block aspect-square rounded-lg bg-media overflow-hidden">
                                                {img
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    ? <img src={img} alt={p.name} loading="lazy" className="absolute inset-0 m-auto max-w-[80%] max-h-[80%] object-contain mix-blend-multiply" />
                                                    : <span className="absolute inset-0 flex items-center justify-center text-ink-4"><Package size={28} strokeWidth={1.3} /></span>}
                                            </span>
                                            {p.brand && <span className="mt-2 text-[12px] font-semibold text-ink-2 truncate">{p.brand}</span>}
                                            <span className="text-[13px] leading-snug text-ink line-clamp-2 min-h-[2.5em] group-hover:text-teal">{p.name}</span>
                                            {p.ean && <span className="mt-0.5 text-[11.5px] text-ink-4 tabular-nums">{p.ean}</span>}
                                            <span className="mt-auto pt-1.5 text-[13px] text-ink-3">{!showPrices ? <span className="text-teal font-semibold">Sign in for price</span> : price > 0 ? <><span className="font-semibold text-ink tabular-nums">{formatPrice(price)}</span> / case</> : 'Price on request'}</span>
                                        </Link>
                                    </div>
                                );
                            })}
                        </ProductRail>
                    </section>
                )}
            </main>


            {/* Image lightbox — click any product image to open */}
            <ImageLightbox
                images={allImages}
                startIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
                alt={product.name}
            />

            {/* Mix composer "add another?" prompt — fires after a mixed
                truck/pallet is added so the buyer doesn't have to re-find
                the product to repeat the order. "Yes" empties the
                composer and keeps them on this page; "No, go to cart"
                routes to /cart. */}
            {showAddAnotherPrompt && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                    <div
                        className="absolute inset-0 bg-[#0F172A]/70 backdrop-blur-sm"
                        onClick={() => setShowAddAnotherPrompt(false)}
                    />
                    <div className="relative w-full max-w-md bg-surface rounded-3xl shadow-2xl p-7 space-y-5">
                        <div className="text-center">
                            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                                <Check size={26} />
                            </div>
                            <h3 className="text-[18px] font-black text-ink">
                                Mixed {tierData.activeLabel.toLowerCase()} added to your cart
                            </h3>
                            <p className="text-[13px] text-slate-500 mt-1.5">
                                Want to build another {tierData.activeLabel.toLowerCase()} with a different mix?
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => {
                                    setMixQuantities({});
                                    setShowAddAnotherPrompt(false);
                                }}
                                className="h-12 rounded-xl bg-[#0F172A] hover:bg-[#2EC4B6] text-white font-black uppercase text-[12px] tracking-widest transition-colors"
                            >
                                Yes, add another
                            </button>
                            <button
                                onClick={() => {
                                    setShowAddAnotherPrompt(false);
                                    router.push('/cart');
                                }}
                                className="h-12 rounded-xl bg-surface border-2 border-slate-200 hover:border-[#2EC4B6] text-slate-700 font-black uppercase text-[12px] tracking-widest transition-colors"
                            >
                                Go to cart
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
