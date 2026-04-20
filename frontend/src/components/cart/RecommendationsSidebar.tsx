'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Sparkles, Loader2, Plus, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useCart, CartItem } from '@/lib/cart';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface RecommendedProduct {
    id: string;
    name: string;
    price: number;
    images: string[];
    supplierId: string;
    brand?: string;
    category: string;
}

export default function RecommendationsSidebar({ items }: { items: CartItem[] }) {
    const { addItem } = useCart();
    const { t } = useLanguage();
    const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const fetchRecommendations = async () => {
            if (items.length === 0) {
                setRecommendations([]);
                setIsLoading(false);
                return;
            }

            const categories = Array.from(new Set(items.map(item => item.category).filter(Boolean)));
            const excludeIds = items.map(item => item.id);

            setIsLoading(true);
            try {
                const params = new URLSearchParams();
                params.append('categories', categories.join(','));
                params.append('excludeIds', excludeIds.join(','));

                const res = await apiFetch(`/products/cart/recommendations?${params.toString()}`, {
                    signal: controller.signal
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setRecommendations(data);
                }
            } catch (error: any) {
                if (error.name !== 'AbortError') {
                    console.error("Failed to fetch recommendations:", error);
                }
            } finally {
                clearTimeout(timeoutId);
                setIsLoading(false);
            }
        };

        fetchRecommendations();
        return () => controller.abort();
    }, [items]);

    if (items.length === 0) return null;

    return (
        <div className="bg-card rounded-[40px] border border-border/50 p-8 premium-shadow space-y-8 mt-8 relative overflow-hidden group/sidebar">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[60px] group-hover/sidebar:bg-primary/10 transition-colors duration-700" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-highlight/5 rounded-full blur-[50px]" />

            <div className="flex items-center justify-between relative z-10">
                <h3 className="font-heading font-black text-2xl flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center shadow-inner">
                        <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    {t('cart', 'frequentlyBought')}
                </h3>
                {recommendations.length > 0 && !isLoading && (
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                        Curated for you
                    </span>
                )}
            </div>

            <AnimatePresence mode="wait">
                {isLoading ? (
                    <motion.div 
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center justify-center py-12 space-y-6"
                    >
                        <div className="relative">
                            <Loader2 className="w-12 h-12 text-primary animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-highlight animate-pulse" />
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-black uppercase tracking-widest text-foreground animate-pulse">{t('cart', 'analyzingCart')}</p>
                            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tighter">finding the perfect matches</p>
                        </div>
                    </motion.div>
                ) : recommendations.length === 0 ? (
                    <motion.div 
                        key="empty"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-12 text-center space-y-4"
                    >
                        <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center">
                            <Plus className="w-6 h-6 text-muted-foreground/30 rotate-45" />
                        </div>
                        <div>
                            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">No matches found yet</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Add more variety to your cart to see pairs.</p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="list"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6 relative z-10"
                    >
                        {recommendations.map((product, idx) => (
                            <motion.div 
                                key={product.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="group/item relative flex gap-5 p-5 rounded-[2.5rem] border border-border/50 bg-background/40 hover:bg-white hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500"
                            >
                                <div className="w-24 h-24 bg-white rounded-3xl flex-shrink-0 border border-border/50 overflow-hidden p-3 flex items-center justify-center relative group-hover/item:border-primary/20 transition-colors">
                                    {product.images?.[0] ? (
                                        <img 
                                            src={product.images[0]} 
                                            alt={product.name} 
                                            className="w-full h-full object-contain mix-blend-multiply group-hover/item:scale-110 transition-transform duration-700 ease-out" 
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-muted/30 rounded-2xl flex items-center justify-center">
                                            <ShoppingCart className="w-8 h-8 text-muted-foreground/20" />
                                        </div>
                                    )}
                                    {/* Quick action overlay */}
                                    <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                        <button 
                                            onClick={() => addItem({
                                                id: product.id,
                                                name: product.name,
                                                price: product.price,
                                                image: product.images?.[0] || '',
                                                supplierId: product.supplierId,
                                                brand: product.brand || 'Premium',
                                                unit: 'box',
                                                category: product.category
                                            }, 1)}
                                            className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-primary shadow-xl hover:scale-110 active:scale-95 transition-all"
                                        >
                                            <Plus size={24} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            {product.brand && (
                                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 truncate">{product.brand}</span>
                                            )}
                                        </div>
                                        <h4 className="font-black text-base text-foreground leading-tight truncate px-0.5 group-hover/item:text-primary transition-colors">{product.name}</h4>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">{product.category}</p>
                                    </div>
                                    
                                    <div className="flex items-center justify-between mt-3">
                                        <p className="font-black text-lg text-primary">{formatPrice(product.price, false)}</p>
                                        <button 
                                            onClick={() => addItem({
                                                id: product.id,
                                                name: product.name,
                                                price: product.price,
                                                image: product.images?.[0] || '',
                                                supplierId: product.supplierId,
                                                brand: product.brand || 'Premium',
                                                unit: 'box',
                                                category: product.category
                                            }, 1)}
                                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover/item:text-primary transition-colors"
                                        >
                                            {t('cart', 'add')} <ArrowRight size={12} className="group-hover/item:translate-x-1 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {recommendations.length > 0 && (
                <div className="pt-2 border-t border-border/50 text-center">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.1em]">
                        Prices include platform professional handling
                    </p>
                </div>
            )}
        </div>
    );
}
