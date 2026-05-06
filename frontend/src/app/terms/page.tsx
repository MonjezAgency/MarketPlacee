import type { Metadata } from 'next';
import TermsClient from './TermsClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Terms of Service | Atlantis B2B Wholesale Marketplace',
    description: 'Terms governing the use of Atlantis Marketplace — buyer obligations, supplier obligations, escrow, dispute resolution, and platform liability.',
    alternates: { canonical: `${SITE_URL}/terms` },
    robots: { index: true, follow: true },
};

export default function TermsPage() {
    return <TermsClient />;
}
