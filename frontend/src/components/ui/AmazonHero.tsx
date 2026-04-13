'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
    image: string;
    title: string;
    subtitle: string;
    badge: string;
    isSponsored?: boolean;
}

const DEMO_SLIDES: Slide[] = [
    {
        image: "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&q=80&w=2000",
        title: "Limited Time Offer: 30% Off Energy Drinks",
        subtitle: "Bulk orders for Red Bull & Monster at exclusive wholesale prices.",
        badge: "Seasonal Deal"
    },
    {
        image: "https://images.unsplash.com/photo-1550345332-09e3ac987658?auto=format&fit=crop&q=80&w=2000",
        title: "Wholesale Beverages Direct",
        subtitle: "Global brands delivered to your doorstep. Verified suppliers only.",
        badge: "B2B Exclusive"
    },
    {
        image: "https://images.unsplash.com/photo-1543256283-42c206511a76?auto=format&fit=crop&q=80&w=2000",
        title: "Bulk Coffee & Tea Savings",
        subtitle: "Save up to 40% on case orders of Nescafe, Lavazza, and more.",
        badge: "Best Seller"
    },
    {
        image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=2000",
        title: "Supplier Spotlight: Bloom Energy",
        subtitle: "Check out the latest sparkling energy flavors from Bloom.",
        badge: "New Arrival"
    }
];

export default function AmazonHero() {
    const [current, setCurrent] = React.useState(0);
    const [allSlides, setAllSlides] = React.useState<Slide[]>(DEMO_SLIDES);

    // Load hero banner ads from admin placements
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
                        isSponsored: true
                    }));
                    setAllSlides([...adminSlides, ...DEMO_SLIDES]);
                    return;
                }
            }
            setAllSlides(DEMO_SLIDES);
        } catch (_e) {
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
        const timer = setInterval(next, 5000);
        return () => clearInterval(timer);
    }, [next]);

    const slide = allSlides[current] || DEMO_SLIDES[0];

    return (
        <section className="relative w-full h-[600px] overflow-hidden group">
            <AnimatePresence initial={false}>
                <motion.div
                    key={current}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0"
                >
                    <div
                        className="w-full h-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${slide.image})` }}
                    >
                        {/* Gradient Fade */}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Content */}
            <div className="absolute top-1/4 start-10 z-10 hidden md:block">
                {/* Sponsored tag */}
                {slide.isSponsored && (
                    <motion.span
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-block px-3 py-1 bg-[#FF9900] text-white text-[10px] font-black uppercase tracking-widest rounded mb-3"
                    >
                        ⚡ SPONSORED
                    </motion.span>
                )}
                {slide.badge && !slide.isSponsored && (
                    <motion.span
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-[10px] font-black uppercase tracking-widest rounded mb-3"
                    >
                        {slide.badge}
                    </motion.span>
                )}
                <motion.h1
                    key={`title-${current}`}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-white text-5xl font-black mb-4 drop-shadow-xl max-w-2xl"
                >
                    {slide.title}
                </motion.h1>
                <motion.p
                    key={`sub-${current}`}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-white/80 text-xl font-bold drop-shadow-md max-w-xl"
                >
                    {slide.subtitle}
                </motion.p>
            </div>

            {/* Slide indicators */}
            <div className="absolute bottom-6 start-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                {allSlides.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setCurrent(i)}
                        className={`transition-all rounded-full ${i === current
                            ? 'w-8 h-2 bg-white'
                            : 'w-2 h-2 bg-white/40 hover:bg-white/60'
                            }`}
                    />
                ))}
            </div>

            {/* Navigation */}
            <button
                onClick={prev}
                className="absolute start-0 top-0 bottom-0 w-20 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/10 transition-all z-20 group-hover:opacity-100 opacity-0"
            >
                <ChevronLeft size={48} strokeWidth={1} />
            </button>
            <button
                onClick={next}
                className="absolute end-0 top-0 bottom-0 w-20 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/10 transition-all z-20 group-hover:opacity-100 opacity-0"
            >
                <ChevronRight size={48} strokeWidth={1} />
            </button>
        </section>
    );
}

