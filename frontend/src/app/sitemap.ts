import type { MetadataRoute } from 'next';

/**
 * Normalize SITE_URL to never have a trailing slash so route paths can be
 * concatenated as `${SITE_URL}/page` without producing the `//page` bug
 * the SEO audit caught (every URL in the previous sitemap was malformed).
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();

    // Notes from the SEO audit (May 2026):
    // - /products and /brands were 404 → removed from sitemap.
    // - /login and /register are gated user pages → must NOT be indexed.
    // - changeFrequency and priority hints were dropped: Google has ignored
    //   them since 2023 and they only add noise.
    // - Shipping/returns/how-it-works/wholesale are real public pages we
    //   want crawled.
    return [
        { url: `${SITE_URL}/`, lastModified },
        { url: `${SITE_URL}/categories`, lastModified },
        { url: `${SITE_URL}/about`, lastModified },
        { url: `${SITE_URL}/contact`, lastModified },
        { url: `${SITE_URL}/how-it-works`, lastModified },
        { url: `${SITE_URL}/wholesale`, lastModified },
        { url: `${SITE_URL}/shipping`, lastModified },
        { url: `${SITE_URL}/returns`, lastModified },
        { url: `${SITE_URL}/help`, lastModified },
        { url: `${SITE_URL}/privacy-policy`, lastModified },
        { url: `${SITE_URL}/terms`, lastModified },
        { url: `${SITE_URL}/cookie-policy`, lastModified },
    ];
}
