'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X, ChevronDown, FileText } from 'lucide-react';
import { CATEGORY_ICONS } from '@/components/help/icons';
import { ARTICLES, CATEGORIES, articleHref, articlesIn, searchArticles, categoryById } from '@/content/help';
import { cn } from '@/lib/utils';

/** Instant local search with a results dropdown; Enter opens the full results page. */
export function HelpSearch({ size = 'md', autoFocus }: { size?: 'md' | 'lg'; autoFocus?: boolean }) {
    const router = useRouter();
    const [q, setQ] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [active, setActive] = React.useState(0);
    const hits = React.useMemo(() => (q.trim().length >= 2 ? searchArticles(q, 7) : []), [q]);
    const boxRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);
    const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };
    return (
        <div ref={boxRef} className="relative w-full" role="search">
            <label htmlFor={`help-search-${size}`} className="sr-only">Search the Help Center</label>
            <Search size={size === 'lg' ? 19 : 16} className={cn('absolute top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none', size === 'lg' ? 'start-4' : 'start-3')} />
            <input id={`help-search-${size}`} value={q} autoFocus={autoFocus} autoComplete="off"
                onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                    else if (e.key === 'Enter') { e.preventDefault(); if (hits[active] && open) go(articleHref(hits[active].article)); else if (q.trim()) go(`/help/search?q=${encodeURIComponent(q.trim())}`); }
                    else if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="Search articles — e.g. minimum order, bulk upload, EAN"
                role="combobox" aria-expanded={open && q.trim().length >= 2} aria-controls={`help-results-${size}`} aria-autocomplete="list"
                className={cn('w-full rounded-xl bg-surface ring-1 ring-line-strong text-ink placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-teal transition-shadow',
                    size === 'lg' ? 'h-14 ps-12 pe-12 text-[16px] shadow-sm' : 'h-10 ps-9 pe-9 text-[14px]')} />
            {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className={cn('absolute top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink', size === 'lg' ? 'end-4' : 'end-3')}><X size={16} /></button>}
            {open && q.trim().length >= 2 && (
                <div id={`help-results-${size}`} role="listbox" className="absolute z-50 mt-2 w-full rounded-xl bg-surface ring-1 ring-line shadow-xl overflow-hidden text-start">
                    {hits.length === 0 ? (
                        <p className="px-4 py-3 text-[13.5px] text-ink-3">No articles match “{q.trim()}”. Try a shorter term, or <Link href="/help/all" className="text-teal font-medium" onClick={() => setOpen(false)}>browse all articles</Link>.</p>
                    ) : (
                        <ul>
                            {hits.map((h, i) => (
                                <li key={articleHref(h.article)} role="option" aria-selected={i === active}>
                                    <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(articleHref(h.article))} className={cn('w-full text-start px-4 py-2.5 flex gap-3', i === active && 'bg-surface-2')}>
                                        <FileText size={15} className="mt-0.5 shrink-0 text-ink-4" />
                                        <span className="min-w-0">
                                            <span className="block text-[14px] font-medium text-heading truncate">{h.article.title}</span>
                                            <span className="block text-[12px] text-ink-3 truncate">{categoryById(h.article.category)?.title}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                            <li><button type="button" onClick={() => go(`/help/search?q=${encodeURIComponent(q.trim())}`)} className="w-full text-start px-4 py-2.5 border-t border-line text-[13px] font-medium text-teal">See all results for “{q.trim()}”</button></li>
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

/** Category navigation: full list on desktop, a compact "Browse topics" disclosure on mobile. */
export function HelpSidebar() {
    const path = usePathname();
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const currentCat = path.split('/')[2];
    const [expanded, setExpanded] = React.useState<string | null>(currentCat || null);
    React.useEffect(() => { setExpanded(currentCat || null); setMobileOpen(false); }, [path, currentCat]);
    const nav = (
        <nav aria-label="Help topics" className="space-y-0.5 text-[14px]">
            <Link href="/help" className={cn('block px-3 py-1.5 rounded-lg', path === '/help' ? 'bg-teal-soft text-heading font-semibold' : 'text-ink-2 hover:bg-surface-2')}>Help Center home</Link>
            <Link href="/help/all" className={cn('block px-3 py-1.5 rounded-lg', path === '/help/all' ? 'bg-teal-soft text-heading font-semibold' : 'text-ink-2 hover:bg-surface-2')}>All articles</Link>
            <div className="pt-3 pb-1 px-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">Topics</div>
            {CATEGORIES.map((c) => {
                const open = expanded === c.id;
                return (
                    <div key={c.id}>
                        <button type="button" onClick={() => setExpanded(open ? null : c.id)} aria-expanded={open}
                            className={cn('w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-start', currentCat === c.id ? 'text-heading font-semibold' : 'text-ink-2 hover:bg-surface-2')}>
                            <span className="truncate">{c.title}</span>
                            <ChevronDown size={14} className={cn('shrink-0 text-ink-4 transition-transform', open && 'rotate-180')} />
                        </button>
                        {open && (
                            <ul className="ms-3 my-1 border-s border-line">
                                <li><Link href={`/help/${c.id}`} className={cn('block ps-3 py-1 text-[13.5px]', path === `/help/${c.id}` ? 'text-teal font-medium' : 'text-ink-3 hover:text-ink')}>Overview</Link></li>
                                {articlesIn(c.id).map((a) => {
                                    const href = articleHref(a);
                                    return <li key={href}><Link href={href} aria-current={path === href ? 'page' : undefined} className={cn('block ps-3 py-1 text-[13.5px] leading-snug', path === href ? 'text-teal font-medium border-s-2 border-teal -ms-px' : 'text-ink-3 hover:text-ink')}>{a.title}</Link></li>;
                                })}
                            </ul>
                        )}
                    </div>
                );
            })}
        </nav>
    );
    return (
        <>
            <div className="lg:hidden mb-4">
                <button type="button" onClick={() => setMobileOpen((v) => !v)} aria-expanded={mobileOpen} className="w-full h-10 px-3.5 rounded-xl ring-1 ring-line flex items-center justify-between text-[14px] font-medium text-heading">
                    Browse topics <ChevronDown size={16} className={cn('transition-transform', mobileOpen && 'rotate-180')} />
                </button>
                {mobileOpen && <div className="mt-2 rounded-xl ring-1 ring-line p-2 max-h-[60vh] overflow-y-auto">{nav}</div>}
            </div>
            <aside className="hidden lg:block sticky top-24 self-start max-h-[calc(100dvh-7rem)] overflow-y-auto pe-2">{nav}</aside>
        </>
    );
}

/** "On this page" with the current section highlighted. */
export function TableOfContents({ items }: { items: { id: string; text: string }[] }) {
    const [active, setActive] = React.useState(items[0]?.id);
    React.useEffect(() => {
        const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
        const io = new IntersectionObserver((entries) => {
            const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
            if (vis) setActive(vis.target.id);
        }, { rootMargin: '-100px 0px -65% 0px' });
        els.forEach((e) => io.observe(e));
        return () => io.disconnect();
    }, [items]);
    if (items.length < 2) return null;
    return (
        <nav aria-label="On this page" className="hidden xl:block sticky top-24 self-start text-[13px]">
            <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">On this page</p>
            <ul className="space-y-1.5 border-s border-line">
                {items.map((i) => <li key={i.id}><a href={`#${i.id}`} className={cn('block ps-3 -ms-px border-s-2 leading-snug', active === i.id ? 'border-teal text-heading font-medium' : 'border-transparent text-ink-3 hover:text-ink')}>{i.text}</a></li>)}
            </ul>
        </nav>
    );
}

export const totalArticles = ARTICLES.length;
