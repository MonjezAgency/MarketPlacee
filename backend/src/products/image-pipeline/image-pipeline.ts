import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';
import { kindOf, type ProductDataProvider } from '../product-data-providers';
import { raiseVisionAlert } from './alerts';
import { decodeBarcode } from './barcode';
import { composeCutout, composeWhite, type ComposeOutcome } from './compose';
import { downloadImage, type Download, type LookupCache } from './http';
import { parseGtin, sameCode, type Gtin } from './gtin';
import { buildIdentity, searchQueries } from './identity';
import { blockedDomain, DEFAULT_POLICY, domainClass, licenceOf, mayPublish, type LicencePolicy } from './licensing';
import { cleanName } from './name';
import { fingerprint, hashDistance, isWhiteBackground, rawRgb, whiteRingShare, type Fingerprint } from './pixels';
import { domainPoints, framingPoints, identityTextPoints, MIN_LONG_SIDE, resolutionPoints, total, visualPoints, WEIGHTS } from './scoring';
import type { LookupSource, SearchSource } from './sources';
import type { Candidate, Identity, IdentityRecord, ImageStatus, PipelineResult, PipelineRow, Scored, SourceCall, Trace, VisionVerdict } from './types';
import { VisionGate, VisionUnavailable, visionModel } from './vision';

export const PIPELINE_VERSION = 'b2';
const TOP = 5;
const MAX_DOWNLOADS = 40;
const DOWNLOADS_AT_ONCE = 6;
/** A first search that leaves this many usable photos gets no second one. */
const ENOUGH_FROM_A_SEARCH = 3;
/** Two photos this close are one photo. */
const SAME_PICTURE = 6;
/** Free vision calls are few: this is the most one row may use. */
const VISION_CALLS = 3;
const PHOTOROOM_COST = 0.02;

