'use client';

import * as React from 'react';
import Link from 'next/link';
import NewsletterSignup from '@/components/newsletter/NewsletterSignup';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Footer() {
    const { t, locale } = useLanguage();

    const cols: { title: string; links: { href: string; label: string }[] }[] = [
        { title: t('footer', 'sourcing'), links: [
            { href: '/categories', label: t('footer', 'browseCategories') },
            { href: '/requests', label: 'Request a quote' },
            { href: '/wholesale', label: t('footer', 'bulkWholesale') },
            { href: '/deals', label: t('footer', 'dailyDeals') },
        ] },
        { title: 'Sellers', links: [
            // Supplier onboarding is invite-only — sellers apply via contact.
            { href: '/contact', label: 'Become a seller' },
            { href: '/targets', label: 'Contact buyers' },
            { href: '/how-it-works', label: t('footer', 'howItWorks') },
        ] },
        { title: t('footer', 'support'), links: [
            { href: '/help', label: t('footer', 'helpCenter') },
            { href: '/shipping', label: t('footer', 'shippingPolicy') },
            { href: '/returns', label: t('footer', 'returnsRefunds') },
        ] },
        { title: t('footer', 'aboutUs'), links: [
            { href: '/about', label: t('footer', 'aboutUs') },
            { href: '/contact', label: t('footer', 'contactUs') },
        ] },
    ];

    return (
        <footer className="bg-surface-2 text-ink-2 text-start border-t border-[#E6EAEE]">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                {/* Newsletter (double opt-in; consent stored on the server) */}
                <div className="py-12 sm:py-14 flex flex-col lg:flex-row lg:items-start justify-between gap-8 border-b border-line">
                    <div className="max-w-xl">
                        <h2 className="font-sans text-[24px] sm:text-[28px] font-bold tracking-tight text-heading leading-tight">Subscribe to our newsletter</h2>
                        <p className="mt-2 text-[15px] text-ink-2 leading-relaxed">Get weekly updates from the FMCG market, with fresh arrivals, new offers, and live availability.</p>
                    </div>
                    <NewsletterSignup source="footer" />
                </div>

                {/* Columns */}
                <div className="py-12 grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-10">
                    <div className="col-span-2">
                        <Link href="/" className="inline-flex items-center gap-2.5">
                            <img src="/brand/atlantis-mark.png" alt="" width={36} height={36} className="w-9 h-9 object-contain rounded-lg" />
                            <span className="text-[21px] font-black tracking-tighter uppercase">
                                <span className="text-heading">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
                            </span>
                        </Link>
                        <p className="mt-4 text-[14px] leading-relaxed max-w-xs">{t('footer', 'description')}</p>
                    </div>
                    {cols.map((c) => (
                        <nav key={c.title} aria-label={c.title}>
                            <h3 className="font-sans text-[13px] font-semibold uppercase tracking-[0.12em] text-heading mb-4">{c.title}</h3>
                            <ul className="space-y-3 text-[14px]">
                                {c.links.map((l) => (
                                    <li key={l.label}><Link href={l.href} className="hover:text-teal transition-colors">{l.label}</Link></li>
                                ))}
                            </ul>
                        </nav>
                    ))}
                </div>

                {/* Legal bar */}
                <div className="py-6 border-t border-line flex flex-col md:flex-row md:items-center justify-between gap-3 text-[13px] text-ink-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>{t('footer', 'copyright')}</span>
                        <span>{t('footer', 'developedBy')}</span>
                    </div>
                    <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        <Link href="/terms" className="hover:text-teal">{t('footer', 'terms')}</Link>
                        <Link href="/privacy-policy" className="hover:text-teal">{t('footer', 'privacy')}</Link>
                        <Link href="/cookie-policy" className="hover:text-teal">{t('footer', 'cookies')}</Link>
                        <span className="uppercase font-semibold text-ink-4">{locale}</span>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
