import { Logger } from '@nestjs/common';
import type { SourceCall, SourceId } from './types';

/** Every source answer is kept this long, so a re-run costs nothing. */
export const CACHE_DAYS = 30;
const TIMEOUT_MS = 15_000;
const RETRIES = 2;
const BACKOFF_MS = 800;
/** A source that refuses the key isn't asked again for this long: one dead key is one log line, not one per row. */
const REFUSED_MS = 10 * 60 * 1000;

export interface LookupCache {
    get(key: string): Promise<unknown | undefined>;
    set(key: string, value: unknown, days: number): Promise<void>;
}
export class MemoryCache implements LookupCache {
    private readonly map = new Map<string, unknown>();
    async get(key: string) { return this.map.get(key); }
    async set(key: string, value: unknown) { this.map.set(key, value); }
}

export interface JsonRequest {
    source: SourceId;
    ean: string;
    /** What the call was, for the trace. Never the URL: some sources take the token in it. */
    what: string;
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    /** Null means never store this answer. */
    cacheKey: string | null;
    /** How long to keep it, when not the usual 30 days. */
    cacheDays?: number;
    /** Minimum gap between calls to this source. */
    gapMs?: number;
    cost?: number;
    /** Asked only when a real call is about to happen: a cached answer spends nothing. False skips the call. */
    allow?: () => Promise<boolean>;
    /** A call that costs is never repeated by itself. */
    retries?: number;
}
export interface JsonReply { status: number | 'timeout' | 'error' | 'cached' | 'skipped'; data: any }

/** Timeout, retries, one call at a time per source, every failure logged at warn, every answer cached. */
export class SourceHttp {
    private readonly logger = new Logger('ImagePipeline');
    private readonly turns = new Map<string, Promise<unknown>>();
    private readonly last = new Map<string, number>();
    private readonly refused = new Map<string, number>();

    constructor(
        private readonly cache: LookupCache,
        private readonly fetcher: typeof fetch = fetch,
        private readonly pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    ) {}

    async json(req: JsonRequest, calls: SourceCall[]): Promise<JsonReply> {
        if (req.cacheKey) {
            const hit = await this.cache.get(req.cacheKey).catch(() => undefined);
            if (hit !== undefined) {
                calls.push({ source: req.source, ean: req.ean, what: req.what, status: 'cached', ms: 0, cost: 0 });
                return { status: 'cached', data: hit };
            }
        }
        const refusedAt = this.refused.get(req.source);
        if ((refusedAt && Date.now() - refusedAt < REFUSED_MS) || (req.allow && !(await req.allow()))) {
            calls.push({ source: req.source, ean: req.ean, what: req.what, status: 'skipped', ms: 0, cost: 0, note: refusedAt ? 'key refused' : 'over its allowance' });
            return { status: 'skipped', data: null };
        }
        const started = Date.now();
        const reply = await this.inTurn(req, () => this.attempts(req));
        const paid = reply.status === 200 ? req.cost ?? 0 : 0;
        calls.push({ source: req.source, ean: req.ean, what: req.what, status: reply.status as SourceCall['status'], ms: Date.now() - started, cost: paid });
        if (typeof reply.status === 'number' && reply.status < 500 && reply.status !== 429 && reply.status !== 401 && reply.status !== 403 && req.cacheKey) {
            await this.cache.set(req.cacheKey, reply.data ?? null, req.cacheDays ?? CACHE_DAYS).catch((e) => this.logger.warn(`[cache] ${req.source} ${req.ean}: ${e?.message}`));
        }
        if (reply.status === 401 || reply.status === 403) this.refused.set(req.source, Date.now());
        if (reply.status !== 200 && reply.status !== 404) this.logger.warn(`[${req.source}] ${req.ean} ${req.what}: ${reply.status}`);
        return reply;
    }

    private async attempts(req: JsonRequest): Promise<JsonReply> {
        let last: JsonReply = { status: 'error', data: null };
        for (let i = 0; i <= (req.retries ?? RETRIES); i++) {
            if (i) await this.pause(BACKOFF_MS * 2 ** (i - 1));
            last = await this.once(req);
            const again = last.status === 'timeout' || last.status === 'error' || last.status === 429 || (typeof last.status === 'number' && last.status >= 500);
            if (!again) break;
        }
        return last;
    }

    private async once(req: JsonRequest): Promise<JsonReply> {
        try {
            const res = await this.fetcher(req.url, { method: req.method || 'GET', headers: req.headers, body: req.body, signal: AbortSignal.timeout(TIMEOUT_MS) });
            const text = await res.text();
            let data: any = null;
            try { data = text ? JSON.parse(text) : null; } catch { data = null; }
            return { status: res.status, data };
        } catch (e: any) {
            return { status: e?.name === 'TimeoutError' ? 'timeout' : 'error', data: null };
        }
    }

    /** One at a time per source, spaced by its gap, so a burst from concurrent jobs can't trip a rate limit. */
    private inTurn<T>(req: JsonRequest, work: () => Promise<T>): Promise<T> {
        const run = async () => {
            const wait = (this.last.get(req.source) ?? 0) + (req.gapMs ?? 0) - Date.now();
            if (wait > 0) await this.pause(wait);
            try { return await work(); } finally { this.last.set(req.source, Date.now()); }
        };
        const turn = (this.turns.get(req.source) ?? Promise.resolve()).then(run, run);
        this.turns.set(req.source, turn.catch(() => undefined));
        return turn;
    }
}

const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
const IP_HOST = /^(\d{1,3}\.){3}\d{1,3}$|^\[.*\]$/;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Image links come from third parties, so they may never point the server at itself. */
export function safeImageUrl(raw: string): URL | null {
    let u: URL;
    try { u = new URL(raw); } catch { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || BLOCKED_HOST.test(u.hostname) || IP_HOST.test(u.hostname)) return null;
    return u;
}

export type Download = { ok: true; bytes: Buffer } | { ok: false; reason: string };

/** Follows up to three redirects by hand, so each hop passes the same check. */
export async function downloadImage(url: string, fetcher: typeof fetch = fetch): Promise<Download> {
    let at = url;
    for (let hop = 0; hop < 4; hop++) {
        const u = safeImageUrl(at);
        if (!u) return { ok: false, reason: 'unsafe_url' };
        let res: Response;
        try {
            res = await fetcher(u.toString(), { redirect: 'manual', headers: { 'User-Agent': 'AliFMCG-ImagePipeline/1.0', Accept: 'image/*' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        } catch (e: any) {
            return { ok: false, reason: e?.name === 'TimeoutError' ? 'download_timeout' : 'download_failed' };
        }
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { at = new URL(res.headers.get('location')!, u).toString(); continue; }
        if (!res.ok) return { ok: false, reason: `download_http_${res.status}` };
        if (Number(res.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
        return { ok: true, bytes };
    }
    return { ok: false, reason: 'too_many_redirects' };
}
