'use client';

import * as React from 'react';
import Link from 'next/link';
import NewsletterSignup from '@/components/newsletter/NewsletterSignup';
import { useLanguage } from '@/contexts/LanguageContext';
import { SOCIAL_LINKS } from '@/lib/config';

/** Brand marks drawn from the networks' own simple glyphs (24×24, currentColor). */
const SOCIAL_ICONS: Record<'facebook' | 'instagram' | 'linkedin' | 'x', React.ReactNode> = {
    facebook: <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9z" />,
    linkedin: <path d="M6.94 8.5H3.56V20h3.38V8.5zM5.25 3a1.97 1.97 0 1 0 0 3.94 1.97 1.97 0 0 0 0-3.94zM20.44 13.45c0-3.08-1.64-4.52-3.84-4.52-1.77 0-2.56.98-3 1.66V8.5h-3.38c.05.96 0 11.5 0 11.5h3.38v-6.42c0-.34.02-.69.13-.93.27-.69.89-1.4 1.94-1.4 1.37 0 1.92 1.05 1.92 2.58V20h3.38l-.53-6.55z" />,
    instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="17.3" cy="6.7" r="1.1" /></>,
    x: <path d="M17.75 3h3.05l-6.67 7.62L22 21h-6.15l-4.81-6.3L5.53 21H2.47l7.13-8.15L2 3h6.3l4.35 5.75L17.75 3zm-1.07 16.17h1.69L7.4 4.73H5.58l11.1 14.44z" />,
};

/** Footer link: an accent line draws in under the text from the reading start (left in LTR, right in RTL). */
const footerLink = 'relative inline-block py-0.5 text-ink-2 hover:text-ink focus-visible:text-ink transition-colors outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 after:absolute after:start-0 after:bottom-0 after:h-[1.5px] after:w-full after:rounded-full after:bg-[#2EC4B6] after:scale-x-0 after:origin-left rtl:after:origin-right after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-100 focus-visible:after:scale-x-100 motion-reduce:after:transition-none';
const iconBtn = 'w-9 h-9 rounded-full ring-1 ring-line bg-surface flex items-center justify-center text-ink-2 hover:text-teal hover:ring-[#2EC4B6] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2';

export default function Footer() {
    const { t, locale, meta } = useLanguage();

    const cols: { title: string; links: { href: string; label: string }[] }[] = [
        { title: t('footer', 'colMarketplace'), links: [
            { href: '/categories', label: t('footer', 'browseProducts') },
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
            // Suppliers register like buyers (Supplier preselected) and are approved by Ali FMCG.
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
    // Only profiles configured with their real URL are shown; nothing is linked to a guessed page.
    const socials = SOCIAL_LINKS.filter((s) => s.url);
    React.useEffect(() => {
        const missing = SOCIAL_LINKS.filter((s) => !s.url).map((s) => s.envVar);
        if (missing.length && process.env.NODE_ENV !== 'production') console.info(`[footer] Social profiles not configured (hidden): ${missing.join(', ')}`);
    }, []);

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
                                <span className="text-heading">ALI</span><span className="ms-[0.3em] text-[#2EC4B6]">FMCG.</span>
                            </span>
                        </Link>
                        <p className="mt-4 text-[14px] leading-relaxed max-w-xs">{t('footer', 'description')}</p>
                        {socials.length > 0 && <ul className="mt-5 flex flex-wrap items-center gap-2" aria-label={t('footer', 'socialAria')}>
                            {socials.map((s) => (
                                <li key={s.id}>
                                    <a href={s.url!} target="_blank" rel="noopener noreferrer" aria-label={t('footer', 'socialLink', { network: s.label })} title={s.label} className={iconBtn}>
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>{SOCIAL_ICONS[s.id]}</svg>
                                    </a>
                                </li>
                            ))}
                        </ul>}
                    </div>
                    {cols.map((c) => (
                        <nav key={c.title} aria-label={c.title}>
                            <h3 className="font-sans text-[13px] font-semibold uppercase tracking-[0.12em] text-heading mb-4">{c.title}</h3>
                            <ul className="space-y-3 text-[14px]">
                                {c.links.map((l) => (
                                    <li key={l.href}><Link href={l.href} className={footerLink}>{l.label}</Link></li>
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
                        <Link href="/terms" className={footerLink}>{t('footer', 'terms')}</Link>
                        <Link href="/privacy-policy" className={footerLink}>{t('footer', 'privacy')}</Link>
                        <Link href="/cookie-policy" className={footerLink}>{t('footer', 'cookies')}</Link>
                        <span className="font-semibold text-ink-4" lang={locale}>{meta.name}</span>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
