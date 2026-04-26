'use client';

import Link from 'next/link';
import { ChevronRight, Facebook, Twitter, Instagram, Linkedin, Mail, Phone, MapPin, PackageSearch } from 'lucide-react';

import { useLanguage } from '@/contexts/LanguageContext';

const FOOTER_COLUMNS = [
    {
        title: 'sourcing',
        links: [
            { name: 'browseCategories', href: '/categories' },
            { name: 'dailyDeals', href: '/deals' },
            { name: 'bulkWholesale', href: '/wholesale' },
            { name: 'howItWorks', href: '/how-it-works' },
        ],
    },
    {
        title: 'forSuppliers',
        links: [
            { name: 'registerSupplier', href: '/auth/register' },
            { name: 'marketingTools', href: '/marketing' },
            { name: 'aboutUs', href: '/about' },
        ],
    },
    {
        title: 'support',
        links: [
            { name: 'helpCenter', href: '/help' },
            { name: 'contactUs', href: '/contact' },
            { name: 'shippingPolicy', href: '/shipping' },
            { name: 'returnsRefunds', href: '/returns' },
        ],
    },
];

export default function Footer() {
    const { t } = useLanguage();
    return (
        <footer className="bg-[#232F3E] text-white border-t border-white/10 mt-auto">
            <div className="container mx-auto px-6 py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                    {/* Brand Info */}
                    <div className="space-y-6">
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center premium-shadow group-hover:rotate-12 transition-transform duration-300">
                                <img src="/icon.png" alt="Atlantis" className="w-full h-full object-cover" />
                            </div>
                            <span className="font-heading font-bold text-2xl tracking-tight text-white">
                                Atlan<span className="text-secondary">tis</span>
                            </span>
                        </Link>
                        <p className="text-white/70 text-sm leading-relaxed max-w-xs">
                            {t('footer', 'description')}
                        </p>
                        <div className="flex gap-3">
                            {[Facebook, Twitter, Instagram, Linkedin].map((Icon, i) => (
                                <a key={i} href="#" className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all duration-300">
                                    <Icon size={18} />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Dynamic Columns */}
                    {FOOTER_COLUMNS.map((col) => (
                        <div key={col.title}>
                            <h3 className="font-heading font-bold text-sm uppercase tracking-widest mb-6 text-white/90">{t('footer', col.title)}</h3>
                            <ul className="space-y-3">
                                {col.links.map((link) => (
                                    <li key={link.name}>
                                        <Link
                                            href={link.href}
                                            className="text-white/70 text-sm hover:text-primary hover:translate-x-1 transition-all flex items-center group"
                                        >
                                            {t('footer', link.name)}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="border-t border-white/10 py-8 bg-[#131921]">
                <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex flex-col gap-1">
                        <p className="text-white/60 text-xs font-medium">
                            {t('footer', 'copyright')}
                        </p>
                        <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">
                            {t('footer', 'developedBy')}
                        </p>
                    </div>
                    <div className="flex items-center gap-6 text-xs font-semibold text-white/60">
                        <Link href="/privacy-policy" className="hover:text-white transition-colors">{t('footer', 'privacy')}</Link>
                        <Link href="/terms" className="hover:text-white transition-colors">{t('footer', 'terms')}</Link>
                        <Link href="/cookie-policy" className="hover:text-white transition-colors">{t('footer', 'cookies')}</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
