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
import { cutoutFits, cuttable, domainPoints, flawsOf, framingPoints, identityTextPoints, isStudio, MIN_LONG_SIDE, penaltyOf, resolutionPoints, total, visualPoints, WEIGHTS } from './scoring';
import type { LookupSource, SearchSource } from './sources';
import type { Candidate, Identity, IdentityRecord, ImageStatus, PipelineResult, PipelineRow, RankedPhoto, RunPlan, Scored, SourceCall, Trace, VisionStage, VisionVerdict } from './types';
import { VisionGate, VisionUnavailable, visionModel } from './vision';

export const PIPELINE_VERSION = 'b4';
const TOP = 6;
/** Only these go to vision, in one call. */
const FINALISTS = 3;
/** Paid photos one pass may try before moving on. */
const CUTOUTS_PER_PASS = 2;
const MAX_DOWNLOADS = 40;
const DOWNLOADS_AT_ONCE = 6;
/** A first search that leaves this many usable photos gets no second one. */
const ENOUGH_FROM_A_SEARCH = 3;
/** Two photos this close are one photo. */
const SAME_PICTURE = 6;
const SHOWN_SMALL = 6;
/** A doubt about what the photo shows goes to a person. Anything else only means a better photo is needed. */
const IDENTITY_RULES = new Set(['same_product', 'same_variant', 'same_size_or_count', 'brand_not_read', 'unreadable_answer']);
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
    /** Takes one paid cut-out from the allowance. False when it is used up. */
    reserveCutout?: () => Promise<boolean>;
    /** Sandbox key only: a watermarked preview of the cut-out. */
    previewBackground?: (image: Buffer) => Promise<Buffer>;
    download?: (url: string) => ReturnType<typeof downloadImage>;
    style?: () => Promise<Buffer[]>;
    alerts?: Parameters<typeof raiseVisionAlert>[0];
    /** Cut-outs are paid for once in a test run. Too big for the database, so production passes none. */
    cutoutCache?: LookupCache;
}
export interface RunOptions {
    upload?: string; policy?: LicencePolicy; model?: string;
    /** Free sources only: work out what a full run would spend and stop. */
    plan?: boolean;
}
type Done = (status: ImageStatus, reason: string, extra?: Partial<PipelineResult>) => PipelineResult;
interface RunState {
    /** Everything usable so far, best first. */
    scored: Scored[];
    prints: Fingerprint[];
    seen: Set<string>;
    tooSmall: number;
    lastUsable: number;
    /** Photos already composed or screened: none is paid for or judged twice in a run. */
    tried: Set<string>;
    /** The nearest miss, what a person sees if nothing better comes. */
    failed: { status: ImageStatus; reason: string; confidence: number; chosen?: Scored } | null;
    downloads: Map<string, Promise<Download>>;
    verdicts: Map<string, VisionVerdict>;
    /** Too small to use, kept to show on the contact sheet. */
    small: RankedPhoto[];
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
            version: PIPELINE_VERSION, row: { ean: row.ean, name: row.name ?? null, brand: row.brand ?? null }, calls: [], notes: [],
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
     * Every free source first, then the ranking: no source stops the others, because
     * the first acceptable photo is rarely the best one. A white studio photo is laid
     * out as it is. Failing that, the best photo that can be cut out cleanly is, and
     * only then is a cut-out paid for. Vision has the last word on the finished
     * picture. A row with neither gets the capped web search and the same again.
     */
    private async steps(row: PipelineRow, opts: RunOptions, trace: Trace, done: Done): Promise<PipelineResult> {
        const gtin = parseGtin(row.ean);
        trace.gtin = { canonical: gtin.canonical, caseCode: gtin.caseCode, inner: gtin.inner, searchCodes: gtin.searchCodes, problem: gtin.problem };
        if (gtin.problem) return done('invalid_ean', gtin.digits ? gtin.problem : 'no barcode on this row');
        if (gtin.caseCode) trace.notes.push(`carton code ${gtin.caseCode}: the picture shows the single unit ${gtin.inner}`);
        const name = cleanName(row.name ?? '', row.brand ?? '');
        trace.name = name;

        const records: IdentityRecord[] = [];
        const state: RunState = { scored: [], prints: [], seen: new Set(), tooSmall: 0, lastUsable: 0, tried: new Set(), failed: null, downloads: new Map(), verdicts: new Map(), small: [] };
        const end: Done = (status, reason, extra = {}) => done(status, reason, { ...extra, ranked: rankedPhotos(state, extra.chosen) });
        const add = async (fresh: Candidate[]) => {
            const unseen = fresh.filter((c) => !state.seen.has(c.url));
            state.lastUsable = 0;
            const identity = buildIdentity(gtin, name, records);
            trace.identity = identity;
            if (!unseen.length) return identity;
            trace.candidates.found += unseen.length;
            for (const c of unseen) trace.candidates.bySource[c.source] = (trace.candidates.bySource[c.source] || 0) + 1;
            const scored = await this.assess(unseen, identity, gtin, trace, state);
            state.lastUsable = scored.length;
            state.scored.push(...scored);
            state.scored.sort((a, b) => b.score - a.score);
            return identity;
        };

        const collected = supplierCandidates(row);
        for (const source of this.deps.lookups.filter((s) => s.enabled())) {
            const found = await this.ask(source, gtin, row, trace.calls);
            records.push(...found.records);
            collected.push(...found.candidates);
        }
        const identity = await add(collected);
        const searches = this.deps.searches.filter((s) => s.enabled());
        if (opts.plan) return end('pending', 'plan', { plan: await this.plan(identity, state, searches) });

        const free = await this.settle(identity, row, opts, trace, state, end);
        if (free) return free;
        // Only a row with no good photo gets a search, and nothing could judge what one finds without vision.
        const person = state.failed?.status === 'needs_review';
        const down = await this.deps.vision.unavailable();
        if (person || down) return this.nothingAccepted(state, trace, end, down);
        for (const source of searches) {
            for (const q of searchQueries(identity)) {
                await add(await source.search(q.query, identity.ean, q.language, trace.calls).catch(() => []));
                if (state.lastUsable >= ENOUGH_FROM_A_SEARCH) break;
            }
        }
        return (await this.settle(identity, row, opts, trace, state, end)) ?? this.nothingAccepted(state, trace, end, null);
    }

