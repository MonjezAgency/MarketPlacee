import type { ProductDataProvider, ProductKind } from '../../product-data-providers';
import type { JsonRequest, SourceHttp } from '../http';
import type { Candidate, IdentityRecord, SourceCall, SourceId } from '../types';

/**
 * The official APIs the pipeline may use. A source switches itself on when its
 * key appears. Nothing here reads a web page: no search engine, retailer or
 * stock site is ever scraped. Unit costs are list prices (sources/README.md);
 * vision reports its own real cost.
 */
export interface LookupAnswer { record: IdentityRecord | null; candidates: Candidate[] }
export interface LookupSource { id: SourceId; keyEnv?: string; enabled(): boolean; lookup(code: string, ean: string, calls: SourceCall[], kind: ProductKind): Promise<LookupAnswer> }
export interface SearchSource { id: SourceId; keyEnv: string; enabled(): boolean; search(query: string, ean: string, language: string, calls: SourceCall[]): Promise<Candidate[]> }

export const UNIT_COST: Partial<Record<SourceId, number>> = { 'ean-search': 19 / 5000, 'ean-db': 9.8 / 5000, 'go-upc': 74.95 / 5000, 'barcode-spider': 39 / 10000, serper: 0.001, brave: 0.005 };

const none: LookupAnswer = { record: null, candidates: [] };
const key = (name: string) => (process.env[name] || '').trim();
const urls = (list: unknown[]) => [...new Set(list.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//.test(u)))];

function lookup(http: SourceHttp, calls: SourceCall[], req: Omit<JsonRequest, 'cost'>) {
    return http.json({ ...req, cost: UNIT_COST[req.source] }, calls);
}

/** Open Food, Beauty and Products Facts through the shared rate-limited providers. CC BY-SA, attribution kept. */
export function openFacts(providers: ProductDataProvider[]): LookupSource {
    return {
        id: 'openfoodfacts',
        enabled: () => true,
        async lookup(code, ean, calls, kind) {
            const order = providers.filter((p) => p.covers(kind));
            const asked = new Set<string>();
            for (let i = 0; i < order.length; i++) {
                const p = order[i];
                if (asked.has(p.id)) continue;
                asked.add(p.id);
                const started = Date.now();
                const r = await p.lookup(code).catch(() => ({ status: 'unavailable' as const, reason: 'error' as const }));
                calls.push({ source: 'openfoodfacts', ean, what: `${p.id} ${code}`, status: r.status === 'found' ? 200 : r.status === 'unavailable' ? 'error' : 404, ms: Date.now() - started, candidates: r.status === 'found' ? r.record.photos.length : 0 });
                if (r.status === 'elsewhere') {
                    const next = providers.find((x) => x.productType === r.productType);
                    if (next && !asked.has(next.id)) order.push(next);
                }
                if (r.status !== 'found') continue;
                const fronts = r.record.photos.filter((ph) => ph.kind === 'front' || ph.kind === 'packaging');
                return {
                    record: { source: 'openfoodfacts', code: r.record.code || code, name: r.record.name, brand: r.record.brands, quantity: r.record.quantity, imageUrls: fronts.slice(0, 3).map((ph) => ph.url) },
                    candidates: fronts.map((ph) => ({
                        url: ph.url, source: 'openfoodfacts', pageUrl: r.record.pageUrl, title: r.record.name ?? undefined, width: ph.width, height: ph.height, foundBy: code,
                        licence: 'cc_by_sa', licenceLabel: p.license.images, attribution: p.license.attribution,
                    })),
                };
            }
            return none;
        },
    };
}

export function eanSearch(http: SourceHttp): LookupSource {
    return {
        id: 'ean-search', keyEnv: 'EAN_SEARCH_TOKEN',
        enabled: () => !!key('EAN_SEARCH_TOKEN'),
        async lookup(code, ean, calls) {
            const base = `https://api.ean-search.org/api?format=json&token=${encodeURIComponent(key('EAN_SEARCH_TOKEN'))}&ean=${code}`;
            const info = await lookup(http, calls, { source: 'ean-search', ean, what: `barcode-lookup ${code}`, url: `${base}&op=barcode-lookup`, cacheKey: `ean-search:lookup:${code}`, gapMs: 300 });
            const row = Array.isArray(info.data) ? info.data[0] : null;
            if (!row?.name || row.error) return none;
            const pic = await lookup(http, calls, { source: 'ean-search', ean, what: `product-image ${code}`, url: `${base}&op=product-image`, cacheKey: `ean-search:image:${code}`, gapMs: 300 });
            const image = (Array.isArray(pic.data) ? pic.data[0]?.image : pic.data?.image) as string | undefined;
            const list = image && /^https?:/.test(image) ? [image] : [];
            return {
                record: { source: 'ean-search', code, name: row.name, brand: null, quantity: null, imageUrls: list },
                candidates: list.map((url) => ({ url, source: 'ean-search', title: row.name, foundBy: code })),
            };
        },
    };
}

export function eanDb(http: SourceHttp): LookupSource {
    return {
        id: 'ean-db', keyEnv: 'EANDB_API_KEY',
        enabled: () => !!key('EANDB_API_KEY'),
        async lookup(code, ean, calls) {
            const r = await lookup(http, calls, { source: 'ean-db', ean, what: `product ${code}`, url: `https://ean-db.com/api/v2/product/${code}`, headers: { Authorization: `Bearer ${key('EANDB_API_KEY')}`, Accept: 'application/json' }, cacheKey: `ean-db:${code}`, gapMs: 200 });
            const p = r.data?.product;
            if (!p) return none;
            const titles = p.titles || {};
            const name = titles.en || Object.values(titles)[0] || null;
            const list = urls((p.images || []).map((i: any) => i?.url));
            const brand = p.manufacturer?.titles?.en || Object.values(p.manufacturer?.titles || {})[0] || null;
            return {
                record: { source: 'ean-db', code: p.barcode || code, name: name as string | null, brand: brand as string | null, quantity: null, imageUrls: list },
                candidates: list.map((url) => ({ url, source: 'ean-db', title: (name as string) ?? undefined, foundBy: code })),
            };
        },
    };
}

/** Free trial endpoint: no key, about 100 calls a day, so it is spaced and a 429 just means no answer today. */
export function upcItemDb(http: SourceHttp): LookupSource {
    return {
        id: 'upcitemdb',
        enabled: () => true,
        async lookup(code, ean, calls) {
            const r = await lookup(http, calls, { source: 'upcitemdb', ean, what: `trial lookup ${code}`, url: `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, cacheKey: `upcitemdb:${code}`, gapMs: 10_500 });
            const it = r.data?.items?.[0];
            if (!it) return none;
            const list = urls(it.images || []);
            return {
                record: { source: 'upcitemdb', code: it.ean || code, name: it.title || null, brand: it.brand || null, quantity: it.size || null, imageUrls: list },
                candidates: list.map((url) => ({ url, source: 'upcitemdb', title: it.title, foundBy: code })),
            };
        },
    };
}

export function goUpc(http: SourceHttp): LookupSource {
    return {
        id: 'go-upc', keyEnv: 'GOUPC_API_KEY',
        enabled: () => !!key('GOUPC_API_KEY'),
        async lookup(code, ean, calls) {
            const r = await lookup(http, calls, { source: 'go-upc', ean, what: `code ${code}`, url: `https://go-upc.com/api/v1/code/${code}`, headers: { Authorization: `Bearer ${key('GOUPC_API_KEY')}` }, cacheKey: `go-upc:${code}`, gapMs: 300 });
            const p = r.data?.product;
            if (!p?.name) return none;
            const list = urls([p.imageUrl]);
            const size = (p.specs || []).find((s: any) => /size|weight|volume/i.test(String(s?.[0] ?? '')));
            return {
                record: { source: 'go-upc', code, name: p.name, brand: p.brand || null, quantity: size?.[1] ?? null, imageUrls: list },
                candidates: list.map((url) => ({ url, source: 'go-upc', title: p.name, foundBy: code })),
            };
        },
    };
}

export function barcodeSpider(http: SourceHttp): LookupSource {
    return {
        id: 'barcode-spider', keyEnv: 'BARCODESPIDER_API_KEY',
        enabled: () => !!key('BARCODESPIDER_API_KEY'),
        async lookup(code, ean, calls) {
            const r = await lookup(http, calls, { source: 'barcode-spider', ean, what: `product ${code}`, url: `https://api.barcodespider.com/v2/products/${code}`, headers: { Authorization: `Bearer ${key('BARCODESPIDER_API_KEY')}` }, cacheKey: `barcode-spider:${code}`, gapMs: 5_200 });
            const p = r.data?.product;
            if (!p?.name) return none;
            const list = urls(p.images || []);
            return {
                record: { source: 'barcode-spider', code, name: p.name, brand: p.brand || null, quantity: p.size || p.weight || null, imageUrls: list },
                candidates: list.map((url) => ({ url, source: 'barcode-spider', title: p.name, foundBy: code })),
            };
        },
    };
}

/** Google Images through Serper's API. Licence unknown: a search result is never proof of rights. */
export function serper(http: SourceHttp): SearchSource {
    return {
        id: 'serper', keyEnv: 'SERPER_API_KEY',
        enabled: () => !!key('SERPER_API_KEY'),
        async search(query, ean, language, calls) {
            const hl = /^[a-z]{2}$/.test(language) ? language : 'en';
            const r = await http.json({
                source: 'serper', ean, what: `images "${query}"`, url: 'https://google.serper.dev/images', method: 'POST',
                headers: { 'X-API-KEY': key('SERPER_API_KEY'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: query, num: 20, hl }), cacheKey: `serper:${hl}:${query}`, gapMs: 120, cost: 0,
            }, calls);
            const last = calls[calls.length - 1];
            // Serper states the credits each answer cost, so the trace records that and not an assumption.
            if (last && last.status === 200) last.cost = Number(r.data?.credits ?? 1) * (UNIT_COST.serper ?? 0);
            return (r.data?.images || []).slice(0, 20).map((i: any): Candidate => ({
                url: i.imageUrl, source: 'serper', pageUrl: i.link, title: i.title, width: i.imageWidth, height: i.imageHeight, query,
            })).filter((c: Candidate) => /^https:\/\//.test(c.url));
        },
    };
}

/** Fallback when Serper gives too little. Brave's terms forbid storing results, so nothing here is cached. */
export function brave(http: SourceHttp): SearchSource {
    return {
        id: 'brave', keyEnv: 'BRAVE_SEARCH_API_KEY',
        enabled: () => !!key('BRAVE_SEARCH_API_KEY'),
        async search(query, ean, language, calls) {
            const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=20&search_lang=${/^[a-z]{2}$/.test(language) ? language : 'en'}`;
            const r = await http.json({ source: 'brave', ean, what: `images "${query}"`, url, headers: { 'X-Subscription-Token': key('BRAVE_SEARCH_API_KEY'), Accept: 'application/json' }, cacheKey: null, gapMs: 1100, cost: UNIT_COST.brave }, calls);
            return (r.data?.results || []).map((i: any): Candidate => ({
                url: i.properties?.url, source: 'brave', pageUrl: i.url, title: i.title, width: i.properties?.width, height: i.properties?.height, query,
            })).filter((c: Candidate) => /^https:\/\//.test(c.url || ''));
        },
    };
}

/** Off unless asked for. Previews are watermarked, so these can only ever be a suggestion for a person to license. */
export function shutterstock(http: SourceHttp): SearchSource {
    return {
        id: 'shutterstock', keyEnv: 'SHUTTERSTOCK_API_TOKEN',
        enabled: () => key('SHUTTERSTOCK_ENABLED') === 'true' && !!key('SHUTTERSTOCK_API_TOKEN'),
        async search(query, ean, _language, calls) {
            const r = await http.json({
                source: 'shutterstock', ean, what: `images "${query}"`, url: `https://api.shutterstock.com/v2/images/search?query=${encodeURIComponent(query)}&per_page=20&view=full`,
                headers: { Authorization: `Bearer ${key('SHUTTERSTOCK_API_TOKEN')}` }, cacheKey: `shutterstock:${query}`, gapMs: 500,
            }, calls);
            return (r.data?.data || []).map((i: any): Candidate => ({
                url: i.assets?.preview_1500?.url || i.assets?.preview?.url, source: 'shutterstock', title: i.description, width: i.assets?.preview_1500?.width, height: i.assets?.preview_1500?.height,
                isEditorial: i.is_editorial === true, licence: i.is_editorial === true ? 'editorial' : 'unknown', query,
            })).filter((c: Candidate) => !!c.url);
        },
    };
}
