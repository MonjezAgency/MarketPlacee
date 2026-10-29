import type { Metadata } from 'next';
import AboutClient from './AboutClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'About Ali FMCG | B2B Wholesale Distributor — Built by Monjez Company',
    description: 'Ali FMCG is a B2B wholesale distributor by Monjez Company. We sell FMCG, beverages and consumer goods directly to business buyers — supplier-confirmed orders, GDPR-compliant, EUR-native — built for Romania and the European market.',
    alternates: { canonical: `${SITE_URL}/about` },
    openGraph: {
        type: 'website',
        title: 'About Ali FMCG | B2B Wholesale Distributor',
        description: 'Ali FMCG sells wholesale directly to business buyers. Supplier-confirmed orders, GDPR-compliant. Built for Romania, the EU, and the Gulf by Monjez Company.',
        url: `${SITE_URL}/about`,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'About Ali FMCG | B2B Wholesale Distributor',
        description: 'Ali FMCG sells wholesale directly. Supplier-confirmed orders, GDPR-compliant. Built by Monjez Company.',
    },
};

export default function AboutPage() {
    return <AboutClient />;
}
