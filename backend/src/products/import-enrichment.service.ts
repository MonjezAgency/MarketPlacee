import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { barcodeProblem, normaliseBarcode } from './catalog-rules';
import { brandInName, compareBrands, compareNames, comparePack, variantConflict } from './image-lookup.service';
import { HostQueue, buildProviders, kindOf, lookupPlan, sameGtin, type ProductDataProvider, type ProductKind, type ProviderPhoto, type ProviderRecord, type ProviderResult } from './product-data-providers';

/**
 * Photo finding by barcode, shared by the import review ("Find photos") and
 * the background search for products saved without a photo
 * (ImageDiscoveryService). One engine, one cache, one rate-limited queue.
 *
 * For each barcode the category-appropriate Open*Facts database is asked
 * first; when the shared index says the product lives in another of the
 * databases, that one is asked next. A photo is "verified" only when the
 * record has the same barcode, the name or brand agrees and nothing (size,
 * multipack, variant) contradicts the supplier's data. Results are only
 * suggestions: nothing is stored on a product until the supplier chooses a
 * photo, and a lookup failure never blocks an import or a save.
 */

export interface EnrichItem { key: string; ean: string; name?: string; brand?: string; weight?: string; category?: string }
export interface PhotoCandidate {
    url: string; previewUrl: string; source: string; providerId: string; sourceUrl: string;
    license: string; licenseUrl: string; attribution: string;
    productName: string | null; brand: string | null; quantity: string | null;
    barcode: string;
    kind?: ProviderPhoto['kind']; language?: string | null; width?: number; height?: number; imgid?: string;
}
/** A candidate photo with how far it can be trusted for this product. */
export interface RankedCandidate extends PhotoCandidate { confidence: 'verified' | 'needs_confirmation'; reasons: string[] }
export interface LookupOutcome {
    status: 'found' | 'not_found' | 'unavailable' | 'invalid_barcode';
    /** Why nothing usable was found (codes the browser translates). Empty when candidates exist. */
    reasons: string[];
    /** Best first. All come from one database record, so they share the confidence. */
    candidates: RankedCandidate[];
    secondSourceNeeded?: boolean;
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
type Found = { p: ProductDataProvider; record: ProviderRecord };
interface Records { found: Found[]; unavailable: boolean; viaInner: boolean; code: string; skip?: string }

export const MAX_ENRICH_ITEMS = 500;
/** Photos offered per product: a few front packshots (languages differ) and one packaging photo. */
export const MAX_CANDIDATES = 4;
/** Below this many pixels on the long side a photo is shown as low resolution and ranked after sharper ones. */
export const MIN_LONG_SIDE = 500;
const JOB_TTL = 60 * 60 * 1000;
const FOUND_TTL = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL = 12 * 60 * 60 * 1000;
const CACHE_MAX = 20_000;

type Cached = { at: number; result: Exclude<ProviderResult, { status: 'unavailable' }> };

@Injectable()
export class ImportEnrichmentService {
    private readonly logger = new Logger(ImportEnrichmentService.name);
    private readonly jobs = new Map<string, Job>();
    /** barcode|provider → that database's answer (found / not found / in another database), with when it was given. */
    private readonly cache = new Map<string, Cached>();
    /** The same barcode asked of the same database at the same time (import + background search) is asked once. */
    private readonly pending = new Map<string, Promise<ProviderResult>>();
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

    /** Rough seconds before `n` more lookups queued now would finish. */
    etaSeconds(n = 1) { return this.queue.waitSeconds('world.openfoodfacts.org', n); }

    // ─── Import review: a background job over many rows ─────────────

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
        return { jobId: job.id, total: items.length, lookups, etaSeconds: this.etaSeconds(lookups) };
    }

