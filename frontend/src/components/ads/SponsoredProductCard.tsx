'use client';

import Link from 'next/link';
import { ShoppingCart, Check, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/currency';
import { useState } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/lib/auth';

interface SponsoredProductProps {
    product: any;
    index: number;
}

export default function SponsoredProductCard({ product, index }: SponsoredProductProps) {
    const { currency } = useCurrency();
    const { t, meta } = useLanguage();
    const tc = (k: string) => t('catalogPage', k);
    const { isLoggedIn } = useAuth();
    const { addItem } = useCart();
    const [isAdded, setIsAdded] = useState(false);

    if (!product) return null;

    const handleAddToCart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isAdded) return;

        addItem({
            id: product.id,
            name: product.name,
            brand: product.brand || 'Atlantis',
            price: product.price || 0,
            image: product.images?.[0] || '',
            unit: tc('case'),
            tier: 'carton',
        });

        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000);
    };

    return (
        <div className="group relative flex flex-col h-full text-start rounded-[20px] p-2.5 -m-2.5 transition-[transform,box-shadow,background-color] duration-300 ease-out hover:-translate-y-1 hover:bg-surface hover:shadow-[0_20px_44px_-14px_rgba(14,124,116,0.28),0_0_0_1px_rgba(46,196,182,0.18)] motion-reduce:transform-none">
            <Link
                href={`/products/${product.id}`}
                className="relative block aspect-square rounded-2xl bg-media border border-line overflow-hidden transition-all duration-200 group-hover:border-line-strong"
            >
                {product.images?.[0] ? (
                    <img
                        src={product.images[0]}
                        alt={product.name}
                        className="absolute inset-0 w-full h-full object-contain p-[9%] mix-blend-multiply group-hover:scale-[1.04] transition-transform duration-300 motion-reduce:transform-none"
                    />
                ) : (
                    // No stock photo stand-in: a generic picture would misrepresent the product.
                    <span className="absolute inset-0 flex items-center justify-center text-ink-4"><ImageIcon size={40} strokeWidth={1.25} aria-hidden /></span>
                )}
                <span className="absolute top-3 start-3 bg-surface-3 text-ink-2 border border-line px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide rtl:tracking-normal">
                    {tc('sponsored')}
                </span>
            </Link>

            <div className="flex flex-col flex-1 pt-3.5 px-0.5">
                <p className="text-[12px] font-bold text-ink truncate mb-1.5">
                    {product.brand || 'Atlantis'}
                </p>
                <Link href={`/products/${product.id}`}>
                    <h3 className="font-sans text-[15px] font-semibold leading-snug line-clamp-2 h-[2.75em] text-ink hover:text-teal transition-colors">
                        {product.name}
                    </h3>
                </Link>
                <p className="mt-1 h-[18px] text-[12px] leading-[18px] text-ink-3 tabular-nums tracking-wide truncate" title={(product as any).ean || undefined}>
                    {(product as any).ean ? <bdi dir="ltr">{(product as any).ean}</bdi> : tc('noLinkCode')}
                </p>

                <div className="mt-auto pt-3">
                    <div className="flex items-end justify-between gap-2">
                        {/* Prices only for signed-in buyers, and never a €0.00 for a missing price. */}
                        {!isLoggedIn || product.pricesHidden ? (
                            <Link href={`/auth/login?redirect=${encodeURIComponent(`/products/${product.id}`)}`} className="text-[13px] font-semibold text-teal hover:underline">{tc('signInForPrice')}</Link>
                        ) : Number(product.price) > 0 ? (
                            <span className="text-[19px] font-bold text-ink tabular-nums tracking-tight"><bdi>{formatPrice(product.price, currency, meta.intl)}</bdi></span>
                        ) : (
                            <span className="text-[14px] font-semibold text-ink-2">{tc('priceOnRequest')}</span>
                        )}
                        {(product.stock ?? 0) > 0 ? (
                            <span className="text-[11px] font-semibold text-[#047857] pb-0.5">{tc('inStock')}</span>
                        ) : (
                            <span className="text-[11px] font-semibold text-[#B91C1C] pb-0.5">{tc('unavailable')}</span>
                        )}
                    </div>
                    <Button
                        onClick={handleAddToCart}
                        disabled={!isLoggedIn || !(Number(product.price) > 0) || product.stock === 0 || isAdded}
                        className={`mt-3 w-full h-10 rounded-xl text-[13px] font-semibold shadow-none transition-colors flex items-center justify-center gap-2 ${isAdded
                            ? "bg-[#2EC4B6] text-white"
                            : "bg-cta hover:bg-cta-hover text-white"
                            }`}
                    >
                        {isAdded ? <><Check size={15} className="animate-in zoom-in duration-300" /> <span className="sr-only">{tc('addedToCart')}</span></> : <><ShoppingCart size={15} /> {tc('addToCart')}</>}
                    </Button>
                </div>
            </div>
        </div>
    );
}
