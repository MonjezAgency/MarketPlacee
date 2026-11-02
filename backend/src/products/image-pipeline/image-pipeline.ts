import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';
import { kindOf, type ProductDataProvider } from '../product-data-providers';
import { raiseVisionAlert } from './alerts';
import { decodeBarcode } from './barcode';
import { composeCutout, composeWhite, type ComposeOutcome } from './compose';
import { downloadImage, type LookupCache } from './http';
import { parseGtin, sameCode, type Gtin } from './gtin';
import { buildIdentity, searchQueries } from './identity';
import { blockedDomain, DEFAULT_POLICY, domainClass, licenceOf, mayPublish, type LicencePolicy } from './licensing';
import { cleanName } from './name';
import { fingerprint, hashDistance, isWhiteBackground, rawRgb, whiteRingShare, type Fingerprint } from './pixels';
import { domainPoints, framingPoints, identityTextPoints, MIN_LONG_SIDE, resolutionPoints, total, visualPoints, WEIGHTS } from './scoring';
import type { LookupSource, SearchSource } from './sources';
import type { Candidate, Identity, IdentityRecord, ImageStatus, PipelineResult, PipelineRow, Scored, SourceCall, Trace, VisionVerdict } from './types';
import { DEFAULT_VISION_MODEL, SHADOW_VISION_MODEL, VisionGate, VisionUnavailable } from './vision';

export const PIPELINE_VERSION = 'b1';
const TOP = 5;
const MAX_DOWNLOADS = 40;
const DOWNLOADS_AT_ONCE = 6;
const MIN_USABLE_BEFORE_FALLBACK = 5;
/** Two photos this close are one photo. */
const SAME_PICTURE = 6;
const VISION_ROUNDS = 2;
const PHOTOROOM_COST = 0.02;

export interface PipelineDeps {
    lookups: LookupSource[];
    searches: SearchSource[];
    vision: VisionGate;
    cache: LookupCache;
    /** Basic background removal; absent when no key. */
    removeBackground?: (image: Buffer) => Promise<Buffer>;
    /** Why no cut-out can be made, when that is the case. */
    cutoutBlocked?: () => string | null;
    download?: (url: string) => ReturnType<typeof downloadImage>;
    style?: () => Promise<Buffer[]>;
    alerts?: Parameters<typeof raiseVisionAlert>[0];
    /** Cut-outs are paid for once in a test run. Too big for the database, so production passes none. */
    cutoutCache?: LookupCache;
}
export interface RunOptions { upload?: string; policy?: LicencePolicy; shadow?: boolean; model?: string }

const longest = (c: Candidate) => Math.max(c.width || 0, c.height || 0);
const digest = (b: Buffer) => createHash('sha1').update(b).digest('hex');

async function inBatches<T, R>(list: T[], size: number, work: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = [];
    for (let i = 0; i < list.length; i += size) out.push(...await Promise.all(list.slice(i, i + size).map(work)));
    return out;
}

/** One row of a price list, from its barcode to a house-style photo or an exact reason why not. Stores nothing: the job around it does. */
export class ImagePipeline {
    private readonly logger = new Logger('ImagePipeline');
    constructor(private readonly deps: PipelineDeps, private readonly providers: ProductDataProvider[] = []) {}

    async run(row: PipelineRow, opts: RunOptions = {}): Promise<PipelineResult> {
        const trace: Trace = {
            version: PIPELINE_VERSION, row: { ean: row.ean, name: row.name ?? null, brand: row.brand ?? null }, calls: [],
            candidates: { found: 0, bySource: {}, downloaded: 0 }, rejects: [], scored: [], barcode: { attempted: 0, decoded: 0, matched: 0 }, vision: [], cost: { total: 0, bySource: {} },
        };
        const done = (status: ImageStatus, reason: string, extra: Partial<PipelineResult> = {}): PipelineResult => {
            for (const c of trace.calls) if (c.cost) { trace.cost.total += c.cost; trace.cost.bySource[c.source] = (trace.cost.bySource[c.source] || 0) + c.cost; }
            return { status, reason, trace, top: [], publishable: { A: false, B: false }, ...extra };
        };
        try {
            return await this.steps(row, opts, trace, done);
        } catch (e: any) {
            this.logger.warn(`[pipeline] ${row.ean}: ${e?.message}`);
            return done('failed', `pipeline_error: ${String(e?.message).slice(0, 120)}`);
        }
    }

