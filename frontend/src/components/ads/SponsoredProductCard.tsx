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
            brand: product.brand || product.supplier?.name || '',
            price: product.price || 0,
            image: product.images?.[0] || '',
            unit: 'unit',
        });

        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000);
    };

    return (
        <div className="group relative bg-card border border-border rounded-md hover:shadow-sm overflow-hidden flex flex-col transition-all h-full pb-3">
            <span className="text-[11px] text-[#565656] px-3 pt-2 font-medium">Sponsored</span>
            <Link href={`/products/${product.id}`} className="block relative aspect-square p-4 mb-2">
                <img
                    src={product.images?.[0] || 'https://images.unsplash.com/photo-1542272604-787c38355620'}
                    alt={product.name}
                    className="object-contain w-full h-full mix-blend-multiply group-hover:scale-105 transition-transform duration-300"
                />
            </Link>

            <div className="px-4 flex flex-col flex-1">
                <Link href={`/products/${product.id}`} className="block mt-auto">
                    <h3 className="font-medium text-[15px] leading-tight text-[#0F1111] hover:text-[#C7511F] line-clamp-2 mb-1">
                        {product.name}
                    </h3>
                </Link>

                <p className="text-[#007185] text-xs mb-2 truncate">
                    {product.brand || product.supplier?.name}
                </p>

                <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-xl font-medium text-[#0F1111]">{formatPrice(product.price, false)}</span>
                </div>

                {(product.stock ?? 0) > 0 ? (
                    <div className="text-[#007185] text-xs mb-3">In Stock</div>
                ) : (
                    <div className="text-[#B12704] text-xs mb-3">Currently unavailable.</div>
                )}

                <div className="mt-auto pt-2">
                    <Button
                        onClick={handleAddToCart}
                        disabled={product.stock === 0 || isAdded}
                        className={`w-full font-normal shadow-sm rounded-full border h-8 text-xs transition-all flex items-center justify-center gap-2 ${isAdded
                            ? "bg-accent text-accent-foreground border-transparent"
                            : "bg-[#FFD814] hover:bg-[#F7CA00] text-[#0F1111] border-[#FCD200]"
                            }`}
                    >
                        {isAdded ? <Check size={14} className="animate-in zoom-in duration-300" /> : "Add to cart"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
