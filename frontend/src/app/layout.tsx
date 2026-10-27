import type { Metadata } from "next";
import { Cairo, Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from './providers';
import ClientLayout from "@/components/layout/ClientLayout";
import { Toaster } from 'react-hot-toast';
import { NotifyToasts } from '@/components/ui/NotifyToasts';
import { StepUpDialog } from '@/components/security/StepUp';
import { CookieConsent } from '@/components/CookieConsent';
import { cn } from "@/lib/utils";
import { SOCIAL_LINKS } from "@/lib/config";

const cairo = Cairo({
    subsets: ["arabic", "latin"],
    variable: "--font-cairo",
    display: "swap",
});

// Inter for Latin text (compact metrics); Cairo still renders Arabic glyphs.
const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
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
        default: "Atlantis | B2B Wholesale Distributor — Europe & Gulf",
        template: "%s | Atlantis Marketplace",
    },
    description: "Buy bulk FMCG, beverages, electronics, and industrial products direct from Atlantis. Supplier-confirmed orders. EUR pricing. Built for Romania, Europe, and the Gulf.",
    keywords: [
        "B2B marketplace",
        "wholesale platform",
        "bulk sourcing",
        "wholesale distributor",
        "wholesale distribution",
        "B2B procurement",
        "Atlantis wholesale",
        "trade assurance",
        "wholesale prices",
        "bulk orders",
        "FMCG wholesale",
        "Europe distribution",
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
        // No per-language alternates: the interface language is chosen in the
        // app, not in the URL, so /en, /ar… don't exist (they used to 404).
    },
    openGraph: {
        type: 'website',
        siteName: 'Atlantis Marketplace',
        title: 'Atlantis | B2B Wholesale Distributor — Europe & Gulf',
        description: 'Wholesale catalog sold and shipped by Atlantis. Supplier-confirmed orders. EUR pricing. The B2B wholesale distributor built for Europe and the Gulf.',
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
                alt: 'Atlantis — B2B Wholesale Distributor across Europe and the Gulf',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Atlantis | B2B Wholesale Distributor — Europe & Gulf',
        description: 'Sold and shipped by Atlantis. Supplier-confirmed orders. EUR pricing. Source FMCG, electronics, industrial goods at scale.',
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
    // The HTML root defaults to English/LTR; the LanguageProvider wraps a
    // <div dir={...}> around the app and flips to RTL once the locale has
    // hydrated from localStorage. SSR-stable, no mismatch.
    return (
        // translate="no" + the google meta: the site translates itself (7 locales). Browser page
        // translation (Chrome/Edge) swaps React's text nodes for <font> wrappers, and the next
        // update then crashes with "insertBefore/removeChild: not a child of this node".
        <html lang="en" dir="ltr" translate="no" className="notranslate" suppressHydrationWarning>
            <head>
                <meta name="google" content="notranslate" />
                {/* Safety net for extensions that still rewrite the DOM: instead of crashing the page,
                    removeChild/insertBefore tolerate a node that was moved or wrapped. */}
                <script dangerouslySetInnerHTML={{
                    __html: `try{if(typeof Node==='function'&&Node.prototype&&!Node.prototype.__atlDomGuard){var P=Node.prototype,rc=P.removeChild,ib=P.insertBefore;P.__atlDomGuard=true;P.removeChild=function(c){if(c&&c.parentNode!==this){if(c.parentNode&&this.contains(c)){return rc.call(c.parentNode,c)}return c}return rc.apply(this,arguments)};P.insertBefore=function(n,r){if(r&&r.parentNode!==this){var a=r;while(a&&a.parentNode!==this){a=a.parentNode}return ib.call(this,n,a||null)}return ib.apply(this,arguments)}}}catch(e){}`
                }} />
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
                            description: 'B2B wholesale distributor selling FMCG, beverages and consumer goods directly to business buyers across Europe and the Gulf. EUR-native pricing, supplier-confirmed orders.',
                            // sameAs populated so the entity is discoverable by AI
                            // search engines — the GEO audit flagged the empty
                            // array as one of the biggest brand-signal misses.
                            // Only official profiles that exist (configured via NEXT_PUBLIC_SOCIAL_*).
                            sameAs: SOCIAL_LINKS.map((l) => l.url).filter(Boolean),
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
                {/* Chosen language before first paint, so Arabic opens right-to-left without a jump
                    (contexts/LanguageContext.tsx keeps it in sync afterwards). */}
                <script dangerouslySetInnerHTML={{
                    __html: `try{var l=localStorage.getItem('app-locale');if(['ar','fr','ro','it','es','pt'].indexOf(l)>-1){document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr';}}catch(e){}`
                }} />
                {/* Service worker: production only. In dev it would cache
                    hot-reloaded assets, so we unregister any leftover worker
                    instead. Registration failures are non-fatal — always
                    catch them so they never surface as unhandled rejections. */}
                <script dangerouslySetInnerHTML={{
                    __html: process.env.NODE_ENV === 'production' ? `
                        if ('serviceWorker' in navigator) {
                            window.addEventListener('load', function() {
                                navigator.serviceWorker.register('/sw.js').catch(function() {});
                            });
                        }
                    ` : `
                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.getRegistrations()
                                .then(function(regs) { regs.forEach(function(r) { r.unregister(); }); })
                                .catch(function() {});
                        }
                    `
                }} />
            </head>
            <body className={cn(
                'min-h-screen bg-surface text-ink font-sans antialiased text-start',
                inter.variable,
                cairo.variable,
                poppins.variable // Keep poppins variable if it's still needed for other elements
            )}>
                <Providers>
                    <Toaster position="top-right" />
                    <NotifyToasts />
                    <StepUpDialog />
                    <ClientLayout>
                        {children}
                    </ClientLayout>
                    <CookieConsent />
                </Providers>
            </body>
        </html>
    );
}
