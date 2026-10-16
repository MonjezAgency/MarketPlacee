import type { Metadata } from 'next';
import WarehousesClient from './WarehousesClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Warehouses | Atlantis Hubs in Europe & the Americas',
    description: 'Verified Atlantis hubs in Europe and the Americas, the services each offers, and the countries Atlantis delivers to. Only hubs Atlantis has verified are shown.',
    alternates: { canonical: `${SITE_URL}/warehouses` },
    openGraph: { type: 'website', title: 'Warehouses | Atlantis', description: 'Verified Atlantis hubs in Europe and the Americas, and where Atlantis delivers.', url: `${SITE_URL}/warehouses` },
};

export default function WarehousesPage() {
    return <WarehousesClient />;
}
