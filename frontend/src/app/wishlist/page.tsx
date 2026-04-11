'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Package, Trash2, ShoppingCart, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';

const API_URL = '/api';

interface WishlistProduct {
    id: string;
    name: string;
    price: number;
    images: string[];
    brand: string;
    category: string;
    supplier: { name: string };
    addedAt: string;
}

export default function WishlistPage() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { addItem } = useCart();
    const [items, setItems] = React.useState<WishlistProduct[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [removing, setRemoving] = React.useState<string | null>(null);
    const [addedToCart, setAddedToCart] = React.useState<string | null>(null);

    const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('bev-token') : '');

    const fetchWishlist = React.useCallback(async () => {
        if (!user) { setIsLoading(false); return; }
        try {
            const res = await fetch(`${API_URL}/wishlist`, {
                headers: { Authorization: `Bearer ${getToken()}` },
                cache: 'no-store',
            });
            if (res.ok) setItems(await res.json());
        } catch { /* offline */ }
        finally { setIsLoading(false); }
    }, [user]);

    React.useEffect(() => { fetchWishlist(); }, [fetchWishlist]);

    const handleRemove = async (productId: string) => {
        setRemoving(productId);
        try {
            await fetch(`${API_URL}/wishlist/${productId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            setItems(prev => prev.filter(i => i.id !== productId));
        } finally { setRemoving(null); }
    };

    const handleAddToCart = (item: WishlistProduct) => {
        addItem({ id: item.id, name: item.name, brand: item.brand, price: item.price, image: item.images?.[0] || '', unit: 'unit' }, 1);
        setAddedToCart(item.id);
        setTimeout(() => setAddedToCart(null), 2000);
    };

    if (!user) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground pt-20">
                <Heart className="w-12 h-12 opacity-20" />
                <p className="font-bold">{t('wishlist', 'signInRequired')}</p>
                <Link href="/auth/login" className="text-primary font-black text-sm hover:underline">{t('wishlist', 'signIn')}</Link>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 pt-24 pb-20 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/" className="w-10 h-10 rounded-xl border border-border/50 bg-card flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                            <Heart size={22} className="text-primary" fill="currentColor" /> {t('wishlist', 'title')}
                        </h1>
                        <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                            {items.length} {items.length === 1 ? t('wishlist', 'savedItem') : t('wishlist', 'savedItems')}
                        </p>
                    </div>
                </div>
                {items.length > 0 && (
                    <button
                        onClick={() => items.forEach(i => handleAddToCart(i))}
                        className="h-10 px-5 bg-primary text-white font-black text-xs rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 uppercase tracking-wide"
                    >
                        <ShoppingCart size={14} />
                        {t('wishlist', 'addAllToCart')}
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : items.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-4 py-24 text-muted-foreground"
                >
                    <Heart className="w-16 h-16 opacity-10" />
                    <p className="font-black text-lg">{t('wishlist', 'empty')}</p>
                    <p className="text-sm">{t('wishlist', 'emptyDesc')}</p>
                    <Link
                        href="/categories"
                        className="mt-4 h-11 px-6 bg-primary text-white font-black text-xs rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 uppercase tracking-widest"
                    >
                        {t('wishlist', 'browseProducts')}
                    </Link>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                        {items.map((item, i) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ delay: i * 0.05 }}
                                className="bg-card border border-border/50 rounded-3xl overflow-hidden hover:border-primary/20 transition-all group"
                            >
                                {/* Product image */}
                                <Link href={`/products/${item.id}`} className="block relative aspect-square bg-muted/20 overflow-hidden">
                                    {item.images?.[0] ? (
                                        <img
                                            src={item.images[0]}
                                            alt={item.name}
                                            className="w-full h-full object-contain p-6 group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Package size={40} className="text-muted-foreground/30" />
                                        </div>
                                    )}
                                </Link>

                                {/* Info */}
                                <div className="p-5 space-y-3">
                                    <div>
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{item.category}</p>
                                        <Link href={`/products/${item.id}`} className="font-black text-sm hover:text-primary transition-colors line-clamp-2 mt-0.5">
                                            {item.name}
                                        </Link>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.supplier?.name}</p>
                                    </div>

                                    <p className="text-xl font-black text-primary">{formatPrice(item.price, false)}</p>

                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={() => handleAddToCart(item)}
                                            className={cn(
                                                'flex-1 h-9 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all',
                                                addedToCart === item.id
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20'
                                            )}
                                        >
                                            <ShoppingCart size={12} />
                                            {addedToCart === item.id ? t('product', 'added') : t('wishlist', 'addToCart')}
                                        </button>
                                        <button
                                            onClick={() => handleRemove(item.id)}
                                            disabled={removing === item.id}
                                            className="w-9 h-9 rounded-xl border border-border/50 flex items-center justify-center text-muted-foreground hover:text-red-500 hover:border-red-500/30 transition-all disabled:opacity-50"
                                        >
                                            {removing === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
