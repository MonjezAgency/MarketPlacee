import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, MessageSquare } from 'lucide-react';
import { ARTICLES, articleHref, articlesIn, categoryById, findRef, getArticle, headingId } from '@/content/help';
import HelpShell from '@/components/help/HelpShell';
import ArticleBody, { Inline } from '@/components/help/ArticleBody';
import { TableOfContents } from '@/components/help/HelpUI';
import AccountCta from '@/components/help/AccountCta';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');
const AUDIENCE = { buyer: 'Buyers', supplier: 'Suppliers', both: 'Buyers and suppliers' } as const;

export function generateStaticParams() {
    return ARTICLES.map((a) => ({ category: a.category, slug: a.slug }));
}

export function generateMetadata({ params }: { params: { category: string; slug: string } }): Metadata {
    const a = getArticle(params.category, params.slug);
    if (!a) return { title: 'Article not found — Help Center' };
    const url = `${SITE_URL}${articleHref(a)}`;
    return { title: `${a.title} — Help Center`, description: a.summary, alternates: { canonical: url }, openGraph: { type: 'article', title: a.title, description: a.summary, url } };
}

export default function ArticlePage({ params }: { params: { category: string; slug: string } }) {
    const a = getArticle(params.category, params.slug);
    const cat = categoryById(params.category);
    if (!a || !cat) notFound();
    const siblings = articlesIn(a.category);
    const idx = siblings.findIndex((s) => s.slug === a.slug);
    const prev = siblings[idx - 1], next = siblings[idx + 1];
    const related = (a.related || []).map(findRef).filter(Boolean) as typeof ARTICLES;
    const toc = a.blocks.filter((b): b is { h2: string } => 'h2' in b).map((b) => ({ id: headingId(b.h2), text: b.h2 }));
    const supportHref = a.audience === 'supplier' ? '/supplier/support' : '/dashboard/customer/support';

    return (
        <HelpShell crumbs={[{ label: 'Help Center', href: '/help' }, { label: cat.title, href: `/help/${cat.id}` }, { label: a.title }]} aside={<TableOfContents items={toc} />}>
            <article className="max-w-[760px]">
                <header className="pb-5 border-b border-line">
                    <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-teal">{cat.title}</p>
                    <h1 className="mt-1.5 text-[28px] sm:text-[32px] font-bold tracking-tight text-heading leading-tight">{a.title}</h1>
                    <p className="mt-3 text-[16.5px] leading-relaxed text-ink-2"><Inline text={a.summary} /></p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[12.5px]">
                        <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-surface-2 ring-1 ring-line text-ink-2">For: <b className="ms-1 font-semibold text-heading">{AUDIENCE[a.audience]}</b></span>
                    </div>
                    {a.prerequisites && a.prerequisites.length > 0 && (
                        <div className="mt-4 rounded-xl ring-1 ring-line px-4 py-3 text-[14px]">
                            <p className="font-semibold text-heading">Before you start</p>
                            <ul className="mt-1 ps-5 list-disc space-y-0.5 text-ink-2 marker:text-ink-4">{a.prerequisites.map((p) => <li key={p}><Inline text={p} /></li>)}</ul>
                        </div>
                    )}
                </header>

                <ArticleBody blocks={a.blocks} />

                <AccountCta audience={a.audience} />

                {related.length > 0 && (
                    <section aria-labelledby="related" className="mt-12 pt-6 border-t border-line">
                        <h2 id="related" className="text-[17px] font-bold text-heading">Related articles</h2>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                            {related.map((r) => (
                                <li key={articleHref(r)}><Link href={articleHref(r)} className="block h-full rounded-xl ring-1 ring-line px-4 py-3 hover:ring-teal">
                                    <span className="block text-[14.5px] font-medium text-heading">{r.title}</span>
                                    <span className="block mt-0.5 text-[12.5px] text-ink-3">{categoryById(r.category)?.title}</span>
                                </Link></li>
                            ))}
                        </ul>
                    </section>
                )}

                <div className="mt-8 rounded-xl ring-1 ring-line bg-surface-2/60 px-5 py-4 flex flex-wrap items-center gap-3">
                    <p className="flex-1 min-w-[14rem] text-[14px] text-ink-2">Still stuck? The Support Assistant can check your own {a.audience === 'supplier' ? 'products, stock and orders' : 'orders and cart'}.</p>
                    <Link href={supportHref} className="h-9 px-3.5 rounded-lg bg-heading text-white text-[13.5px] font-semibold inline-flex items-center gap-1.5"><MessageSquare size={15} /> Open support</Link>
                </div>

                <nav aria-label="More in this topic" className="mt-8 grid gap-3 sm:grid-cols-2">
                    {prev ? <Link href={articleHref(prev)} className="rounded-xl ring-1 ring-line px-4 py-3 hover:ring-teal"><span className="flex items-center gap-1 text-[12px] text-ink-3"><ArrowLeft size={13} /> Previous</span><span className="block text-[14.5px] font-medium text-heading">{prev.title}</span></Link> : <span />}
                    {next && <Link href={articleHref(next)} className="rounded-xl ring-1 ring-line px-4 py-3 hover:ring-teal text-end"><span className="flex items-center justify-end gap-1 text-[12px] text-ink-3">Next <ArrowRight size={13} /></span><span className="block text-[14.5px] font-medium text-heading">{next.title}</span></Link>}
                </nav>
            </article>
        </HelpShell>
    );
}