export interface PipelineDeps {
    lookups: LookupSource[];
    searches: SearchSource[];
    vision: VisionGate;
    cache: LookupCache;
    /** Basic background removal, a paid call. */
    removeBackground?: (image: Buffer) => Promise<Buffer>;
    /** Why no cut-out can be made, when that is the case. Off until the owner decides on paying. */
    cutoutBlocked?: () => string | null;
    /** Sandbox key only: a watermarked preview of the cut-out. */
    previewBackground?: (image: Buffer) => Promise<Buffer>;
    download?: (url: string) => ReturnType<typeof downloadImage>;
    style?: () => Promise<Buffer[]>;
    alerts?: Parameters<typeof raiseVisionAlert>[0];
    /** Cut-outs are paid for once in a test run. Too big for the database, so production passes none. */
    cutoutCache?: LookupCache;
}
export interface RunOptions { upload?: string; policy?: LicencePolicy; model?: string }
type Done = (status: ImageStatus, reason: string, extra?: Partial<PipelineResult>) => PipelineResult;
interface RunState {
    /** Everything usable so far, best first. */
    scored: Scored[];
    prints: Fingerprint[];
    seen: Set<string>;
    tooSmall: number;
    lastUsable: number;
    visionCalls: number;
    /** The nearest miss, what a person sees if nothing better comes. */
    failed: { status: ImageStatus; reason: string; confidence: number; chosen?: Scored } | null;
    downloads: Map<string, Promise<Download>>;
}

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

    /**
     * Free sources first, one at a time, stopping at the first photo vision accepts:
     * supplier pictures, Open Facts, UPCitemdb, the keyed free tiers, and only then
     * the capped web search. A source's photos that vision turns down are no reason
     * to stop; a day without vision is, because nothing could be judged.
     */
    private async steps(row: PipelineRow, opts: RunOptions, trace: Trace, done: Done): Promise<PipelineResult> {
        const gtin = parseGtin(row.ean);
        trace.gtin = { canonical: gtin.canonical, caseCode: gtin.caseCode, inner: gtin.inner, searchCodes: gtin.searchCodes, problem: gtin.problem };
        if (gtin.problem) return done('invalid_ean', gtin.digits ? gtin.problem : 'no barcode on this row');
        const name = cleanName(row.name ?? '', row.brand ?? '');
        trace.name = name;

        const records: IdentityRecord[] = [];
        const state: RunState = { scored: [], prints: [], seen: new Set(), tooSmall: 0, lastUsable: 0, visionCalls: 0, failed: null, downloads: new Map() };
        const look = async (fresh: Candidate[]) => {
            const unseen = fresh.filter((c) => !state.seen.has(c.url));
            state.lastUsable = 0;
            if (!unseen.length) return null;
            const identity = buildIdentity(gtin, name, records);
            trace.identity = identity;
            trace.candidates.found += unseen.length;
            for (const c of unseen) trace.candidates.bySource[c.source] = (trace.candidates.bySource[c.source] || 0) + 1;
            const scored = await this.assess(unseen, identity, gtin, trace, state);
            state.lastUsable = scored.length;
            if (!scored.length) return null;
            state.scored.push(...scored);
            state.scored.sort((a, b) => b.score - a.score);
            return this.judge(scored, identity, opts, trace, state, done);
        };

        const fromSupplier = await look(supplierCandidates(row));
        if (fromSupplier) return fromSupplier;
        for (const source of this.deps.lookups.filter((s) => s.enabled())) {
            const found = await this.ask(source, gtin, row, trace.calls);
            records.push(...found.records);
            const result = await look(found.candidates);
            if (result) return result;
        }
        trace.identity = buildIdentity(gtin, name, records);

        // Nothing could judge what a search finds, so nothing is spent on one.
        const down = await this.deps.vision.unavailable();
        if (down) return done('needs_review', visionDown(down), { top: state.scored.slice(0, TOP), chosen: state.failed?.chosen });
        for (const source of this.deps.searches.filter((s) => s.enabled())) {
            for (const q of searchQueries(trace.identity)) {
                const result = await look(await source.search(q.query, trace.identity.ean, q.language, trace.calls).catch(() => []));
                if (result) return result;
                if (state.lastUsable >= ENOUGH_FROM_A_SEARCH) break;
            }
        }
        return this.nothingAccepted(state, trace, done);
    }

    private nothingAccepted(state: RunState, trace: Trace, done: Done) {
        const top = state.scored.slice(0, TOP);
        if (state.failed) return done(state.failed.status, state.failed.reason, { top, chosen: state.failed.chosen });
        if (state.scored.length) return done('needs_review', 'no candidate passed', { top });
        if (state.tooSmall) return done('low_res', `every usable photo is under ${MIN_LONG_SIDE}px (${state.tooSmall} found)`);
        return trace.candidates.found ? done('not_found', `all_rejected: ${summarise(trace.rejects)}`) : done('not_found', `no_candidates: ${noCandidates(this.deps, trace.calls)}`);
    }

    private async ask(source: LookupSource, gtin: Gtin, row: PipelineRow, calls: SourceCall[]) {
        const records: IdentityRecord[] = [];
        const candidates: Candidate[] = [];
        for (const code of gtin.searchCodes) {
            const a = await source.lookup(code, gtin.canonical, calls, kindOf(row.category)).catch(() => ({ record: null, candidates: [] }));
            if (a.record) records.push(a.record);
            candidates.push(...a.candidates);
        }
        return { records, candidates };
    }

    /** Hard rejects, then the points. What survives is ranked, best first. */
    private async assess(all: Candidate[], identity: Identity, gtin: Gtin, trace: Trace, state: RunState): Promise<Scored[]> {
        const reject = (c: Candidate, reason: string) => trace.rejects.push({ url: c.url, source: c.source, reason });
        const open: Candidate[] = [];
        for (const c of all) {
            if (state.seen.has(c.url)) continue;
            state.seen.add(c.url);
            const blocked = blockedDomain(c);
            if (blocked) { reject(c, `blocked_domain:${blocked}`); continue; }
            if (longest(c) && longest(c) < MIN_LONG_SIDE && !c.bytes) { state.tooSmall++; reject(c, `under_${MIN_LONG_SIDE}px`); continue; }
            open.push(c);
        }
        open.sort((a, b) => Number(!!b.bytes) - Number(!!a.bytes) || identityTextPoints(b, identity, gtin.searchCodes) - identityTextPoints(a, identity, gtin.searchCodes) || longest(b) - longest(a));
        const download = this.downloader(state);
        const references = await this.referencePrints(identity, download);
        const opened = await inBatches(open.slice(0, MAX_DOWNLOADS), DOWNLOADS_AT_ONCE, async (c) => {
            const got = c.bytes ? { ok: true as const, bytes: c.bytes } : await download(c.url);
            if (got.ok === false) { reject(c, got.reason); return null; }
            trace.candidates.downloaded++;
            try {
                const raw = await rawRgb(got.bytes);
                if (Math.max(raw.width, raw.height) < MIN_LONG_SIDE) { state.tooSmall++; reject(c, `under_${MIN_LONG_SIDE}px`); return null; }
                return { c, bytes: got.bytes, raw, print: await fingerprint(got.bytes) };
            } catch { reject(c, 'not_an_image'); return null; }
        });
        const kept = opened.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => Math.max(b.raw.width, b.raw.height) - Math.max(a.raw.width, a.raw.height));
        // Largest first, so the copy that stays of any duplicate is the sharpest.
        const unique: typeof kept = [];
        for (const k of kept) {
            if (state.prints.some((p) => hashDistance(p, k.print) <= SAME_PICTURE)) reject(k.c, 'duplicate');
            else { unique.push(k); state.prints.push(k.print); }
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
        trace.scored.push(...clean.map((s) => ({ url: s.url, source: s.source, score: s.score, parts: s.parts, licence: s.licence, decoded: s.decodedBarcode })));
        return clean;
    }

    /** One fetch per picture in a run, however many times it comes up. */
    private downloader(state: RunState) {
        const fetchOne = this.deps.download ?? downloadImage;
        return (url: string) => {
            if (!state.downloads.has(url)) state.downloads.set(url, fetchOne(url));
            return state.downloads.get(url)!;
        };
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

    /** A final result, or null when these photos won't do and the next source should be asked. */
    private async judge(scored: Scored[], identity: Identity, opts: RunOptions, trace: Trace, state: RunState, done: Done): Promise<PipelineResult | null> {
        const model = opts.model || visionModel();
        const policy = opts.policy || DEFAULT_POLICY;
        const top = () => state.scored.slice(0, TOP);
        const miss = (status: ImageStatus, reason: string, confidence: number, chosen?: Scored) => {
            if (!state.failed || confidence >= state.failed.confidence) state.failed = { status, reason, confidence, chosen };
        };
        const eligible = scored.filter((s) => !s.isEditorial && s.licence !== 'editorial');
        if (!eligible.length) { miss('needs_review', 'only editorial photos found: never published', -1); return null; }
        const references = await this.identityPhotos(identity, state);
        const style = await this.deps.style?.().catch(() => []) ?? [];
        let queue = eligible;
        while (queue.length && state.visionCalls < VISION_CALLS) {
            state.visionCalls++;
            const batch = queue.slice(0, TOP);
            const verdict = await this.deps.vision.check(model, identity, batch.map((b) => b.bytes), references, style, trace.calls).catch((e) => e as VisionUnavailable);
            if (!isVerdict(verdict)) {
                const code = verdict instanceof VisionUnavailable ? verdict.code : 'error';
                if (code !== 'vision_quota' && code !== 'rate_limited' && this.deps.alerts) await raiseVisionAlert(this.deps.alerts, this.logger, { code: 'vision_unavailable', status: verdict instanceof VisionUnavailable ? verdict.httpStatus : undefined, scope: opts.upload || new Date().toISOString().slice(0, 13) }).catch(() => undefined);
                return done('needs_review', visionDown(code), { top: top() });
            }
            trace.vision.push(verdict);
            const chosen = batch[verdict.index];
            if (!verdict.passed) { miss('needs_review', `vision_failed: ${verdict.failed.join(', ')}${verdict.reason ? ` (${verdict.reason})` : ''}`, verdict.confidence, chosen); return null; }

            const conflict = identity.conflicts.some((c) => c.startsWith('brand'));
            const allowed = (p: LicencePolicy) => !conflict && mayPublish({ licence: chosen.licence, confidence: verdict.confidence, domain: chosen.domainClass, isEditorial: chosen.isEditorial }, p);
            const publishable = { A: allowed('A'), B: allowed('B') };
            const cutoutOff = chosen.whiteBackground ? null : this.cutoutOff();
            if (cutoutOff) {
                if (conflict) return done('needs_review', `brand_conflict: ${identity.conflicts.join('; ')}`, { top: top(), chosen });
                return done('needs_bg_removal', `vision ${verdict.confidence.toFixed(2)}, licence ${chosen.licence}, ${chosen.domainClass}: the right product, background not white (${cutoutOff})`, { top: top(), chosen, wouldPublish: publishable, ...await this.preview(chosen, trace) });
            }
            const made = await this.compose(chosen, trace);
            trace.compose = { engine: made.engine, checks: { ...made.checks } };
            if (made.status === 'ok') {
                const extra = { top: top(), chosen, publishable, output: { jpeg: made.jpeg, webp: made.webp } };
                if (publishable[policy]) return done('approved', `vision ${verdict.confidence.toFixed(2)}, licence ${chosen.licence}, ${chosen.domainClass}`, extra);
                return done('needs_review', conflict ? `brand_conflict: ${identity.conflicts.join('; ')}` : `licence_${chosen.licence}: confirmed by vision, publishing needs a person under policy ${policy}`, extra);
            }
            if (made.status !== 'low_res') return done(made.status === 'failed' ? 'failed' : 'needs_review', `compose: ${made.reason}`, { top: top(), chosen });
            miss('low_res', `compose: ${made.reason}`, verdict.confidence, chosen);
            queue = queue.filter((s) => s !== chosen);
        }
        return null;
    }

    private async identityPhotos(identity: Identity, state: RunState): Promise<Buffer[]> {
        const got = await Promise.all(identity.references.slice(0, 1).map(this.downloader(state)));
        return got.flatMap((g) => (g.ok ? [g.bytes] : []));
    }

    /** Why a background can't be removed here, or null when it can. */
    private cutoutOff(): string | null {
        return this.deps.cutoutBlocked?.() ?? (this.deps.removeBackground ? null : 'no_cutout_service');
    }

    /** A watermarked look at the cut-out, when a sandbox key allows one. It goes in `preview`, never `output`. */
    private async preview(chosen: Scored, trace: Trace): Promise<Pick<PipelineResult, 'preview'>> {
        if (!this.deps.previewBackground) return {};
        const started = Date.now();
        const png = await this.deps.previewBackground(chosen.bytes).catch(() => null);
        trace.calls.push({ source: 'photoroom', what: 'sandbox preview', status: png ? 200 : 'error', ms: Date.now() - started, cost: 0 });
        return png ? { preview: { png, label: 'SANDBOX PREVIEW' } } : {};
    }

    private async compose(chosen: Scored, trace: Trace): Promise<ComposeOutcome> {
        if (chosen.whiteBackground) return composeWhite(chosen.bytes);
        const remove = this.deps.removeBackground!;
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

function visionDown(code: string) {
    return code === 'vision_quota' ? 'vision_quota: today\'s free checks are used up, nothing approved automatically' : `vision_unavailable: ${code === 'no_key' ? 'no OPENROUTER_API_KEY' : code}, nothing approved automatically`;
}

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
