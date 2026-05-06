import type { Metadata } from 'next';
import AboutClient from './AboutClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'About Atlantis | KYC-Verified B2B Wholesale Platform — Built by Monjez Company',
    description: 'Atlantis is a B2B wholesale marketplace by Monjez Company. KYC-verified suppliers, escrow-protected payments, GDPR-compliant, EUR-native — built for Romania and the European market.',
    alternates: { canonical: `${SITE_URL}/about` },
    openGraph: {
        type: 'website',
        title: 'About Atlantis | KYC-Verified B2B Wholesale Platform',
        description: 'KYC-verified suppliers, escrow-protected payments, GDPR-compliant. Built for Romania, the EU, and the Gulf by Monjez Company.',
        url: `${SITE_URL}/about`,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'About Atlantis | KYC-Verified B2B Wholesale Platform',
        description: 'KYC-verified suppliers, escrow-protected payments, GDPR-compliant. Built by Monjez Company.',
    },
};

export default function AboutPage() {
    return <AboutClient />;
}
