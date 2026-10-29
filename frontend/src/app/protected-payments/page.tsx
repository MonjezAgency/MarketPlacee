import type { Metadata } from 'next';
import ProtectedPaymentsClient from './ProtectedPaymentsClient';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Protected Payments | How Ali FMCG Orders Are Confirmed',
    description: 'Know what happens before money moves: suppliers explicitly confirm every order, Ali FMCG approves the terms, and any change needs your acceptance before shipping.',
    alternates: { canonical: `${SITE_URL}/protected-payments` },
    openGraph: { type: 'website', title: 'Protected Payments | Ali FMCG', description: 'Supplier confirmation, Ali FMCG approval and confirmed terms — before you pay.', url: `${SITE_URL}/protected-payments` },
};

export default function ProtectedPaymentsPage() {
    return <ProtectedPaymentsClient />;
}
