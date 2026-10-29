import type { Metadata } from 'next';
import ShippingClient from './ShippingClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Shipping & Logistics | Ali FMCG B2B Wholesale Marketplace — Europe & Gulf',
    description: 'How delivery works on Ali FMCG: delivery countries, how delivery charges are priced, typical transit times by zone, customs and duties, and what to do if something goes wrong.',
    alternates: { canonical: `${SITE_URL}/shipping` },
    openGraph: {
        type: 'website',
        title: 'Shipping & Logistics | Ali FMCG Marketplace',
        description: 'Delivery countries, delivery pricing, transit estimates and customs for Ali FMCG wholesale orders.',
        url: `${SITE_URL}/shipping`,
    },
};

export default function ShippingPage() {
    return <ShippingClient />;
}
