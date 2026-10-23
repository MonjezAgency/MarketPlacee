import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { barcodeProblem, normaliseBarcode, realImages } from './catalog-rules';
import { isStaffRole } from './catalog-scope';
import { ImageLookupService } from './image-lookup.service';
import { ImportEnrichmentService, type RankedCandidate } from './import-enrichment.service';
import { USER_AGENT } from './product-data-providers';
import { MAX_ANALYSE_BYTES, analyseBuffer, rankScored, scoreCandidate, type ScoreLine, type Tier, type Visual } from './image-quality';
import { ProductsService } from './products.service';

/**
 * Background photo search for products saved without a photo.
 *
 * When a product (supplier editor, import, Atlantis Catalog) is saved with a
 * valid barcode and no photo, the barcode is looked up in the background
 * through the shared engine (ImportEnrichmentService: same cache, same
 * rate-limited queue as the import review). Every photo found is then:
 *   1. checked for identity — a record that contradicts the product's brand,
 *      name/variant or pack size is dropped, never offered;
 *   2. measured from its pixels (image-quality.ts: white background, cut off,
 *      size) and scored, with the score lines stored so the UI can say why;
 *   3. ranked: the best exact match on a white background is offered as the
 *      main photo, the other exact matches as gallery photos.
 * The outcome is stored on the product (`Product.imageDiscovery`) so it
 * survives reloads and restarts.
 *
 * Nothing is ever applied automatically: a found photo waits for a person's
 * "Use this photo" (the supplier, or for Atlantis Catalog products, staff).
 * A product that has a photo is never searched in the background, and a found
 * photo never replaces one: on a product without a photo it fills the gallery;
 * on a product that has photos (an explicit "look for more") it can only be
 * added after them. Product status and publication rules are unchanged.
 */

export type DiscoveryStatus = 'searching' | 'found_review' | 'not_found' | 'unavailable' | 'invalid_barcode';
export interface DiscoveryCandidate {
    url: string; previewUrl: string; source: string; sourceUrl: string; license: string; licenseUrl: string; attribution: string;
    confidence: 'verified' | 'needs_confirmation'; reasons: string[];
    kind?: string; language?: string | null; width?: number; height?: number; imgid?: string;
    productName?: string | null; brand?: string | null; quantity?: string | null;
    /** 1 white background · 2 plain light background · 3 other photo of the exact product · null identity not confirmed. */
    tier?: Tier | null;
    score?: number;
    /** Why it scored what it did (keys the browser translates). */
    breakdown?: ScoreLine[];
    /** What the pixels showed, or why they couldn't be read. */
    visual?: Visual | null;
    /** primary = suggested main photo · gallery = another photo of the same product · review = identity to be checked. */
    role?: 'primary' | 'gallery' | 'review';
}
export interface DiscoveryState {
    status: DiscoveryStatus;
    barcode: string;
    /** fill = the product has no photo (the default) · add = it has photos; found ones can only be added after them. */
    mode?: 'fill' | 'add';
    startedAt?: string;
    checkedAt?: string;
    /** Main reason code when nothing usable was found (not_in_database, no_photo, source_unavailable, record_mismatch, internal_code, dismissed…). */
    reason?: string;
    reasons?: string[];
    candidates: DiscoveryCandidate[];
    /** What the database record says when it was rejected as a different product (so a person can see why). */
    record?: { productName: string | null; brand: string | null; quantity: string | null; sourceUrl: string } | null;
    /** Photos a person said are not this product: never offered again for this barcode. */
    dismissed?: string[];
    attempts?: number;
    /** Who asked for the last search by hand, if anyone. */
    requestedBy?: { id: string; role: string } | null;
}
export type DiscoveryActor = { id: string; role: string };

/** A search answered "unavailable" may run again on the next save after this long. */
const UNAVAILABLE_RETRY_MS = 10 * 60 * 1000;
/** An explicit retry within this time of the last answer is refused (the queue is shared by everyone). */
export const RETRY_COOLDOWN_MS = 30 * 1000;
/**
 * A record that says one of these is another product (another barcode, pack size or variant): its photos are
 * never offered. A name or brand worded differently only needs a person's check (shown as "check before using").
 */
