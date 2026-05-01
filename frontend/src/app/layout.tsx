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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://atlantisfmcg.com';

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: "Atlantis Marketplace — Global B2B Wholesale Sourcing Platform",
        template: "%s | Atlantis Marketplace",
    },
    description: "Atlantis is a global B2B wholesale marketplace connecting verified suppliers with retailers. Source bulk products at competitive wholesale prices with reliable global shipping, flexible payment terms, and dedicated business support.",
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
        title: 'Atlantis Marketplace — Global B2B Wholesale Sourcing Platform',
        description: 'Connect with verified global suppliers. Source bulk products at competitive wholesale prices with reliable global shipping and trade assurance.',
        url: SITE_URL,
        locale: 'en_US',
        alternateLocale: ['ar_EG', 'fr_FR', 'ro_RO'],
        images: [
            {
                url: '/icon.png',
                width: 1200,
                height: 630,
                alt: 'Atlantis Marketplace — Global B2B Wholesale Platform',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Atlantis Marketplace — Global B2B Wholesale Sourcing Platform',
        description: 'Connect with verified global suppliers. Source bulk products at competitive wholesale prices.',
        images: ['/icon.png'],
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
                            url: SITE_URL,
                            logo: `${SITE_URL}/icon.png`,
                            description: 'Global B2B wholesale marketplace connecting verified suppliers with retailers.',
                            sameAs: [],
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
                            url: SITE_URL,
                            potentialAction: {
                                '@type': 'SearchAction',
                                target: `${SITE_URL}/categories?q={search_term_string}`,
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