    private async steps(row: PipelineRow, opts: RunOptions, trace: Trace, done: (s: ImageStatus, r: string, x?: Partial<PipelineResult>) => PipelineResult): Promise<PipelineResult> {
        const gtin = parseGtin(row.ean);
        trace.gtin = { canonical: gtin.canonical, caseCode: gtin.caseCode, inner: gtin.inner, searchCodes: gtin.searchCodes, problem: gtin.problem };
        if (gtin.problem) return done('invalid_ean', gtin.problem);
        const name = cleanName(row.name ?? '', row.brand ?? '');
        trace.name = name;

        const { records, candidates } = await this.lookups(gtin, row, trace.calls);
        const identity = buildIdentity(gtin, name, records);
        trace.identity = identity;
        candidates.push(...await this.searches(identity, candidates, trace.calls));
        candidates.push(...supplierCandidates(row));
        trace.candidates.found = candidates.length;
        for (const c of candidates) trace.candidates.bySource[c.source] = (trace.candidates.bySource[c.source] || 0) + 1;
        if (!candidates.length) return done('not_found', `no_candidates: ${noCandidates(this.deps, trace.calls)}`);

        const { scored, tooSmall } = await this.assess(candidates, identity, gtin, trace);
        if (!scored.length) {
            return tooSmall ? done('low_res', `every usable photo is under ${MIN_LONG_SIDE}px (${tooSmall} found)`) : done('not_found', `all_rejected: ${summarise(trace.rejects)}`);
        }
        const top = scored.slice(0, TOP);
        if (!this.deps.vision.enabled) return done('needs_review', 'vision_unavailable: no OPENROUTER_API_KEY, nothing approved automatically', { top });
        return this.decide(scored, identity, opts, trace, done);
    }

    private async lookups(gtin: Gtin, row: PipelineRow, calls: SourceCall[]) {
        const records: IdentityRecord[] = [];
        const candidates: Candidate[] = [];
        const kind = kindOf(row.category);
        await Promise.all(this.deps.lookups.filter((s) => s.enabled()).map(async (source) => {
            for (const code of gtin.searchCodes) {
                const a = await source.lookup(code, gtin.canonical, calls, kind).catch(() => ({ record: null, candidates: [] }));
                if (a.record) records.push(a.record);
                candidates.push(...a.candidates);
            }
        }));
        return { records, candidates };
    }

    /** Serper first; Brave only when the barcode databases and Serper together leave too little. */
    private async searches(identity: Identity, have: Candidate[], calls: SourceCall[]): Promise<Candidate[]> {
        const usable = (list: Candidate[]) => list.filter((c) => !blockedDomain(c) && (!longest(c) || longest(c) >= MIN_LONG_SIDE)).length;
        const queries = searchQueries(identity);
        const found: Candidate[] = [];
        const [first, ...rest] = this.deps.searches.filter((s) => s.enabled());
        if (!first) return found;
        for (const q of queries) found.push(...await first.search(q.query, identity.ean, q.language, calls).catch(() => []));
        if (usable([...have, ...found]) >= MIN_USABLE_BEFORE_FALLBACK) return found;
        for (const next of rest) for (const q of queries.slice(0, 3)) found.push(...await next.search(q.query, identity.ean, q.language, calls).catch(() => []));
        return found;
    }

