import { Injectable, Logger } from '@nestjs/common';
import { lookup as dnsLookup } from 'dns';
import * as https from 'https';
import { BlockList, isIP } from 'net';
import { PrismaService } from '../common/prisma.service';
import { MAX_ANALYSE_BYTES, MIN_PRIMARY_LONG_SIDE, analyseBuffer, decodeImage, isWideBanner, type Visual, type VisualReport } from './image-quality';
import { ImageLookupService, webTitleMatches } from './image-lookup.service';
import type { RankedCandidate } from './import-enrichment.service';
import { USER_AGENT } from './product-data-providers';

/**
 * Last resort for a product no database knows: a Google Images search through
 * SerpApi (key `SERPAPI_API_KEY`, server only; unset = switched off).
 *
 * A person's search reaches this only after the barcode and the name search
 * found nothing. Searching the barcode returns unrelated products, so the
 * product's name is searched; a result is kept only when its page title says
 * this product and its pixels are a whole pack on pure white, so these photos
 * never need Photoroom. They come from other sites with no licence: they are
 * stored here, shown apart, and only used after a person confirms them.
 *
 * Searches are limited to WEB_SEARCH_MONTHLY_LIMIT a month for the whole site.
 * The counter and each barcode's answer live in AppConfig, so a restart or a
 * second click doesn't pay again.
 */
export const WEB_SEARCH_MONTHLY_LIMIT = 200;
const MAX_PHOTOS = 3;
/** Downloads tried per search: most results are shops' lifestyle photos, and a slow site must not hold up the search. */
const MAX_DOWNLOADS = 12;
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 8_000;

export interface WebCandidate extends RankedCandidate { visual: VisualReport }
export type WebSearchResult =
    { status: 'found' | 'no_white' | 'limit_reached' | 'off' | 'failed'; candidates: WebCandidate[] };
interface WebResult { original?: string; link?: string; title?: string; source?: string }

const PRIVATE = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) PRIVATE.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) PRIVATE.addSubnet(net, bits, 'ipv6');
export const isPublicAddress = (ip: string) => { const v = isIP(ip); return !!v && !PRIVATE.check(ip, v === 4 ? 'ipv4' : 'ipv6'); };

/** Resolves a host for the connection itself, so a name can't pass a check and then point somewhere private. */
function publicLookup(host: string, opts: any, done: (...a: any[]) => void) {
    dnsLookup(host, { all: true }, (err, found) => {
        if (err) return done(err);
        if (!found.length || !found.every((a) => isPublicAddress(a.address))) return done(new Error('private address'));
        return opts?.all ? done(null, found) : done(null, found[0].address, found[0].family);
    });
}

