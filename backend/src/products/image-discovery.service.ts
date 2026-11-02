import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { barcodeProblem, normaliseBarcode, realImages } from './catalog-rules';
import { isStaffRole } from './catalog-scope';
import { ImageLookupService } from './image-lookup.service';
import { PhotoroomService } from './photoroom.service';
import { ImportEnrichmentService, type RankedCandidate } from './import-enrichment.service';
import { USER_AGENT } from './product-data-providers';
import { MAX_ANALYSE_BYTES, analyseBuffer, rankScored, scoreCandidate, type ScoreLine, type Tier, type Visual } from './image-quality';
import { ProductsService } from './products.service';
import { PhotoCheckService, type PhotoCheck } from './photo-check.service';
import { DEFAULT_POLICY, mayPublish } from './image-pipeline/licensing';
import { readVisionAlert } from './image-pipeline/alerts';

/**
 * Background photo search for products saved without a photo.
 *
 * When a product (supplier editor, import, Ali FMCG Catalog) is saved with a
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
 * When a person searches and no database has the barcode, the product's name
 * is searched too. Those photos carry another barcode: they are shown apart as
 * a similar product (role `similar`), never ranked as a match, and only used
 * after the person states they show exactly this product (`confirmed`).
 *
 * With the AI check available (photo-check.service.ts) all of this runs by
 * itself after a save, cheapest source first, stopping at the first photo the
 * check confirms. A confirmed photo whose licence allows it goes on the product
 * marked as automatic (credit `chosenBy: 'auto'`) and staff review it (`auto`
 * bucket). It never changes the product's status. Anything else waits for a
 * person's "Use this photo"; while the check is down nothing is applied, and
 * admins see one clear error. Products that held back are picked up by the sweep.
 *
 * A product that has a photo is never searched in the background, and a found
 * photo never replaces one: on a product without a photo it fills the gallery;
 * on a product that has photos (an explicit "look for more") it can only be
 * added after them.
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
    /** primary = suggested main photo · gallery = another photo of the same product · review = identity to be checked · similar = found by name under another barcode. */
    role?: 'primary' | 'gallery' | 'review' | 'similar';
    /** The barcode of the record a `similar` photo belongs to. */
    sourceBarcode?: string;
    /** Where a web photo came from; `url` is our stored copy. */
    webImage?: string;
    /** What the AI check said about this photo, when it was checked. */
    aiCheck?: PhotoCheck;
    /** The same photo on pure white (Photoroom). watermarked = made with a sandbox key: a preview that can't be saved. */
    clean?: { url: string; watermarked: boolean; at: string };
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
    /** How the automatic decision ended. needs_review = confirmed, but its licence needs a person · check_down = the daily sweep tries again. held, dry_run and waiting_month are only in older records. */
    auto?: { at: string; outcome: 'applied' | 'needs_review' | 'held' | 'dry_run' | 'no_match' | 'waiting_month' | 'check_down' };
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
/** Photos checked per source for one product: the cheap ones are ranked first, the rest rarely change the answer. */
const AUTO_MAX_CHECKS = 3;
/** Products the daily sweep picks up (each gets a search and AI checks). */
const SWEEP_LIMIT = 300;
/** Buckets of the staff "Product photos" list. */
export const PHOTO_BUCKETS = ['auto', 'review', 'searching', 'not_searched', 'no_barcode', 'invalid_barcode', 'not_in_database', 'mismatch', 'no_photo', 'no_clean_background', 'unavailable', 'dismissed'] as const;
export type PhotoBucket = (typeof PHOTO_BUCKETS)[number];
const SELECT = { imageStatus: true, id: true, supplierId: true, ean: true, images: true, name: true, brand: true, weight: true, category: true, status: true, imageDiscovery: true, imageCredits: true, updatedAt: true } as const;
type Row = { id: string; supplierId: string; ean: string | null; images: string[]; name: string; brand: string | null; weight: string | null; category: string; status?: string; imageDiscovery: unknown; imageCredits?: unknown; updatedAt: Date };

