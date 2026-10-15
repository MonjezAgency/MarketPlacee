'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { articleHref, categoryById, searchArticles } from '@/content/help';
import HelpShell from '@/components/help/HelpShell';

function Results() {
    const q = (useSearchParams().get('q') || '').trim();
    const hits = React.useMemo(() => searchArticles(q, 50), [q]);
    return (
        <HelpShell crumbs={[{ label: 'Help Center', href: '/help' }, { label: 'Search' }]}>
            <h1 className="text-[26px] font-bold tracking-tight text-heading">{q ? <>Results for “{q}”</> : 'Search the Help Center'}</h1>
            <p className="mt-1 text-[14px] text-ink-3">{q ? `${hits.length} ${hits.length === 1 ? 'article' : 'articles'}` : 'Type a term in the search box above.'}</p>
            {q && hits.length === 0 && (
                <div className="mt-6 rounded-xl ring-1 ring-line px-5 py-6 max-w-[760px]">
                    <p className="font-semibold text-heading">No articles match “{q}”.</p>
                    <ul className="mt-2 ps-5 list-disc text-[14px] text-ink-2 space-y-1">
                        <li>Try a shorter or more general term (for example “minimum” instead of “minimum order pallets”).</li>
                        <li>Check the spelling, or search for a code shown in an error message such as BELOW_MOQ.</li>
                        <li><Link href="/help/all" className="text-teal font-medium">Browse all articles</Link> by topic.</li>
                    </ul>
                </div>
            )}
            <ul className="mt-4 max-w-[760px] divide-y divide-line">
                {hits.map((h) => (
                    <li key={articleHref(h.article)}>
                        <Link href={articleHref(h.article)} className="group block py-4">
                            <span className="block text-[12px] font-medium text-ink-4">{categoryById(h.article.category)?.title}</span>
                            <span className="block text-[16px] font-semibold text-heading group-hover:text-teal">{h.article.title}</span>
                            <span className="block mt-0.5 text-[14px] text-ink-3 line-clamp-2">{h.snippet}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </HelpShell>
    );
}

export default function HelpSearchPage() {
    return <React.Suspense fallback={null}><Results /></React.Suspense>;
}