const CONTRADICTIONS = new Set(['barcode_differs', 'size_differs', 'variant_differs']);
/** Buckets of the staff "Product photos" list. */
export const PHOTO_BUCKETS = ['review', 'searching', 'not_searched', 'no_barcode', 'invalid_barcode', 'not_in_database', 'mismatch', 'no_photo', 'no_clean_background', 'unavailable', 'dismissed'] as const;
export type PhotoBucket = (typeof PHOTO_BUCKETS)[number];
const SELECT = { id: true, supplierId: true, ean: true, images: true, name: true, brand: true, weight: true, category: true, status: true, imageDiscovery: true, imageCredits: true, updatedAt: true } as const;
type Row = { id: string; supplierId: string; ean: string | null; images: string[]; name: string; brand: string | null; weight: string | null; category: string; status?: string; imageDiscovery: unknown; imageCredits?: unknown; updatedAt: Date };

@Injectable()
export class ImageDiscoveryService implements OnModuleInit {
    private readonly logger = new Logger(ImageDiscoveryService.name);
    /** productId → barcode being searched in this process (dedupes saves, retries and imports). */
    private readonly inflight = new Map<string, string>();
    /** Promises of running searches, for tests and graceful waits. */
    readonly running = new Map<string, Promise<void>>();
    /** previewUrl → what its pixels showed (a photo is downloaded and measured once). */
    private readonly visuals = new Map<string, Promise<Visual>>();
    now = () => Date.now();
    /**
     * Download a candidate's preview and measure it. Tests replace this; under
     * test nothing is downloaded and every photo counts as "not checked".
     */
    inspectImage: (previewUrl: string) => Promise<Visual> = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID
        ? async () => ({ analysed: false, reason: 'download_failed' })
        : (u) => this.fetchAndAnalyse(u);

    constructor(
        private readonly prisma: PrismaService,
        private readonly products: ProductsService,
        private readonly enrichment: ImportEnrichmentService,
        private readonly imageLookup: ImageLookupService,
    ) {}

    /** Searches cut short by a restart are picked up again (the cache is gone, the queue keeps the pace). */
    onModuleInit() {
        if (process.env.NODE_ENV === 'test') return;
        setTimeout(() => {
            this.prisma.product.findMany({ where: { imageDiscovery: { path: ['status'], equals: 'searching' } } as any, select: { id: true }, take: 500 })
                .then((rows) => rows.forEach((r) => this.trigger(r.id)))
                .catch((e) => this.logger.warn(`[discovery] resume: ${e?.message}`));
        }, 15_000).unref?.();
    }

    /** After any save: start a search if it is needed. Never throws. */
    trigger(productId: string) {
        this.enqueue(productId).catch((e) => this.logger.warn(`[discovery] ${productId}: ${e?.message}`));
    }

