import HomeClient from './HomeClient';

// Homepage uses the default title/description from src/app/layout.tsx,
// so no per-page metadata override is needed here. This file exists as a
// server-component wrapper around the 'use client' homepage so future
// metadata tweaks (Product schema, breadcrumb schema, page-specific OG)
// have a place to land without touching the client tree.
export default function HomePage() {
    return <HomeClient />;
}
