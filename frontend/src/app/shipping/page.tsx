import type { Metadata } from 'next';
import ShippingClient from './ShippingClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Shipping & Logistics | Atlantis B2B Wholesale Marketplace — Europe & Gulf',
    description: 'Shipping policy, delivery zones, and logistics partners for Atlantis bulk orders. Lead times, customs, pallet & truck delivery across Romania, the EU, and the Gulf region.',
    alternates: { canonical: `${SITE_URL}/shipping` },
    openGraph: {
        type: 'website',
        title: 'Shipping & Logistics | Atlantis Marketplace',
        description: 'Delivery zones, customs handling, lead times — wholesale logistics across Europe and the Gulf.',
        url: `${SITE_URL}/shipping`,
    },
};

export default function ShippingPage() {
    return <ShippingClient />;
}