    private fresh(state: RunState) { return state.scored.filter((s) => !s.isEditorial && s.licence !== 'editorial' && !state.tried.has(s.url)); }
    private whiteRoute(state: RunState) { return this.fresh(state).filter((s) => s.studio && s.whiteBackground); }
    private cutoutRoute(state: RunState) { return this.fresh(state).filter((s) => !(s.studio && s.whiteBackground) && cuttable(s)); }

    /** Free: reads the cache and counts. Every number is an upper limit for this route: a row may stop sooner. */
    private async plan(identity: Identity, state: RunState, searches: SearchSource[]): Promise<RunPlan> {
        const white = this.whiteRoute(state).slice(0, FINALISTS);
        const cutout = this.cutoutRoute(state).slice(0, FINALISTS);
        const finalists = white.length ? white : cutout;
        const route = white.length ? 'white' : cutout.length ? 'cutout' : 'none';
        const unscreened = route === 'cutout' && (await Promise.all(cutout.map((f) => this.deps.vision.judged(identity.ean, f.bytes, 'screen')))).includes(false);
        const queries = searches.flatMap((s) => searchQueries(identity).map((q) => (s.cacheKey ? this.deps.cache.get(s.cacheKey(q.query, q.language)).catch(() => undefined) : undefined)));
        const uncached = (await Promise.all(queries)).filter((hit) => hit === undefined).length;
        return { finalists: finalists.length, route, visionCalls: route === 'white' ? 1 : route === 'cutout' ? (unscreened ? 2 : 1) : 0, visionCallsAfterSearch: uncached ? 2 : 0, photoroomCalls: route === 'cutout' ? 1 : 0, searches: finalists.length ? 0 : uncached, searchesIfRejected: finalists.length ? uncached : 0 };
    }

