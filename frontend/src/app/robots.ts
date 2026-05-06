import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            // Default: allow all bots into public pages, block app/back-of-house paths.
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/admin/',
                    '/dashboard/',
                    '/api/',
                    '/auth/',
                    '/checkout/',
                    '/_next/',
                    '/cart',
                    '/login',
                    '/register',
                    '/account/',
                    '/saved/',
                    '/wishlist',
                ],
            },
            // Explicitly allow major AI search crawlers — without this the GEO
            // audit flags them as "implicit allow" which is fragile across
            // future robots.txt edits.
            { userAgent: 'GPTBot',         allow: '/' },
            { userAgent: 'OAI-SearchBot',  allow: '/' },
            { userAgent: 'ChatGPT-User',   allow: '/' },
            { userAgent: 'ClaudeBot',      allow: '/' },
            { userAgent: 'Claude-Web',     allow: '/' },
            { userAgent: 'PerplexityBot',  allow: '/' },
            { userAgent: 'Perplexity-User', allow: '/' },
            { userAgent: 'Google-Extended', allow: '/' },
            { userAgent: 'Applebot-Extended', allow: '/' },
            // Block training-only scrapers that don't drive search traffic.
            { userAgent: 'CCBot',          disallow: '/' },
            { userAgent: 'Bytespider',     disallow: '/' },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
