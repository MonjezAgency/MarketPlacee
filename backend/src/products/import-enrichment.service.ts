import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { barcodeProblem, normaliseBarcode } from './catalog-rules';
import { compareBrands, compareNames, comparePack } from './image-lookup.service';
import { HostQueue, buildProviders, kindOf, sameGtin, type ProductDataProvider, type ProductKind, type ProviderRecord } from './product-data-providers';

/**
 * Optional photo finding for a supplier import, before anything is imported.
 *
 * For rows with a valid barcode and no photo of their own, each barcode is
 * looked up once (cached), through a queue that keeps every lookup in this
 * process under the provider's rate limit. Results are suggestions shown in
 * the review: a photo is "verified" only when the record has the same
 * barcode, the name or brand agrees and nothing (size, multipack, variant)
 * contradicts the supplier's row. Nothing is stored until the supplier
 * imports with a photo selected — and a lookup failure never blocks an import.
 */

export interface EnrichItem { key: string; ean: string; name?: string; brand?: string; weight?: string; category?: string }
export interface PhotoCandidate {
    url: string; previewUrl: string; source: string; providerId: string; sourceUrl: string;
    license: string; licenseUrl: string; attribution: string;
    productName: string | null; brand: string | null; quantity: string | null;
    barcode: string;
}
export interface EnrichResult {
    key: string;
    status: 'verified' | 'needs_confirmation' | 'not_found' | 'invalid_barcode' | 'unavailable';
    /** Codes the browser translates: why it is verified, or what to check. */
    reasons: string[];
    candidate?: PhotoCandidate;
    /** True when the only source is one that may not verify this kind of product on its own. */
    secondSourceNeeded?: boolean;
}
interface Job { id: string; supplierId: string; createdAt: number; items: EnrichItem[]; results: Map<string, EnrichResult>; done: boolean; failed?: string }

export const MAX_ENRICH_ITEMS = 500;
const JOB_TTL = 60 * 60 * 1000;
const FOUND_TTL = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL = 12 * 60 * 60 * 1000;
const CACHE_MAX = 20_000;

@Injectable()
export class ImportEnrichmentService {
    private readonly logger = new Logger(ImportEnrichmentService.name);
    private readonly jobs = new Map<string, Job>();
    /** barcode|provider → record (or null = not in that database), with when it expires. */
    private readonly cache = new Map<string, { at: number; record: ProviderRecord | null }>();
    readonly queue: HostQueue;
    /** Photo downloads come from the databases' image servers, not the product API: a separate, gentler queue. */
    readonly imageQueue: HostQueue;
    readonly providers: ProductDataProvider[];

    constructor() {
        this.queue = new HostQueue(Number(process.env.PRODUCT_DATA_PER_MINUTE) || 12);
        this.imageQueue = new HostQueue(Number(process.env.PRODUCT_IMAGE_PER_MINUTE) || 120);
        this.providers = buildProviders(this.queue);
    }

    /** Pause before the one retry after a rate limit or an error. */
    retryDelayMs: (rateLimited: boolean) => number = (rateLimited) => (rateLimited ? 5000 : 1500);

    /** For tests: swap the network. */
    useProviders(p: ProductDataProvider[]) { (this as any).providers = p; this.cache.clear(); this.retryDelayMs = () => 0; }

    imageHosts(): Set<string> { return new Set(this.providers.flatMap((p) => p.imageHosts)); }

    start(supplierId: string, raw: EnrichItem[]): { jobId: string; total: number; lookups: number; etaSeconds: number } {
        if (!Array.isArray(raw) || !raw.length) throw new BadRequestException('Nothing to look up.');
        if (raw.length > MAX_ENRICH_ITEMS) throw new BadRequestException(`Look up at most ${MAX_ENRICH_ITEMS} rows at a time.`);
        this.sweep();
        const running = [...this.jobs.values()].filter((j) => j.supplierId === supplierId && !j.done).length;
        if (running >= 2) throw new BadRequestException('A photo search is already running for your import. Wait for it to finish.');
        const items = raw.slice(0, MAX_ENRICH_ITEMS).map((i) => ({
            key: String(i?.key || '').slice(0, 300), ean: normaliseBarcode(i?.ean), name: str(i?.name, 300), brand: str(i?.brand, 120), weight: str(i?.weight, 60), category: str(i?.category, 80),
        })).filter((i) => i.key);
        const job: Job = { id: randomUUID(), supplierId, createdAt: Date.now(), items, results: new Map(), done: false };
        this.jobs.set(job.id, job);
        const lookups = new Set(items.filter((i) => !barcodeProblem(i.ean) && !this.cached(i)).map((i) => i.ean)).size;
        this.run(job).catch((e) => { job.failed = String(e?.message || e); job.done = true; this.logger.error(`[enrich] job ${job.id}: ${job.failed}`); });
        return { jobId: job.id, total: items.length, lookups, etaSeconds: this.queue.waitSeconds('world.openfoodfacts.org', lookups) };
    }

    status(supplierId: string, jobId: string) {
        const job = this.jobs.get(String(jobId));
        if (!job || job.supplierId !== supplierId) throw new NotFoundException('This photo search has expired. Start it again.');
        const left = job.items.length - job.results.size;
        return { jobId: job.id, done: job.done, total: job.items.length, completed: job.results.size, etaSeconds: job.done ? 0 : this.queue.waitSeconds('world.openfoodfacts.org', left), results: [...job.results.values()], failed: job.failed ?? null };
    }

    /** A photo URL may be imported only if a lookup for this barcode returned it. */
    candidateFor(barcode: string, url: string): PhotoCandidate | null {
        const code = normaliseBarcode(barcode);
        for (const p of this.providers) {
            const hit = this.cache.get(`${code}|${p.id}`);
            const ph = hit?.record?.photos.find((x) => x.url === url || x.previewUrl === url);
            if (hit?.record && ph) return this.toCandidate(p, hit.record, ph.url, ph.previewUrl, code);
        }
        return null;
    }

