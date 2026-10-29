import type { Metadata } from 'next';
import ContactClient from './ContactClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Contact Ali FMCG | B2B Wholesale Support, Supplier Registration & Inquiries',
    description: 'Get in touch with the Ali FMCG B2B team. Wholesale sourcing questions, supplier registration, KYC verification — we respond within 24 business hours.',
    alternates: { canonical: `${SITE_URL}/contact` },
    openGraph: {
        type: 'website',
        title: 'Contact Ali FMCG | B2B Wholesale Support',
        description: 'Reach our team for wholesale sourcing, supplier onboarding, KYC, and order questions. Response within 24 business hours.',
        url: `${SITE_URL}/contact`,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Contact Ali FMCG | B2B Wholesale Support',
        description: 'Wholesale sourcing, supplier onboarding, KYC, and order inquiries.',
    },
};

export default function ContactPage() {
    return <ContactClient />;
}
