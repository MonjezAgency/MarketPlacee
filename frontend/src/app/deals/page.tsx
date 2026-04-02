'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Tag, Package, ArrowRight, Loader2, Percent, Clock, Flame } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

export default function DealsPage() {
    const [products, setProducts] = React.useState<any[]>([]);
    const [coupons, setCoupons] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [addedIds, setAddedIds] = React.useState<Set<string>>(new Set());
    const { addItem } = useCart();

    React.useEffect(() => {
        const fetchDeals = async () => {
            setIsLoading(true);
            try {
                const token = localStorage.getItem('bev-token');
                const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

                const [productsRes, couponsRes] = await Promise.all([
                    fetch(`${API_URL}/products?status=APPROVED&sort=newest&limit=48`),
                    token
                        ? fetch(`${API_URL}/coupons`, { headers: authHeader })
                        : Promise.resolve(null),
                ]);

                if (productsRes.ok) {
                    const data = await productsRes.json();
                    setProducts(data.data || (Array.isArray(data) ? data : []));
                }
                if (couponsRes?.ok) {
                    const data = await couponsRes.json();
                    setCoupons((Array.isArray(data) ? data : []).filter((c: any) => c.isActive));
                }
            } catch { /* ignore */ }
            finally { setIsLoading(false); }
        };
        fetchDeals();
    }, []);

    const handleAddToCart = (product: any) => {
        addItem({ id: product.id, name: product.name, price: product.price, image: product.images?.[0] });
        setAddedIds(prev => new Set(prev).add(product.id));
        setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(product.id); return s; }), 2000);
    };

    return (
        <main className="min-h-screen bg-muted/20 pt-20 pb-24">
            <div className="container mx-auto px-6">
                {/* Hero */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center space-y-4 relative overflow-hidden">
                    <div className="absolute inset-0 -z-10">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-3xl" />
                    </div>
                    <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 px-4 py-1.5 rounded-full text-primary text-xs font-black uppercase tracking-widest">
                        <Flame size={12} /> Best Value
                    </div>
                    <h1 className="text-5xl font-heading font-black tracking-tight">
                        Today's <span className="text-primary">Deals</span>
                    </h1>
                    <p className="text-muted-foreground max-w-xl mx-auto text-lg">
                        Bulk purchasing at competitive prices — direct from verified suppliers.
                    </p>
                </motion.div>

                {/* Active Coupons */}
                {coupons.length > 0 && (
                    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
                        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                            <Tag size={14} /> Active Coupon Codes
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {coupons.map((coupon: any) => (
                                <motion.div key={coupon.id} whileHover={{ scale: 1.02 }}
                                    className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-5 flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                                        <Percent size={20} className="text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-black text-xl text-primary">{coupon.discountPercent}% OFF</p>
                                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                            <Clock size={10} /> Expires {new Date(coupon.expirationDate).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="shrink-0">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Code</p>
                                        <p className="font-black font-mono text-sm bg-background border border-border/50 px-3 py-1 rounded-lg">
                                            {coupon.code}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.section>
                )}

                {/* Products Grid */}
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-black">
                            {isLoading ? 'Loading...' : `${products.length} Products`}
                        </h2>
                        <Link href="/categories" className="text-sm font-bold text-primary hover:underline flex items-center gap-1">
                            Browse All <ArrowRight size={14} />
                        </Link>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">
                            <Package size={40} className="mx-auto mb-3 opacity-20" />
                            <p className="font-bold">No deals available right now. Check back soon.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                            {products.map((product: any, i: number) => {
                                const isAdded = addedIds.has(product.id);
                                return (
                                    <motion.div key={product.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(i * 0.03, 0.5) }}
                                        className="bg-card border border-border/50 rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all group"
                                    >
                                        <Link href={`/products/${product.id}`} className="block">
                                            <div className="aspect-square bg-muted relative overflow-hidden">
                                                {product.images?.[0] ? (
                                                    <img src={product.images[0]} alt={product.name}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Package size={32} className="text-muted-foreground/30" />
                                                    </div>
                                                )}
                                                {product.moq && (
                                                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                                                        MOQ: {product.moq}
                                                    </div>
                                                )}
                                            </div>
                                        </Link>
                                        <div className="p-4 space-y-3">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{product.category}</p>
                                                <Link href={`/products/${product.id}`}>
                                                    <p className="font-black text-sm mt-0.5 line-clamp-2 group-hover:text-primary transition-colors">{product.name}</p>
                                                </Link>
                                                {product.supplier?.companyName && (
                                                    <p className="text-[10px] text-muted-foreground mt-1">{product.supplier.companyName}</p>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-black text-primary">{formatPrice(product.price)}</p>
                                                    <p className="text-[10px] text-muted-foreground">per {product.unit || 'unit'}</p>
                                                </div>
                                                <button onClick={() => handleAddToCart(product)}
                                                    className={cn('h-8 px-3 rounded-xl text-xs font-black transition-all',
                                                        isAdded
                                                            ? 'bg-emerald-500 text-white'
                                                            : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20'
                                                    )}>
                                                    {isAdded ? '✓ Added' : '+ Cart'}
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