    /**
     * Decide whether this product needs a search and start it. Returns the
     * state now stored. `force` = a person asked to search again (skips cached
     * "not found" answers; never runs twice at once). `add` = a person asked
     * for more photos of a product that already has some.
     */
    async enqueue(productId: string, opts: { force?: boolean; add?: boolean; by?: DiscoveryActor } = {}): Promise<DiscoveryState | null> {
        const p = await this.load(productId);
        if (!p) return null;
        const state = asState(p.imageDiscovery);
        const hasPhoto = realImages(p.images).length > 0;
        // A product with a photo is only searched when someone asks for more; a stale "fill" suggestion is cleared.
        if (hasPhoto && !opts.add) {
            if (state && state.mode !== 'add') { await this.write(p, null); return null; }
            return state;
        }
        const mode: 'fill' | 'add' = hasPhoto ? 'add' : 'fill';
        const code = normaliseBarcode(p.ean);
        if (!code) { if (state) await this.write(p, null); return null; }
        if (barcodeProblem(code)) {
            const s: DiscoveryState = { status: 'invalid_barcode', barcode: code, mode, checkedAt: this.iso(), reason: 'invalid_barcode', reasons: ['invalid_barcode'], candidates: [] };
            if (!(state?.status === 'invalid_barcode' && state.barcode === code)) await this.write(p, s);
            return s;
        }
        if (this.inflight.get(p.id) === code) return state;           // already searching this barcode
        const same = !!state && state.barcode === code && (state.mode || 'fill') === mode;
        if (same && state!.status !== 'searching') {
            const at = Date.parse(state!.checkedAt || '');
            const age = Number.isFinite(at) ? this.now() - at : Infinity;
            if (!opts.force && !(state!.status === 'unavailable' && age > UNAVAILABLE_RETRY_MS)) return state;   // answered already
            if (opts.force && age < RETRY_COOLDOWN_MS) return state;
        }
        const keepDismissed = !!state && state.barcode === code && state.dismissed?.length;
        const next: DiscoveryState = {
            status: 'searching', barcode: code, mode, startedAt: this.iso(), candidates: [],
            ...(keepDismissed ? { dismissed: state!.dismissed } : {}),
            attempts: (same ? state!.attempts || 0 : 0) + 1,
            ...(opts.by ? { requestedBy: { id: opts.by.id, role: opts.by.role } } : {}),
        };
        await this.write(p, next);
        this.inflight.set(p.id, code);
        const job = this.run(p.id, code, !!opts.force, mode)
            .catch((e) => this.logger.warn(`[discovery] ${p.id}: ${e?.message}`))
            .finally(() => { if (this.inflight.get(p.id) === code) this.inflight.delete(p.id); this.running.delete(p.id); });
        this.running.set(p.id, job);
        return next;
    }

    private async run(id: string, code: string, fresh: boolean, mode: 'fill' | 'add') {
        const p0 = await this.load(id);
        if (!p0) return;
        const out = await this.enrichment.lookupOne({ ean: code, name: p0.name, brand: p0.brand || undefined, weight: p0.weight || undefined, category: p0.category }, { fresh });
        // Re-read: the barcode or the photos may have changed while we waited.
        let p = await this.load(id);
        if (!p || normaliseBarcode(p.ean) !== code) return;          // that save started its own search
        const cur = asState(p.imageDiscovery);
        if (mode === 'fill' && realImages(p.images).length) { if (cur) await this.write(p, null); return; }
        const dismissed = new Set(cur?.barcode === code ? cur.dismissed || [] : []);
        const inGallery = new Set(Object.values(creditsOf(p)).map((c: any) => String(c?.originalUrl || '')).filter(Boolean));
        const fresh0 = out.candidates.filter((c) => !dismissed.has(c.url) && !inGallery.has(c.url));
        // Identity first: a record that says it's another flavour, size or brand is not this product.
        const rejected = fresh0.filter((c) => c.reasons.some((r) => CONTRADICTIONS.has(r)));
        const usable = fresh0.filter((c) => !c.reasons.some((r) => CONTRADICTIONS.has(r)));
        const scored = await Promise.all(usable.map(async (c) => {
            const visual = await this.visualFor(c.previewUrl);
            return { ...stored(c), ...scoreCandidate(c, visual) };
        }));
        const ranked = rankScored(scored);
        let primaryGiven = mode === 'add';
        const candidates: DiscoveryCandidate[] = ranked.map((c) => {
            const role: DiscoveryCandidate['role'] = c.tier === null ? 'review' : !primaryGiven ? 'primary' : 'gallery';
            if (role === 'primary') primaryGiven = true;
            return { ...c, role };
        });
        const exact = candidates.filter((c) => c.tier !== null);
        const base = { barcode: code, mode, startedAt: cur?.startedAt, checkedAt: this.iso(), ...(dismissed.size ? { dismissed: [...dismissed] } : {}), attempts: cur?.attempts, ...(cur?.requestedBy ? { requestedBy: cur.requestedBy } : {}) };
        let state: DiscoveryState;
        if (candidates.length) {
            const reasons = !exact.length ? ['identity_unconfirmed'] : exact.some((c) => c.tier === 1) ? [] : ['no_clean_background'];
            state = { ...base, status: 'found_review', reasons, candidates };
        } else if (rejected.length) {
            const r = rejected[0];
            const why = [...new Set(rejected.flatMap((c) => c.reasons.filter((x) => CONTRADICTIONS.has(x))))];
            state = { ...base, status: 'not_found', reason: 'record_mismatch', reasons: ['record_mismatch', ...why], candidates: [], record: { productName: r.productName, brand: r.brand, quantity: r.quantity, sourceUrl: r.sourceUrl } };
        } else {
            const dropped = out.candidates.length > 0;   // everything found was dismissed or is already in the gallery
            state = { ...base, status: out.status === 'unavailable' ? 'unavailable' : out.status === 'invalid_barcode' ? 'invalid_barcode' : 'not_found', reason: dropped ? (mode === 'add' && !dismissed.size ? 'already_in_gallery' : 'dismissed') : out.reasons[0] || 'not_in_database', reasons: dropped ? [mode === 'add' && !dismissed.size ? 'already_in_gallery' : 'dismissed'] : out.reasons, candidates: [] };
        }
        p = await this.load(id);
        if (!p || normaliseBarcode(p.ean) !== code) return;
        if (mode === 'fill' && realImages(p.images).length) { if (asState(p.imageDiscovery)) await this.write(p, null); return; }
        await this.write(p, state);
    }

