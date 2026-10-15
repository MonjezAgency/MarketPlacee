import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Search — Help Center', robots: { index: false } };

export default function HelpSearchLayout({ children }: { children: React.ReactNode }) {
    return children;
}
