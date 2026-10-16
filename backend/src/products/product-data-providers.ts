/**
 * Read-only product-data sources keyed by barcode, used to find a photo for
 * an imported product that has none. Supplier data is never sent anywhere
 * except the barcode in the lookup URL, and nothing is ever written back.
 *
 * Open Food Facts and its sister databases (Beauty, Products, Pet Food) are
 * community-maintained. Terms (https://world.openfoodfacts.org/terms-of-use,
 * API docs https://openfoodfacts.github.io/openfoodfacts-server/api/):
 *   - database: ODbL 1.0; individual contents: Database Contents License 1.0
 *   - product images: CC BY-SA 3.0 — attribution and ShareAlike apply, and
 *     images may show third-party trademarks and packaging artwork
 *   - product reads are limited to 15 requests/minute per IP (search 10/min);
 *     exceeding it can get the IP banned; global overload returns HTTP 503
 *   - a custom User-Agent "AppName/Version (ContactEmail)" is required
 * Add another approved source by implementing ProductDataProvider and listing
 * it in PROVIDERS; nothing else changes.
 */
import { Logger } from '@nestjs/common';
import { normaliseBarcode } from './catalog-rules';

export type ProductKind = 'food' | 'beauty' | 'household' | 'pet' | 'other';

export interface ProviderPhoto { url: string; previewUrl: string; kind: 'front' | 'packaging' | 'other'; language: string | null }
export interface ProviderRecord { code: string; name: string | null; brands: string | null; quantity: string | null; categories: string[]; photos: ProviderPhoto[]; pageUrl: string }
export type ProviderResult =
    | { status: 'found'; record: ProviderRecord }
    | { status: 'not_found' }
    | { status: 'unavailable'; reason: 'rate_limited' | 'error' | 'timeout' };

export interface ProductDataProvider {
    id: string;
    label: string;
    /** Shown with every candidate and stored with every accepted photo. */
    license: { images: string; imagesUrl: string; data: string; attribution: string };
    /** Hosts its images are served from (only these can be downloaded on acceptance). */
    imageHosts: string[];
    /** Which kinds of products to ask this source about. */
    covers(kind: ProductKind): boolean;
    /**
     * Whether a match from this source alone may be called verified for this
     * kind. False means it is always shown as "check this photo" — e.g. Open
     * Food Facts must not be the only source for cleaning or personal-care products.
     */
    canVerify(kind: ProductKind): boolean;
    lookup(barcode: string): Promise<ProviderResult>;
}

const CATEGORY_KIND: Record<string, ProductKind> = {
    'Beverages': 'food', 'Soft Drinks': 'food', 'Energy Drinks': 'food', 'Coffee & Tea': 'food', 'Snacks & Biscuits': 'food', 'Chocolates & Sweets': 'food',
    'Confectionery': 'food', 'Dairy & Eggs': 'food', 'Frozen Food': 'food', 'Bakery & Bread': 'food', 'Pantry & Grains': 'food', 'Canned & Jarred Food': 'food',
    'Spices & Condiments': 'food', 'Meat & Poultry': 'food', 'Seafood': 'food',
    'Personal Care': 'beauty', 'Beauty & Makeup': 'beauty', 'Fragrances & Perfumes': 'beauty', 'Hair Care': 'beauty', 'Skincare': 'beauty', 'Oral Care': 'beauty', 'Baby Care': 'beauty', 'Health & Wellness': 'beauty',
    'Household & Cleaning': 'household', 'Laundry & Detergents': 'household', 'Paper & Plastic': 'household', 'Home & Kitchen': 'household',
    'Pet Care': 'pet',
};
export const kindOf = (category?: string | null): ProductKind => CATEGORY_KIND[String(category || '').trim()] || 'other';

// ─── Rate-limited fetch, shared by every caller in this process ──────

/**
 * One queue per host: at most `perMinute` requests, one at a time, with a
 * pause after HTTP 429/503 (Retry-After honoured). Every lookup — bulk import
 * enrichment and the one-product photo search — goes through it, so together
 * they stay under the provider's limit.
 */
export class HostQueue {
    private readonly logger = new Logger('ProductDataQueue');
    private chains = new Map<string, Promise<void>>();
    private nextAt = new Map<string, number>();
    private pausedUntil = new Map<string, number>();
    constructor(private readonly perMinute = 12, private readonly fetcher: typeof fetch = fetch, private readonly now = () => Date.now(), private readonly sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {}

    /** Seconds until a request queued now would start, roughly. */
    waitSeconds(host: string, queued = 0): number {
        const gap = 60_000 / this.perMinute;
        const start = Math.max(this.now(), this.nextAt.get(host) || 0, this.pausedUntil.get(host) || 0);
        return Math.ceil((start - this.now() + queued * gap) / 1000);
    }

    fetch(url: string, init: RequestInit = {}): Promise<Response> {
        const host = new URL(url).host;
        const gap = 60_000 / this.perMinute;
        const prev = this.chains.get(host) || Promise.resolve();
        let release!: () => void;
        const mine = new Promise<void>((r) => { release = r; });
        this.chains.set(host, prev.then(() => mine));
        return prev.then(async () => {
            try {
                const wait = Math.max(this.nextAt.get(host) || 0, this.pausedUntil.get(host) || 0) - this.now();
                if (wait > 0) await this.sleep(wait);
                this.nextAt.set(host, this.now() + gap);
                const res = await this.fetcher(url, init);
                if (res.status === 429 || res.status === 503) {
                    const ra = Number(res.headers.get('retry-after'));
                    const pause = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 600) * 1000 : 60_000;
                    this.pausedUntil.set(host, this.now() + pause);
                    this.logger.warn(`${host} answered ${res.status}; pausing lookups for ${Math.round(pause / 1000)} s`);
                }
                return res;
            } finally { release(); }
        });
    }
}

