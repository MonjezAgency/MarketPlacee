import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShoppingCart, Store, MessageSquare, Mail } from 'lucide-react';
import { ARTICLES, CATEGORIES, articleHref, articlesIn, findRef } from '@/content/help';
import { HelpSearch } from '@/components/help/HelpUI';
import { CATEGORY_ICONS } from '@/components/help/icons';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

export const metadata: Metadata = {
    title: 'Help Center',
    description: 'Guides for buyers and suppliers on Ali FMCG: accounts, product listings, packaging and pricing, minimum orders, mixed loads, checkout, delivery and troubleshooting.',
    alternates: { canonical: `${SITE_URL}/help` },
    openGraph: { type: 'website', title: 'Ali FMCG Help Center', description: 'Guides for buyers and suppliers on Ali FMCG.', url: `${SITE_URL}/help` },
};

const BUYER_PATH = ['welcome/getting-started-checklist', 'buyers/find-products', 'products-pricing/cases-pallets-trucks', 'orders-cart/minimum-order-quantity', 'buyers/checkout', 'buyers/track-orders'];
const SUPPLIER_PATH = ['suppliers/supplier-hub-overview', 'suppliers/create-a-product', 'suppliers/product-status', 'suppliers/bulk-upload', 'suppliers/update-prices-and-stock', 'suppliers/handle-orders'];

export default function HelpHome() {
    const popular = ARTICLES.filter((a) => a.popular).slice(0, 8);
    const path = (refs: string[]) => refs.map(findRef).filter(Boolean) as typeof ARTICLES;
    return (
        <main className="bg-surface text-start">
            <section className="border-b border-line bg-surface-2/60">
                <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 sm:pt-16 sm:pb-12">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal">Help Center</p>
                    <h1 className="mt-2 text-[30px] sm:text-[38px] font-bold tracking-tight text-heading leading-tight">How can we help?</h1>
                    <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-2">
                        Welcome to Ali FMCG. Whether you’re a buyer comparing wholesale offers or a supplier managing products and inventory, this Help Center guides you through the platform, explains how key workflows work, and helps you resolve common issues.
                    </p>
                    <div className="mt-7 max-w-2xl"><HelpSearch size="lg" /></div>
                    <p className="mt-3 text-[13px] text-ink-3">{ARTICLES.length} articles · <Link href="/help/all" className="font-medium text-teal hover:underline">Browse all</Link></p>
                </div>
            </section>

            <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-12">
                {/* Learning paths */}
                <section aria-labelledby="paths" className="grid gap-5 md:grid-cols-2">
                    <h2 id="paths" className="sr-only">Learning paths</h2>
                    {([['Start here as a buyer', 'Find products, understand packaging and minimums, and place your first order.', ShoppingCart, path(BUYER_PATH)],
                        ['Start here as a supplier', 'Set up listings, keep prices and stock current, and handle incoming orders.', Store, path(SUPPLIER_PATH)]] as const).map(([title, desc, Icon, list]) => (
                        <div key={title} className="rounded-2xl ring-1 ring-line bg-surface p-6">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><Icon size={19} /></span>
                                <div>
                                    <h3 className="text-[17px] font-bold text-heading">{title}</h3>
                                    <p className="text-[13.5px] text-ink-3">{desc}</p>
                                </div>
                            </div>
                            <ol className="mt-5 space-y-1">
                                {list.map((a, i) => (
                                    <li key={articleHref(a)}>
                                        <Link href={articleHref(a)} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                                            <span className="w-6 h-6 rounded-full ring-1 ring-line text-[12px] font-semibold text-ink-3 flex items-center justify-center tabular-nums shrink-0">{i + 1}</span>
                                            <span className="flex-1 text-[14.5px] text-ink group-hover:text-heading">{a.title}</span>
                                            <ArrowRight size={15} className="text-ink-4 group-hover:text-teal" />
                                        </Link>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ))}
                </section>

                {/* Categories */}
                <section aria-labelledby="topics">
                    <h2 id="topics" className="text-[20px] font-bold text-heading">Browse by topic</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {CATEGORIES.map((c) => {
                            const Icon = CATEGORY_ICONS[c.icon];
                            return (
                                <Link key={c.id} href={`/help/${c.id}`} className="group rounded-2xl ring-1 ring-line bg-surface p-5 hover:ring-teal hover:shadow-sm transition">
                                    <span className="w-9 h-9 rounded-lg bg-surface-2 text-heading flex items-center justify-center group-hover:bg-teal-soft group-hover:text-teal transition-colors"><Icon size={17} /></span>
                                    <h3 className="mt-3 text-[15.5px] font-semibold text-heading">{c.title}</h3>
                                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">{c.description}</p>
                                    <p className="mt-3 text-[12.5px] font-medium text-ink-4">{articlesIn(c.id).length} articles</p>
                                </Link>
                            );
                        })}
                    </div>
                </section>

                {/* Popular */}
                {popular.length > 0 && (
                    <section aria-labelledby="popular">
                        <h2 id="popular" className="text-[20px] font-bold text-heading">Popular articles</h2>
                        <ul className="mt-4 grid gap-x-8 sm:grid-cols-2 divide-y divide-line sm:divide-y-0">
                            {popular.map((a) => (
                                <li key={articleHref(a)} className="sm:border-b sm:border-line">
                                    <Link href={articleHref(a)} className="group block py-3">
                                        <span className="block text-[15px] font-medium text-heading group-hover:text-teal">{a.title}</span>
                                        <span className="block text-[13px] text-ink-3 line-clamp-1">{a.summary}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* Still need help */}
                <section className="rounded-2xl ring-1 ring-line bg-surface-2/60 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="flex-1">
                        <h2 className="text-[18px] font-bold text-heading">Still need help?</h2>
                        <p className="mt-1 text-[14px] text-ink-3">Signed-in buyers and suppliers can ask the Support Assistant, which checks your own orders, products and cart. You can also write to us.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link href="/dashboard/customer/support" className="h-10 px-4 rounded-xl bg-heading text-white text-[14px] font-semibold inline-flex items-center gap-2"><MessageSquare size={16} /> Buyer support</Link>
                        <Link href="/supplier/support" className="h-10 px-4 rounded-xl ring-1 ring-line-strong text-[14px] font-semibold text-heading inline-flex items-center gap-2"><MessageSquare size={16} /> Supplier support</Link>
                        <Link href="/contact" className="h-10 px-4 rounded-xl ring-1 ring-line-strong text-[14px] font-semibold text-heading inline-flex items-center gap-2"><Mail size={16} /> Contact us</Link>
                    </div>
                </section>
            </div>
        </main>
    );
}
