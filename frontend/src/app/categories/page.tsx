import type { Metadata } from 'next';
import CategoriesClient from './CategoriesClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'B2B Wholesale Products | Bulk FMCG, Beverages, Electronics & More | Ali FMCG',
    description: 'Browse thousands of wholesale products sold by Ali FMCG. FMCG, beverages, snacks, personal care, electronics, packaging, and industrial goods. Bulk pricing with supplier-confirmed orders.',
    alternates: { canonical: `${SITE_URL}/categories` },
    openGraph: {
        type: 'website',
        title: 'B2B Wholesale Products | Bulk FMCG & More | Ali FMCG',
        description: 'Buy bulk products direct from Ali FMCG across Europe and the Gulf. Supplier-confirmed orders.',
        url: `${SITE_URL}/categories`,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'B2B Wholesale Products | Ali FMCG',
        description: 'Sold by Ali FMCG. Supplier-confirmed. Bulk pricing.',
    },
};

export default function CategoriesPage() {
    return <CategoriesClient />;
}
