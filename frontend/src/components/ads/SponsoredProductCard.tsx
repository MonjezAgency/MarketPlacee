'use client';

import Link from 'next/link';
import { ShoppingCart, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/currency';
import { useState } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';

interface SponsoredProductProps {
    product: any;
    index: number;
}

export default function SponsoredProductCard({ product, index }: SponsoredProductProps) {
    const { currency } = useCurrency();
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
            unit: 'Case',
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
                <img
                    src={product.images?.[0] || 'https://images.unsplash.com/photo-1542272604-787c38355620'}
                    alt={product.name}
                    className="absolute inset-0 w-full h-full object-contain p-[9%] mix-blend-multiply group-hover:scale-[1.04] transition-transform duration-300"
                />
                <span className="absolute top-3 start-3 bg-surface-3 text-ink-2 border border-line px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
                    Sponsored
                </span>
            </Link>

            <div className="flex flex-col flex-1 pt-3.5 px-0.5">
                <p className="text-[12px] font-bold text-ink truncate mb-1.5">
                    {product.brand || 'Atlantis'}
                </p>
                <Link href={`/products/${product.id}`}>
                    <h3 className="font-sans text-[15px] font-semibold leading-snug line-clamp-2 min-h-[2.6em] text-ink hover:text-teal transition-colors">
                        {product.name}
                    </h3>
                </Link>

                <div className="mt-auto pt-3">
                    <div className="flex items-end justify-between gap-2">
                        <span className="text-[19px] font-bold text-ink tabular-nums tracking-tight">{formatPrice(product.price, currency)}</span>
                        {(product.stock ?? 0) > 0 ? (
                            <span className="text-[11px] font-semibold text-[#047857] pb-0.5">In Stock</span>
                        ) : (
                            <span className="text-[11px] font-semibold text-[#B91C1C] pb-0.5">Currently unavailable</span>
                        )}
                    </div>
                    <Button
                        onClick={handleAddToCart}
                        disabled={product.stock === 0 || isAdded}
                        className={`mt-3 w-full h-10 rounded-xl text-[13px] font-semibold shadow-none transition-colors flex items-center justify-center gap-2 ${isAdded
                            ? "bg-[#2EC4B6] text-white"
                            : "bg-cta hover:bg-cta-hover text-white"
                            }`}
                    >
                        {isAdded ? <Check size={15} className="animate-in zoom-in duration-300" /> : <><ShoppingCart size={15} /> Add to cart</>}
                    </Button>
                </div>
            </div>
        </div>
    );
}
