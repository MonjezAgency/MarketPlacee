import type { Metadata } from 'next';
import PrivacyClient from './PrivacyClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Privacy Policy | Atlantis Marketplace — GDPR-Compliant Data Handling',
    description: 'How Atlantis collects, processes, and protects buyer and supplier data. GDPR-compliant, AES-256 encryption, EU data residency.',
    alternates: { canonical: `${SITE_URL}/privacy-policy` },
    robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
    return <PrivacyClient />;
}
