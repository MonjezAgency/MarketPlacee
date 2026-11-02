/** Which image sources are on, and does each answer? One small real call per source. Prints status codes, never a key. */
import 'dotenv/config';
import { join } from 'path';
import { FileBudget, serperCap } from '../src/products/image-pipeline/budget';
import { buildPipeline } from '../src/products/image-pipeline/factory';
import { MemoryCache } from '../src/products/image-pipeline/http';
import { DEFAULT_VISION_MODEL, FALLBACK_VISION_MODEL, isFreeModel, visionModel } from '../src/products/image-pipeline/vision';
import type { SourceCall } from '../src/products/image-pipeline/types';

const EAN = '5449000000439';
const out: [string, string, string][] = [];
const say = (name: string, state: string, note = '') => out.push([name, state, note]);

async function main() {
    const cache = new MemoryCache();
    const budget = new FileBudget(join(process.cwd(), '.image-budget.json'));
    const { deps, photoroom } = buildPipeline(cache, budget);
    for (const s of deps.lookups) {
        if (!s.enabled()) { say(s.id, 'off', `no ${s.keyEnv} (or no free allowance known)`); continue; }
        const calls: SourceCall[] = [];
        const a = await s.lookup(EAN, EAN, calls, 'food').catch((e) => { say(s.id, 'error', String(e?.name)); return null; });
        if (a) say(s.id, a.record ? 'ok' : 'answered, no record', calls.map((c) => c.status).join(' '));
    }
    for (const s of deps.searches) say(s.id, s.enabled() ? 'on' : 'off', s.enabled() ? 'not called here: a search counts against the monthly cap' : `no ${s.keyEnv}`);
    say('serper budget', `${await budget.used('serper', 'month')}/${serperCap()} this month`);
    const key = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!key) say('openrouter', 'off', 'no OPENROUTER_API_KEY: nothing can be approved');
    else {
        const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
        const body: any = r?.ok ? await r.json().catch(() => null) : null;
        const day = body?.data?.free_model_daily_requests;
        say('openrouter', r?.ok ? 'ok' : 'REFUSED', r ? `HTTP ${r.status}${day ? `, free calls today ${day.used}/${day.limit}` : ''}` : 'no answer');
        const list: any = await fetch('https://openrouter.ai/api/v1/models').then((m) => m.json()).catch(() => null);
        for (const id of [visionModel(), FALLBACK_VISION_MODEL]) {
            const m = (list?.data || []).find((x: any) => x.id === id);
            say(id === DEFAULT_VISION_MODEL ? 'vision default' : 'vision model', !isFreeModel(id) ? 'REFUSED: not :free' : m?.architecture?.input_modalities?.includes('image') ? 'ok' : 'NOT LISTED', id);
        }
    }
    if (!photoroom.configured) say('photoroom', 'off', 'no key: non-white winners are marked needs_bg_removal');
    else if (photoroom.testMode) say('photoroom', 'sandbox', 'previews only on needs_bg_removal items, never saved');
    else say('photoroom', 'live key, not called', 'paid cut-outs stay off unless PHOTOROOM_LIVE=true');
    if ((process.env.SERPAPI_API_KEY || '').trim()) say('serpapi', 'IGNORED', 'removed; delete the key');
    for (const [n, s, note] of out) console.log(`${n.padEnd(16)} ${s.padEnd(20)} ${note}`);
}
main().catch((e) => { console.error(String(e?.message)); process.exit(1); });