/** Download a file from a site found on the web: https to a public address, no redirects, size and time limited. Null when it can't be had. */
export function downloadPublicFile(raw: string, maxBytes = MAX_ANALYSE_BYTES): Promise<Buffer | null> {
    let u: URL;
    try { u = new URL(raw); } catch { return Promise.resolve(null); }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || isIP(u.hostname.replace(/[[\]]/g, ''))) return Promise.resolve(null);
    return new Promise((resolve) => {
        const req = https.get(u, { lookup: publicLookup as any, headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' } }, (res) => {
            if (res.statusCode !== 200 || Number(res.headers['content-length'] || 0) > maxBytes) { req.destroy(); return resolve(null); }
            const parts: Buffer[] = [];
            let size = 0;
            res.on('data', (d: Buffer) => {
                size += d.length;
                if (size > maxBytes) { req.destroy(); return resolve(null); }
                parts.push(d);
            });
            res.on('end', () => resolve(Buffer.concat(parts)));
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        setTimeout(() => { req.destroy(); resolve(null); }, DOWNLOAD_TIMEOUT_MS).unref?.();
    });
}

/** Whole pack on pure white: stricter than the ranking's "white", which also accepts a mostly white border. */
export function isCleanPackshot(v: Visual, buf: Buffer): v is VisualReport {
    if (!v.analysed || v.background !== 'white' || v.cleanCorners < 3 || v.fit === 'cut' || v.coverage < 0.12 || Math.max(v.width, v.height) < MIN_PRIMARY_LONG_SIDE) return false;
    const img = decodeImage(buf);
    return !!img && !isWideBanner(img);
}

@Injectable()
export class WebImageSearchService {
    private readonly logger = new Logger(WebImageSearchService.name);
    /** Tests replace these two. */
    download: (url: string) => Promise<Buffer | null> = (u) => downloadPublicFile(u);
    searchImages: (query: string) => Promise<WebResult[]> = (q) => this.serpApi(q);
    now = () => Date.now();

    constructor(
        private readonly prisma: PrismaService,
        private readonly images: ImageLookupService,
    ) {}

    get enabled() { return !!process.env.SERPAPI_API_KEY; }

    /** Photos of this product on pure white, leaving out `skip` (web image addresses). Never throws. */
    async find(it: { ean: string; name: string; brand?: string; weight?: string }, skip: Set<string>): Promise<WebSearchResult> {
        if (!this.enabled) return { status: 'off', candidates: [] };
        try {
            const query = searchQuery(it);
            const key = `web_photos:${it.ean}`;
            const hit = await this.prisma.appConfig.findUnique({ where: { key } });
            const cached = hit ? JSON.parse(hit.value) as { query: string; at: number; candidates: WebCandidate[] } : null;
            let candidates: WebCandidate[];
            if (cached && cached.query === query && this.now() - cached.at < CACHE_MS) candidates = cached.candidates;
            else {
                if (!(await this.reserve())) return { status: 'limit_reached', candidates: [] };
                candidates = await this.collect(it, await this.searchImages(query));
                const value = JSON.stringify({ query, at: this.now(), candidates });
                await this.prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
            }
            const left = candidates.filter((c) => !skip.has(c.webImage!));
            return left.length ? { status: 'found', candidates: left } : { status: 'no_white', candidates: [] };
        } catch (e: any) {
            // The search address holds the key, so only the error's name is logged.
            this.logger.warn(`[web-photos] ${it.ean}: search failed (${e?.name || 'error'})`);
            return { status: 'failed', candidates: [] };
        }
    }

    private async collect(it: { name: string; brand?: string; weight?: string }, results: WebResult[]): Promise<WebCandidate[]> {
        const out: WebCandidate[] = [];
        const matching = results.filter((r) => r.original && webTitleMatches(it, String(r.title || ''))).slice(0, MAX_DOWNLOADS);
        for (const r of matching) {
            if (out.length >= MAX_PHOTOS) break;
            const buf = await this.download(r.original!);
            if (!buf) continue;
            const visual = analyseBuffer(buf);
            if (!isCleanPackshot(visual, buf)) continue;
            const site = String(r.source || '').trim() || new URL(r.original!).hostname;
            const { url } = await this.images.store(buf, buf[0] === 0x89 ? 'image/png' : 'image/jpeg');
            out.push({
                url, previewUrl: url, webImage: r.original, source: site, sourceUrl: String(r.link || r.original), license: '', licenseUrl: '', attribution: site,
                kind: 'other', language: null, width: visual.width, height: visual.height, productName: String(r.title || '').slice(0, 200), brand: null, quantity: null,
                confidence: 'needs_confirmation', reasons: ['web_search'], visual,
            } as WebCandidate);
        }
        return out;
    }

    /** Count one search if the month has room, across every server. A failed count refuses, so the limit can't be passed. */
    private async reserve(): Promise<boolean> {
        const key = `web_search_count:${new Date(this.now()).toISOString().slice(0, 7)}`;
        for (let i = 0; i < 6; i++) {
            const row = await this.prisma.appConfig.findUnique({ where: { key } });
            const used = Number(row?.value) || 0;
            if (used >= WEB_SEARCH_MONTHLY_LIMIT) return false;
            if (!row) {
                if (await this.prisma.appConfig.create({ data: { key, value: '1' } }).then(() => true, () => false)) return true;
                continue;
            }
            const r = await this.prisma.appConfig.updateMany({ where: { key, value: row.value }, data: { value: String(used + 1) } });
            if (r.count) return true;
        }
        return false;
    }

    private async serpApi(query: string): Promise<WebResult[]> {
        const url = new URL('https://serpapi.com/search.json');
        Object.entries({ engine: 'google_images', q: query, image_color: 'white', gl: 'uk', hl: 'en', api_key: process.env.SERPAPI_API_KEY! }).forEach(([k, v]) => url.searchParams.set(k, v));
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { images_results?: WebResult[] };
        return Array.isArray(data.images_results) ? data.images_results : [];
    }
}

/** Brand, name and size. The barcode isn't used: Google answers it with unrelated products. */
export function searchQuery(it: { name: string; brand?: string; weight?: string }) {
    const has = (s: string) => it.name.toLowerCase().includes(s.toLowerCase());
    return [it.brand && !has(it.brand) ? it.brand : '', it.name, it.weight && !has(it.weight) ? it.weight : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
