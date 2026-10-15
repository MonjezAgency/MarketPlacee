import type { Metadata } from 'next';
import Link from 'next/link';
import { ARTICLES, CATEGORIES, articleHref, articlesIn } from '@/content/help';
import HelpShell from '@/components/help/HelpShell';

export const metadata: Metadata = { title: 'All articles — Help Center', description: 'Every Atlantis Help Center article, by topic.' };

export default function AllArticles() {
    return (
        <HelpShell crumbs={[{ label: 'Help Center', href: '/help' }, { label: 'All articles' }]}>
            <h1 className="text-[28px] font-bold tracking-tight text-heading">All articles</h1>
            <p className="mt-1 text-[14px] text-ink-3">{ARTICLES.length} articles in {CATEGORIES.length} topics.</p>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
                {CATEGORIES.map((c) => (
                    <section key={c.id} aria-labelledby={`all-${c.id}`}>
                        <h2 id={`all-${c.id}`} className="text-[16px] font-bold text-heading"><Link href={`/help/${c.id}`} className="hover:text-teal">{c.title}</Link></h2>
                        <ul className="mt-2 space-y-1.5">
                            {articlesIn(c.id).map((a) => <li key={a.slug}><Link href={articleHref(a)} className="text-[14.5px] text-ink-2 hover:text-teal">{a.title}</Link></li>)}
                        </ul>
                    </section>
                ))}
            </div>
        </HelpShell>
    );
}
