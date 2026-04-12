'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface Slide {
    image: string;
    titleKey?: string;
    subtitleKey?: string;
    badgeKey?: string;
    // Fallback for admin-set ads
    title?: string;
    subtitle?: string;
    badge?: string;
    isSponsored?: boolean;
    ctaTextKey?: string;
    ctaText?: string;
    ctaHref?: string;
}

const DEMO_SLIDES: Slide[] = [
    {
        image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=2000",
        titleKey: "slide1Title",
        subtitleKey: "slide1Subtitle",
        badgeKey: "slide1Badge",
        ctaTextKey: "checkDeals",
        ctaHref: "/categories?category=Energy Drinks"
    },
    {
        image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=2000",
        titleKey: "slide2Title",
        subtitleKey: "slide2Subtitle",
        badgeKey: "slide2Badge",
        ctaTextKey: "browseBrands",
        ctaHref: "/suppliers"
    },
    {
        image: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&q=80&w=2000",
        titleKey: "slide3Title",
        subtitleKey: "slide3Subtitle",
        badgeKey: "slide3Badge",
        ctaTextKey: "viewOffers",
        ctaHref: "/categories"
    }
];

export default function OffersHero() {
    const { t } = useLanguage();
    const [current, setCurrent] = React.useState(0);
    const [allSlides, setAllSlides] = React.useState<Slide[]>(DEMO_SLIDES);

    const loadHeroAds = React.useCallback(() => {
        try {
            const stored = localStorage.getItem('admin-placements');
            if (stored) {
                const slots = JSON.parse(stored);
                const heroSlot = slots.find((s: any) => s.id === 'hero-banner');
                if (heroSlot?.ads && heroSlot.ads.length > 0) {
                    const adminSlides: Slide[] = heroSlot.ads.map((ad: any) => ({
                        image: ad.image,
                        title: ad.title,
                        subtitle: ad.subtitle || '',
                        badge: ad.badge || 'Sponsored',
                        isSponsored: true,
                        ctaText: ad.ctaText || 'Learn More',
                        ctaHref: ad.ctaHref || '/categories'
                    }));
                    setAllSlides([...adminSlides, ...DEMO_SLIDES]);
                    return;
                }
            }
            setAllSlides(DEMO_SLIDES);
        } catch {
            setAllSlides(DEMO_SLIDES);
        }
    }, []);

    React.useEffect(() => {
        loadHeroAds();
        const onFocus = () => loadHeroAds();
        window.addEventListener('focus', onFocus);
        window.addEventListener('storage', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('storage', onFocus);
        };
    }, [loadHeroAds]);

    const next = React.useCallback(() => setCurrent((prev) => (prev + 1) % allSlides.length), [allSlides.length]);
    const prev = () => setCurrent((prev) => (prev - 1 + allSlides.length) % allSlides.length);

    React.useEffect(() => {
        const timer = setInterval(next, 7000);
        return () => clearInterval(timer);
    }, [next]);

    const slide = allSlides[current] || DEMO_SLIDES[0];

    const translatedTitle = slide.titleKey ? t('home', `hero.${slide.titleKey}`) : slide.title;
    const translatedSubtitle = slide.subtitleKey ? t('home', `hero.${slide.subtitleKey}`) : slide.subtitle;
    const translatedBadge = slide.badgeKey ? t('home', `hero.${slide.badgeKey}`) : slide.badge;
    const translatedCtaText = slide.ctaTextKey ? t('home', `hero.${slide.ctaTextKey}`) : (slide.ctaText || t('home', 'hero.getStarted'));

    return (
        <section className="relative w-full h-[500px] md:h-[650px] overflow-hidden group bg-[#0A0D12]">
            <AnimatePresence initial={false}>
                <motion.div
                    key={current}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="absolute inset-0"
                >
                    <div
                        className="w-full h-full bg-cover bg-center transition-transform duration-[10s] ease-linear scale-100 group-hover:scale-105"
                        style={{ backgroundImage: `url(${slide.image})` }}
                    >
                        {/* Atlantis Style Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0D12] via-[#0A0D12]/60 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0A0D12]" />
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Content */}
            <div className="absolute inset-0 z-10 flex flex-col justify-center px-6 md:px-20 items-start">
                <div className="max-w-3xl text-start">
                    {/* Badge */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`badge-${current}`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="mb-6 flex items-center gap-3"
                        >
                            <span className={cn(
                                "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-500",
                                slide.isSponsored 
                                    ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(255,153,0,0.4)] animate-pulse" 
                                    : "bg-white/10 backdrop-blur-md text-white border border-white/20"
                            )}>
                                {slide.isSponsored ? t('home', 'hero.limitedTimeOffer') : translatedBadge}
                            </span>
                            
                            {slide.isSponsored && (
                                <span className="px-3 py-1 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-full text-[9px] font-bold uppercase tracking-wider">
                                    {t('home', 'hero.featuredPlacement')}
                                </span>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    <motion.h1
                        key={`title-${current}`}
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className={cn(
                            "text-4xl md:text-7xl font-black text-white mb-6 leading-[0.95] drop-shadow-2xl transition-all",
                            slide.isSponsored && "tracking-tighter bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent"
                        )}
                    >
                        {translatedTitle}
                    </motion.h1>

                    <motion.p
                        key={`sub-${current}`}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-white/70 text-lg md:text-2xl font-medium mb-10 max-w-2xl leading-relaxed"
                    >
                        {translatedSubtitle}
                    </motion.p>

                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex items-center gap-4"
                    >
                        <Link
                            href={slide.ctaHref || '/categories'}
                            className={cn(
                                "px-10 py-5 rounded-2xl font-black text-sm flex items-center gap-3 transition-all hover:scale-105 active:scale-95 shadow-2xl group/btn",
                                slide.isSponsored 
                                    ? "bg-white text-[#0A0D12] hover:bg-white/90" 
                                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                        >
                            {translatedCtaText}
                            <ArrowRight size={20} className="transition-transform group-hover/btn:translate-x-1" />
                        </Link>
                    </motion.div>
                </div>
            </div>

            {/* Navigation Arrows */}
            <button
                onClick={prev}
                className="absolute start-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100"
            >
                <ChevronLeft size={24} />
            </button>
            <button
                onClick={next}
                className="absolute end-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100"
            >
                <ChevronRight size={24} />
            </button>

            {/* Indicators */}
            <div className="absolute bottom-10 start-6 md:start-20 z-20 flex items-center gap-3">
                {allSlides.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setCurrent(i)}
                        className={`h-1.5 transition-all rounded-full ${i === current
                            ? 'w-10 bg-primary'
                            : 'w-4 bg-white/20 hover:bg-white/40'
                            }`}
                    />
                ))}
            </div>
        </section>
    );
}