    // ─── Pixels ──────────────────────────────────────────────────────

    private visualFor(previewUrl: string): Promise<Visual> {
        const hit = this.visuals.get(previewUrl);
        if (hit) return hit;
        const task = this.inspectImage(previewUrl).catch((): Visual => ({ analysed: false, reason: 'download_failed' }));
        if (this.visuals.size > 5000) this.visuals.delete(this.visuals.keys().next().value as string);
        this.visuals.set(previewUrl, task);
        // A failed download may be tried again by a later search.
        task.then((v) => { if (v.analysed === false && v.reason === 'download_failed') this.visuals.delete(previewUrl); });
        return task;
    }

    /** The small preview (OFF serves 400 px) is enough to judge background and cropping. Only the databases' image hosts. */
    private async fetchAndAnalyse(previewUrl: string): Promise<Visual> {
        let u: URL;
        try { u = new URL(previewUrl); } catch { return { analysed: false, reason: 'not_an_image' }; }
        if (u.protocol !== 'https:' || !this.enrichment.imageHosts().has(u.hostname)) return { analysed: false, reason: 'not_an_image' };
        const res = await this.enrichment.imageQueue.fetch(u.toString(), { headers: { 'User-Agent': USER_AGENT }, redirect: 'error', timeoutMs: 10_000 }).catch(() => null);
        if (!res || !res.ok) return { analysed: false, reason: 'download_failed' };
        if (!/^image\/(jpeg|png)/.test(res.headers.get('content-type') || '')) return { analysed: false, reason: 'not_an_image' };
        if (Number(res.headers.get('content-length') || 0) > MAX_ANALYSE_BYTES) return { analysed: false, reason: 'too_large' };
        const buf = Buffer.from(await res.arrayBuffer());
        return analyseBuffer(buf);
    }

    // ─── Supplier actions (own products only) ────────────────────────

    async get(supplierId: string, id: string): Promise<DiscoveryState | null> {
        return asState((await this.own(supplierId, id)).imageDiscovery);
    }

    /** Search again. On a product that has photos this looks for more (they can only be added after the existing ones). */
    async retry(supplierId: string, id: string): Promise<DiscoveryState | null> {
        const p = await this.own(supplierId, id);
        if (!normaliseBarcode(p.ean)) throw new BadRequestException({ code: 'NO_BARCODE', message: 'Add the product’s barcode and save it first.' });
        return this.enqueue(id, { force: true, add: realImages(p.images).length > 0, by: { id: supplierId, role: 'SUPPLIER' } });
    }