    private nothingAccepted(state: RunState, trace: Trace, done: Done, down: string | null) {
        const top = state.scored.slice(0, TOP);
        const waiting = down ? `; search waits for vision (${down})` : '';
        if (state.failed) return done(state.failed.status, `${state.failed.reason}${waiting}`, { top, chosen: state.failed.chosen });
        if (state.scored.length && state.scored.every((s) => s.isEditorial || s.licence === 'editorial')) return done('needs_review', 'only editorial photos found: never published', { top });
        if (state.scored.length) return done('needs_better_image', `best photo has: ${top[0].flaws.join(', ') || 'no passing verdict'}${waiting}`, { top, chosen: top[0] });
        if (state.tooSmall) return done('low_res', `every usable photo is under ${MIN_LONG_SIDE}px (${state.tooSmall} found)${waiting}`);
        return trace.candidates.found ? done('not_found', `all_rejected: ${summarise(trace.rejects)}${waiting}`) : done('not_found', `no_candidates: ${noCandidates(this.deps, trace.calls)}${waiting}`);
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
        const promise = (c: Candidate) => identityTextPoints(c, identity, gtin.searchCodes) + domainPoints(domainClass(c, identity.brand));
        open.sort((a, b) => Number(!!b.bytes) - Number(!!a.bytes) || promise(b) - promise(a) || longest(b) - longest(a));
        const download = this.downloader(state);
        const references = await this.referencePrints(identity, download);
        const opened = await inBatches(open.slice(0, MAX_DOWNLOADS), DOWNLOADS_AT_ONCE, async (c) => {
            const got = c.bytes ? { ok: true as const, bytes: c.bytes } : await download(c.url);
            if (got.ok === false) { reject(c, got.reason); return null; }
            trace.candidates.downloaded++;
            try {
                const raw = await rawRgb(got.bytes);
                if (Math.max(raw.width, raw.height) < MIN_LONG_SIDE) {
                    state.tooSmall++;
                    reject(c, `under_${MIN_LONG_SIDE}px`);
                    if (state.small.length < SHOWN_SMALL) state.small.push({ url: c.url, source: c.source, width: raw.width, height: raw.height, score: 0, why: `under ${MIN_LONG_SIDE}px`, bytes: got.bytes });
                    return null;
                }
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
            const flaws = flawsOf(print, c, identity.size);
            const parts = {
                white: white ? WEIGHTS.white : Math.round(WEIGHTS.white * whiteRingShare(raw) * 5) / 10,
                resolution: resolutionPoints(Math.max(raw.width, raw.height)),
                identityText: identityTextPoints(c, identity, gtin.searchCodes), visual: visualPoints(print, references),
                domain: domainPoints(cls), framing: framingPoints(print), barcode: 0, penalty: penaltyOf(flaws),
            };
            return { ...c, bytes, parts, score: total(parts), domainClass: cls, licence: licenceOf(c, cls), decodedBarcode: null, pixelWidth: raw.width, pixelHeight: raw.height, whiteBackground: white, flaws, studio: isStudio(flaws), cutoutFits: cutoutFits(print) };
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
                    s.flaws = [...s.flaws, 'shows_barcode'];
                    s.parts = { ...s.parts, barcode: WEIGHTS.barcode, penalty: penaltyOf(s.flaws) };
                    s.score = total(s.parts);
                } else { trace.rejects.push({ url: s.url, source: s.source, reason: `barcode_differs:${code}` }); continue; }
            }
            keep.push(s);
        }
        return keep.sort((a, b) => b.score - a.score);
    }

    /** A final result, or null when no photo so far gives one. */
    private async settle(identity: Identity, row: PipelineRow, opts: RunOptions, trace: Trace, state: RunState, done: Done): Promise<PipelineResult | null> {
        return (await this.fromWhite(identity, opts, trace, state, done)) ?? this.fromCutout(identity, row, opts, trace, state, done);
    }

    /** Already on white: laid out for free, and vision sees the finished picture. */
    private async fromWhite(identity: Identity, opts: RunOptions, trace: Trace, state: RunState, done: Done): Promise<PipelineResult | null> {
        const ready: { s: Scored; made: Extract<ComposeOutcome, { status: 'ok' }> }[] = [];
        for (const s of this.whiteRoute(state)) {
            if (ready.length >= FINALISTS) break;
            state.tried.add(s.url);
            const made = await composeWhite(s.bytes);
            if (made.status === 'ok') ready.push({ s, made });
            else this.composeMiss(state, s, made);
        }
        if (!ready.length) return null;
        const verdicts = await this.judge(identity, 'final', ready.map((r) => r.made.jpeg), opts, trace, state);
        if (!Array.isArray(verdicts)) return done('needs_review', visionDown(verdicts), { top: state.scored.slice(0, TOP) });
        ready.forEach(({ s }, i) => state.verdicts.set(s.url, verdicts[i]));
        for (const [i, { s, made }] of ready.entries()) {
            if (!verdicts[i].passed) { this.miss(state, s, verdicts[i]); continue; }
            return this.accept(s, verdicts[i], made, identity, opts, trace, state, done);
        }
        return null;
    }

