import type { Metadata } from 'next';
import WarehousesClient from './WarehousesClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Warehouses & hubs | Atlantis',
    description: 'How Atlantis hubs, supplier dispatch locations and delivery countries differ. A hub is shown, with the services it offers, only once Atlantis has verified it.',
    alternates: { canonical: `${SITE_URL}/warehouses` },
    openGraph: { type: 'website', title: 'Warehouses | Atlantis', description: 'Atlantis hubs are shown only once verified. See where Atlantis delivers.', url: `${SITE_URL}/warehouses` },
};

export default function WarehousesPage() {
    return <WarehousesClient />;
}
