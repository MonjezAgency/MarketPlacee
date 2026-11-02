/** Which image sources are on, and does each answer? One small real call per source. Prints status codes, never a key. */
import 'dotenv/config';
import { buildPipeline } from '../src/products/image-pipeline/factory';
import { MemoryCache } from '../src/products/image-pipeline/http';
import type { SourceCall } from '../src/products/image-pipeline/types';

const EAN = '5449000000439';
const out: [string, string, string][] = [];
const say = (name: string, state: string, note = '') => out.push([name, state, note]);

async function main() {
    const cache = new MemoryCache();
    const { deps, photoroom } = buildPipeline(cache);
    for (const s of deps.lookups) {
        if (!s.enabled()) { say(s.id, 'off', `no ${s.keyEnv}`); continue; }
        const calls: SourceCall[] = [];
        const a = await s.lookup(EAN, EAN, calls, 'food').catch((e) => { say(s.id, 'error', String(e?.name)); return null; });
        if (a) say(s.id, a.record ? 'ok' : 'answered, no record', calls.map((c) => c.status).join(' '));
    }
    for (const s of deps.searches) {
        if (!s.enabled()) { say(s.id, 'off', `no ${s.keyEnv}`); continue; }
        const calls: SourceCall[] = [];
        const list = await s.search('Coca-Cola 1.5l', EAN, 'en', calls).catch(() => []);
        say(s.id, list.length ? 'ok' : 'no results', `${calls.map((c) => c.status).join(' ')}, ${list.length} photos`);
    }
    const key = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!key) say('openrouter', 'off', 'no OPENROUTER_API_KEY: nothing can be approved');
    else {
        const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
        say('openrouter', r?.ok ? 'ok' : 'REFUSED', r ? `HTTP ${r.status}` : 'no answer');
    }
    if (!photoroom.configured) say('photoroom', 'off', 'no PHOTOROOM_API_KEY: non-white photos go to review');
    else if (photoroom.testMode) say('photoroom', 'REFUSED', 'sandbox key: its watermark must not reach a product; a live key is needed');
    else {
        const r = await fetch('https://image-api.photoroom.com/v1/account', { headers: { 'x-api-key': process.env.PHOTOROOM_API_KEY!.trim() }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
        say('photoroom', r?.ok ? 'ok' : 'check failed', r ? `HTTP ${r.status}` : 'no answer');
    }
    if ((process.env.SERPAPI_API_KEY || '').trim()) say('serpapi', 'IGNORED', 'removed; delete the key');
    for (const [n, s, note] of out) console.log(`${n.padEnd(16)} ${s.padEnd(20)} ${note}`);
}
main().catch((e) => { console.error(String(e?.message)); process.exit(1); });