@Injectable()
export class ImageDiscoveryService implements OnModuleInit {
    private readonly logger = new Logger(ImageDiscoveryService.name);
    /** productId → barcode being searched in this process (dedupes saves, retries and imports). */
    private readonly inflight = new Map<string, string>();
    /** Promises of running searches, for tests and graceful waits. */
    readonly running = new Map<string, Promise<void>>();
    /** Photos being sent to Photoroom right now, so a double click isn't charged twice. */
    private readonly cleaning = new Set<string>();
    /** previewUrl → what its pixels showed (a photo is downloaded and measured once). */
    private readonly visuals = new Map<string, Promise<Visual>>();
    private turn: Promise<unknown> = Promise.resolve();
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
        private readonly photoroom: PhotoroomService,
        private readonly photoCheck: PhotoCheckService,
    ) {}

    /** Searches cut short by a restart are picked up again (the cache is gone, the queue keeps the pace). */
    onModuleInit() {
        // SerpApi is gone for good: its key does nothing, and whoever left it set should know.
        if (process.env.SERPAPI_API_KEY) this.logger.error('[discovery] SERPAPI_API_KEY is set but SerpApi is not used. The key is ignored; delete it.');
        if (process.env.NODE_ENV === 'test') return;
        setTimeout(() => {
            this.prisma.product.findMany({ where: { imageDiscovery: { path: ['status'], equals: 'searching' } } as any, select: { id: true }, take: 500 })
                .then((rows) => rows.forEach((r) => this.trigger(r.id)))
                .catch((e) => this.logger.warn(`[discovery] resume: ${e?.message}`));
        }, 15_000).unref?.();
        // Soon after a deploy, so a change to the check shows up in the logs without waiting for the night.
        setTimeout(() => { this.sweep().catch((e) => this.logger.warn(`[discovery] sweep: ${e?.message}`)); }, 120_000).unref?.();
    }

    /**
     * Products without a photo that never had an automatic decision (saved
     * before it existed), or that a broken check held back. Each is answered once, so running this again costs nothing.
     */
    @Cron('0 3 * * *')
    async sweep(limit = SWEEP_LIMIT) {
        if (!(await this.photoCheck.ready())) return 0;
        const rows = await this.prisma.product.findMany({
            where: { status: { not: 'REJECTED' }, ean: { not: null }, images: { isEmpty: true }, imageStatus: null } as any,
            orderBy: { createdAt: 'asc' }, take: 5000, select: { id: true, imageDiscovery: true },
        }) as unknown as { id: string; imageDiscovery: unknown }[];
        const due = rows.filter((r) => {
            const st = asState(r.imageDiscovery);
            if (st?.status === 'searching' || st?.status === 'invalid_barcode') return false;
            const o = st?.auto?.outcome;
            return !o || o === 'check_down' || o === 'dry_run' || o === 'waiting_month';
        }).slice(0, limit);
        for (const r of due) await this.enqueue(r.id, { again: true }).catch((e) => this.logger.warn(`[discovery] sweep ${r.id}: ${e?.message}`));
        if (due.length) this.logger.log(`[discovery] sweep: ${due.length} of ${rows.length} products without a photo`);
        return due.length;
    }

    /** After any save: start a search if it is needed. Never throws. */
    trigger(productId: string) {
        this.enqueue(productId).catch((e) => this.logger.warn(`[discovery] ${productId}: ${e?.message}`));
    }

    /**
     * Decide whether this product needs a search and start it. Returns the
     * state now stored. `force` = a person asked to search again (skips cached
     * "not found" answers; never runs twice at once). `add` = a person asked
     * for more photos of a product that already has some. `restore` = a person
     * takes back their "Not my product" answers for this barcode. `again` =
     * answer once more, keeping the caches (the sweep).
     */
    async enqueue(productId: string, opts: { force?: boolean; add?: boolean; restore?: boolean; again?: boolean; by?: DiscoveryActor } = {}): Promise<DiscoveryState | null> {
        const p = await this.load(productId);
        if (!p) return null;
        // The image pipeline answers for this product; only a person's own search runs beside it.
        if ((p as any).imageStatus && !opts.force && !opts.add) return null;
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
            if (!opts.force && !opts.again && !(state!.status === 'unavailable' && age > UNAVAILABLE_RETRY_MS)) return state;   // answered already
            if (opts.force && !opts.restore && age < RETRY_COOLDOWN_MS) return state;
        }
        const keepDismissed = !opts.restore && !!state && state.barcode === code && state.dismissed?.length;
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
        let usable = fresh0.filter((c) => !c.reasons.some((r) => CONTRADICTIONS.has(r)));
        const item = { ean: code, name: p0.name, brand: p0.brand || undefined, weight: p0.weight || undefined };
        const wanted = mode === 'fill' && this.photoCheck.enabled && p0.status !== 'REJECTED';
        const auto = wanted && await this.photoCheck.ready();
        const checks = new Map<string, PhotoCheck>();
        const verdict: { confirmed: string | null; down: boolean } = { confirmed: null, down: false };
        const nothingForBarcode = out.status === 'not_found' && !out.candidates.length;
        /** Ask the AI about these photos; stops at the first yes, or when the check isn't answering. */
        const decide = async (list: Ranked[]) => {
            if (!auto) return;
            for (const c of rankScored(list).filter(autoEligible).slice(0, AUTO_MAX_CHECKS)) {
                const r = await this.photoCheck.check(item, c.url);
                if (r.status !== 'checked') { verdict.down = true; return; }
                checks.set(c.url, r.check);
                if (r.check.ok) { verdict.confirmed = c.url; return; }
            }
        };
        const chain = async () => {
            let pool = await this.score(usable);
            await decide(pool);
            // Only a person's search or an automatic one, for a product with no photo: the barcode gave nothing that fits.
            if (mode === 'fill' && !verdict.confirmed && !verdict.down && out.status !== 'unavailable' && (auto || (fresh && nothingForBarcode))) {
                const similar = await this.enrichment.similarByName({ ...item, category: p0.category }).catch(() => []);
                const named = await this.score(similar.filter((c) => !dismissed.has(c.url) && !inGallery.has(c.url)));
                pool = [...pool, ...named];
                await decide(named);
            }
            return pool;
        };
        const pool = await (auto ? this.inTurn(chain) : chain());
        const ranked = rankScored(pool);
        let primaryGiven = mode === 'add';
        const candidates: DiscoveryCandidate[] = ranked.map((c) => {
            const role: DiscoveryCandidate['role'] = c.reasons.includes('different_barcode') ? 'similar' : c.tier === null ? 'review' : !primaryGiven ? 'primary' : 'gallery';
            if (role === 'primary') primaryGiven = true;
            const aiCheck = checks.get(c.url);
            return { ...c, role, ...(aiCheck ? { aiCheck } : {}) };
        });
        const exact = candidates.filter((c) => c.tier !== null);
        const base = { barcode: code, mode, startedAt: cur?.startedAt, checkedAt: this.iso(), ...(dismissed.size ? { dismissed: [...dismissed] } : {}), attempts: cur?.attempts, ...(cur?.requestedBy ? { requestedBy: cur.requestedBy } : {}) };
        let state: DiscoveryState;
        if (candidates.length) {
            const reasons = candidates.every((c) => c.role === 'similar') ? ['no_exact_match'] : !exact.length ? ['identity_unconfirmed'] : exact.some((c) => c.tier === 1) ? [] : ['no_clean_background'];
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
        const chosen = verdict.confirmed ? candidates.find((c) => c.url === verdict.confirmed) : undefined;
        const outcome = !wanted ? null : !auto ? 'check_down' : chosen ? (autoApplyAllowed(chosen) ? 'applied' : 'needs_review') : verdict.down ? 'check_down' : 'no_match';
        if (outcome) state.auto = { at: this.iso(), outcome };
        await this.write(p, state);
        if (outcome === 'applied') {
            const fresh1 = await this.load(id);
            if (fresh1) await this.apply(fresh1, verdict.confirmed!, [], SYSTEM, fresh1.supplierId, false, true).catch((e) => this.logger.warn(`[discovery] automatic photo for ${id}: ${e?.message}`));
        }
        this.logger.log(`[discovery] ${id} ${code}: ${outcome || ''} ${state.status} ${state.reason || (state.reasons || []).join(',')} (${candidates.length} offered, ${rejected.length} rejected)`);
    }

    private async score(list: RankedCandidate[]): Promise<Ranked[]> {
        return Promise.all(list.map(async (c) => {
            const visual = await this.visualFor(c.previewUrl);
            return { ...stored(c), ...scoreCandidate(c, visual) } as Ranked;
        }));
    }

    /** Web searches and AI checks run one product at a time, so a large import spends the allowance in order. */
    private inTurn<T>(work: () => Promise<T>): Promise<T> {
        const turn = this.turn.then(work, work);
        this.turn = turn.catch(() => undefined);
        return turn;
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
    async retry(supplierId: string, id: string, restore = false): Promise<DiscoveryState | null> {
        const p = await this.own(supplierId, id);
        if (!normaliseBarcode(p.ean)) throw new BadRequestException({ code: 'NO_BARCODE', message: 'Add the product’s barcode and save it first.' });
        return this.enqueue(id, { force: true, restore, add: realImages(p.images).length > 0, by: { id: supplierId, role: 'SUPPLIER' } });
    }

    /**
     * Use photos found for this product: `url` first, then `also` (other
     * exact-match photos for the gallery), each copied into Ali FMCG storage
     * and credited (licence, attribution, source page, who approved it).
     */
    async accept(supplierId: string, id: string, url: string, also: string[] = [], clean = false, confirmed = false) {
        const p = await this.own(supplierId, id);
        return this.apply(p, url, also, { id: supplierId, role: 'SUPPLIER' }, supplierId, clean, confirmed);
    }

    /** Make the white-background version of a found photo, for the supplier to look at before using it. */
    async whiten(supplierId: string, id: string, url: string): Promise<DiscoveryState | null> {
        return this.makeClean(await this.own(supplierId, id), url);
    }

    /** "This isn't my product": take an automatic photo off the product. It's never offered again. */
    async removeAutomatic(supplierId: string, id: string): Promise<DiscoveryState | null> {
        return this.removeAuto(await this.own(supplierId, id));
    }

    /** "Not my product": drop one found photo (or all), and never offer it again for this barcode. */
    async dismiss(supplierId: string, id: string, url?: string): Promise<DiscoveryState | null> {
        return this.drop(await this.own(supplierId, id), url);
    }

    // ─── Staff (Ali FMCG Catalog photos; read-only status for supplier products) ──

    /**
     * Products that need a photo or have photos waiting for review, with the
     * reason. Ali FMCG Catalog products can be acted on; supplier products are
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
            alert: await readVisionAlert(this.prisma),
            scope, total: list.length, page, limit, counts, canApply: scope === 'catalog',
            items: slice.map(({ r, bucket }) => ({
                id: r.id, name: r.name, brand: r.brand, ean: r.ean, status: r.status, bucket, hasPhoto: realImages(r.images).length > 0, photo: realImages(r.images)[0] || null,
                supplier: scope === 'submissions' ? (r.supplier?.companyName || r.supplier?.name || null) : null,
                // Supplier products: status only. The photos found are the supplier's to choose.
                discovery: scope === 'catalog' ? asState(r.imageDiscovery) : summary(asState(r.imageDiscovery)),
                automatic: bucket === 'auto' ? autoWaiting(r) : null,
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

    /** Reviewed: the automatic photo stays (a live product gets the one that was waiting). Reports each product. */
    async staffKeepAuto(actor: DiscoveryActor, ids: string[]) {
        const results: { id: string; outcome: 'kept' | 'nothing_waiting' | 'failed' }[] = [];
        for (const id of [...new Set((ids || []).map(String))].slice(0, 100)) {
            const p = await this.load(id);
            const waiting = p ? autoWaiting(p) : null;
            if (!p || !waiting) { results.push({ id, outcome: 'nothing_waiting' }); continue; }
            try {
                if (waiting.held) await this.apply(p, waiting.url, [], actor, p.supplierId, false, true);
                else {
                    const c = (creditsOf(p) as any)[waiting.url];
                    await this.products.setImageCredits(id, { [waiting.url]: { ...c, reviewedBy: actor.id, reviewedByRole: actor.role, reviewedAt: this.iso() } });
                }
                results.push({ id, outcome: 'kept' });
            } catch (e: any) {
                this.logger.warn(`[discovery] keep ${id}: ${e?.message}`);
                results.push({ id, outcome: 'failed' });
            }
        }
        return { results, kept: results.filter((r) => r.outcome === 'kept').length };
    }

    async staffRemoveAuto(id: string) {
        const p = await this.load(id);
        if (!p) throw new NotFoundException('Product not found');
        return this.removeAuto(p);
    }

    async staffGet(id: string) {
        const p = await this.load(id);
        if (!p) throw new NotFoundException('Product not found');
        const catalog = await this.isCatalog(p);
        const st = asState(p.imageDiscovery);
        return { catalog, canApply: catalog, state: catalog ? st : summary(st) };
    }

    async staffWhiten(id: string, url: string): Promise<DiscoveryState | null> {
        const p = await this.load(id);
        if (!p) throw new NotFoundException('Product not found');
        if (!(await this.isCatalog(p))) throw new ForbiddenException({ code: 'SUPPLIER_OWNED', message: 'This product belongs to a supplier. Only the supplier can choose its photos.' });
        return this.makeClean(p, url);
    }

    async staffAccept(actor: DiscoveryActor, id: string, url: string, also: string[] = [], clean = false, confirmed = false) {
        const p = await this.load(id);
        if (!p) throw new NotFoundException('Product not found');
        if (!(await this.isCatalog(p))) throw new ForbiddenException({ code: 'SUPPLIER_OWNED', message: 'This product belongs to a supplier. Only the supplier can choose its photos.' });
        return this.apply(p, url, also, actor, p.supplierId, clean, confirmed);
    }

    async staffDismiss(id: string, url?: string) {
        const p = await this.load(id);
        if (!p) throw new NotFoundException('Product not found');
        if (!(await this.isCatalog(p))) throw new ForbiddenException({ code: 'SUPPLIER_OWNED', message: 'This product belongs to a supplier. Only the supplier can choose its photos.' });
        return this.drop(p, url);
    }

    // ─── Shared ──────────────────────────────────────────────────────

    /** Photoroom charges per call, so a photo is processed once: the result stays on the candidate. */
    private async makeClean(p: Row, url: string): Promise<DiscoveryState | null> {
        const st = asState(p.imageDiscovery);
        const cand = st?.status === 'found_review' ? st.candidates.find((c) => c.url === url || c.previewUrl === url) : undefined;
        if (!st || !cand) throw new BadRequestException({ code: 'NOT_A_CANDIDATE', message: 'Only a photo found for this product’s barcode can be used here.' });
        if (cand.webImage) throw new BadRequestException({ code: 'ALREADY_WHITE', message: 'This photo is already on a white background.' });
        if (cand.clean) return st;
        const key = `${p.id}:${cand.url}`;
        if (this.cleaning.has(key)) throw new ConflictException({ code: 'ALREADY_RUNNING', message: 'This photo is already being processed.' });
        this.cleaning.add(key);
        try {
            const { buf, type } = await this.imageLookup.download(cand.url, ((u: any, i: any) => { const { signal, ...rest } = i || {}; void signal; return this.enrichment.imageQueue.fetch(String(u), { ...rest, timeoutMs: 15_000 }); }) as typeof fetch);
            const png = await this.photoroom.whiteBackground(buf, type);
            const saved = await this.imageLookup.store(png, 'image/png');
            const latest = await this.load(p.id);
            const now = latest ? asState(latest.imageDiscovery) : null;
            if (!latest || !now) return st;
            const clean = { url: saved.url, watermarked: this.photoroom.testMode, at: this.iso() };
            const next: DiscoveryState = { ...now, candidates: now.candidates.map((c) => (c.url === cand.url ? { ...c, clean } : c)) };
            await this.write(latest, next);
            return next;
        } finally {
            this.cleaning.delete(key);
        }
    }

    private async apply(p: Row, url: string, also: string[], actor: DiscoveryActor, ownerId: string, clean = false, confirmed = false) {
        const st = asState(p.imageDiscovery);
        const mode = st?.mode || 'fill';
        if (mode === 'fill' && realImages(p.images).length) throw new ConflictException({ code: 'HAS_PHOTO', message: 'This product already has a photo, so a found photo can’t be added here.' });
        const find = (u: string) => (st?.status === 'found_review' ? st.candidates.find((c) => c.url === u || c.previewUrl === u) : undefined);
        const main = find(url);
        if (!st || !main) throw new BadRequestException({ code: 'NOT_A_CANDIDATE', message: 'Only a photo found for this product’s barcode can be used here.' });
        if (main.role === 'similar' && !confirmed) throw new BadRequestException({ code: 'NOT_CONFIRMED', message: 'This photo has a different barcode. Confirm it shows exactly your product first.' });
        if (clean && !main.clean) throw new BadRequestException({ code: 'NOT_WHITENED', message: 'Make the white background first.' });
        // A sandbox result carries a watermark: it must never reach a product page.
        if (clean && main.clean?.watermarked) throw new ConflictException({ code: 'TEST_MODE', message: 'This white background was made in test mode and has a watermark, so it can’t be saved.' });
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
            if (clean && cand === main) { saved.push({ cand, url: main.clean!.url }); continue; }
            if (cand.webImage) { saved.push({ cand, url: cand.url }); continue; }   // copied here when it was found
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
        const isAuto = actor.role === 'SYSTEM';
        const who = actor.role === 'SUPPLIER' ? 'the supplier' : isAuto ? 'the automatic check' : `Ali FMCG (${actor.role.toLowerCase()})`;
        const wasLive = latest.status === 'APPROVED';
        let product: any = await this.products.supplierUpdate(p.id, ownerId, { images, changeReason: `${saved.length === 1 ? 'Photo' : `${saved.length} photos`} from ${main.source}${main.license ? ` (${main.license})` : ''}, chosen by ${who}` });
        // Staff adding a photo to a live Ali FMCG Catalog product is itself the review: keep it live.
        if (actor.role !== 'SUPPLIER' && wasLive && product?.status === 'PENDING') {
            product = await this.products.updateStatus(p.id, 'APPROVED' as any, '', { id: actor.id, role: actor.role }, { notify: false }).catch(() => product);
        }
        const at = new Date(this.now()).toISOString();
        await this.products.setImageCredits(p.id, Object.fromEntries(saved.map(({ cand, url: u }) => [u, {
            source: cand.source, license: cand.license, licenseUrl: cand.licenseUrl, attribution: cand.attribution, sourceUrl: cand.sourceUrl,
            barcode: st.barcode, originalUrl: cand.webImage || cand.url, origin: 'discovery', addedAt: at,
            ...(isAuto ? { chosenBy: 'auto', auto: cand.aiCheck } : {
                chosenBy: actor.role === 'SUPPLIER' ? 'supplier' : 'staff', approvedBy: actor.id, approvedByRole: actor.role, approvedAt: at,
                ...(cand.aiCheck ? { auto: cand.aiCheck, reviewedBy: actor.id, reviewedByRole: actor.role, reviewedAt: at } : {}),
            }),
            ...(cand.tier !== undefined ? { tier: cand.tier } : {}), ...(cand.imgid ? { imgid: cand.imgid } : {}),
            ...(cand.sourceBarcode ? { sourceBarcode: cand.sourceBarcode } : {}),
            ...(clean && cand === main ? { edited: 'Background changed to white (Photoroom)' } : {}),
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
        const dismissed = [...new Set([...(st.dismissed || []), ...drop.flatMap((c) => [c.url, ...(c.webImage ? [c.webImage] : [])])])].slice(-50);
        const left = st.candidates.filter((c) => !dismissed.includes(c.url));
        const next: DiscoveryState = left.length
            ? { ...st, candidates: left, dismissed }
            : { ...st, status: 'not_found', reason: 'dismissed', reasons: ['dismissed'], candidates: [], dismissed };
        await this.write(p, next);
        return next;
    }

    /** Whatever automatic photo is waiting on this product goes, and stays gone: the product is left without an answer to repeat. */
    private async removeAuto(p: Row): Promise<DiscoveryState | null> {
        const waiting = autoWaiting(p);
        if (!waiting) throw new BadRequestException({ code: 'NOT_AUTOMATIC', message: 'This product has no automatic photo waiting.' });
        if (waiting.held) return this.drop(p, waiting.url);
        const credit = (creditsOf(p) as any)[waiting.url];
        const images = realImages(p.images).filter((u) => u !== waiting.url);
        await this.products.supplierUpdate(p.id, p.supplierId, { images, changeReason: 'Automatic photo removed' });
        const after = await this.load(p.id);
        const code = normaliseBarcode(p.ean);
        const next: DiscoveryState = { status: 'not_found', barcode: code, mode: 'fill', checkedAt: this.iso(), reason: 'dismissed', reasons: ['dismissed'], candidates: [], dismissed: [credit?.originalUrl, waiting.url].filter(Boolean), auto: { at: this.iso(), outcome: 'no_match' } };
        if (after) await this.write(after, next);
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

    /** Ali FMCG Catalog = owned by a staff account (catalog-scope.ts). */
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

const SYSTEM: DiscoveryActor = { id: 'system', role: 'SYSTEM' };
type Ranked = DiscoveryCandidate & { tier: Tier | null; score: number; breakdown: ScoreLine[]; visual: Visual | null };

/** The AI confirmed it, and the licence lets it go on a product with nobody looking. Open*Facts photos are CC BY-SA; anything else waits for a person. */
function autoApplyAllowed(c: DiscoveryCandidate): boolean {
    const check = c.aiCheck;
    if (!check?.ok) return false;
    return mayPublish({ licence: /CC BY-SA/i.test(c.license) ? 'cc_by_sa' : 'unknown', confidence: check.confidence, domain: 'ean_database' }, DEFAULT_POLICY);
}

/** Worth asking the AI about: the pixels were read, the whole pack is shown, and the background is clean. */
function autoEligible(c: DiscoveryCandidate): boolean {
    const v = c.visual;
    return !!v && v.analysed === true && (v.background === 'white' || v.background === 'light_neutral') && v.fit !== 'cut';
}

/** The automatic photo staff still have to look at. Accepting a product for sale is itself that review. */
export function autoWaiting(r: { images: string[]; status?: string; imageDiscovery: unknown; imageCredits?: unknown }): { url: string; held: boolean; check: PhotoCheck | null } | null {
    const credits = r.imageCredits && typeof r.imageCredits === 'object' ? r.imageCredits as Record<string, any> : {};
    if (r.status !== 'APPROVED') {
        const url = realImages(r.images).find((u) => credits[u]?.chosenBy === 'auto' && !credits[u].reviewedAt);
        if (url) return { url, held: false, check: credits[url].auto || null };
    }
    const st = asState(r.imageDiscovery);
    const held = st?.auto?.outcome === 'held' || st?.auto?.outcome === 'needs_review' ? st.candidates.find((c) => c.aiCheck?.ok) : undefined;
    return held ? { url: held.url, held: true, check: held.aiCheck! } : null;
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
export function bucketOf(r: { ean: string | null; images: string[]; imageDiscovery: unknown; status?: string; imageCredits?: unknown }): PhotoBucket | null {
    if (autoWaiting(r)) return 'auto';
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
    productName: c.productName, brand: c.brand, quantity: c.quantity, ...(c.sourceBarcode ? { sourceBarcode: c.sourceBarcode } : {}), ...(c.webImage ? { webImage: c.webImage } : {}),
});
