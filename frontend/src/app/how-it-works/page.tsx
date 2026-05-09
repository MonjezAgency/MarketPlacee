import type { Metadata } from 'next';
import HowItWorksClient from './HowItWorksClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'How Atlantis Works | B2B Wholesale Sourcing & Escrow Payments Explained',
    description: 'Step-by-step: how to buy bulk goods directly from Atlantis. Curated wholesale catalog, secure escrow payments, dispute resolution, and EUR-native pricing across Europe and the Gulf.',
    alternates: { canonical: `${SITE_URL}/how-it-works` },
    openGraph: {
        type: 'website',
        title: 'How Atlantis Works | B2B Wholesale Buying Explained',
        description: 'Curated catalog + escrow payments + EUR pricing — the B2B wholesale distributor built for Europe and the Gulf.',
        url: `${SITE_URL}/how-it-works`,
    },
};

export default function HowItWorksPage() {
    return <HowItWorksClient />;
}