    /**
     * Use photos found for this product: `url` first, then `also` (other
     * exact-match photos for the gallery), each copied into Atlantis storage
     * and credited (licence, attribution, source page, who approved it).
     */
    async accept(supplierId: string, id: string, url: string, also: string[] = []) {
        const p = await this.own(supplierId, id);
        return this.apply(p, url, also, { id: supplierId, role: 'SUPPLIER' }, supplierId);
    }

    /** "Not my product": drop one found photo (or all), and never offer it again for this barcode. */
    async dismiss(supplierId: string, id: string, url?: string): Promise<DiscoveryState | null> {
        return this.drop(await this.own(supplierId, id), url);
    }

    // ─── Staff (Atlantis Catalog photos; read-only status for supplier products) ──

    /**
     * Products that need a photo or have photos waiting for review, with the
     * reason. Atlantis Catalog products can be acted on; supplier products are
     * listed for their status only (staff never apply photos to them).
     */
    async staffList(q: { scope?: string; bucket?: string; q?: string; page?: string | number; limit?: string | number }) {
        const staff = await this.staffIds();
        const scope = q.scope === 'submissions' ? 'submissions' : 'catalog';
        const where: any = scope === 'catalog' ? { supplierId: { in: staff } } : (staff.length ? { supplierId: { notIn: staff } } : {});
        where.status = { not: 'REJECTED' };
        const term = String(q.q || '').trim();
        if (term) {
            const digits = term.replace(/\D/g, '');
            where.OR = [{ name: { contains: term, mode: 'insensitive' } }, { brand: { contains: term, mode: 'insensitive' } }, ...(digits.length >= 4 ? [{ ean: { contains: digits } }] : [])];
        }
        const rows = await this.prisma.product.findMany({
            where, orderBy: { updatedAt: 'desc' }, take: 5000,
            select: { ...SELECT, supplier: { select: { companyName: true, name: true } } } as any,
        }) as unknown as (Row & { supplier?: { companyName: string | null; name: string | null } })[];
        const items = rows.map((r) => ({ r, bucket: bucketOf(r) })).filter((x): x is { r: typeof x.r; bucket: PhotoBucket } => x.bucket !== null);
        const counts = Object.fromEntries(PHOTO_BUCKETS.map((b) => [b, 0])) as Record<PhotoBucket, number>;
        for (const x of items) counts[x.bucket]++;
        const wanted = (PHOTO_BUCKETS as readonly string[]).includes(String(q.bucket)) ? String(q.bucket) : null;
        const list = wanted ? items.filter((x) => x.bucket === wanted) : items;
        const limit = Math.min(100, Math.max(5, Number(q.limit) || 25));
        const page = Math.max(1, Number(q.page) || 1);
        const slice = list.slice((page - 1) * limit, page * limit);
        return {
            scope, total: list.length, page, limit, counts, canApply: scope === 'catalog',
            items: slice.map(({ r, bucket }) => ({
                id: r.id, name: r.name, brand: r.brand, ean: r.ean, status: r.status, bucket, hasPhoto: realImages(r.images).length > 0, photo: realImages(r.images)[0] || null,
                supplier: scope === 'submissions' ? (r.supplier?.companyName || r.supplier?.name || null) : null,
                // Supplier products: status only. The photos found are the supplier's to choose.
                discovery: scope === 'catalog' ? asState(r.imageDiscovery) : summary(asState(r.imageDiscovery)),
            })),
        };
    }

    /** Search again for one or many products (max 200). Cooldown and dedupe as for suppliers. */
    async staffRetry(actor: DiscoveryActor, ids: string[]) {
        const unique = [...new Set((ids || []).map(String))].slice(0, 200);
        const staff = new Set(await this.staffIds());
        const out: { id: string; outcome: 'started' | 'searching' | 'answered_recently' | 'no_barcode' | 'has_photo' | 'not_found'; status?: string | null }[] = [];
        for (const id of unique) {
            const p = await this.load(id);
            if (!p) { out.push({ id, outcome: 'not_found' }); continue; }
            if (!normaliseBarcode(p.ean)) { out.push({ id, outcome: 'no_barcode' }); continue; }
            const hasPhoto = realImages(p.images).length > 0;
            // Looking for more photos of a supplier's product is the supplier's call.
            if (hasPhoto && !staff.has(p.supplierId)) { out.push({ id, outcome: 'has_photo' }); continue; }
            const before = asState(p.imageDiscovery);
            const s = await this.enqueue(id, { force: true, add: hasPhoto, by: actor });
            const started = s?.status === 'searching' && s.startedAt !== before?.startedAt;
            out.push({ id, outcome: started ? 'started' : s?.status === 'searching' ? 'searching' : 'answered_recently', status: s?.status ?? null });
        }
        return { results: out, started: out.filter((x) => x.outcome === 'started').length };
    }

