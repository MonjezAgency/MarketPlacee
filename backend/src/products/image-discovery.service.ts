import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { barcodeProblem, normaliseBarcode, realImages } from './catalog-rules';
import { ImageLookupService } from './image-lookup.service';
import { ImportEnrichmentService, type RankedCandidate } from './import-enrichment.service';
import { ProductsService } from './products.service';

/**
 * Background photo search for products saved without a photo.
 *
 * When a supplier saves a product (editor, import, legacy bulk upload) that
 * has a valid barcode and no photo, the barcode is looked up in the
 * background through the shared engine (ImportEnrichmentService: same cache,
 * same rate-limited queue as the import review). The outcome is stored on
 * the product (`Product.imageDiscovery`) so it survives reloads and restarts
 * and can be shown in the editor and the product list.
 *
 * Nothing is ever applied automatically: a found photo waits for the
 * supplier's "Use this photo". A product that has a photo is never touched,
 * and accepting refuses if one appeared meanwhile — nothing is overwritten.
 * Product status and publication rules are unchanged (a product without a
 * photo stays a draft because photos are required).
 */

export type DiscoveryStatus = 'searching' | 'found_review' | 'not_found' | 'unavailable' | 'invalid_barcode';
export interface DiscoveryCandidate {
    url: string; previewUrl: string; source: string; sourceUrl: string; license: string; licenseUrl: string; attribution: string;
    confidence: 'verified' | 'needs_confirmation'; reasons: string[];
    kind?: string; language?: string | null; width?: number; height?: number;
    productName?: string | null; brand?: string | null; quantity?: string | null;
}
export interface DiscoveryState {
    status: DiscoveryStatus;
    barcode: string;
    startedAt?: string;
    checkedAt?: string;
    /** Main reason code when nothing usable was found (not_in_database, no_photo, source_unavailable, internal_code, dismissed…). */
    reason?: string;
    reasons?: string[];
    candidates: DiscoveryCandidate[];
    /** Photos the supplier said are not their product: never offered again for this barcode. */
    dismissed?: string[];
    attempts?: number;
}

/** A search answered "unavailable" may run again on the next save after this long. */
const UNAVAILABLE_RETRY_MS = 10 * 60 * 1000;
/** An explicit retry within this time of the last answer is refused (the queue is shared by everyone). */
export const RETRY_COOLDOWN_MS = 30 * 1000;
const SELECT = { id: true, supplierId: true, ean: true, images: true, name: true, brand: true, weight: true, category: true, imageDiscovery: true, updatedAt: true } as const;
type Row = { id: string; supplierId: string; ean: string | null; images: string[]; name: string; brand: string | null; weight: string | null; category: string; imageDiscovery: unknown; updatedAt: Date };

@Injectable()
export class ImageDiscoveryService implements OnModuleInit {
    private readonly logger = new Logger(ImageDiscoveryService.name);
    /** productId → barcode being searched in this process (dedupes saves, retries and imports). */
    private readonly inflight = new Map<string, string>();
    /** Promises of running searches, for tests and graceful waits. */
    readonly running = new Map<string, Promise<void>>();
    now = () => Date.now();

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

    /** After any supplier save: start a search if it is needed. Never throws. */
    trigger(productId: string) {
        this.enqueue(productId).catch((e) => this.logger.warn(`[discovery] ${productId}: ${e?.message}`));
    }

    /**
     * Decide whether this product needs a search and start it. Returns the
     * state now stored. `force` = the supplier asked to search again (skips
     * cached "not found" answers; never runs twice at once).
     */
    async enqueue(productId: string, opts: { force?: boolean } = {}): Promise<DiscoveryState | null> {
        const p = await this.load(productId);
        if (!p) return null;
        const state = asState(p.imageDiscovery);
        // A product with a photo needs nothing; a stale suggestion is cleared.
        if (realImages(p.images).length) { if (state) await this.write(p, null); return null; }
        const code = normaliseBarcode(p.ean);
        if (!code) { if (state) await this.write(p, null); return null; }
        if (barcodeProblem(code)) {
            const s: DiscoveryState = { status: 'invalid_barcode', barcode: code, checkedAt: this.iso(), reason: 'invalid_barcode', reasons: ['invalid_barcode'], candidates: [] };
            if (!(state?.status === 'invalid_barcode' && state.barcode === code)) await this.write(p, s);
            return s;
        }
        if (this.inflight.get(p.id) === code) return state;           // already searching this barcode
        const same = !!state && state.barcode === code;
        if (same && state!.status !== 'searching') {
            const at = Date.parse(state!.checkedAt || '');
            const age = Number.isFinite(at) ? this.now() - at : Infinity;
            if (!opts.force && !(state!.status === 'unavailable' && age > UNAVAILABLE_RETRY_MS)) return state;   // answered already
            if (opts.force && age < RETRY_COOLDOWN_MS) return state;
        }
        const next: DiscoveryState = {
            status: 'searching', barcode: code, startedAt: this.iso(), candidates: [],
            ...(same && state!.dismissed?.length ? { dismissed: state!.dismissed } : {}),
            attempts: (same ? state!.attempts || 0 : 0) + 1,
        };
        await this.write(p, next);
        this.inflight.set(p.id, code);
        const job = this.run(p.id, code, !!opts.force)
            .catch((e) => this.logger.warn(`[discovery] ${p.id}: ${e?.message}`))
            .finally(() => { if (this.inflight.get(p.id) === code) this.inflight.delete(p.id); this.running.delete(p.id); });
        this.running.set(p.id, job);
        return next;
    }