    status(supplierId: string, jobId: string) {
        const job = this.jobs.get(String(jobId));
        if (!job || job.supplierId !== supplierId) throw new NotFoundException('This photo search has expired. Start it again.');
        const left = job.items.length - job.results.size;
        return { jobId: job.id, done: job.done, total: job.items.length, completed: job.results.size, etaSeconds: job.done ? 0 : this.etaSeconds(left), results: [...job.results.values()], failed: job.failed ?? null };
    }

    /** A photo URL may be imported only if a lookup for this barcode (or, for a case code, its inner item) returned it. */
    candidateFor(barcode: string, url: string): PhotoCandidate | null {
        const plan = lookupPlan(barcode);
        for (const code of [plan.code, plan.inner].filter(Boolean) as string[]) {
            for (const p of this.providers) {
                const hit = this.cache.get(`${code}|${p.id}`);
                const record = hit?.result.status === 'found' ? hit.result.record : null;
                const ph = record?.photos.find((x) => x.url === url || x.previewUrl === url);
                if (record && ph) return this.toCandidate(p, record, ph, normaliseBarcode(barcode));
            }
        }
        return null;
    }

    private cached(i: EnrichItem): boolean {
        const { code } = lookupPlan(i.ean);
        const ps = this.providers.filter((p) => p.covers(kindOf(i.category)));
        return ps.every((p) => this.fresh(this.cache.get(`${code}|${p.id}`)));
    }
    private fresh(c?: Cached, ignoreMisses = false) {
        if (!c) return false;
        const useful = c.result.status === 'found' && c.result.record.photos.length > 0;
        if (ignoreMisses && !useful) return false;
        return Date.now() - c.at < (c.result.status === 'found' ? FOUND_TTL : MISS_TTL);
    }

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
            const recs = await this.records(code, kind);
            for (const it of rows) job.results.set(it.key, toEnrichResult(it.key, this.assess(it, kind, recs)));
        }
        job.done = true;
    }

    // ─── One product (background search, editor) ────────────────────

    /**
     * Look up one product's barcode and judge every photo found for it.
     * `fresh` skips cached "not found" answers (a supplier's explicit retry);
     * found records are still reused.
     */
    async lookupOne(it: Omit<EnrichItem, 'key'>, opts: { fresh?: boolean } = {}): Promise<LookupOutcome> {
        const ean = normaliseBarcode(it.ean);
        if (barcodeProblem(ean)) return { status: 'invalid_barcode', reasons: ['invalid_barcode'], candidates: [] };
        const kind = kindOf(it.category);
        return this.assess({ ...it, ean, key: ean }, kind, await this.records(ean, kind, opts));
    }

    /** Ask the databases for a barcode: the ones for this kind of product, then wherever the shared index points. */
    private async records(ean: string, kind: ProductKind, opts: { fresh?: boolean } = {}): Promise<Records> {
        const plan = lookupPlan(ean);
        if (plan.skip) return { found: [], unavailable: false, viaInner: false, code: plan.code, skip: plan.skip };
        const first = await this.ask(plan.code, kind, opts);
        const hasPhoto = (r: Records | { found: Found[] }) => r.found.some((f) => f.record.photos.length);
        if (hasPhoto(first) || first.unavailable || !plan.inner) return { ...first, viaInner: false, code: plan.code };
        // A case code nobody has: the inner item's EAN-13 (a photo of the piece, so never "verified").
        const inner = await this.ask(plan.inner, kind, opts);
        if (hasPhoto(inner) || inner.unavailable) return { ...inner, viaInner: true, code: plan.inner };
        return { found: [...first.found, ...inner.found], unavailable: false, viaInner: false, code: plan.code };
    }

    private async ask(code: string, kind: ProductKind, opts: { fresh?: boolean }): Promise<{ found: Found[]; unavailable: boolean }> {
        const order = this.providers.filter((x) => x.covers(kind));
        const asked = new Set<string>();
        const found: Found[] = [];
        let unavailable = false;
        for (let i = 0; i < order.length; i++) {
            const p = order[i];
            if (asked.has(p.id)) continue;
            asked.add(p.id);
            const r = await this.lookupCached(p, code, opts);
            if (r.status === 'unavailable') { unavailable = true; continue; }
            if (r.status === 'elsewhere') {
                const next = this.providers.find((x) => x.productType === r.productType);
                if (next && !asked.has(next.id)) order.push(next);
                continue;
            }
            if (r.status === 'found') {
                found.push({ p, record: r.record });
                if (r.record.photos.length) break; // a photo from the first database that has one is enough
            }
        }
        // Nothing found anywhere because a database was down: say unavailable, not "not found".
        return { found, unavailable: unavailable && !found.some((f) => f.record.photos.length) };
    }

    private async lookupCached(p: ProductDataProvider, code: string, opts: { fresh?: boolean }): Promise<ProviderResult> {
        const key = `${code}|${p.id}`;
        const c = this.cache.get(key);
        if (this.fresh(c, !!opts.fresh)) return c!.result;
        const inflight = this.pending.get(key);
        if (inflight) return inflight;
        const task = (async (): Promise<ProviderResult> => {
            let r = await p.lookup(code).catch((): ProviderResult => ({ status: 'unavailable', reason: 'error' }));
            // One retry after a pause for a rate limit or a passing error.
            if (r.status === 'unavailable') {
                await new Promise((res) => setTimeout(res, this.retryDelayMs(r.status === 'unavailable' && r.reason === 'rate_limited')));
                r = await p.lookup(code).catch((): ProviderResult => ({ status: 'unavailable', reason: 'error' }));
            }
            if (r.status !== 'unavailable') this.put(key, r);   // outages are never cached
            return r;
        })();
        this.pending.set(key, task);
        try { return await task; } finally { this.pending.delete(key); }
    }

    // ─── Judging ─────────────────────────────────────────────────────

    /** Kept for callers that judge records they already have (tests, import). */
    judge(it: EnrichItem, kind: ProductKind, found: Found[], unavailable: boolean): EnrichResult {
        return toEnrichResult(it.key, this.assess(it, kind, { found, unavailable, viaInner: false, code: it.ean }));
    }

    private assess(it: EnrichItem, kind: ProductKind, recs: Records): LookupOutcome {
        if (recs.skip) return { status: 'not_found', reasons: [recs.skip], candidates: [] };
        const withPhoto = recs.found.filter((f) => f.record.photos.length);
        if (!withPhoto.length) {
            return { status: recs.unavailable ? 'unavailable' : 'not_found', reasons: [recs.unavailable ? 'source_unavailable' : recs.found.length ? 'no_photo' : 'not_in_database'], candidates: [] };
        }
        const { p, record } = withPhoto[0];
        const reasons: string[] = [];
        const barcodeMatch = sameGtin(record.code || recs.code, recs.code);
        const nameMatch = compareNames(it.name, record.name, [it.brand, record.brands]);
        const brandMatch = compareBrands(it.brand, record.brands) === false && brandInName(it.brand, record.name) ? true : compareBrands(it.brand, record.brands);
        const pack = comparePack({ name: it.name, weight: it.weight }, { name: record.name, quantity: record.quantity });
        if (!barcodeMatch) reasons.push('barcode_differs');
        if (recs.viaInner) reasons.push('case_code');
        if (nameMatch === false) reasons.push('name_differs');
        // A different variant (zero / light / another %) is a different product; other wording differences only need a check.
        if (nameMatch === false && variantConflict(it.name, record.name, [it.brand, record.brands])) reasons.push('variant_differs');
        if (brandMatch === false) reasons.push('brand_differs');
        if (pack.match === false) reasons.push('size_differs');
        if (nameMatch === null && brandMatch === null) reasons.push('nothing_to_compare');
        const agrees = nameMatch === true || brandMatch === true;
        // Without a category on the row or the record, we can't tell this is a product the source may verify.
        const kindUnknown = kind === 'other' && !record.categories.length;
        const sourceMayVerify = p.canVerify(kind) && !kindUnknown;
        const clean = barcodeMatch && !recs.viaInner && agrees && nameMatch !== false && brandMatch !== false && pack.match !== false;
        if (clean && !sourceMayVerify) reasons.push(kindUnknown ? 'kind_unknown' : 'second_source_needed');
        if (clean && sourceMayVerify) {
            reasons.push(nameMatch ? 'name_matches' : 'brand_matches');
            if (pack.match) reasons.push('size_matches');
        }
        const confidence: RankedCandidate['confidence'] = clean && sourceMayVerify ? 'verified' : 'needs_confirmation';
        const candidates = pickPhotos(record.photos).map((ph) => ({
            ...this.toCandidate(p, record, ph, normaliseBarcode(it.ean)), confidence,
            reasons: lowResolution(ph) ? [...reasons, 'low_resolution'] : reasons,
        }));
        return { status: 'found', reasons: [], candidates, ...(clean && !sourceMayVerify && !kindUnknown ? { secondSourceNeeded: true } : {}) };
    }

    private toCandidate(p: ProductDataProvider, r: ProviderRecord, ph: ProviderPhoto, barcode: string): PhotoCandidate {
        return {
            url: ph.url, previewUrl: ph.previewUrl, source: p.label, providerId: p.id, sourceUrl: r.pageUrl, license: p.license.images, licenseUrl: p.license.imagesUrl, attribution: p.license.attribution,
            productName: r.name, brand: r.brands, quantity: r.quantity, barcode, kind: ph.kind, language: ph.language,
            ...(ph.width && ph.height ? { width: ph.width, height: ph.height } : {}), ...(ph.imgid ? { imgid: ph.imgid } : {}),
        };
    }

    private put(key: string, result: Cached['result']) {
        if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
        this.cache.set(key, { at: Date.now(), result });
    }

    private sweep() { const now = Date.now(); for (const [id, j] of this.jobs) if (now - j.createdAt > JOB_TTL) this.jobs.delete(id); }
}

