import type { Metadata } from 'next';
import NotFoundClient from './NotFoundClient';

// Server-component wrapper so the 404 page can carry its own unique title
// (audit issue #11 — soft-404 risk because every page including 404 shipped
// with the homepage title). Next.js automatically returns a 404 HTTP status
// for app/not-found.tsx; this override only changes the metadata.
export const metadata: Metadata = {
    title: 'Page Not Found | Atlantis B2B Wholesale Marketplace',
    description: 'The page you were looking for could not be found. Browse our verified wholesale catalogue or contact the Atlantis team.',
    robots: { index: false, follow: false },
};

export default function NotFound() {
    return <NotFoundClient />;
}
