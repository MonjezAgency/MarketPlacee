'use client';

import Link from 'next/link';
import { Star, Check, ShieldCheck, ShoppingCart, ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
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
            unit: product.unit || 'units',
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
            <div className="relative p-4 flex justify-center items-center h-[200px] border-b border-border/30 bg-white">
                { (product.image || (product.images && product.images.length > 0)) ? (
                    <img
                        src={product.image || (product.images && product.images[0]) || ''}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/160?text=Invalid+Image'; }}
                        className="max-h-[160px] max-w-full object-contain mix-blend-multiply"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="w-full h-[160px] flex items-center justify-center text-muted-foreground/30">
                        {/* Empty layout as requested */}
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
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-foreground">{formatPrice(displayPrice, currency)}</span>
                        <span className="text-muted-foreground text-xs font-medium">/ {product.unit}</span>
                        {isOwnProduct && (
                            <span className="ms-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Your Price</span>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Min Order</span>
                            <span className="text-xs font-bold">{product.minOrder} units</span>
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
