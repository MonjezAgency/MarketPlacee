import * as React from 'react';
import { AdPlacements } from '@/components/marketplace/AdPlacements';

// Header/footer come from ClientLayout (the shared shell) — this page used
// to render its own <Navbar/>/<Footer/> too, which duplicated them.
export default function SponsoredHighlightsPage() {
    return (
        <main className="min-h-screen bg-surface text-start">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-6">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">Sponsored</p>
                <h1 className="font-sans mt-2 text-[30px] sm:text-[38px] font-bold tracking-tight text-heading">Ali FMCG Highlights</h1>
                <p className="mt-2 text-[15px] text-ink-2">Featured placements from brands on Ali FMCG.</p>
            </div>
            <AdPlacements />
        </main>
    );
}
