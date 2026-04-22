'use client';

import * as React from 'react';

const BRAND_LOGOS = [
    { name: 'Trusted Partner 1', image: '/Logos/brand1.jpg' },
    { name: 'Trusted Partner 2', image: '/Logos/brand2.jpg' },
    { name: 'Trusted Partner 3', image: '/Logos/brand3.jpg' },
    { name: 'Trusted Partner 4', image: '/Logos/brand4.jpg' },
    // Fillers with high-end brands if needed
    { name: 'Coca-Cola', color: '#E8001C', bg: '#FFF5F5' },
    { name: 'Pepsi', color: '#0032A0', bg: '#F0F4FF' },
    { name: 'Red Bull', color: '#CC0000', bg: '#FFF5F5' },
    { name: 'Lipton', color: '#D4A017', bg: '#FFFBEB' },
];

// Duplicate for seamless infinite loop
const ALL_BRANDS = [...BRAND_LOGOS, ...BRAND_LOGOS];

export function BrandLogosMarquee() {
    return (
        <div className="w-full overflow-hidden bg-white dark:bg-[#1A1F26] border-y border-black/5 dark:border-white/5 py-5">
            <p className="text-center text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-4">
                Trusted Brands We Work With
            </p>
            <div className="relative flex">
                {/* Fade edges */}
                <div className="absolute start-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-r from-white dark:from-[#1A1F26] to-transparent pointer-events-none" />
                <div className="absolute end-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-white dark:from-[#1A1F26] to-transparent pointer-events-none" />

                <div className="flex gap-3 animate-marquee whitespace-nowrap">
                    {ALL_BRANDS.map((brand, i) => (
                        <div
                            key={`${brand.name}-${i}`}
                            className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl border border-black/8 dark:border-white/10 shrink-0 bg-white dark:bg-white/5 shadow-sm"
                        >
                            {brand.image ? (
                                <img src={brand.image} alt={brand.name} className="h-8 w-auto object-contain brightness-0 dark:brightness-100 invert-0 dark:invert opacity-80 group-hover:opacity-100 transition-opacity" />
                            ) : (
                                <>
                                    <div
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: brand.color }}
                                    />
                                    <span
                                        className="text-xs font-black whitespace-nowrap"
                                        style={{ color: brand.color }}
                                    >
                                        {brand.name}
                                    </span>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