    /** Hard rejects, then the points. What survives is ranked, best first. */
    private async assess(all: Candidate[], identity: Identity, gtin: Gtin, trace: Trace): Promise<{ scored: Scored[]; tooSmall: number }> {
        const reject = (c: Candidate, reason: string) => trace.rejects.push({ url: c.url, source: c.source, reason });
        let tooSmall = 0;
        const seen = new Set<string>();
        const open: Candidate[] = [];
        for (const c of all) {
            if (seen.has(c.url)) continue;
            seen.add(c.url);
            const blocked = blockedDomain(c);
            if (blocked) { reject(c, `blocked_domain:${blocked}`); continue; }
            if (longest(c) && longest(c) < MIN_LONG_SIDE && !c.bytes) { tooSmall++; reject(c, `under_${MIN_LONG_SIDE}px`); continue; }
            open.push(c);
        }
        open.sort((a, b) => Number(!!b.bytes) - Number(!!a.bytes) || identityTextPoints(b, identity, gtin.searchCodes) - identityTextPoints(a, identity, gtin.searchCodes) || longest(b) - longest(a));
        const download = this.deps.download ?? downloadImage;
        const references = await this.referencePrints(identity, download);
        const opened = await inBatches(open.slice(0, MAX_DOWNLOADS), DOWNLOADS_AT_ONCE, async (c) => {
            const got = c.bytes ? { ok: true as const, bytes: c.bytes } : await download(c.url);
            if (got.ok === false) { reject(c, got.reason); return null; }
            trace.candidates.downloaded++;
            try {
                const raw = await rawRgb(got.bytes);
                if (Math.max(raw.width, raw.height) < MIN_LONG_SIDE) { tooSmall++; reject(c, `under_${MIN_LONG_SIDE}px`); return null; }
                return { c, bytes: got.bytes, raw, print: await fingerprint(got.bytes) };
            } catch { reject(c, 'not_an_image'); return null; }
        });
        const kept = opened.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => Math.max(b.raw.width, b.raw.height) - Math.max(a.raw.width, a.raw.height));
        // Largest first, so the copy that stays of any duplicate is the sharpest.
        const unique: typeof kept = [];
        for (const k of kept) {
            if (unique.some((u) => hashDistance(u.print, k.print) <= SAME_PICTURE)) reject(k.c, 'duplicate');
            else unique.push(k);
        }
        const scored = unique.map(({ c, bytes, raw, print }): Scored => {
            const cls = domainClass(c, identity.brand);
            const white = isWhiteBackground(raw);
            const parts = {
                white: white ? WEIGHTS.white : Math.round(WEIGHTS.white * whiteRingShare(raw) * 5) / 10,
                resolution: resolutionPoints(Math.max(raw.width, raw.height)),
                identityText: identityTextPoints(c, identity, gtin.searchCodes), visual: visualPoints(print, references),
                domain: domainPoints(cls), framing: framingPoints(print), barcode: 0,
            };
            return { ...c, bytes, parts, score: total(parts), domainClass: cls, licence: licenceOf(c, cls), decodedBarcode: null, pixelWidth: raw.width, pixelHeight: raw.height, whiteBackground: white };
        }).sort((a, b) => b.score - a.score);
        const clean = await this.readBarcodes(scored, gtin, trace);
        trace.scored = clean.map((s) => ({ url: s.url, source: s.source, score: s.score, parts: s.parts, licence: s.licence, decoded: s.decodedBarcode }));
        return { scored: clean, tooSmall };
    }

    private async referencePrints(identity: Identity, download: NonNullable<PipelineDeps['download']>): Promise<Fingerprint[]> {
        const prints = await Promise.all(identity.references.map(async (url) => {
            const got = await download(url);
            return got.ok ? fingerprint(got.bytes).catch(() => null) : null;
        }));
        return prints.filter((p): p is Fingerprint => !!p);
    }

    /** A printed barcode that differs is proof of another product; one that matches is the best proof there is. Read down the ranking until the top is settled. */
    private async readBarcodes(scored: Scored[], gtin: Gtin, trace: Trace): Promise<Scored[]> {
        const keep: Scored[] = [];
        const limit = TOP * 3;
        for (const s of scored) {
            if (keep.length >= limit) { keep.push(s); continue; }
            trace.barcode.attempted++;
            const code = await decodeBarcode(s.bytes).catch(() => null);
            if (code) {
                trace.barcode.decoded++;
                s.decodedBarcode = code;
                if (gtin.searchCodes.some((c) => sameCode(c, code))) {
                    trace.barcode.matched++;
                    s.parts = { ...s.parts, barcode: WEIGHTS.barcode };
                    s.score = total(s.parts);
                } else { trace.rejects.push({ url: s.url, source: s.source, reason: `barcode_differs:${code}` }); continue; }
            }
            keep.push(s);
        }
        return keep.sort((a, b) => b.score - a.score);
    }

    private async decide(scored: Scored[], identity: Identity, opts: RunOptions, trace: Trace, done: (s: ImageStatus, r: string, x?: Partial<PipelineResult>) => PipelineResult): Promise<PipelineResult> {
        const model = opts.model || DEFAULT_VISION_MODEL;
        const policy = opts.policy || DEFAULT_POLICY;
        const eligible = scored.filter((s) => !s.isEditorial && s.licence !== 'editorial');
        const top = scored.slice(0, TOP);
        if (!eligible.length) return done('needs_review', 'only editorial photos found: never published', { top });
        const references = await this.identityPhotos(identity);
        const style = await this.deps.style?.().catch(() => []) ?? [];
        let queue = eligible;
        let lastReason = '';
        let lowRes = false;
        for (let round = 0; round < VISION_ROUNDS && queue.length; round++) {
            const batch = queue.slice(0, TOP);
            const verdict = await this.ask(model, identity, batch, references, style, trace, opts).catch((e) => e as VisionUnavailable);
            if (!isVerdict(verdict)) {
                const code = verdict instanceof VisionUnavailable ? verdict.code : 'error';
                if (this.deps.alerts) await raiseVisionAlert(this.deps.alerts, this.logger, { code: 'vision_unavailable', status: verdict instanceof VisionUnavailable ? verdict.httpStatus : undefined, scope: opts.upload || new Date().toISOString().slice(0, 13) }).catch(() => undefined);
                return done('needs_review', `vision_unavailable: ${code}, nothing approved automatically`, { top });
            }
            if (!verdict.passed) return done('needs_review', `vision_failed: ${verdict.failed.join(', ')}${verdict.reason ? ` (${verdict.reason})` : ''}`, { top, chosen: batch[verdict.index] });
            const chosen = batch[verdict.index];
            const made = await this.compose(chosen, trace);
            if (made.status === 'ok') {
                trace.compose = { engine: made.engine, checks: { ...made.checks } };
                const conflict = identity.conflicts.some((c) => c.startsWith('brand'));
                const allowed = (p: LicencePolicy) => !conflict && mayPublish({ licence: chosen.licence, confidence: verdict.confidence, domain: chosen.domainClass, isEditorial: chosen.isEditorial }, p);
                const publishable = { A: allowed('A'), B: allowed('B') };
                const extra = { top, chosen, publishable, output: { jpeg: made.jpeg, webp: made.webp } };
                if (publishable[policy]) return done('approved', `vision ${verdict.confidence.toFixed(2)}, licence ${chosen.licence}, ${chosen.domainClass}`, extra);
                return done('needs_review', conflict ? `brand_conflict: ${identity.conflicts.join('; ')}` : `licence_${chosen.licence}: confirmed by vision, publishing needs a person under policy ${policy}`, extra);
            }
            trace.compose = { engine: made.engine, checks: { ...made.checks } };
            lastReason = made.reason;
            lowRes = made.status === 'low_res';
            if (made.status === 'needs_review' || made.status === 'failed') return done(made.status === 'failed' ? 'failed' : 'needs_review', `compose: ${made.reason}`, { top, chosen });
            queue = queue.filter((s) => s !== chosen);
        }
        return lowRes ? done('low_res', `compose: ${lastReason}`, { top }) : done('needs_review', `compose: ${lastReason || 'no candidate passed'}`, { top });
    }

    private async identityPhotos(identity: Identity): Promise<Buffer[]> {
        const download = this.deps.download ?? downloadImage;
        const got = await Promise.all(identity.references.slice(0, 1).map((u) => download(u)));
        return got.flatMap((g) => (g.ok ? [g.bytes] : []));
    }

    /** The gate that decides, and beside it, on the same pictures, the cheaper model being measured. Its answer changes nothing. */
    private async ask(model: string, identity: Identity, batch: Scored[], references: Buffer[], style: Buffer[], trace: Trace, opts: RunOptions): Promise<VisionVerdict> {
        const pictures = batch.map((b) => b.bytes);
        const [main] = await Promise.all([
            this.deps.vision.check(model, identity, pictures, references, style, trace.calls),
            opts.shadow ? this.deps.vision.check(SHADOW_VISION_MODEL, identity, pictures, references, style, trace.calls).then((v) => { trace.vision.push(v); }).catch(() => undefined) : undefined,
        ]);
        trace.vision.unshift(main);
        return main;
    }

    private async compose(chosen: Scored, trace: Trace): Promise<ComposeOutcome> {
        if (chosen.whiteBackground) return composeWhite(chosen.bytes);
        const blocked = this.deps.cutoutBlocked?.();
        if (blocked) return { status: 'needs_review', reason: blocked, engine: 'photoroom', checks: {} };
        if (!this.deps.removeBackground) return { status: 'needs_review', reason: 'photoroom_not_configured', engine: 'photoroom', checks: {} };
        const remove = this.deps.removeBackground;
        return composeCutout(chosen.bytes, async (image) => {
            const key = `cutout:${digest(image)}`;
            const hit = await this.deps.cutoutCache?.get(key).catch(() => undefined) as string | undefined;
            if (hit) { trace.calls.push({ source: 'photoroom', what: 'segment', status: 'cached', ms: 0, cost: 0 }); return Buffer.from(hit, 'base64'); }
            const started = Date.now();
            const png = await remove(image);
            trace.calls.push({ source: 'photoroom', what: 'segment', status: 200, ms: Date.now() - started, cost: PHOTOROOM_COST });
            await this.deps.cutoutCache?.set(key, png.toString('base64'), 30).catch(() => undefined);
            return png;
        });
    }
}

const isVerdict = (v: VisionVerdict | Error): v is VisionVerdict => !(v instanceof Error);

function supplierCandidates(row: PipelineRow): Candidate[] {
    return (row.supplierImages || []).map((s, i): Candidate => ({ url: s.url || `supplier:${row.ean}:${i}`, source: 'supplier', title: row.name ?? undefined, licence: 'supplier', foundBy: row.ean, ...(s.bytes ? { bytes: s.bytes } : {}) }));
}

function noCandidates(deps: PipelineDeps, calls: SourceCall[]): string {
    const on = [...deps.lookups, ...deps.searches].filter((s) => s.enabled()).map((s) => s.id);
    const failed = [...new Set(calls.filter((c) => c.status !== 200 && c.status !== 404 && c.status !== 'cached').map((c) => `${c.source}=${c.status}`))];
    return `asked ${on.join(', ') || 'no source'}${failed.length ? `; failed: ${failed.join(', ')}` : ''}`;
}

function summarise(rejects: Trace['rejects']): string {
    const n = new Map<string, number>();
    for (const r of rejects) { const k = r.reason.split(':')[0]; n.set(k, (n.get(k) || 0) + 1); }
    return [...n.entries()].map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
}