    /** The best ordinary photos are screened on the raw picture, so that only one fit for it costs a cut-out, then judged again as the finished picture. */
    private async fromCutout(identity: Identity, row: PipelineRow, opts: RunOptions, trace: Trace, state: RunState, done: Done): Promise<PipelineResult | null> {
        const batch = this.cutoutRoute(state).slice(0, FINALISTS);
        if (!batch.length) return null;
        for (const s of batch) state.tried.add(s.url);
        const screens = await this.judge(identity, 'screen', batch.map((b) => b.bytes), opts, trace, state);
        if (!Array.isArray(screens)) {
            for (const s of batch) state.tried.delete(s.url);
            return done('needs_review', visionDown(screens), { top: state.scored.slice(0, TOP) });
        }
        batch.forEach((b, i) => state.verdicts.set(b.url, screens[i]));
        batch.forEach((b, i) => { if (!screens[i].passed) this.note(state, 'needs_better_image', `not_cutout_ready: ${screens[i].failed.join(', ')}${screens[i].reason ? ` (${screens[i].reason})` : ''}`, screens[i].confidence, b); });
        const ready = batch.map((s, i) => ({ s, screen: screens[i] })).filter((x) => x.screen.passed);
        const market = (row.market || '').trim().toLowerCase();
        if (market) ready.sort((a, b) => Number((b.screen.answer?.pack_language || '').toLowerCase() === market) - Number((a.screen.answer?.pack_language || '').toLowerCase() === market));
        if (!ready.length) return null;
        const off = this.cutoutOff();
        if (off) {
            const chosen = ready[0].s, verdict = ready[0].screen;
            return done('needs_bg_removal', `vision ${verdict.confidence.toFixed(2)}, licence ${chosen.licence}, ${chosen.domainClass}: cut-out ready, no cut-out made (${off})`, { top: state.scored.slice(0, TOP), chosen, wouldPublish: this.publishable(chosen, verdict, identity), ...await this.preview(chosen, trace) });
        }
        for (const { s } of ready.slice(0, CUTOUTS_PER_PASS)) {
            const made = await this.compose(s, trace);
            if (made === 'cap') return done('needs_bg_removal', 'photoroom_cap_reached: the allowance of paid cut-outs for this test is used up', { top: state.scored.slice(0, TOP), chosen: s });
            if (made.status !== 'ok') { this.composeMiss(state, s, made); continue; }
            const verdicts = await this.judge(identity, 'final', [made.jpeg], opts, trace, state);
            if (!Array.isArray(verdicts)) return done('needs_review', visionDown(verdicts), { top: state.scored.slice(0, TOP), chosen: s });
            state.verdicts.set(s.url, verdicts[0]);
            if (verdicts[0].passed) return this.accept(s, verdicts[0], made, identity, opts, trace, state, done);
            this.miss(state, s, verdicts[0]);
        }
        return null;
    }

    /** Verdicts, or the code that says why vision can't answer. */
    private async judge(identity: Identity, stage: VisionStage, photos: Buffer[], opts: RunOptions, trace: Trace, state: RunState): Promise<VisionVerdict[] | string> {
        const references = await this.identityPhotos(identity, state);
        const style = stage === 'final' ? await this.deps.style?.().catch(() => []) ?? [] : [];
        const verdicts = await this.deps.vision.check(opts.model || visionModel(), identity, photos, references, style, trace.calls, stage).catch((e) => e as VisionUnavailable);
        if (Array.isArray(verdicts)) { trace.vision.push(...verdicts); return verdicts; }
        const code = verdicts instanceof VisionUnavailable ? verdicts.code : 'error';
        if (code !== 'vision_quota' && code !== 'rate_limited' && this.deps.alerts) await raiseVisionAlert(this.deps.alerts, this.logger, { code: 'vision_unavailable', status: verdicts instanceof VisionUnavailable ? verdicts.httpStatus : undefined, scope: opts.upload || new Date().toISOString().slice(0, 13) }).catch(() => undefined);
        return code;
    }

    /** The nearest miss so far. A doubt for a person outranks a photo that is merely not good enough. */
    private note(state: RunState, status: ImageStatus, reason: string, confidence: number, chosen: Scored) {
        const worse = state.failed?.status === 'needs_review' && status !== 'needs_review';
        if (!worse && (!state.failed || status === 'needs_review' || confidence >= state.failed.confidence)) state.failed = { status, reason, confidence, chosen };
    }

    private miss(state: RunState, chosen: Scored, verdict: VisionVerdict) {
        const doubt = verdict.failed.some((f) => IDENTITY_RULES.has(f)) || verdict.failed.every((f) => f === 'confidence');
        this.note(state, doubt ? 'needs_review' : 'needs_better_image', `vision_failed: ${verdict.failed.join(', ')}${verdict.reason ? ` (${verdict.reason})` : ''}`, verdict.confidence, chosen);
    }

