import type { Metadata } from 'next';
import GoodsInspectionClient from './GoodsInspectionClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Goods Inspection | Ali FMCG B2B FMCG Wholesale',
    description: 'How goods inspection works on Ali FMCG: EAN and variant checks, carton counts, best-before dates and packaging condition, recorded on your order with the agreed outcome.',
    alternates: { canonical: `${SITE_URL}/goods-inspection` },
    openGraph: { type: 'website', title: 'Goods Inspection | Ali FMCG', description: 'What an inspection checks, what the report shows, and how issues are resolved.', url: `${SITE_URL}/goods-inspection` },
};

export default function GoodsInspectionPage() {
    return <GoodsInspectionClient />;
}