    async staffGet(id: string) {
        const p = await this.load(id);
        if (!p) throw new NotFoundException('Product not found');
        const catalog = await this.isCatalog(p);
        const st = asState(p.imageDiscovery);
        return { catalog, canApply: catalog, state: catalog ? st : summary(st) };
    }

    async staffAccept(actor: DiscoveryActor, id: string, url: string, also: string[] = []) {
        const p = await this.load(id);
        if (!p) throw new NotFoundException('Product not found');
        if (!(await this.isCatalog(p))) throw new ForbiddenException({ code: 'SUPPLIER_OWNED', message: 'This product belongs to a supplier. Only the supplier can choose its photos.' });
        return this.apply(p, url, also, actor, p.supplierId);
    }

    async staffDismiss(id: string, url?: string) {
        const p = await this.load(id);
        if (!p) throw new NotFoundException('Product not found');
        if (!(await this.isCatalog(p))) throw new ForbiddenException({ code: 'SUPPLIER_OWNED', message: 'This product belongs to a supplier. Only the supplier can choose its photos.' });
        return this.drop(p, url);
    }

    // ─── Shared ──────────────────────────────────────────────────────

    private async apply(p: Row, url: string, also: string[], actor: DiscoveryActor, ownerId: string) {
        const st = asState(p.imageDiscovery);
        const mode = st?.mode || 'fill';
        if (mode === 'fill' && realImages(p.images).length) throw new ConflictException({ code: 'HAS_PHOTO', message: 'This product already has a photo, so a found photo can’t be added here.' });
        const find = (u: string) => (st?.status === 'found_review' ? st.candidates.find((c) => c.url === u || c.previewUrl === u) : undefined);
        const main = find(url);
        if (!st || !main) throw new BadRequestException({ code: 'NOT_A_CANDIDATE', message: 'Only a photo found for this product’s barcode can be used here.' });
        const extras: DiscoveryCandidate[] = [];
        for (const u of (Array.isArray(also) ? also : []).slice(0, 8)) {
            const c = find(String(u));
            if (!c) throw new BadRequestException({ code: 'NOT_A_CANDIDATE', message: 'Only a photo found for this product’s barcode can be used here.' });
            // Gallery photos must be confirmed photos of this exact product; an unconfirmed one is chosen on its own, after checking it.
            if (c.confidence !== 'verified') throw new BadRequestException({ code: 'NOT_CONFIRMED', message: 'Only photos confirmed as this exact product can be added together. Check the others one at a time.' });
            if (c.url !== main.url && !extras.some((e) => e.url === c.url)) extras.push(c);
        }
        if (normaliseBarcode(p.ean) !== st.barcode) throw new BadRequestException({ code: 'BARCODE_CHANGED', message: 'The barcode changed since this photo was found. Search again.' });
        const picked = [main, ...extras];
        const saved: { cand: DiscoveryCandidate; url: string }[] = [];
        for (const cand of picked) {
            // The download's timeout starts when it leaves the queue, not while it waits its turn.
            const s = await this.imageLookup.accept(cand.url, ((u: any, i: any) => { const { signal, ...rest } = i || {}; void signal; return this.enrichment.imageQueue.fetch(String(u), { ...rest, timeoutMs: 15_000 }); }) as typeof fetch);
            saved.push({ cand, url: s.url });
        }
        // Last check right before writing: a photo added meanwhile is never replaced.
        const latest = await this.load(p.id);
        if (!latest) throw new NotFoundException('Product not found');
        const existing = realImages(latest.images);
        if (mode === 'fill' && existing.length) throw new ConflictException({ code: 'HAS_PHOTO', message: 'This product got a photo in the meantime; nothing was changed.' });
        const images = [...existing, ...saved.map((s) => s.url).filter((u) => !existing.includes(u))];
        const who = actor.role === 'SUPPLIER' ? 'the supplier' : `Atlantis (${actor.role.toLowerCase()})`;
        const wasLive = latest.status === 'APPROVED';
        let product: any = await this.products.supplierUpdate(p.id, ownerId, { images, changeReason: `${saved.length === 1 ? 'Photo' : `${saved.length} photos`} from ${main.source} (${main.license}), chosen by ${who}` });
        // Staff adding a photo to a live Atlantis Catalog product is itself the review: keep it live.
        if (actor.role !== 'SUPPLIER' && wasLive && product?.status === 'PENDING') {
            product = await this.products.updateStatus(p.id, 'APPROVED' as any, '', { id: actor.id, role: actor.role }, { notify: false }).catch(() => product);
        }
        const at = new Date(this.now()).toISOString();
        await this.products.setImageCredits(p.id, Object.fromEntries(saved.map(({ cand, url: u }) => [u, {
            source: cand.source, license: cand.license, licenseUrl: cand.licenseUrl, attribution: cand.attribution, sourceUrl: cand.sourceUrl,
            barcode: st.barcode, originalUrl: cand.url, origin: 'discovery', chosenBy: actor.role === 'SUPPLIER' ? 'supplier' : 'staff',
            approvedBy: actor.id, approvedByRole: actor.role, approvedAt: at, addedAt: at,
            ...(cand.tier !== undefined ? { tier: cand.tier } : {}), ...(cand.imgid ? { imgid: cand.imgid } : {}),
        }]))).catch((e) => this.logger.warn(`[discovery] credit for ${p.id}: ${e?.message}`));
        const after = await this.load(p.id);
        let next: DiscoveryState | null = null;
        if (after) {
            if (mode === 'add') {
                const used = new Set(picked.map((c) => c.url));
                const left = st.candidates.filter((c) => !used.has(c.url));
                next = left.length ? { ...st, candidates: left } : null;
            }
            await this.write(after, next);
        }
        return { ...product, imageDiscovery: next };
    }

