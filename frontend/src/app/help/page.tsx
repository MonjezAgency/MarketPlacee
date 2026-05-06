import type { Metadata } from 'next';
import HelpClient from './HelpClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Help Center & FAQ | Atlantis B2B Wholesale Marketplace',
    description: 'Answers to common questions about sourcing on Atlantis — KYC verification, escrow, shipping, MOQ, payment terms, and dispute resolution.',
    alternates: { canonical: `${SITE_URL}/help` },
    openGraph: {
        type: 'website',
        title: 'Help Center & FAQ | Atlantis Marketplace',
        description: 'Common questions about KYC, escrow, MOQ, shipping, and payment terms on Atlantis.',
        url: `${SITE_URL}/help`,
    },
};

export default function HelpPage() {
    return <HelpClient />;
}
