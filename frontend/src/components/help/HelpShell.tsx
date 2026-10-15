import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { HelpSearch, HelpSidebar } from '@/components/help/HelpUI';

/** Documentation frame: search bar, breadcrumbs, topic sidebar, content (and an optional right column). */
export default function HelpShell({ crumbs, children, aside }: { crumbs: { label: string; href?: string }[]; children: React.ReactNode; aside?: React.ReactNode }) {
    return (
        <main className="bg-surface text-start">
            <div className="border-b border-line bg-surface-2/60">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <Link href="/help" className="text-[15px] font-bold text-heading shrink-0">Atlantis Help Center</Link>
                    <div className="sm:ms-auto sm:w-[420px]"><HelpSearch /></div>
                </div>
            </div>
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_200px]">
                <HelpSidebar />
                <div className="min-w-0">
                    <nav aria-label="Breadcrumb" className="mb-4 text-[13px] text-ink-3">
                        <ol className="flex flex-wrap items-center gap-1">
                            {crumbs.map((c, i) => (
                                <li key={i} className="inline-flex items-center gap-1">
                                    {i > 0 && <ChevronRight size={13} className="text-ink-4" />}
                                    {c.href ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : <span aria-current="page" className="text-ink-2">{c.label}</span>}
                                </li>
                            ))}
                        </ol>
                    </nav>
                    {children}
                </div>
                {aside}
            </div>
        </main>
    );
}
