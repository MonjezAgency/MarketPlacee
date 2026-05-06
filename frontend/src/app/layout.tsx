import type { Metadata } from "next";
import { Cairo, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from './providers';
import ClientLayout from "@/components/layout/ClientLayout";
import { Toaster } from 'react-hot-toast';
import { CookieConsent } from '@/components/CookieConsent';
import { cn } from "@/lib/utils";

const cairo = Cairo({
    subsets: ["arabic", "latin"],
    variable: "--font-cairo",
    display: "swap",
});

const poppins = Poppins({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    variable: "--font-poppins",
    display: "swap",
});

// Normalize SITE_URL to never have a trailing slash. The SEO audit caught
// a double-slash bug in every sitemap URL and in the Organization schema's
// logo field (e.g. "https://www.atlantisfmcg.com//icon.png"). Stripping
// trailing slashes here and concatenating with explicit "/" keeps every
// derived URL clean.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        // Homepage default — every other page should set its own `title`
        // (the audit flagged 100% duplicate titles). The template handles
        // pages that DO set their own title.
        default: "Atlantis | B2B Wholesale Marketplace — Verified Suppliers, Europe & Gulf",
        template: "%s | Atlantis Marketplace",
    },
    description: "Source bulk FMCG, beverages, electronics, and industrial products from KYC-verified suppliers. Escrow-protected payments. EUR pricing. Built for Romania, Europe, and the Gulf.",
    keywords: [
        "B2B marketplace",
        "wholesale platform",
        "bulk sourcing",
        "global suppliers",
        "wholesale distribution",
        "B2B procurement",
        "verified suppliers",
        "trade assurance",
        "wholesale prices",
        "bulk orders",
        "FMCG wholesale",
        "supplier network",
        "Atlantis Marketplace",
        "B2B sourcing",
        "wholesale beverages",
        "global trade",
    ],
    authors: [{ name: "Atlantis Marketplace" }],
    creator: "Atlantis Marketplace",
    publisher: "Atlantis Marketplace",
    formatDetection: {
        email: false,
        address: false,
        telephone: false,
    },
    alternates: {
        canonical: '/',
        languages: {
            'en': '/en',
            'ar': '/ar',
            'fr': '/fr',
            'ro': '/ro',
        },
    },
    openGraph: {
        type: 'website',
        siteName: 'Atlantis Marketplace',
        title: 'Atlantis | B2B Wholesale Marketplace — Verified Suppliers, Europe & Gulf',
        description: 'KYC-verified suppliers. Escrow-protected payments. EUR pricing. The B2B wholesale marketplace built for Europe and the Gulf.',
        url: `${SITE_URL}/`,
        locale: 'en_US',
        alternateLocale: ['ar_EG', 'fr_FR', 'ro_RO'],
        images: [
            {
                // TODO: replace /og-image.png with a 1200x630 branded OG image.
                // Until that asset exists, fall back to /icon.png — it will
                // render as a tiny logo in social previews. The audit called
                // this out as a missed brand impression. Once a designed
                // OG image lands in /public/og-image.png, this fallback
                // becomes correct automatically.
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: 'Atlantis — B2B Wholesale Marketplace for verified suppliers across Europe and the Gulf',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Atlantis | B2B Wholesale Marketplace — Verified Suppliers, Europe & Gulf',
        description: 'KYC-verified suppliers. Escrow-protected payments. EUR pricing. Source FMCG, electronics, industrial goods at scale.',
        images: ['/og-image.png'],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
    category: 'business',
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/icon.png', type: 'image/png' },
        ],
        apple: '/icon.png',
    },
    manifest: '/manifest.json',
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    themeColor: '#0B1F3A',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ar" dir="rtl" suppressHydrationWarning>
            <head>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'Organization',
                            name: 'Atlantis Marketplace',
                            legalName: 'Atlantis Marketplace (operated by Monjez Company)',
                            url: `${SITE_URL}/`,
                            logo: `${SITE_URL}/icon.png`,
                            description: 'B2B wholesale marketplace connecting KYC-verified suppliers with business buyers across Europe and the Gulf. EUR-native pricing, escrow-protected payments.',
                            // sameAs populated so the entity is discoverable by AI
                            // search engines — the GEO audit flagged the empty
                            // array as one of the biggest brand-signal misses.
                            sameAs: [
                                'https://www.linkedin.com/company/atlantis-fmcg',
                                'https://x.com/atlantisfmcg',
                                'https://www.facebook.com/atlantisfmcg',
                                'https://www.instagram.com/atlantisfmcg',
                            ],
                            contactPoint: [{
                                '@type': 'ContactPoint',
                                email: 'Info@atlantisfmcg.com',
                                contactType: 'customer support',
                                areaServed: ['EU', 'GCC'],
                                availableLanguage: ['en', 'ar', 'fr', 'ro'],
                            }],
                            areaServed: ['Europe', 'Gulf Cooperation Council'],
                        }),
                    }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'WebSite',
                            name: 'Atlantis Marketplace',
                            url: `${SITE_URL}/`,
                            inLanguage: ['en', 'ar', 'fr', 'ro'],
                            potentialAction: {
                                '@type': 'SearchAction',
                                target: {
                                    '@type': 'EntryPoint',
                                    urlTemplate: `${SITE_URL}/categories?q={search_term_string}`,
                                },
                                'query-input': 'required name=search_term_string',
                            },
                        }),
                    }}
                />
                <script dangerouslySetInnerHTML={{
                    __html: `
                        if ('serviceWorker' in navigator) {
                            window.addEventListener('load', function() {
                                navigator.serviceWorker.register('/sw.js');
                            });
                        }
                    `
                }} />
            </head>
            <body className={cn(
                'min-h-screen bg-background font-sans antialiased text-end',
                cairo.variable,
                poppins.variable // Keep poppins variable if it's still needed for other elements
            )}>
                <Providers>
                    <Toaster position="top-right" />
                    <ClientLayout>
                        {children}
                    </ClientLayout>
                    <CookieConsent />
                </Providers>
            </body>
        </html>
    );
}
