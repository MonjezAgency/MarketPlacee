'use client';

import * as React from 'react';
import Link from 'next/link';

interface CardTileProps {
    title: string;
    items?: {
        image: string;
        label: string;
        link: string;
    }[];
    singleItem?: {
        image: string;
        link: string;
    };
    footerLink: string;
    footerText: string;
}

export default function AmazonCardTile({ title, items, singleItem, footerLink, footerText }: CardTileProps) {
    return (
        <div className="bg-white/80 dark:bg-[#1A1F26]/80 backdrop-blur-md p-5 flex flex-col gap-4 rounded-3xl border border-white dark:border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] dark:hover:shadow-[0_20px_40px_rgb(0,0,0,0.4)] transition-all duration-500 group h-full">
            <h3 className="text-xl font-black text-[#111] dark:text-white leading-tight tracking-tighter group-hover:text-primary transition-colors duration-300">
                {title}
            </h3>

            {singleItem ? (
                <Link href={singleItem.link} className="flex-1 relative overflow-hidden rounded-2xl group/img">
                    <img
                        src={singleItem.image}
                        alt={title}
                        className="w-full h-full object-cover aspect-square transition-transform duration-1000 ease-out group-hover/img:scale-110"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-500" />
                </Link>
            ) : (
                <div className="grid grid-cols-2 gap-3 flex-1">
                    {items?.map((item, i) => (
                        <Link key={i} href={item.link} className="flex flex-col gap-2 group/item">
                            <div className="relative overflow-hidden aspect-square rounded-xl bg-gray-50/50 dark:bg-white/5 border border-black/[0.03] dark:border-white/[0.03] shadow-inner group-hover/item:border-primary/20 transition-all duration-300">
                                <img
                                    src={item.image}
                                    alt={item.label}
                                    className="w-full h-full object-contain p-3 mix-blend-multiply dark:mix-blend-normal transition-all duration-500 group-hover/item:scale-115 group-hover/item:rotate-2"
                                />
                            </div>
                            <span className="text-[11px] md:text-xs text-[#111] dark:text-white/80 font-black leading-snug line-clamp-1 group-hover/item:text-primary transition-colors uppercase tracking-tight">
                                {item.label}
                            </span>
                        </Link>
                    ))}
                </div>
            )}

            <div className="pt-2 mt-auto border-t border-black/5 dark:border-white/5">
                <Link href={footerLink} className="text-xs font-black text-primary hover:text-primary/80 transition-all inline-flex items-center gap-1.5 group/link uppercase tracking-widest leading-none">
                    {footerText}
                    <span className="group-hover/link:translate-x-1 transition-transform duration-300">→</span>
                </Link>
            </div>
        </div>
    );
}