    private cached(i: EnrichItem): boolean {
        const ps = this.providers.filter((p) => p.covers(kindOf(i.category)));
        return ps.every((p) => this.fresh(this.cache.get(`${i.ean}|${p.id}`)));
    }
    private fresh(c?: { at: number; record: ProviderRecord | null }) { return !!c && Date.now() - c.at < (c.record ? FOUND_TTL : MISS_TTL); }

    private async run(job: Job) {
        // One lookup per distinct barcode; rows sharing a barcode share the answer.
        const byCode = new Map<string, EnrichItem[]>();
        for (const it of job.items) {
            if (barcodeProblem(it.ean)) { job.results.set(it.key, { key: it.key, status: 'invalid_barcode', reasons: ['invalid_barcode'] }); continue; }
            (byCode.get(it.ean) || byCode.set(it.ean, []).get(it.ean)!).push(it);
        }
        // Cached barcodes first, so their answers show at once.
        const order = [...byCode.keys()].sort((a, b) => Number(this.cached(byCode.get(b)![0])) - Number(this.cached(byCode.get(a)![0])));
        for (const code of order) {
            if (!this.jobs.has(job.id)) return;   // expired while running
            const rows = byCode.get(code)!;
            const kind = kindOf(rows[0].category);
            const found: { p: ProductDataProvider; record: ProviderRecord }[] = [];
            let unavailable = false;
            for (const p of this.providers.filter((x) => x.covers(kind))) {
                const key = `${code}|${p.id}`;
                const c = this.cache.get(key);
                if (this.fresh(c)) { if (c!.record) found.push({ p, record: c!.record }); continue; }
                let r = await p.lookup(code);
                // One retry after a pause for a rate limit or a passing error.
                if (r.status === 'unavailable') { await new Promise((res) => setTimeout(res, this.retryDelayMs(r.status === 'unavailable' && r.reason === 'rate_limited'))); r = await p.lookup(code); }
                if (r.status === 'unavailable') { unavailable = true; continue; }
                this.put(key, r.status === 'found' ? r.record : null);
                if (r.status === 'found') found.push({ p, record: r.record });
                if (r.status === 'found' && r.record.photos.length) break; // a front photo from the first database that has one is enough
            }
            for (const it of rows) job.results.set(it.key, this.judge(it, kind, found, unavailable));
        }
        job.done = true;
    }

    /** The best photo for a row, and whether it may be called verified. */
    judge(it: EnrichItem, kind: ProductKind, found: { p: ProductDataProvider; record: ProviderRecord }[], unavailable: boolean): EnrichResult {
        const withPhoto = found.filter((f) => f.record.photos.length);
        if (!withPhoto.length) return { key: it.key, status: unavailable ? 'unavailable' : 'not_found', reasons: [unavailable ? 'source_unavailable' : found.length ? 'no_photo' : 'not_in_database'] };
        const { p, record } = withPhoto[0];
        const photo = record.photos.find((x) => x.kind === 'front' && x.language === 'en') || record.photos.find((x) => x.kind === 'front') || record.photos[0];
        const reasons: string[] = [];
        const barcodeMatch = sameGtin(record.code || it.ean, it.ean);
        const nameMatch = compareNames(it.name, record.name);
        const brandMatch = compareBrands(it.brand, record.brands);
        const pack = comparePack({ name: it.name, weight: it.weight }, { name: record.name, quantity: record.quantity });
        if (!barcodeMatch) reasons.push('barcode_differs');
        if (nameMatch === false) reasons.push('name_differs');
        if (brandMatch === false) reasons.push('brand_differs');
        if (pack.match === false) reasons.push('size_differs');
        if (nameMatch === null && brandMatch === null) reasons.push('nothing_to_compare');
        const agrees = nameMatch === true || brandMatch === true;
        // Without a category on the row or the record, we can't tell this is a product the source may verify.
        const kindUnknown = kind === 'other' && !record.categories.length;
        const sourceMayVerify = p.canVerify(kind) && !kindUnknown;
        const clean = barcodeMatch && agrees && nameMatch !== false && brandMatch !== false && pack.match !== false;
        if (clean && !sourceMayVerify) reasons.push(kindUnknown ? 'kind_unknown' : 'second_source_needed');
        if (clean && sourceMayVerify) {
            reasons.push(nameMatch ? 'name_matches' : 'brand_matches');
            if (pack.match) reasons.push('size_matches');
        }
        return {
            key: it.key, status: clean && sourceMayVerify ? 'verified' : 'needs_confirmation', reasons,
            candidate: this.toCandidate(p, record, photo.url, photo.previewUrl, it.ean),
            ...(clean && !sourceMayVerify && !kindUnknown ? { secondSourceNeeded: true } : {}),
        };
    }

    private toCandidate(p: ProductDataProvider, r: ProviderRecord, url: string, previewUrl: string, barcode: string): PhotoCandidate {
        return { url, previewUrl, source: p.label, providerId: p.id, sourceUrl: r.pageUrl, license: p.license.images, licenseUrl: p.license.imagesUrl, attribution: p.license.attribution, productName: r.name, brand: r.brands, quantity: r.quantity, barcode };
    }

    private put(key: string, record: ProviderRecord | null) {
        if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
        this.cache.set(key, { at: Date.now(), record });
    }

    private sweep() { const now = Date.now(); for (const [id, j] of this.jobs) if (now - j.createdAt > JOB_TTL) this.jobs.delete(id); }
}

const str = (v: unknown, max: number) => (v === undefined || v === null ? undefined : String(v).slice(0, max));
