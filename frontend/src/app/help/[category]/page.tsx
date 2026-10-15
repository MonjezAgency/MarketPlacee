import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { CATEGORIES, articleHref, articlesIn, categoryById } from '@/content/help';
import HelpShell from '@/components/help/HelpShell';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');
const AUDIENCE = { buyer: 'Buyers', supplier: 'Suppliers', both: 'Everyone' } as const;

export function generateStaticParams() {
    return CATEGORIES.map((c) => ({ category: c.id }));
}

export function generateMetadata({ params }: { params: { category: string } }): Metadata {
    const c = categoryById(params.category);
    if (!c) return { title: 'Topic not found — Help Center' };
    return { title: `${c.title} — Help Center`, description: c.description, alternates: { canonical: `${SITE_URL}/help/${c.id}` } };
}

export default function CategoryPage({ params }: { params: { category: string } }) {
    const c = categoryById(params.category);
    if (!c) notFound();
    const list = articlesIn(c.id);
    return (
        <HelpShell crumbs={[{ label: 'Help Center', href: '/help' }, { label: c.title }]}>
            <header className="max-w-[760px] pb-5 border-b border-line">
                <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-heading">{c.title}</h1>
                <p className="mt-2 text-[16px] text-ink-2">{c.description}</p>
                <p className="mt-2 text-[13px] text-ink-4">{list.length} articles</p>
            </header>
            <ul className="mt-2 max-w-[760px] divide-y divide-line">
                {list.map((a) => (
                    <li key={a.slug}>
                        <Link href={articleHref(a)} className="group flex items-start gap-4 py-4">
                            <div className="flex-1 min-w-0">
                                <h2 className="text-[16px] font-semibold text-heading group-hover:text-teal">{a.title}</h2>
                                <p className="mt-0.5 text-[14px] text-ink-3">{a.summary.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}</p>
                                <p className="mt-1.5 text-[12px] font-medium text-ink-4">{AUDIENCE[a.audience]}</p>
                            </div>
                            <ArrowRight size={16} className="mt-1 text-ink-4 group-hover:text-teal shrink-0" />
                        </Link>
                    </li>
                ))}
            </ul>
        </HelpShell>
    );
}
