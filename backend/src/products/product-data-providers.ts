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

export interface ProviderPhoto {
    url: string; previewUrl: string; kind: 'front' | 'packaging' | 'other' | 'back'; language: string | null;
    /** Pixel size of the full-size file, when the record says (Open*Facts `images` metadata). */
    width?: number; height?: number;
    /** The uploaded photo this selection was cut from (Open*Facts `imgid`): two selections of one upload are one photo. */
    imgid?: string;
}
export interface ProviderRecord { code: string; name: string | null; brands: string | null; quantity: string | null; categories: string[]; photos: ProviderPhoto[]; /** Every other upload the record holds. */ uploads?: ProviderPhoto[]; pageUrl: string }
export type ProviderResult =
    | { status: 'found'; record: ProviderRecord }
    | { status: 'not_found' }
    /** The shared Open*Facts index knows the code, but in another of the databases (e.g. a soft drink asked of Open Beauty Facts). */
    | { status: 'elsewhere'; productType: string }
    | { status: 'unavailable'; reason: 'rate_limited' | 'error' | 'timeout' };

export interface ProductDataProvider {
    id: string;
    label: string;
    /** Open*Facts `product_type` this database holds (food, beauty, product, petfood), for following "elsewhere" answers. */
    productType?: string;
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
    /** Records found by product name, best first. Only for a person's explicit search: never the proof of identity. */
    search?(query: string): Promise<SearchHit[]>;
}
export interface SearchHit { code: string; name: string | null; brands: string | null; quantity: string | null }

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

    /**
     * `timeoutMs` starts when the request is actually sent, not when it is queued: with many
     * lookups waiting their turn (a bulk import), a timeout set at queue time would expire
     * before the request even left and every lookup would look like an outage.
     */
    fetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
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
                const { timeoutMs, ...rest } = init;
                const res = await this.fetcher(url, timeoutMs ? { ...rest, signal: AbortSignal.timeout(timeoutMs) } : rest);
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
// `images` carries the pixel size of each selected photo, so the largest usable one can be preferred.
const SEARCH_HITS = 20;
const FIELDS = 'code,product_name,product_name_en,brands,quantity,categories_tags,selected_images,image_front_url,image_packaging_url,images';

/** Open Food Facts family: same API (v3), same licence, separate databases. */
function openFactsProvider(o: { id: string; label: string; site: string; productType: string; covers: ProductKind[]; verifies: ProductKind[]; searchSite?: string }, queue: HostQueue): ProductDataProvider {
    const host = new URL(o.site).host.replace(/^world\./, '');
    return {
        id: o.id, label: o.label, productType: o.productType,
        license: { images: 'CC BY-SA 3.0', imagesUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', data: 'ODbL 1.0', attribution: `${o.label} contributors` },
        imageHosts: [`images.${host}`, `static.${host}`],
        covers: (k) => o.covers.includes(k),
        canVerify: (k) => o.verifies.includes(k),
        ...(o.searchSite ? { search: async (query: string) => {
            const res = await queue.fetch(`${o.searchSite}/search?q=${encodeURIComponent(query)}&page_size=${SEARCH_HITS}&fields=code,product_name,brands,quantity,image_front_url`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, timeoutMs: 20_000 });
            if (!res.ok) return [];
            const j: any = await res.json().catch(() => null);
            const hits: any[] = Array.isArray(j?.hits) ? j.hits : [];
            return hits.filter((h) => /^\d{8,14}$/.test(String(h?.code || '')) && h?.image_front_url).map((h): SearchHit => ({
                code: String(h.code), name: h.product_name || null, brands: Array.isArray(h.brands) ? h.brands.filter(Boolean).join(', ') || null : h.brands || null,
                quantity: typeof h.quantity === 'string' && h.quantity.trim() ? h.quantity.trim() : null,
            }));
        } } : {}),
        async lookup(barcode) {
            let res: Response;
            try {
                res = await queue.fetch(`${o.site}/api/v3/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, timeoutMs: 20_000 });
            } catch (e: any) { return { status: 'unavailable', reason: e?.name === 'TimeoutError' ? 'timeout' : 'error' }; }
            if (res.status === 429 || res.status === 503) return { status: 'unavailable', reason: 'rate_limited' };
            if (res.status !== 404 && !res.ok) return { status: 'unavailable', reason: 'error' };
            const j: any = await res.json().catch(() => null);
            // v3 answers 404 both for "no such product" and for "it is in another of the databases" (one shared index).
            const other = openFactsElsewhere(j);
            if (other && other !== o.productType) return { status: 'elsewhere', productType: other };
            if (res.status === 404) return { status: 'not_found' };
            const p = j?.product;
            if (!p || j?.status === 'failure') return { status: 'not_found' };
            const photos: ProviderPhoto[] = [];
            const seen = new Set<string>();
            const add = (u: unknown, kind: ProviderPhoto['kind'], language: string | null) => {
                if (typeof u !== 'string' || !/^https:\/\//.test(u)) return;
                const key = u.replace(/\.(\d+)\.(100|200|400|full)\./, '.$1.');
                const size = photoSize(p.images, u);
                // The same upload selected as the front for several languages is one photo, offered once.
                const same = size.imgid ? `img:${size.imgid}` : null;
                if (seen.has(key) || (same && seen.has(same))) return;
                seen.add(key);
                if (same) seen.add(same);
                photos.push({ url: u.replace(/\.(\d+)\.(100|200|400)\.(jpg|png)$/i, '.$1.full.$3'), previewUrl: u, kind, language, ...size });
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
                    categories: Array.isArray(p.categories_tags) ? p.categories_tags.slice(0, 20) : [], photos, uploads: uploadedPhotos(p.images, `https://images.${host}`, String(p.code || barcode)), pageUrl: `${o.site}/product/${barcode}`,
                },
            };
        },
    };
}