    private async drop(p: Row, url?: string): Promise<DiscoveryState | null> {
        const st = asState(p.imageDiscovery);
        if (!st || st.status !== 'found_review') return st;
        const drop = url ? st.candidates.filter((c) => c.url === url || c.previewUrl === url) : st.candidates;
        if (url && !drop.length) throw new BadRequestException({ code: 'NOT_A_CANDIDATE', message: 'That photo isn’t one of the photos found for this product.' });
        const dismissed = [...new Set([...(st.dismissed || []), ...drop.map((c) => c.url)])].slice(-50);
        const left = st.candidates.filter((c) => !dismissed.includes(c.url));
        const next: DiscoveryState = left.length
            ? { ...st, candidates: left, dismissed }
            : { ...st, status: 'not_found', reason: 'dismissed', reasons: ['dismissed'], candidates: [], dismissed };
        await this.write(p, next);
        return next;
    }

    private async own(supplierId: string, id: string): Promise<Row> {
        const p = await this.prisma.product.findFirst({ where: { id: String(id), supplierId }, select: SELECT as any }) as unknown as Row | null;
        if (!p) throw new NotFoundException('Product not found');
        return p;
    }

    private load(id: string): Promise<Row | null> {
        return this.prisma.product.findUnique({ where: { id: String(id) }, select: SELECT as any }) as unknown as Promise<Row | null>;
    }

    private async staffIds(): Promise<string[]> {
        const rows = await this.prisma.user.findMany({ where: { role: { in: ['OWNER', 'ADMIN', 'MODERATOR', 'EDITOR', 'DEVELOPER', 'LOGISTICS', 'SUPPORT'] as any } }, select: { id: true } });
        return rows.map((r) => r.id);
    }