    private async run(id: string, code: string, fresh: boolean) {
        const p0 = await this.load(id);
        if (!p0) return;
        const out = await this.enrichment.lookupOne({ ean: code, name: p0.name, brand: p0.brand || undefined, weight: p0.weight || undefined, category: p0.category }, { fresh });
        // Re-read: the supplier may have changed the barcode or added a photo while we waited.
        const p = await this.load(id);
        if (!p || normaliseBarcode(p.ean) !== code) return;          // that save started its own search
        const cur = asState(p.imageDiscovery);
        if (realImages(p.images).length) { if (cur) await this.write(p, null); return; }
        const dismissed = new Set(cur?.barcode === code ? cur.dismissed || [] : []);
        const candidates = out.candidates.filter((c) => !dismissed.has(c.url)).map(stored);
        const base = { barcode: code, startedAt: cur?.startedAt, checkedAt: this.iso(), ...(dismissed.size ? { dismissed: [...dismissed] } : {}), attempts: cur?.attempts };
        const state: DiscoveryState = candidates.length
            ? { ...base, status: 'found_review', candidates }
            : { ...base, status: out.status === 'unavailable' ? 'unavailable' : out.status === 'invalid_barcode' ? 'invalid_barcode' : 'not_found', reason: out.candidates.length ? 'dismissed' : out.reasons[0] || 'not_in_database', reasons: out.reasons, candidates: [] };
        await this.write(p, state);
    }

    // ─── Supplier actions (own products only) ────────────────────────

    async get(supplierId: string, id: string): Promise<DiscoveryState | null> {
        return asState((await this.own(supplierId, id)).imageDiscovery);
    }

    async retry(supplierId: string, id: string): Promise<DiscoveryState | null> {
        const p = await this.own(supplierId, id);
        if (realImages(p.images).length) throw new BadRequestException({ code: 'HAS_PHOTO', message: 'This product already has a photo.' });
        if (!normaliseBarcode(p.ean)) throw new BadRequestException({ code: 'NO_BARCODE', message: 'Add the product’s barcode and save it first.' });
        return this.enqueue(id, { force: true });
    }

    /**
     * Use one of the photos found for this product: copied into Atlantis
     * storage, added as the product's photo and credited (licence,
     * attribution, source page). Only a stored candidate can be used, and
     * never on a product that has a photo.
     */
    async accept(supplierId: string, id: string, url: string) {
        const p = await this.own(supplierId, id);
        if (realImages(p.images).length) throw new ConflictException({ code: 'HAS_PHOTO', message: 'This product already has a photo, so a found photo can’t be added here.' });
        const st = asState(p.imageDiscovery);
        const cand = st?.status === 'found_review' ? st.candidates.find((c) => c.url === url || c.previewUrl === url) : undefined;
        if (!st || !cand) throw new BadRequestException({ code: 'NOT_A_CANDIDATE', message: 'Only a photo found for this product’s barcode can be used here.' });
        if (normaliseBarcode(p.ean) !== st.barcode) throw new BadRequestException({ code: 'BARCODE_CHANGED', message: 'The barcode changed since this photo was found. Search again.' });
        const saved = await this.imageLookup.accept(cand.url, ((u: any, i: any) => this.enrichment.imageQueue.fetch(String(u), i)) as typeof fetch);
        // Last check right before writing: a photo the supplier added meanwhile is never replaced.
        const latest = await this.load(id);
        if (!latest || realImages(latest.images).length) throw new ConflictException({ code: 'HAS_PHOTO', message: 'This product got a photo in the meantime; nothing was changed.' });
        const product = await this.products.supplierUpdate(id, supplierId, { images: [saved.url], changeReason: `Photo from ${cand.source} (${cand.license}), chosen by the supplier` });
        await this.products.setImageCredits(id, {
            [saved.url]: { source: cand.source, license: cand.license, licenseUrl: cand.licenseUrl, attribution: cand.attribution, sourceUrl: cand.sourceUrl, barcode: st.barcode, originalUrl: cand.url, chosenBy: 'supplier', addedAt: new Date(this.now()).toISOString() },
        }).catch((e) => this.logger.warn(`[discovery] credit for ${id}: ${e?.message}`));
        const after = await this.load(id);
        if (after) await this.write(after, null);
        return { ...product, imageDiscovery: null };
    }

    /** "Not my product": drop one found photo (or all), and never offer it again for this barcode. */
    async dismiss(supplierId: string, id: string, url?: string): Promise<DiscoveryState | null> {
        const p = await this.own(supplierId, id);
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

    // ─── Storage ─────────────────────────────────────────────────────

    private async own(supplierId: string, id: string): Promise<Row> {
        const p = await this.prisma.product.findFirst({ where: { id: String(id), supplierId }, select: SELECT as any }) as unknown as Row | null;
        if (!p) throw new NotFoundException('Product not found');
        return p;
    }

    private load(id: string): Promise<Row | null> {
        return this.prisma.product.findUnique({ where: { id }, select: SELECT as any }) as unknown as Promise<Row | null>;
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

const stored = (c: RankedCandidate): DiscoveryCandidate => ({
    url: c.url, previewUrl: c.previewUrl, source: c.source, sourceUrl: c.sourceUrl, license: c.license, licenseUrl: c.licenseUrl, attribution: c.attribution,
    confidence: c.confidence, reasons: c.reasons, kind: c.kind, language: c.language ?? null,
    ...(c.width && c.height ? { width: c.width, height: c.height } : {}),
    productName: c.productName, brand: c.brand, quantity: c.quantity,
});
