import type { Metadata } from 'next';
import CookieClient from './CookieClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Cookie Policy | Atlantis Marketplace — GDPR-Compliant Tracking',
    description: 'How Atlantis uses cookies and similar technologies. Strictly necessary, functional, analytics, and marketing cookies — fully GDPR-compliant.',
    alternates: { canonical: `${SITE_URL}/cookie-policy` },
};

export default function CookiePolicyPage() {
    return <CookieClient />;
}