    /** Atlantis Catalog = owned by a staff account (catalog-scope.ts). */
    private async isCatalog(p: Row): Promise<boolean> {
        const owner = await this.prisma.user.findUnique({ where: { id: p.supplierId }, select: { role: true } });
        return isStaffRole(owner?.role);
    }

    /**
     * Store the state without touching anything else — not even `updatedAt`
     * (a background hint is not an edit). Written only if the product wasn't
     * saved in between; otherwise re-read once and written on the new version.
     */
    private async write(p: Row, state: DiscoveryState | null) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const r = await this.prisma.product.updateMany({
                where: { id: p.id, updatedAt: p.updatedAt },
                data: { imageDiscovery: state === null ? Prisma.DbNull : (state as any), updatedAt: p.updatedAt } as any,
            });
            if (r.count) return;
            const fresh = await this.load(p.id);
            if (!fresh) return;
            p = fresh;
        }
        this.logger.warn(`[discovery] ${p.id}: state not saved (product kept changing)`);
    }

    private iso() { return new Date(this.now()).toISOString(); }
}

function asState(v: unknown): DiscoveryState | null {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const s = v as DiscoveryState;
    return typeof s.status === 'string' && typeof s.barcode === 'string' ? { ...s, candidates: Array.isArray(s.candidates) ? s.candidates : [] } : null;
}

function creditsOf(p: Row): Record<string, unknown> {
    const c = p.imageCredits;
    return c && typeof c === 'object' && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
}

/** Where a product photo came from: found by barcode (credited) or uploaded by the supplier / staff. */
export function imageOrigin(credits: unknown, url: string): 'discovery' | 'upload' {
    const c = credits && typeof credits === 'object' ? (credits as any)[url] : null;
    return c && (c.origin === 'discovery' || c.source) ? 'discovery' : 'upload';
}

/** For supplier products seen by staff: the outcome, not the photos. */
function summary(st: DiscoveryState | null) {
    if (!st) return null;
    const { candidates, dismissed, record, ...rest } = st;
    void dismissed; void record;
    return { ...rest, candidates: [], found: candidates.length, bestTier: candidates.find((c) => c.tier !== null && c.tier !== undefined)?.tier ?? null };
}

/** One bucket per product for the staff list; null = nothing to do (has photos, nothing waiting). */
export function bucketOf(r: { ean: string | null; images: string[]; imageDiscovery: unknown }): PhotoBucket | null {
    const st = asState(r.imageDiscovery);
    const hasPhoto = realImages(r.images).length > 0;
    if (st?.status === 'found_review' && st.candidates.length) return st.reasons?.includes('no_clean_background') && !hasPhoto ? 'no_clean_background' : 'review';
    if (hasPhoto) return st?.status === 'searching' ? 'searching' : null;
    if (!normaliseBarcode(r.ean)) return 'no_barcode';
    if (!st) return barcodeProblem(normaliseBarcode(r.ean)) ? 'invalid_barcode' : 'not_searched';
    if (st.status === 'searching') return 'searching';
    if (st.status === 'invalid_barcode') return 'invalid_barcode';
    if (st.status === 'unavailable') return 'unavailable';
    if (st.reason === 'record_mismatch') return 'mismatch';
    if (st.reason === 'no_photo') return 'no_photo';
    if (st.reason === 'dismissed') return 'dismissed';
    return 'not_in_database';
}

const stored = (c: RankedCandidate): DiscoveryCandidate => ({
    url: c.url, previewUrl: c.previewUrl, source: c.source, sourceUrl: c.sourceUrl, license: c.license, licenseUrl: c.licenseUrl, attribution: c.attribution,
    confidence: c.confidence, reasons: c.reasons, kind: c.kind, language: c.language ?? null,
    ...(c.width && c.height ? { width: c.width, height: c.height } : {}), ...(c.imgid ? { imgid: c.imgid } : {}),
    productName: c.productName, brand: c.brand, quantity: c.quantity,
});
