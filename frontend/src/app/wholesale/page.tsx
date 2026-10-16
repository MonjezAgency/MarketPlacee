import type { Metadata } from 'next';
import WholesaleClient from './WholesaleClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Wholesale FMCG by the Case, Pallet or Truck | Atlantis',
    description: 'Source FMCG wholesale at B2B prices: order by the case, pallet or full truck, build mixed loads, and see the price per case on every listing. Orders are confirmed by suppliers and approved by Atlantis.',
    alternates: { canonical: `${SITE_URL}/wholesale` },
    openGraph: {
        type: 'website',
        title: 'Wholesale Pricing & Bulk Orders | Atlantis',
        description: 'Case, pallet or truck — wholesale FMCG with the price per case on every listing. Orders confirmed by suppliers and approved by Atlantis.',
        url: `${SITE_URL}/wholesale`,
    },
};

export default function WholesalePage() {
    return <WholesaleClient />;
}
