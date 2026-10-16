'use client';

import * as React from 'react';
import Link from 'next/link';
import { Facebook, Instagram, Linkedin, Mail, ShieldCheck, Boxes, Truck } from 'lucide-react';
import NewsletterSignup from '@/components/newsletter/NewsletterSignup';
import { useLanguage } from '@/contexts/LanguageContext';
import { SOCIAL_LINKS } from '@/lib/config';

const SOCIAL_ICONS = { facebook: Facebook, instagram: Instagram, linkedin: Linkedin } as const;

export default function Footer() {
    const { t, locale, meta } = useLanguage();

    const cols: { title: string; links: { href: string; label: string }[] }[] = [
        { title: t('footer', 'colMarketplace'), links: [
            { href: '/categories', label: t('footer', 'browseProducts') },
            { href: '/wholesale', label: t('footer', 'loads') },
            { href: '/deals', label: t('footer', 'dailyDeals') },
            { href: '/requests', label: t('footer', 'requestQuote') },
        ] },
        { title: t('footer', 'colBuyers'), links: [
            { href: '/how-it-works', label: t('footer', 'howItWorks') },
            { href: '/protected-payments', label: t('footer', 'protectedPayments') },
            { href: '/goods-inspection', label: t('footer', 'goodsInspection') },
            { href: '/warehouses', label: t('footer', 'warehouses') },
            { href: '/shipping', label: t('footer', 'shippingPolicy') },
            { href: '/returns', label: t('footer', 'returnsRefunds') },
            { href: '/help', label: t('footer', 'helpCenter') },
        ] },
        { title: t('footer', 'colSuppliers'), links: [
            // Suppliers register like buyers (Supplier preselected) and are approved by Atlantis.
            { href: '/auth/register?role=supplier', label: t('footer', 'becomeSupplier') },
            { href: '/auth/login?redirect=/supplier', label: t('footer', 'supplierSignIn') },
            { href: '/targets', label: t('footer', 'sourcingRequests') },
        ] },
        { title: t('footer', 'colCompany'), links: [
            { href: '/about', label: t('footer', 'aboutUs') },
            { href: '/contact', label: t('footer', 'contactUs') },
            { href: '/privacy-policy', label: t('footer', 'privacy') },
            { href: '/terms', label: t('footer', 'terms') },
        ] },
    ];
    const socials = SOCIAL_LINKS.filter((s) => s.url);

    return (
        <footer data-no-translate className="bg-surface-2 text-ink-2 text-start border-t border-[#E6EAEE]">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                {/* Newsletter (double opt-in; consent stored on the server) */}
                <div className="py-12 sm:py-14 flex flex-col lg:flex-row lg:items-start justify-between gap-8 border-b border-line">
                    <div className="max-w-xl">
                        <h2 className="font-sans text-[24px] sm:text-[28px] font-bold tracking-tight text-heading leading-tight">{t('newsletter', 'title')}</h2>
                        <p className="mt-2 text-[15px] text-ink-2 leading-relaxed">{t('newsletter', 'lead')}</p>
                    </div>
                    <NewsletterSignup source="footer" />
                </div>

                {/* Columns */}
                <div className="py-12 grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-10">
                    <div className="col-span-2">
                        <Link href="/" className="inline-flex items-center gap-2.5" aria-label={t('nav', 'homeAria')}>
                            <img src="/brand/atlantis-mark.png" alt="" width={36} height={36} className="w-9 h-9 object-contain rounded-lg" />
                            <span dir="ltr" className="text-[21px] font-black tracking-tighter uppercase">
                                <span className="text-heading">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
                            </span>
                        </Link>
                        <p className="mt-4 text-[14px] leading-relaxed max-w-xs">{t('footer', 'description')}</p>
                        <ul className="mt-5 space-y-2 text-[13px] text-ink-3">
                            <li className="flex items-center gap-2"><ShieldCheck size={15} className="text-teal shrink-0" /> {t('footer', 'trustReviewed')}</li>
                            <li className="flex items-center gap-2"><Boxes size={15} className="text-teal shrink-0" /> {t('footer', 'trustLoads')}</li>
                            <li className="flex items-center gap-2"><Truck size={15} className="text-teal shrink-0" /> {t('footer', 'trustDelivery')}</li>
                        </ul>
                        <a href="mailto:Info@atlantisfmcg.com" className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-ink hover:text-teal"><Mail size={15} /> Info@atlantisfmcg.com</a>
                        {socials.length > 0 && (
                            <ul className="mt-4 flex items-center gap-2" aria-label={t('footer', 'socialAria')}>
                                {socials.map((s) => {
                                    const Icon = SOCIAL_ICONS[s.id];
                                    return (
                                        <li key={s.id}>
                                            <a href={s.url!} target="_blank" rel="noopener noreferrer" aria-label={t('footer', 'socialLink', { network: s.label })}
                                                className="w-9 h-9 rounded-full ring-1 ring-line bg-surface flex items-center justify-center text-ink-2 hover:text-teal hover:ring-teal transition-colors">
                                                <Icon size={16} aria-hidden />
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                    {cols.map((c) => (
                        <nav key={c.title} aria-label={c.title}>
                            <h3 className="font-sans text-[13px] font-semibold uppercase tracking-[0.12em] text-heading mb-4">{c.title}</h3>
                            <ul className="space-y-3 text-[14px]">
                                {c.links.map((l) => (
                                    <li key={l.href}><Link href={l.href} className="hover:text-teal transition-colors">{l.label}</Link></li>
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
                    <nav aria-label={t('footer', 'legalAria')} className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        <Link href="/terms" className="hover:text-teal">{t('footer', 'terms')}</Link>
                        <Link href="/privacy-policy" className="hover:text-teal">{t('footer', 'privacy')}</Link>
                        <Link href="/cookie-policy" className="hover:text-teal">{t('footer', 'cookies')}</Link>
                        <span className="font-semibold text-ink-4" lang={locale}>{meta.name}</span>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
