import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://atlantisfmcg.com';

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();

    const routes: MetadataRoute.Sitemap = [
        { url: `${SITE_URL}/`, lastModified, changeFrequency: 'daily', priority: 1.0 },
        { url: `${SITE_URL}/categories`, lastModified, changeFrequency: 'daily', priority: 0.9 },
        { url: `${SITE_URL}/brands`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
        { url: `${SITE_URL}/products`, lastModified, changeFrequency: 'daily', priority: 0.9 },
        { url: `${SITE_URL}/about`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
        { url: `${SITE_URL}/contact`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
        { url: `${SITE_URL}/login`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
        { url: `${SITE_URL}/register`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
        { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    ];

    return routes;
}
