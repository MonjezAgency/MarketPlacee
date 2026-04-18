'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Star, Plus, Minus, Check, Truck,
    ShieldCheck, RotateCcw, ChevronRight, Share2,
    Heart, Info, Package, Sparkles, ArrowLeft, ShoppingCart
} from 'lucide-react';
import { type Product, ProductStatus } from '@/lib/types';
import { fetchProductById, apiFetch } from '@/lib/api';
import { useEffect } from 'react';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import ProductCard from '@/components/product/ProductCard';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateText } from '@/lib/translator';
import { motion, AnimatePresence } from 'framer-motion';
import ReviewSection from '@/components/product/ReviewSection';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useWishlist } from '@/hooks/useWishlist';

export default function ProductDetailClient() {
    const { id } = useParams();
    const { addItem } = useCart();
    const [quantity, setQuantity] = useState(1);
    const [isAdded, setIsAdded] = useState(false);
    const router = useRouter();
    const { t, locale } = useLanguage();
    const isAr = locale === 'ar';
    const { user, isLoggedIn } = useAuth();
    const [localRating, setLocalRating] = useState(0);
    const [localReviewsCount, setLocalReviewsCount] = useState(0);

    const { isSaved, toggle: toggleWishlist } = useWishlist();
    const [translatedName, setTranslatedName] = useState('');
    const [translatedDesc, setTranslatedDesc] = useState('');

    const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
    const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch the specific product by ID directly — no need to load all products
    useEffect(() => {
        if (!id) return;
        setIsLoading(true);
        fetchProductById(id as string).then(data => {
            setCurrentProduct(data);
            setIsLoading(false);
        });
    }, [id]);

    // Fetch similar products from the dedicated endpoint once id is known
    useEffect(() => {
        if (!id) return;
        apiFetch(`/products/${id}/similar`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setSimilarProducts(Array.isArray(data) ? data : []))
            .catch(() => { });
    }, [id]);

    useEffect(() => {
        if (currentProduct) {
            setLocalRating(currentProduct.rating || 0);
            setLocalReviewsCount(currentProduct.reviewsCount || 0);

            if (locale !== 'en') {
                translateText(currentProduct.name, locale).then(setTranslatedName);
                translateText(currentProduct.description || '', locale).then(setTranslatedDesc);
            } else {
                setTranslatedName(currentProduct.name);
                setTranslatedDesc(currentProduct.description || '');
            }
        }
    }, [locale, currentProduct]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex text-muted-foreground font-medium items-center justify-center p-6 pt-20">
                {t('common', 'loading')}
            </div>
        );
    }

    const product = currentProduct;
    // Use server-side similar products only
    const relatedProducts = similarProducts;


    if (!product) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <div className="w-24 h-24 bg-muted rounded-[32px] flex items-center justify-center mx-auto mb-8">
                        <Package className="text-muted-foreground" size={40} />
                    </div>
                    <h2 className="text-3xl font-heading font-black mb-4">{t('product', 'notFound')}</h2>
                    <p className="text-muted-foreground mb-8 text-lg">{t('product', 'notFound')}</p>
                    <Link href="/categories">
                        <Button size="lg" className="rounded-2xl font-black">
                            {t('product', 'backToInventory')}
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    const handleAdd = () => {
        if (!isLoggedIn) {
            router.push('/auth/login?redirect=' + encodeURIComponent(window.location.pathname));
            return;
        }
        addItem({
            id: product.id,
            name: product.name,
            brand: product.brand || 'Premium',
            price: product.price,
            image: product.image || '',
            unit: product.unit || 'units',
            category: product.category || 'Uncategorized',
        }, quantity);
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2500);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0A0D12] pb-0 overflow-x-hidden pt-20">
            {/* Upper Nav / Breadcrumbs */}
            <div className="bg-card border-b border-border/50">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <nav className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                        <Link href="/" className="hover:text-primary transition-colors">{t('navbar', 'home') || 'Home'}</Link>
                        <ChevronRight size={10} className="text-muted-foreground/30" />
                        <Link href="/categories" className="hover:text-primary transition-colors">{t('navbar', 'browseCatalog') || 'Inventory'}</Link>
                        <ChevronRight size={10} className="text-muted-foreground/30" />
                        <span className="text-foreground truncate max-w-[150px]">{translatedName || product.name}</span>
                    </nav>
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-[10px] font-bold text-foreground uppercase tracking-widest hover:text-primary transition-colors group"
                    >
                        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        {t('product', 'backToBrowsing')}
                    </button>
                </div>
            </div>

            <main className="container mx-auto px-6 py-12 lg:py-20">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">

                    {/* Left Column: Visuals */}
                    <div className="lg:col-span-7 space-y-10">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-card rounded-[48px] p-12 lg:p-20 border border-border/50 flex items-center justify-center relative group overflow-hidden min-h-[500px] md:min-h-[700px] premium-shadow"
                        >
                            {/* Background Effects */}
                            <div className="absolute top-10 end-10 w-64 h-64 bg-primary/5 rounded-full blur-[100px] group-hover:bg-primary/10 transition-colors duration-700" />
                            <div className="absolute bottom-10 start-10 w-48 h-48 bg-secondary/5 rounded-full blur-[80px]" />

                            {product.image && product.image.length > 5 ? (
                                <motion.img
                                    layoutId={`product-img-${product.id}`}
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full max-w-[480px] max-h-[500px] min-h-[200px] object-contain relative z-10 transition-transform duration-1000 group-hover:scale-110 drop-shadow-2xl"
                                />
                            ) : (
                                <div className="max-w-full max-h-[550px] w-full h-[300px] relative z-10 flex items-center justify-center text-muted-foreground/30">
                                    {/* Empty layout intentionally */}
                                </div>
                            )}

                            {/* Floating Badges */}
                            <div className="absolute top-8 start-8 flex flex-col gap-3 z-20">
                                {product.isNew && (
                                    <span className="bg-primary text-[#131921] text-[10px] font-black px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 tracking-widest uppercase">
                                        <Sparkles size={14} className="text-[#131921]" />
                                        {t('home', 'hero.slide3Badge') || 'New Arrival'}
                                    </span>
                                )}
                                {product.bulkSave && (
                                    <span className="bg-amber-400 text-amber-950 text-[10px] font-black px-4 py-2 rounded-xl shadow-lg tracking-widest uppercase flex items-center gap-2">
                                        <Truck size={14} />
                                        {t('home', 'hero.slide2Badge') || 'B2B Exclusive'}
                                    </span>
                                )}
                            </div>

                            {product && (
                                <button
                                    onClick={() => {
                                        if (!isLoggedIn) {
                                            router.push('/auth/login?redirect=' + encodeURIComponent(window.location.pathname));
                                        } else {
                                            toggleWishlist(product.id);
                                        }
                                    }}
                                    className={cn(
                                        "absolute top-8 end-8 w-12 h-12 backdrop-blur-md border rounded-2xl flex items-center justify-center shadow-xl transition-all z-20 hover:scale-110",
                                        isSaved(product.id)
                                            ? "bg-red-500/20 border-red-500/30 text-red-500"
                                            : "bg-white/10 border-white/20 text-muted-foreground hover:text-red-500 hover:bg-white"
                                    )}
                                >
                                    <Heart size={20} fill={isSaved(product.id) ? 'currentColor' : 'none'} />
                                </button>
                            )}
                        </motion.div>

                        {/* Thumbnails (Simulated) */}
                        {product.image && product.image.length > 5 && (
                            <div className="grid grid-cols-4 gap-6">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="aspect-square bg-card rounded-3xl border border-border/50 p-6 hover:border-primary/50 cursor-pointer transition-all flex items-center justify-center group premium-shadow-sm overflow-hidden">
                                        <img src={product.image} className="max-h-full object-contain opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Column: Info & Actions */}
                    <div className="lg:col-span-5 flex flex-col pt-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="space-y-10"
                        >
                            {/* Brand & Title */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 px-3 py-1 rounded-xl flex items-center gap-2 border border-primary/20">
                                        <span className="text-primary font-black text-[9px] uppercase tracking-widest">{t('product', 'globalSourcing')}</span>
                                        <ShieldCheck size={12} className="text-primary" />
                                    </div>
                                </div>

                                <h1 className="text-3xl lg:text-4xl font-heading font-black text-foreground leading-tight tracking-tight">
                                    {translatedName || product.name}
                                </h1>

                                <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-muted-foreground tracking-widest uppercase">
                                    <span className="flex items-center gap-2 text-primary">
                                        {product.brand} • {t('product', 'authorizedPartner')}
                                    </span>
                                    {((localRating ?? 0) > 0) ? (
                                        <>
                                            <span className="w-1 h-1 rounded-full bg-border" />
                                            <span className="flex items-center gap-1.5"><Star size={14} className="fill-amber-400 text-amber-400" /> <span className="text-foreground">{localRating.toFixed(1)}</span> ({localReviewsCount} {t('product', 'rated')})</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="w-1 h-1 rounded-full bg-border" />
                                            <span className="flex items-center gap-1.5"><Star size={14} className="text-muted-foreground" /> <span className="text-foreground">0</span> (0 {t('product', 'rated')})</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="text-sm text-muted-foreground leading-relaxed">
                                {translatedDesc || t('product', 'defaultDesc')}
                            </div>

                            {/* Pricing Card */}
                            <div className="bg-white dark:bg-[#131921] rounded-3xl p-8 border border-border shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 end-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl transition-all duration-700 pointer-events-none -me-32 -mt-32" />

                                <div className="relative z-10 space-y-8">
                                    <div className="flex items-end gap-3">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-5xl font-black text-foreground font-heading tracking-tight">{formatPrice(product.price, false)}</span>
                                        </div>
                                        <span className="text-muted-foreground font-bold mb-2 uppercase text-[10px] tracking-[0.2em]">/ {product.unit}</span>
                                    </div>

                                    <div className="flex items-center gap-10 py-6 border-y border-border/50">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('product', 'minSourcing')}</p>
                                            <p className="text-foreground font-black text-lg">{product.minOrder} {t('product', 'units')}</p>
                                        </div>
                                        <div className="w-px h-10 bg-border" />
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('product', 'inventoryStatus')}</p>
                                            <p className={cn(
                                                "font-black text-lg",
                                                product.status === ProductStatus.APPROVED ? "text-accent" : "text-amber-500"
                                            )}>
                                                {product.status === ProductStatus.APPROVED ? t('product', 'inActiveDistribution') : t('product', 'pendingApproval')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-6 pt-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center bg-muted/30 rounded-2xl p-2 border border-border/50">
                                                <button
                                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                                    className="w-12 h-12 rounded-xl bg-card border border-border/50 shadow-sm flex items-center justify-center hover:bg-muted transition-all active:scale-90"
                                                >
                                                    <Minus size={18} />
                                                </button>
                                                <span className="w-16 text-center font-black text-foreground text-xl">{quantity}</span>
                                                <button
                                                    onClick={() => setQuantity(quantity + 1)}
                                                    className="w-12 h-12 rounded-xl bg-card border border-border/50 shadow-sm flex items-center justify-center hover:bg-muted transition-all active:scale-90"
                                                >
                                                    <Plus size={18} />
                                                </button>
                                            </div>
                                            <button className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest group">
                                                <Share2 size={20} className="group-hover:rotate-12 transition-transform" />
                                                <span>{t('product', 'shareSKU')}</span>
                                            </button>
                                        </div>

                                        <Button
                                            size="xl"
                                            onClick={handleAdd}
                                            className={cn(
                                                "w-full py-8 text-xl gap-6",
                                                isAdded ? "bg-accent border-accent hover:bg-accent/90" : ""
                                            )}
                                        >
                                            {isAdded ? (
                                                <><Check size={28} /> {t('product', 'addedToProcurement')}</>
                                            ) : (
                                                <><ShoppingCart size={28} /> {isLoggedIn ? t('product', 'getWholesaleQuote') : t('product', 'loginToOrder')}</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white dark:bg-[#131921] rounded-2xl border border-border shadow-sm flex flex-col gap-3 group hover:border-primary/50 transition-colors">
                                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center transition-transform group-hover:scale-110">
                                        <Truck size={20} />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-[10px] font-black text-foreground uppercase tracking-widest">{t('product', 'expressTransit')}</h4>
                                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed max-w-[120px]">{isAr ? 'وصول مركز التوزيع في غضون 48-72 ساعة عبر سلسلة تبريد' : 'Distribution center arrival in 48-72h via cold chain.'}</p>
                                    </div>
                                </div>
                                <div className="p-4 bg-white dark:bg-[#131921] rounded-2xl border border-border shadow-sm flex flex-col gap-3 group hover:border-amber-400/50 transition-colors">
                                    <div className="w-10 h-10 bg-amber-400/10 text-amber-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110">
                                        <RotateCcw size={20} />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-[10px] font-black text-foreground uppercase tracking-widest">{t('product', 'returnsAudit')}</h4>
                                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed max-w-[120px]">{isAr ? 'سياسة إرجاع الشركات لمدة 30 يومًا للمواد التالفة' : '30-day corporate return policy for damaged SKUs.'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* About Product */}
                            <div className="space-y-6 pt-6 border-t border-border">
                                <h3 className="text-xl font-black text-foreground font-heading">
                                    {t('product', 'skuDetails')}
                                </h3>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-10">
                                    {[
                                        'Official Tier 1 Manufacturer Stock',
                                        'Verified Global Origin Passport',
                                        'Expiry: Guaranteed 14+ Months',
                                        'Pallet Optimization Logic Enabled',
                                        'Full Export Documentation Pack',
                                        'Cold Chain Storage Compliant'
                                    ].map((li, i) => (
                                        <li key={i} className="flex items-start gap-3 text-xs text-muted-foreground font-medium leading-tight">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-shrink-0" />
                                            {li}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* Reviews */}
                <ReviewSection
                    productId={product.id}
                    onReviewSubmitted={(newRating, newCount) => {
                        setLocalRating(newRating);
                        setLocalReviewsCount(newCount);
                    }}
                />

                {/* Related Products */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16 px-6 mt-16">
                    <div className="space-y-2">
                        <h2 className="text-3xl lg:text-4xl font-heading font-black text-foreground tracking-tight">{t('product', 'expandBatch')}</h2>
                        <p className="text-muted-foreground font-medium text-sm">{isAr ? 'مخزون متوافق من نفس المركز اللوجستي' : 'Compatible inventory from the same logistics hub'}</p>
                    </div>
                    <Link href="/categories">
                        <Button variant="outline" className="rounded-xl gap-2 font-black border-border shadow-sm bg-white dark:bg-[#131921] hover:bg-primary hover:text-white hover:border-primary transition-all">
                            {t('product', 'viewFullInventory')}
                            <ChevronRight size={16} />
                        </Button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-6">
                    {relatedProducts.map((p, i) => (
                        <ProductCard key={p.id} product={p} index={i} />
                    ))}
                </div>
            </main>
        </div>
    );
}
