import type { Metadata } from 'next';
import CategoriesClient from './CategoriesClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'B2B Wholesale Products | Bulk FMCG, Beverages, Electronics & More | Atlantis',
    description: 'Browse thousands of wholesale products sold by Atlantis. FMCG, beverages, snacks, personal care, electronics, packaging, and industrial goods. Bulk pricing with escrow protection.',
    alternates: { canonical: `${SITE_URL}/categories` },
    openGraph: {
        type: 'website',
        title: 'B2B Wholesale Products | Bulk FMCG & More | Atlantis',
        description: 'Buy bulk products direct from Atlantis across Europe and the Gulf. Escrow-protected.',
        url: `${SITE_URL}/categories`,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'B2B Wholesale Products | Atlantis',
        description: 'Sold by Atlantis. Escrow-protected. Bulk pricing.',
    },
};

export default function CategoriesPage() {
    return <CategoriesClient />;
}
