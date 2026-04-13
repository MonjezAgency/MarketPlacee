'use client';

import * as React from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ExternalLink, Tag, Zap, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiFetch } from '@/lib/api';

interface AdItem {
    id: string;
    title: string;
    subtitle: string;
    image: string;
    color: string;
    link: string;
    badge: string;
    showSponsored?: boolean;
}

export function AdPlacements() {
    const { t } = useLanguage();
    const [ads, setAds] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);

    const loadAds = React.useCallback(async () => {
        setLoading(true);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
            const response = await apiFetch(`/ads?placement=SPONSORED_PRODUCT`, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                setAds(data);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.warn('Ads request timed out');
            } else {
                console.error('Failed to load sponsored highlights:', error);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadAds();
        const onFocus = () => loadAds();
        window.addEventListener('focus', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
        };
    }, [loadAds]);

    // Don't block the page — show nothing while loading
    if (loading && ads.length === 0) {
        return null;
    }

    return (
        <section className="py-12 px-4 container mx-auto">
            <div className="flex items-center justify-between mb-8 px-2">
                <div className="space-y-1">
                    <Link href="/sponsored-highlights">
                        <h2 className="text-2xl font-black text-[#111] dark:text-white tracking-tight flex items-center gap-2 hover:text-primary transition-colors cursor-pointer">
                            <Zap className="text-primary fill-primary" size={24} />
                            {t('ads', 'sponsoredHighlights')}
                        </h2>
                    </Link>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('ads', 'premiumVendor')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {ads.map((ad) => (
                    <AdCard key={ad.adId} ad={{
                        id: ad.adId,
                        title: ad.product.name,
                        subtitle: ad.product.description,
                        image: ad.product.images?.[0] || 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&fit=crop',
                        color: '#FF9900',
                        link: `/products/${ad.product.id}`,
                        badge: 'Sponsored',
                        showSponsored: true
                    }} />
                ))}
                {ads.length === 0 && !loading && (
                    <div className="col-span-full py-12 text-center text-muted-foreground font-bold">
                        No active highlights at the moment.
                    </div>
                )}
            </div>
        </section>
    );
}

function AdCard({ ad }: { ad: AdItem }) {
    const { t } = useLanguage();
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x);
    const mouseYSpring = useSpring(y);

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["17.5deg", "-17.5deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-17.5deg", "17.5deg"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                rotateY,
                rotateX,
                transformStyle: "preserve-3d",
            }}
            className="relative h-[400px] w-full rounded-[32px] bg-gradient-to-br from-white/5 to-white/10 border border-white/10 overflow-hidden cursor-pointer group shadow-2xl"
        >
            <div
                style={{
                    transform: "translateZ(75px)",
                    transformStyle: "preserve-3d",
                }}
                className="absolute inset-4 rounded-[24px] bg-white dark:bg-[#131921] shadow-xl overflow-hidden"
            >
                <div className="absolute inset-0">
                    <img
                        src={ad.image}
                        alt={ad.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-80"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#131921] via-[#131921]/20 to-transparent" />
                </div>

                <div
                    style={{
                        transform: "translateZ(50px)",
                    }}
                    className="absolute inset-0 p-8 flex flex-col justify-end"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <span className="px-3 py-1 bg-primary text-[#131921] text-[9px] font-black uppercase tracking-widest rounded-full">
                            {ad.badge}
                        </span>
                        {ad.showSponsored !== false && (
                            <div className="flex items-center gap-1 text-white/40 text-[9px] font-bold uppercase tracking-widest">
                                <Tag size={10} />
                                {t('ads', 'sponsored')}
                            </div>
                        )}
                    </div>

                    <h3 className="text-2xl font-black text-white mb-2 leading-tight">
                        {ad.title}
                    </h3>
                    <p className="text-white/60 text-xs font-medium leading-relaxed mb-6 max-w-[80%]">
                        {ad.subtitle}
                    </p>

                    <div className="flex items-center gap-4">
                        <Link
                            href={ad.link}
                            className="h-10 px-6 bg-white text-[#131921] font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-transform flex items-center justify-center gap-2"
                        >
                            {t('ads', 'viewDeal')}
                            <ArrowRight size={14} />
                        </Link>
                        <button className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white hover:bg-white/20 transition-all">
                            <ExternalLink size={16} />
                        </button>
                    </div>
                </div>

                {/* Perspective Elements */}
                <motion.div
                    style={{
                        transform: "translateZ(100px)",
                    }}
                    className="absolute top-8 end-8 w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-3xl border border-white/10 flex items-center justify-center shadow-2xl pointer-events-none group-hover:bg-primary/20 transition-colors"
                >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                        <div className="w-4 h-4 rounded-full bg-primary" />
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
