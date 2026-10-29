import type { Metadata } from 'next';
import TargetsClient from './TargetsClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Buyer Targets | FMCG Demand on Ali FMCG',
    description: 'See what FMCG buyers are actively looking for — requested products, volumes and specifications — and respond with your offer.',
    alternates: { canonical: `${SITE_URL}/targets` },
};

export default function TargetsPage() {
    return <TargetsClient />;
}