const longSide = (ph: ProviderPhoto) => Math.max(ph.width || 0, ph.height || 0);
const lowResolution = (ph: ProviderPhoto) => !!ph.width && !!ph.height && longSide(ph) < MIN_LONG_SIDE;

/**
 * Order a record's photos: front packshots first, then sharp enough before
 * low resolution, then English, then no language, then others, then the
 * largest. Resolution is judged before language because a 160 × 400 English
 * front (Red Bull 250 ml, live data) is worse than a 3024 × 4032 French one.
 * Keeps at most three fronts and one packaging photo.
 */
export function pickPhotos(photos: ProviderPhoto[]): ProviderPhoto[] {
    const key = (ph: ProviderPhoto): number[] => [
        ph.kind === 'front' ? 0 : ph.kind === 'packaging' ? 1 : 2,
        lowResolution(ph) ? 1 : 0,
        ph.language === 'en' ? 0 : ph.language === null ? 1 : 2,
        -longSide(ph),
    ];
    const sorted = [...photos].sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
    const out: ProviderPhoto[] = [];
    let fronts = 0, others = 0;
    for (const ph of sorted) {
        if (ph.kind === 'front' ? fronts++ < 3 : others++ < 1) out.push(ph);
        if (out.length >= MAX_CANDIDATES) break;
    }
    return out;
}

/** The import review shows one photo per row: the best one. */
function toEnrichResult(key: string, o: LookupOutcome): EnrichResult {
    const best = o.candidates[0];
    if (!best) return { key, status: o.status === 'found' ? 'not_found' : o.status, reasons: o.reasons };
    const { confidence, reasons, ...candidate } = best;
    return { key, status: confidence, reasons, candidate, ...(o.secondSourceNeeded ? { secondSourceNeeded: true } : {}) };
}

const str = (v: unknown, max: number) => (v === undefined || v === null ? undefined : String(v).slice(0, max));
