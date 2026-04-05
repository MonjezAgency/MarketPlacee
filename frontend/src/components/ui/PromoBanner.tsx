'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface PromoBannerProps {
    title: string;
    subtitle: string;
    ctaText: string;
    ctaHref: string;
    image: string;
    backgroundColor?: string;
    reverse?: boolean;
}

export default function PromoBanner({ 
    title, 
    subtitle, 
    ctaText, 
    ctaHref, 
    image, 
    backgroundColor = "bg-[#131921]",
    reverse = false 
}: PromoBannerProps) {
    return (
        <section className={`w-full ${backgroundColor} text-white rounded-sm overflow-hidden my-8 shadow-sm border border-white/5`}>
            <div className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center`}>
                {/* Image side */}
                <div className="w-full md:w-1/2 h-[200px] md:h-[300px] relative overflow-hidden">
                    <img 
                        src={image} 
                        alt={title} 
                        className="w-full h-full object-cover transition-transform duration-[10s] hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/10" />
                </div>

                {/* Content side */}
                <div className="w-full md:w-1/2 p-8 md:p-12 space-y-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-2xl md:text-3xl font-black leading-tight tracking-tight mb-2">
                            {title}
                        </h2>
                        <p className="text-white/70 text-sm md:text-base font-medium max-w-md mb-6">
                            {subtitle}
                        </p>
                        <Link 
                            href={ctaHref}
                            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
                        >
                            {ctaText}
                            <ArrowRight size={16} />
                        </Link>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