    private composeMiss(state: RunState, chosen: Scored, made: Exclude<ComposeOutcome, { status: 'ok' }>) {
        this.note(state, made.status === 'failed' ? 'failed' : made.status, `compose: ${made.reason}`, 0, chosen);
    }

    private publishable(chosen: Scored, verdict: VisionVerdict, identity: Identity) {
        const conflict = identity.conflicts.some((c) => c.startsWith('brand'));
        const allowed = (p: LicencePolicy) => !conflict && mayPublish({ licence: chosen.licence, confidence: verdict.confidence, domain: chosen.domainClass, isEditorial: chosen.isEditorial }, p);
        return { A: allowed('A'), B: allowed('B') };
    }

    /** Vision passed the finished picture: what's left is what we know of the barcode, and the licence. */
    private accept(chosen: Scored, verdict: VisionVerdict, made: Extract<ComposeOutcome, { status: 'ok' }>, identity: Identity, opts: RunOptions, trace: Trace, state: RunState, done: Done): PipelineResult {
        const policy = opts.policy || DEFAULT_POLICY;
        const publishable = this.publishable(chosen, verdict, identity);
        trace.compose = { engine: made.engine, checks: { ...made.checks } };
        const extra = { top: state.scored.slice(0, TOP), chosen, publishable, output: { jpeg: made.jpeg, webp: made.webp } };
        if (!identity.brand && !identity.name) return done('needs_review', 'identity_unknown: no source names this barcode, so nothing proves the picture shows it', { ...extra, publishable: { A: false, B: false } });
        if (publishable[policy]) return done('approved', `vision ${verdict.confidence.toFixed(2)}, licence ${chosen.licence}, ${chosen.domainClass}, ${made.engine}`, extra);
        const conflict = identity.conflicts.some((c) => c.startsWith('brand'));
        return done('needs_review', conflict ? `brand_conflict: ${identity.conflicts.join('; ')}` : `licence_${chosen.licence}: confirmed by vision, publishing needs a person under policy ${policy}`, extra);
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

    /** 'cap' when the allowance is used up and this photo was never paid for. */
    private async compose(chosen: Scored, trace: Trace): Promise<ComposeOutcome | 'cap'> {
        const key = `cutout:${digest(chosen.bytes)}`;
        const paid = await this.deps.cutoutCache?.get(key).catch(() => undefined) as string | undefined;
        if (!paid && this.deps.reserveCutout && !(await this.deps.reserveCutout())) return 'cap';
        return composeCutout(chosen.bytes, async (image) => {
            if (paid) { trace.calls.push({ source: 'photoroom', what: 'segment', status: 'cached', ms: 0, cost: 0 }); return Buffer.from(paid, 'base64'); }
            const started = Date.now();
            const png = await this.deps.removeBackground!(image).catch((e) => { trace.calls.push({ source: 'photoroom', what: 'segment', status: 'error', ms: Date.now() - started, cost: 0 }); throw e; });
            trace.calls.push({ source: 'photoroom', what: 'segment', status: 200, ms: Date.now() - started, cost: PHOTOROOM_COST });
            await this.deps.cutoutCache?.set(key, png.toString('base64'), 30).catch(() => undefined);
            return png;
        });
    }
}

function whyLost(s: Scored, state: RunState, chosen?: Scored): string {
    const verdict = state.verdicts.get(s.url);
    const flaws = s.flaws.join(', ');
    if (s === chosen) return verdict?.passed ? 'winner' : `no final image from this one: ${flaws || verdict?.failed.join(', ') || 'no verdict'}`;
    if (verdict) return verdict.passed ? `passed ${verdict.stage === 'screen' ? 'the cut-out screen' : 'vision'}, ranked lower` : `${verdict.stage === 'screen' ? 'not cut-out ready' : 'vision'}: ${verdict.failed.join(', ')}`;
    return flaws || 'not judged: below the top three';
}

function rankedPhotos(state: RunState, chosen?: Scored): RankedPhoto[] {
    const order = chosen ? [chosen, ...state.scored.filter((s) => s !== chosen)] : state.scored;
    const shown = order.slice(0, TOP).map((s): RankedPhoto => ({ url: s.url, source: s.source, width: s.pixelWidth, height: s.pixelHeight, score: s.score, why: whyLost(s, state, chosen), bytes: s.bytes }));
    return [...shown, ...state.small].slice(0, TOP);
}

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