export function buildProviders(queue: HostQueue): ProductDataProvider[] {
    return [
        // Food and drink: the main use. Verifies food only.
        openFactsProvider({ id: 'openfoodfacts', label: 'Open Food Facts', site: 'https://world.openfoodfacts.org', searchSite: 'https://search.openfoodfacts.org', productType: 'food', covers: ['food', 'other'], verifies: ['food', 'other'] }, queue),
        // Cosmetics / cleaning / pet food: asked, but never the only proof — always "check this photo".
        openFactsProvider({ id: 'openbeautyfacts', label: 'Open Beauty Facts', site: 'https://world.openbeautyfacts.org', productType: 'beauty', covers: ['beauty'], verifies: [] }, queue),
        openFactsProvider({ id: 'openproductsfacts', label: 'Open Products Facts', site: 'https://world.openproductsfacts.org', productType: 'product', covers: ['household'], verifies: [] }, queue),
        openFactsProvider({ id: 'openpetfoodfacts', label: 'Open Pet Food Facts', site: 'https://world.openpetfoodfacts.org', productType: 'petfood', covers: ['pet'], verifies: ['pet'] }, queue),
    ];
}

/** `product_found_with_a_different_product_type` → the product_type that holds it (food, beauty, product, petfood). */
export function openFactsElsewhere(j: any): string | null {
    if (j?.result?.id !== 'product_found_with_a_different_product_type') return null;
    const e = (Array.isArray(j?.errors) ? j.errors : []).find((x: any) => x?.field?.id === 'product_type');
    const v = String(e?.field?.value || '').trim();
    return /^[a-z]{3,20}$/.test(v) ? v : null;
}

const MAX_UPLOADS = 24;
const NEWEST_UPLOADS = 16;
const MIN_UPLOAD_SIDE = 800;

/**
 * Every upload of a record, not only the ones picked as the front: a cleaner shot
 * often sits in another language or an older revision. An old product has hundreds,
 * so the newest come first with a spread of the older ones. Uploads picked as the
 * ingredients or nutrition photo are marked, since those show the back.
 */
