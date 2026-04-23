'use client';

import * as React from 'react';

const BRAND_LOGOS = [
    { name: 'Dove', image: '/Logos/dove.png' },
    { name: 'Chanel', image: '/Logos/chanel.png' },
    { name: 'Axe', image: '/Logos/axe.png' },
    { name: 'Persil', image: '/Logos/persil.png' },
    { name: 'Coca-Cola', image: '/Logos/cocacola.png' },
    { name: 'Pepsi', image: '/Logos/pepsi.png' },
    { name: 'Red Bull', image: '/Logos/redbull.png' },
    { name: 'Lux', image: '/Logos/lux.png' },
    { name: 'Dior', image: '/Logos/dior.png' },
    { name: 'Gucci', image: '/Logos/gucci.png' },
];

// Duplicate for seamless infinite loop
const ALL_BRANDS = [...BRAND_LOGOS, ...BRAND_LOGOS];

export function BrandLogosMarquee() {
    return (
        <div className="w-full overflow-hidden bg-white dark:bg-[#1A1F26] border-y border-black/5 dark:border-white/5 py-5">
            <p className="text-center text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-4">
                Trusted Brands We Work With
            </p>
            <div className="relative flex group">
                {/* Fade edges */}
                <div className="absolute start-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-r from-white dark:from-[#1A1F26] to-transparent pointer-events-none" />
                <div className="absolute end-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-white dark:from-[#1A1F26] to-transparent pointer-events-none" />

                <div className="flex gap-3 animate-marquee whitespace-nowrap group-hover:[animation-play-state:paused] py-2">
                    {ALL_BRANDS.map((brand, i) => (
                        <div
                            key={`${brand.name}-${i}`}
                            className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl border border-black/8 dark:border-white/10 shrink-0 bg-white dark:bg-white/5 shadow-sm hover:scale-110 hover:shadow-xl hover:border-primary/20 hover:z-20 transition-all duration-500 transform cursor-pointer relative"
                        >
                            <img src={brand.image} alt={brand.name} className="h-8 w-auto object-contain transition-transform duration-500" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
