import type { Metadata } from 'next';
import RequestsClient from './RequestsClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Sourcing Requests | Tell Atlantis What You Need',
    description: 'Build a buying list — brand, SKU or EAN and how many cartons, pallets or trucks — and the Atlantis sourcing desk prices every line and sends you a quote.',
    alternates: { canonical: `${SITE_URL}/requests` },
    openGraph: {
        type: 'website',
        title: 'Sourcing Requests | Atlantis',
        description: 'Tell Atlantis what you need. We source it, price every line and send you a quote.',
        url: `${SITE_URL}/requests`,
    },
};

export default function RequestsPage() {
    return <RequestsClient />;
}
