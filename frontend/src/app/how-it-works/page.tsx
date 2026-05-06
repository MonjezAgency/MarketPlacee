import type { Metadata } from 'next';
import HowItWorksClient from './HowItWorksClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'How Atlantis Works | B2B Wholesale Sourcing & Escrow Payments Explained',
    description: 'Step-by-step: how to source bulk goods on Atlantis. KYC-verified supplier discovery, secure escrow payments, dispute resolution, and EUR-native pricing across Europe and the Gulf.',
    alternates: { canonical: `${SITE_URL}/how-it-works` },
    openGraph: {
        type: 'website',
        title: 'How Atlantis Works | B2B Wholesale Sourcing Explained',
        description: 'KYC-verified suppliers + escrow payments + EUR pricing — the B2B wholesale marketplace built for Europe and the Gulf.',
        url: `${SITE_URL}/how-it-works`,
    },
};

export default function HowItWorksPage() {
    return <HowItWorksClient />;
}
