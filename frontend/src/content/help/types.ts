/**
 * Help Center content schema. Articles are plain data (no JSX) so new ones
 * can be added without touching the layout. Inline text supports **bold**,
 * `code` and [links](/internal/path) — internal links only.
 */
export type Audience = 'buyer' | 'supplier' | 'both';

export type Block =
    | { h2: string }
    | { h3: string }
    | { p: string }
    | { steps: string[] }
    | { list: string[] }
    | { table: { head: string[]; rows: string[][] } }
    | { note: string; tone?: 'info' | 'warning' | 'tip' }
    | { example: { title: string; body: string[] } }
    | { faq: { q: string; a: string }[] };

export interface Article {
    slug: string;
    category: CategoryId;
    title: string;
    /** One or two sentences: what the reader will learn. */
    summary: string;
    audience: Audience;
    prerequisites?: string[];
    blocks: Block[];
    /** "category/slug" of related articles. */
    related?: string[];
    keywords?: string[];
    popular?: boolean;
}

export type CategoryId =
    | 'welcome' | 'account' | 'buyers' | 'suppliers' | 'products-pricing' | 'orders-cart'
    | 'payment-invoicing' | 'delivery' | 'settings' | 'troubleshooting' | 'glossary';

export interface Category { id: CategoryId; title: string; description: string; icon: string }