const CONTACT = process.env.PRODUCT_DATA_CONTACT || 'info@atlantisfmcg.com';
export const USER_AGENT = `AtlantisFMCG/1.0 (${CONTACT})`;
const FIELDS = 'code,product_name,product_name_en,brands,quantity,categories_tags,selected_images,image_front_url,image_packaging_url';

/** Open Food Facts family: same API (v3), same licence, separate databases. */
function openFactsProvider(o: { id: string; label: string; site: string; covers: ProductKind[]; verifies: ProductKind[] }, queue: HostQueue): ProductDataProvider {
    const host = new URL(o.site).host.replace(/^world\./, '');
    return {
        id: o.id, label: o.label,
        license: { images: 'CC BY-SA 3.0', imagesUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', data: 'ODbL 1.0', attribution: `${o.label} contributors` },
        imageHosts: [`images.${host}`, `static.${host}`],
        covers: (k) => o.covers.includes(k),
        canVerify: (k) => o.verifies.includes(k),
        async lookup(barcode) {
            let res: Response;
            try {
                res = await queue.fetch(`${o.site}/api/v3/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
            } catch (e: any) { return { status: 'unavailable', reason: e?.name === 'TimeoutError' ? 'timeout' : 'error' }; }
            if (res.status === 429 || res.status === 503) return { status: 'unavailable', reason: 'rate_limited' };
            if (res.status === 404) return { status: 'not_found' };
            if (!res.ok) return { status: 'unavailable', reason: 'error' };
            const j: any = await res.json().catch(() => null);
            const p = j?.product;
            if (!p || j?.status === 'failure') return { status: 'not_found' };
            const photos: ProviderPhoto[] = [];
            const seen = new Set<string>();
            const add = (u: unknown, kind: ProviderPhoto['kind'], language: string | null) => {
                if (typeof u !== 'string' || !/^https:\/\//.test(u)) return;
                const key = u.replace(/\.(\d+)\.(100|200|400|full)\./, '.$1.');
                if (seen.has(key)) return;
                seen.add(key);
                photos.push({ url: u.replace(/\.(\d+)\.(100|200|400)\.(jpg|png)$/i, '.$1.full.$3'), previewUrl: u, kind, language });
            };
            const sel = p.selected_images || {};
            for (const [lang, u] of Object.entries(sel.front?.display || {})) add(u, 'front', lang);
            add(p.image_front_url, 'front', null);
            for (const [lang, u] of Object.entries(sel.packaging?.display || {})) add(u, 'packaging', lang);
            add(p.image_packaging_url, 'packaging', null);
            return {
                status: 'found',
                record: {
                    code: String(p.code || j.code || ''), name: p.product_name_en || p.product_name || null, brands: p.brands || null,
                    quantity: typeof p.quantity === 'string' && p.quantity.trim() ? p.quantity.trim() : null,
                    categories: Array.isArray(p.categories_tags) ? p.categories_tags.slice(0, 20) : [], photos, pageUrl: `${o.site}/product/${barcode}`,
                },
            };
        },
    };
}

export function buildProviders(queue: HostQueue): ProductDataProvider[] {
    return [
        // Food and drink: the main use. Verifies food only.
        openFactsProvider({ id: 'openfoodfacts', label: 'Open Food Facts', site: 'https://world.openfoodfacts.org', covers: ['food', 'other'], verifies: ['food', 'other'] }, queue),
        // Cosmetics / cleaning / pet food: asked, but never the only proof — always "check this photo".
        openFactsProvider({ id: 'openbeautyfacts', label: 'Open Beauty Facts', site: 'https://world.openbeautyfacts.org', covers: ['beauty'], verifies: [] }, queue),
        openFactsProvider({ id: 'openproductsfacts', label: 'Open Products Facts', site: 'https://world.openproductsfacts.org', covers: ['household'], verifies: [] }, queue),
        openFactsProvider({ id: 'openpetfoodfacts', label: 'Open Pet Food Facts', site: 'https://world.openpetfoodfacts.org', covers: ['pet'], verifies: ['pet'] }, queue),
    ];
}

/** Same product code? UPC-A 012345678905 and EAN-13 0012345678905 are the same GTIN. */
export function sameGtin(a: string, b: string): boolean {
    const x = normaliseBarcode(a).replace(/^0+/, ''), y = normaliseBarcode(b).replace(/^0+/, '');
    return !!x && x === y;
}
