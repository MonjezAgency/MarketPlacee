'use client';

import { useCart } from '@/lib/cart';
import Link from 'next/link';
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft, ArrowRight, Package, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import RecommendationsSidebar from '@/components/cart/RecommendationsSidebar';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function CartPage() {
    const { items, removeItem, updateQuantity, total, clearCart } = useCart();
    const { t } = useLanguage();
    const { currency } = useCurrency();

    if (items.length === 0) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center max-w-md"
                >
                    <div className="w-24 h-24 bg-muted rounded-[32px] flex items-center justify-center mx-auto mb-8">
                        <ShoppingBag className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h2 className="text-3xl font-heading font-black mb-4">{t('cart', 'emptyTitle')}</h2>
                    <p className="text-muted-foreground mb-10 text-lg">{t('cart', 'emptyDescription')}</p>
                    <Link href="/categories">
                        <Button size="lg" className="rounded-2xl gap-2 font-black">
                            <ArrowLeft size={20} />
                            {t('cart', 'startSourcing')}
                        </Button>
                    </Link>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background py-12">
            <div className="container mx-auto px-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full">
                            <Package size={14} className="text-primary" />
                            <span className="text-[10px] font-black text-foreground uppercase tracking-[0.2em]">{t('cart', 'wholesaleBasket')}</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-heading font-black text-foreground tracking-tight">
                            {t('cart', 'procurementReview')}
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium">{t('cart', 'staging')} {items.length} {t('cart', 'uniqueSKUs')}</p>
                    </div>
                    <Button
                        variant="ghost"
                        onClick={clearCart}
                        className="text-highlight hover:bg-highlight/10 h-12 px-6 rounded-2xl"
                    >
                        <Trash2 className="w-4 h-4 me-2" />
                        {t('cart', 'resetBasket')}
                    </Button>
                </div>

                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Cart Items */}
                    <div className="flex-1 space-y-6">
                        <AnimatePresence mode="popLayout">
                            {items.map((item, i) => (
                                <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="bg-card rounded-[32px] border border-border/50 p-6 flex flex-col sm:flex-row gap-6 items-center group hover:border-primary/20 hover:premium-shadow transition-all duration-300"
                                >
                                    {/* Image */}
                                    <div className="w-28 h-28 bg-muted/30 rounded-2xl flex-shrink-0 overflow-hidden p-4 group-hover:bg-muted/50 transition-colors">
                                        <img src={item.image} alt={item.name} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110" />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0 text-center sm:text-start">
                                        <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">{item.brand}</span>
                                        <h3 className="font-heading font-bold text-lg leading-tight mt-1 mb-2">{item.name}</h3>
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-xl">
                                                <ShieldCheck size={14} className="text-accent" />
                                                <span className="font-bold">{t('cart', 'verifiedSKU')}</span>
                                            </div>
                                            <p className="font-heading font-bold text-xl text-secondary">{formatPrice(item.price, currency)}<span className="text-muted-foreground text-xs font-medium ms-1">/ {item.unit}</span></p>
                                        </div>
                                    </div>

                                    {/* Quantity & Actions */}
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-3 bg-muted/20 p-2 rounded-2xl border border-border/50">
                                            <button
                                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                className="w-10 h-10 rounded-xl flex items-center justify-center bg-card border border-border/50 hover:bg-muted hover:text-primary transition-all active:scale-90 shadow-sm"
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span className="w-8 text-center font-black text-foreground">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                className="w-10 h-10 rounded-xl flex items-center justify-center bg-card border border-border/50 hover:bg-muted hover:text-primary transition-all active:scale-90 shadow-sm"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="text-end hidden xl:block min-w-[120px]">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">{t('cart', 'subtotal')}</span>
                                            <p className="font-heading font-black text-xl">{formatPrice(item.price * item.quantity, currency)}</p>
                                        </div>

                                        <button
                                            onClick={() => removeItem(item.id)}
                                            className="w-12 h-12 rounded-2xl text-muted-foreground hover:bg-highlight/10 hover:text-highlight transition-all duration-300 flex items-center justify-center"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Order Summary */}
                    <aside className="lg:w-[400px]">
                        <div className="bg-card rounded-[40px] border border-border/50 p-8 lg:sticky lg:top-32 premium-shadow space-y-8">
                            <h3 className="font-heading font-bold text-2xl">{t('cart', 'logisticsSummary')}</h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground font-medium">{t('cart', 'coreInventory')}</span>
                                    <span className="font-bold text-foreground font-heading">{formatPrice(total, currency)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground font-medium">{t('cart', 'distributionFee')}</span>
                                    <span className="text-secondary font-black uppercase tracking-widest text-xs">
                                        {t('cart', 'manualQuote')}
                                    </span>
                                </div>
                                {total >= 500 && (
                                    <div className="bg-accent/10 border border-accent/20 text-accent text-[10px] rounded-xl px-4 py-3 font-bold text-center tracking-wider uppercase">
                                        {t('cart', 'bulkThreshold')}
                                    </div>
                                )}
                            </div>

                            <div className="pt-8 border-t border-border">
                                <div className="flex justify-between items-end mb-8">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('cart', 'totalPayable')}</span>
                                        <p className="font-heading font-black text-3xl text-secondary">{formatPrice(total, currency)}</p>
                                    </div>
                                    <span className="text-xs text-muted-foreground font-medium mb-1">{t('cart', 'exclTax')}</span>
                                </div>

                                <Link href="/checkout">
                                    <Button size="xl" className="w-full flex items-center justify-center gap-3">
                                        <Package size={20} />
                                        <span>{t('cart', 'confirmLogistics')}</span>
                                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                </Link>

                                <div className="mt-8 text-center">
                                    <Link href="/categories" className="text-xs font-bold text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2">
                                        <ArrowLeft size={14} />
                                        {t('cart', 'backToInventory')}
                                    </Link>
                                </div>
                            </div>
                        </div>

                    </aside>
                </div>

                {/* Recommendations Section */}
                <RecommendationsSidebar items={items} />
            </div>
        </div>
    );
}