export function uploadedPhotos(images: any, base: string, code: string): ProviderPhoto[] {
    if (!images || typeof images !== 'object') return [];
    const back = new Set(Object.entries<any>(images).filter(([k]) => /^(ingredients|nutrition)_/.test(k)).map(([, v]) => String(v?.imgid)));
    const padded = code.length <= 8 ? code : code.padStart(13, '0');
    const folder = padded.length <= 8 ? padded : padded.replace(/^(.{3})(.{3})(.{3})(.+)$/, '$1/$2/$3/$4');
    const all = Object.entries<any>(images).filter(([k, v]) => /^\d{1,6}$/.test(k) && Math.max(Number(v?.sizes?.full?.w) || 0, Number(v?.sizes?.full?.h) || 0) >= MIN_UPLOAD_SIDE)
        .sort(([a, x], [b, y]) => Number(y?.uploaded_t) - Number(x?.uploaded_t) || Number(b) - Number(a));
    const older = all.slice(NEWEST_UPLOADS);
    const step = Math.max(1, Math.ceil(older.length / (MAX_UPLOADS - NEWEST_UPLOADS)));
    const picked = [...all.slice(0, NEWEST_UPLOADS), ...older.filter((_, i) => i % step === 0)].slice(0, MAX_UPLOADS);
    return picked.map(([id, v]) => ({
        url: `${base}/images/products/${folder}/${id}.jpg`, previewUrl: `${base}/images/products/${folder}/${id}.400.jpg`, kind: back.has(id) ? 'back' as const : 'other' as const,
        language: null, width: Number(v.sizes.full.w), height: Number(v.sizes.full.h), imgid: id,
    }));
}

/** Full-size pixel size of a selected photo (…/front_en.14.400.jpg → images.front_en of the same revision), and the upload it was cut from. */
export function photoSize(images: any, url: string): { width?: number; height?: number; imgid?: string } {
    const m = /\/((?:front|packaging)_[a-z]{2,3})\.(\d+)\.(?:100|200|400|full)\.(?:jpg|png)$/i.exec(url);
    const meta = m && images && typeof images === 'object' ? images[m[1]] : null;
    if (!m || !meta || String(meta.rev) !== m[2]) return {};
    const imgid = meta.imgid !== undefined && meta.imgid !== null && /^\d{1,6}$/.test(String(meta.imgid)) ? String(meta.imgid) : undefined;
    const w = Number(meta?.sizes?.full?.w), h = Number(meta?.sizes?.full?.h);
    return { ...(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { width: w, height: h } : {}), ...(imgid ? { imgid } : {}) };
}

// ─── Barcode forms ────────────────────────────────────────────────────

export const checkDigit = (body: string) => {
    const sum = body.split('').reverse().reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
    return String((10 - (sum % 10)) % 10);
};

/**
 * What to ask the databases for a valid barcode, and what must never be looked up.
 *  - GTIN-14 with indicator 0 is the same item as its last 13 digits: the EAN-13 is asked.
 *  - GTIN-14 with indicator 1–8 identifies a case/pack of an inner item. The code is asked as it is;
 *    if no database has it, the inner item's EAN-13 (digits 2–13 plus a recomputed check digit) is
 *    asked, and anything found that way is only ever "check before using" (it shows the piece).
 *  - Indicator 9 (variable measure), EAN-13 prefix 2 and 02/04, UPC-A number systems 2 and 4 and
 *    EAN-8 prefix 2 are store-internal / random-weight codes: different products in different
 *    shops, so they are never looked up. (EAN-8 prefix 0 is left alone: UPC-E codes look the same.)
 */
export function lookupPlan(raw: string): { code: string; inner?: string; skip?: 'internal_code' | 'variable_measure' } {
    let code = normaliseBarcode(raw);
    if (code.length === 14 && code[0] === '0') code = code.slice(1);
    if (code.length === 14) {
        if (code[0] === '9') return { code, skip: 'variable_measure' };
        const body = code.slice(1, 13);
        return { code, inner: body + checkDigit(body) };
    }
    if (code.length === 8 && code[0] === '2') return { code, skip: 'internal_code' };
    if (code.length === 12 && /^[24]/.test(code)) return { code, skip: 'internal_code' };
    if (code.length === 13 && (/^2/.test(code) || /^0[24]/.test(code))) return { code, skip: 'internal_code' };
    // A UPC is an EAN-13 with a leading zero: every lookup and comparison uses the one form.
    return { code: code.length === 12 ? `0${code}` : code };
}

/** Same product code? UPC-A 012345678905 and EAN-13 0012345678905 are the same GTIN. */
export function sameGtin(a: string, b: string): boolean {
    const x = normaliseBarcode(a).replace(/^0+/, ''), y = normaliseBarcode(b).replace(/^0+/, '');
    return !!x && x === y;
}
