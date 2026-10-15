import type { Article, Block, Category, CategoryId } from './types';
import { welcome } from './articles/welcome';
import { account } from './articles/account';
import { buyers } from './articles/buyers';
import { suppliers } from './articles/suppliers';
import { productsPricing } from './articles/products-pricing';
import { ordersCart } from './articles/orders-cart';
import { paymentInvoicing } from './articles/payment-invoicing';
import { delivery } from './articles/delivery';
import { settings } from './articles/settings';
import { troubleshooting } from './articles/troubleshooting';
import { glossary } from './articles/glossary';

export const CATEGORIES: Category[] = [
    { id: 'welcome', title: 'Welcome to Atlantis', description: 'What Atlantis is, how buying and selling work, and where to start.', icon: 'compass' },
    { id: 'account', title: 'Account setup & verification', description: 'Signing up, approval, security, identity verification and your business profile.', icon: 'user' },
    { id: 'buyers', title: 'Buyer guide', description: 'Finding products, comparing offers, ordering and following your orders.', icon: 'cart' },
    { id: 'suppliers', title: 'Supplier guide', description: 'Listing products, prices and stock, bulk files, and handling orders.', icon: 'store' },
    { id: 'products-pricing', title: 'Products, pricing & packaging', description: 'Identifiers, cases, pallets and trucks, prices and minimum quantities.', icon: 'box' },
    { id: 'orders-cart', title: 'Orders, mixed loads & cart', description: 'How the cart checks minimums and stock, mixed loads, and order statuses.', icon: 'layers' },
    { id: 'payment-invoicing', title: 'Payment, tax & invoicing', description: 'What happens to payment, VAT and invoices after you order.', icon: 'card' },
    { id: 'delivery', title: 'Delivery & fulfillment', description: 'Delivery countries, freight quotes, dispatch and tracking.', icon: 'truck' },
    { id: 'settings', title: 'Account, settings & data', description: 'Notifications, currency, sign-in security, sessions and data downloads.', icon: 'settings' },
    { id: 'troubleshooting', title: 'Troubleshooting & common errors', description: 'What an error means and how to fix it.', icon: 'alert' },
    { id: 'glossary', title: 'Glossary & best practices', description: 'The terms used on Atlantis, and how to keep catalog data clean.', icon: 'book' },
];

export const ARTICLES: Article[] = [
    ...welcome, ...account, ...buyers, ...suppliers, ...productsPricing, ...ordersCart,
    ...paymentInvoicing, ...delivery, ...settings, ...troubleshooting, ...glossary,
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
export const articlesIn = (id: CategoryId) => ARTICLES.filter((a) => a.category === id);
export const getArticle = (category: string, slug: string) => ARTICLES.find((a) => a.category === category && a.slug === slug);
export const articleHref = (a: Pick<Article, 'category' | 'slug'>) => `/help/${a.category}/${a.slug}`;
export const findRef = (ref: string) => { const [c, s] = ref.split('/'); return getArticle(c, s); };

/** URL-safe id for a heading (used by the table of contents). */
export const headingId = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const strip = (t: string) => t.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
export function blockText(b: Block): string {
    if ('h2' in b) return b.h2;
    if ('h3' in b) return b.h3;
    if ('p' in b) return b.p;
    if ('steps' in b) return b.steps.join(' ');
    if ('list' in b) return b.list.join(' ');
    if ('table' in b) return [...b.table.head, ...b.table.rows.flat()].join(' ');
    if ('note' in b) return b.note;
    if ('example' in b) return [b.example.title, ...b.example.body].join(' ');
    if ('faq' in b) return b.faq.map((f) => `${f.q} ${f.a}`).join(' ');
    return '';
}
export const articleText = (a: Article) => strip([a.title, a.summary, ...(a.keywords || []), ...a.blocks.map(blockText)].join(' '));

export interface SearchHit { article: Article; score: number; snippet: string }

/**
 * Local full-text search over every article: title and keywords weigh most,
 * then summary and headings, then body. All query words must appear.
 */
export function searchArticles(query: string, limit = 20): SearchHit[] {
    const words = query.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
    if (!words.length) return [];
    const hits: SearchHit[] = [];
    for (const a of ARTICLES) {
        const title = a.title.toLowerCase(), kw = (a.keywords || []).join(' ').toLowerCase(), sum = a.summary.toLowerCase();
        const heads = a.blocks.map((b) => ('h2' in b ? b.h2 : 'h3' in b ? b.h3 : '')).join(' ').toLowerCase();
        const body = articleText(a).toLowerCase();
        if (!words.every((w) => body.includes(w))) continue;
        let score = 0;
        for (const w of words) score += (title.includes(w) ? 10 : 0) + (kw.includes(w) ? 6 : 0) + (sum.includes(w) ? 3 : 0) + (heads.includes(w) ? 3 : 0) + Math.min(5, body.split(w).length - 1);
        if (title.includes(words.join(' '))) score += 15;
        const plain = articleText(a);
        const at = plain.toLowerCase().indexOf(words[0]);
        const start = Math.max(0, at - 60);
        hits.push({ article: a, score, snippet: (start > 0 ? '…' : '') + plain.slice(start, start + 170).trim() + '…' });
    }
    return hits.sort((x, y) => y.score - x.score).slice(0, limit);
}
