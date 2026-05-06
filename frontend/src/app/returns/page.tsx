import type { Metadata } from 'next';
import ReturnsClient from './ReturnsClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Returns & Refunds Policy | Escrow-Protected B2B Wholesale | Atlantis',
    description: 'Atlantis returns & refunds policy. Escrow-protected payments, dispute resolution, and supplier accountability for bulk B2B orders across Europe and the Gulf.',
    alternates: { canonical: `${SITE_URL}/returns` },
    openGraph: {
        type: 'website',
        title: 'Returns & Refunds Policy | Atlantis Marketplace',
        description: 'Escrow protects you until delivery is confirmed. Clear dispute process for B2B wholesale orders.',
        url: `${SITE_URL}/returns`,
    },
};

export default function ReturnsPage() {
    return <ReturnsClient />;
}
