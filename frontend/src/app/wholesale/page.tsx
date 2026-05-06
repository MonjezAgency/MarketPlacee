import type { Metadata } from 'next';
import WholesaleClient from './WholesaleClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Wholesale Pricing & Bulk Orders | Carton, Pallet, Truck Tiers | Atlantis',
    description: 'Wholesale pricing for B2B buyers. Order by carton, pallet, or full truck and unlock tier-based bulk pricing on FMCG, beverages, electronics, and more. EUR-native.',
    alternates: { canonical: `${SITE_URL}/wholesale` },
    openGraph: {
        type: 'website',
        title: 'Wholesale Pricing & Bulk Orders | Atlantis',
        description: 'Carton, pallet, or truck — tier-based bulk pricing on verified-supplier inventory. EUR-native, escrow-protected.',
        url: `${SITE_URL}/wholesale`,
    },
};

export default function WholesalePage() {
    return <WholesaleClient />;
}
