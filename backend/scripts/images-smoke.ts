/**
 * The Checkpoint B smoke set. Local only: reads ../qa/smoke-rows.csv, writes ../qa/smoke/ and ../qa/compare.jpg.
 * Touches neither the database nor Supabase. Answers are cached in a local file, so a second run costs nothing.
 *
 *   --plan      free sources only: writes the ranking to ../qa/alternatives/ and says what a full run would spend
 *   --search    allows Serper, only after a --plan whose total fits what is left of the month
 *   --rows FILE another row list, same columns as qa/smoke-rows.csv, plus optional supplier, market, current_image
 *   --final NAME also writes ../qa/NAME.jpg: the live picture, our final picture, status and source, one row per product
 *
 * Every product with a final picture gets ../output/{gtin}.jpg. Paid cut-outs are kept in ../qa/smoke/cutouts by image hash.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FileBudget, photoroomCap, serperCap } from '../src/products/image-pipeline/budget';
import { buildPipeline } from '../src/products/image-pipeline/factory';
import { downloadImage, type LookupCache } from '../src/products/image-pipeline/http';
import { sharp } from '../src/products/image-pipeline/sharp';
import type { PipelineResult } from '../src/products/image-pipeline/types';

const QA = join(process.cwd(), '..', 'qa');
const OUT = join(QA, 'smoke');
const ALTERNATIVES = join(QA, 'alternatives');
const FINAL = join(QA, '..', 'output');
const CUTOUTS = join(OUT, 'cutouts');
const PLAN_FILE = join(OUT, 'plan.json');
const flag = (name: string) => process.argv.includes(name);
const option = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const AT_ONCE = 3;
const THUMB = 300;
const PER_PAGE = 8;
type Item = { row: Record<string, string>; r: PipelineResult };

class FileCache implements LookupCache {
    private map: Record<string, unknown>;
    constructor(private readonly file: string) { this.map = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}; }
    async get(key: string) { return this.map[key]; }
    async set(key: string, value: unknown) { this.map[key] = value; writeFileSync(this.file, JSON.stringify(this.map)); }
}

/** Cut-outs are too big for one JSON file. Kept for good: each one was paid for. */
class CutoutCache implements LookupCache {
    private file(key: string) { return join(CUTOUTS, `${key.replace(/\W/g, '_')}.png`); }
    async get(key: string) { return existsSync(this.file(key)) ? readFileSync(this.file(key)).toString('base64') : undefined; }
    async set(key: string, value: unknown) { writeFileSync(this.file(key), Buffer.from(String(value), 'base64')); }
}

function parseCsv(text: string) {
    const [head, ...lines] = text.trim().split('\n').map((l) => l.split('|'));
    return lines.map((l) => Object.fromEntries(head.map((h, i) => [h, (l[i] ?? '').trim()])));
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function tile(input: Buffer | null, label: string) {
    const base = sharp({ create: { width: THUMB, height: THUMB, channels: 3, background: '#f2f2f2' } });
    if (input) return base.composite([{ input: await sharp(input).resize(THUMB, THUMB, { fit: 'contain', background: '#ffffff' }).png().toBuffer() }]).png().toBuffer();
    return base.composite([{ input: Buffer.from(`<svg width="${THUMB}" height="${THUMB}"><text x="150" y="155" text-anchor="middle" font-family="Arial" font-size="17" fill="#666">${esc(label)}</text></svg>`) }]).png().toBuffer();
}

/** Right tile: our output; else the raw best candidate, labelled, so selection can be judged whatever became of the photo. */
async function pairTile(row: Record<string, string>, r: PipelineResult) {
    const raw = r.chosen?.bytes ?? r.top[0]?.bytes ?? null;
    const shown = r.output?.jpeg ?? raw;
    const kind = r.output ? 'OUR OUTPUT' : raw ? 'RAW CANDIDATE, NOT PUBLISHED' : '';
    const refFile = row.reference ? join(QA, 'reference', row.reference) : '';
    const v = r.trace.vision[r.trace.vision.length - 1];
    const lines = [
        `#${row.n} ${row.ean || 'no barcode'} ${row.synthetic === 'yes' ? '[SYNTHETIC] ' : ''}${row.brand} ${row.name} ${row.size} · ${r.status}`.replace(/\s+/g, ' '),
        `${kind} · source ${r.chosen?.source ?? '-'} · score ${r.chosen?.score ?? '-'} · licence ${r.chosen?.licence ?? '-'} · A ${r.publishable.A ? 'yes' : 'no'} / B ${r.publishable.B ? 'yes' : 'no'}`,
        `vision: ${v ? `${v.passed ? 'pass' : 'fail'} ${v.confidence.toFixed(2)} ${v.reason}` : r.reason}`,
    ].map((l) => cut(l, 88));
    return { left: await tile(refFile && existsSync(refFile) ? readFileSync(refFile) : null, 'no reference'), right: await tile(shown, r.status), lines };
}

async function sheet(pairs: Item[], file: string) {
    const W = THUMB * 2 + 30, H = THUMB + 96, columns = 2;
    const rows = Math.ceil(pairs.length / columns);
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < pairs.length; i++) {
        const left = (i % columns) * W + 12, top = Math.floor(i / columns) * H + 12;
        const p = await pairTile(pairs[i].row, pairs[i].r);
        layers.push({ input: p.left, left, top }, { input: p.right, left: left + THUMB + 6, top });
        const svg = `<svg width="${W - 16}" height="84">${p.lines.map((l, n) => `<text x="0" y="${18 + n * 22}" font-family="Arial" font-size="13" fill="#222">${esc(l)}</text>`).join('')}</svg>`;
        layers.push({ input: Buffer.from(svg), left, top: top + THUMB + 4 });
    }
    await sharp({ create: { width: columns * W + 12, height: rows * H + 24, channels: 3, background: '#ffffff' } }).composite(layers).jpeg({ quality: 82 }).toFile(file);
}

/** The top six of one product and why each lost, so a better photo that wasn't chosen can be seen. */
async function alternativesSheet(row: Record<string, string>, r: PipelineResult) {
    const list = r.ranked ?? [];
    if (!list.length || !row.ean) return;
    const W = THUMB + 20, H = THUMB + 74, columns = 3, head = 34;
    const rows = Math.max(1, Math.ceil(list.length / columns));
    const layers: { input: Buffer; left: number; top: number }[] = [{ input: Buffer.from(`<svg width="${W * columns}" height="${head}"><text x="12" y="23" font-family="Arial" font-size="16" fill="#111">${esc(cut(`#${row.n} ${row.ean} ${row.brand} ${row.name} ${row.size} · ${r.status}`.replace(/\s+/g, ' '), 96))}</text></svg>`), left: 0, top: 0 }];
    for (const [i, p] of list.entries()) {
        const left = (i % columns) * W + 10, top = Math.floor(i / columns) * H + head;
        layers.push({ input: await tile(p.bytes, ''), left, top });
        const lines = [`${i + 1}. ${p.source} · ${p.width}x${p.height} · score ${p.score}`, cut(p.why, 50), cut(p.why.slice(49), 50)];
        layers.push({ input: Buffer.from(`<svg width="${THUMB}" height="66">${lines.map((l, n) => `<text x="0" y="${18 + n * 19}" font-family="Arial" font-size="13" fill="#222">${esc(l)}</text>`).join('')}</svg>`), left, top: top + THUMB + 4 });
    }
    await sharp({ create: { width: columns * W + 10, height: rows * H + head, channels: 3, background: '#ffffff' } }).composite(layers).jpeg({ quality: 80 }).toFile(join(ALTERNATIVES, `${row.ean}.jpg`));
}

/** One row per product: what is live today, what we would put there, and why. */
async function finalSheet(items: Item[], file: string) {
    const W = THUMB * 2 + 560, H = THUMB + 16;
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const [i, { row, r }] of items.entries()) {
        const top = i * H + 8;
        const live = row.current_image ? await downloadImage(row.current_image).catch(() => null) : null;
        layers.push({ input: await tile(live?.ok ? live.bytes : null, row.current_image ? 'live image failed to load' : 'none'), left: 8, top });
        layers.push({ input: await tile(r.output?.jpeg ?? null, `no final image: ${r.status}`), left: THUMB + 16, top });
        const lines = [`#${row.n} ${row.ean} ${row.supplier ?? ''}`, cut(`${row.brand} ${row.name} ${row.size}`.replace(/\s+/g, ' '), 60) || cut(r.trace.identity?.name ?? '', 60), `status: ${r.status}`, `source: ${r.chosen?.source ?? '-'} · score ${r.chosen?.score ?? '-'} · ${r.trace.compose?.engine ?? '-'} · licence ${r.chosen?.licence ?? '-'}`, ...cut(r.reason, 180).match(/.{1,60}/g)!, ...r.trace.notes.map((n) => cut(n, 60))];
        layers.push({ input: Buffer.from(`<svg width="540" height="${THUMB}">${lines.map((l, n) => `<text x="0" y="${24 + n * 24}" font-family="Arial" font-size="17" fill="#222">${esc(l)}</text>`).join('')}</svg>`), left: THUMB * 2 + 32, top });
    }
    await sharp({ create: { width: W, height: items.length * H + 16, channels: 3, background: '#ffffff' } }).composite(layers).jpeg({ quality: 82 }).toFile(file);
}

function planText(items: Item[], left: number) {
    const plans = items.flatMap((x) => (x.r.plan ? [x.r.plan] : []));
    const sum = (k: keyof NonNullable<PipelineResult['plan']>) => plans.reduce((a, p) => a + p[k], 0);
    const total = sum('searches') + sum('searchesIfRejected');
    const out = {
        rows: plans.length, visionCallsNow: sum('visionCalls'), visionCallsAfterSearch: sum('visionCallsAfterSearch'),
        whiteRoute: plans.filter((p) => p.route === 'white').length, cutoutRoute: plans.filter((p) => p.route === 'cutout').length, noRoute: plans.filter((p) => p.route === 'none').length, photoroomCalls: sum('photoroomCalls'),
        serperCertain: sum('searches'), serperIfVisionRejects: sum('searchesIfRejected'), serperTotal: total, serperLeft: left, fits: total <= left,
    };
    writeFileSync(PLAN_FILE, JSON.stringify(out, null, 1));
    return out;
}

async function compareSheets(items: Item[]) {
    const pairs = items.filter((x) => x.row.reference || x.r.output || x.r.chosen || x.r.top.length);
    await sheet(pairs, join(QA, 'compare.jpg'));
    mkdirSync(join(OUT, 'pages'), { recursive: true });
    for (let i = 0; i < pairs.length; i += PER_PAGE) await sheet(pairs.slice(i, i + PER_PAGE), join(OUT, 'pages', `page-${String(i / PER_PAGE + 1).padStart(2, '0')}.jpg`));
}

function summary(items: Item[], searches: { used: number; cap: number }, cutouts: { used: number; cap: number }) {
    const n = items.length, real = items.filter((x) => x.row.ean);
    const counts: Record<string, number> = {};
    for (const { r } of items) counts[r.status] = (counts[r.status] || 0) + 1;
    const now = (p: 'A' | 'B') => real.filter((x) => x.r.publishable[p]).length;
    const later = (p: 'A' | 'B') => real.filter((x) => x.r.publishable[p]).length;
    const sources: Record<string, { candidates: number; won: number }> = {};
    for (const { r } of items) {
        for (const [s, c] of Object.entries(r.trace.candidates.bySource)) (sources[s] ??= { candidates: 0, won: 0 }).candidates += c;
        if (r.publishable.A || r.publishable.B) (sources[r.chosen!.source] ??= { candidates: 0, won: 0 }).won++;
    }
    const all = items.flatMap(({ r }) => r.trace.calls);
    const live = (s: string) => all.filter((c) => c.source === s && typeof c.status === 'number');
    const models = [...new Set(live('vision').filter((c) => c.status === 200).map((c) => c.what))];
    const visionCost = live('vision').reduce((a, c) => a + (c.cost || 0), 0);
    const white = items.filter(({ r }) => r.output).length, cut_ = counts.bg_pending || 0;
    const skipped = (note: string) => all.filter((c) => c.source === 'serper' && c.status === 'skipped' && c.note === note).length;
    const free = ['openfoodfacts', 'upcitemdb', 'ean-db', 'go-upc', 'barcode-spider'];
    return [
        '# Smoke run', '', `Rows: ${n}, of which ${items.filter((x) => x.row.synthetic === 'yes').length} have synthetic names and ${n - real.length} have no barcode.`, '',
        '## Status', ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`), '',
        `## Winners\n- Already white, composed locally: ${white}\n- bg_pending: ${cut_}`, '',
        `## Auto-approve rate (of ${real.length} rows with a barcode)\n- Policy A now: ${now('A')}, once backgrounds are removed: ${later('A')}\n- Policy B now: ${now('B')}, once backgrounds are removed: ${later('B')}`, '',
        '## Sources\n| Source | Candidates | Won (passed vision) |\n|---|---|---|', ...Object.entries(sources).map(([k, v]) => `| ${k} | ${v.candidates} | ${v.won} |`), '',
        '## Cost',
        `- Serper: ${live('serper').length} real searches this run, ${searches.used}/${searches.cap} used this month, ${searches.cap - searches.used} left, ${skipped('over its allowance')} skipped by the cap, ${skipped('key refused')} skipped because the key is refused`,
        `- OpenRouter: ${live('vision').filter((c) => c.status === 200).length} answered calls, ${live('vision').filter((c) => c.status !== 200).length} refused or limited, model(s) ${models.join(', ') || 'none'}, reported cost $${visionCost.toFixed(4)}`,
        `- Photoroom: ${live('photoroom').length} paid this run, ${all.filter((c) => c.source === 'photoroom' && c.status === 'cached').length} from the cache, $${live('photoroom').reduce((a, c) => a + (c.cost || 0), 0).toFixed(2)}, ${cutouts.used}/${cutouts.cap} of the allowance used`,
        ...free.map((s) => `- ${s}: ${live(s).length} real calls, $0`), '',
        '## Rows\n| EAN | Group | Synthetic | Status | Reason |\n|---|---|---|---|---|', ...items.map(({ row, r }) => `| ${row.ean || '(none)'} | ${row.group} | ${row.synthetic} | ${r.status} | ${cut(r.reason.replace(/\|/g, '/'), 110)} |`), '',
    ].join('\n');
}

async function main() {
    mkdirSync(OUT, { recursive: true });
    mkdirSync(ALTERNATIVES, { recursive: true });
    mkdirSync(FINAL, { recursive: true });
    mkdirSync(CUTOUTS, { recursive: true });
    const rows = parseCsv(readFileSync(option('--rows') ?? join(QA, 'smoke-rows.csv'), 'utf8')).map((row, i) => ({ ...row, n: String(i + 1) }));
    const budget = new FileBudget(join(process.cwd(), '.image-budget.json'));
    const left = serperCap() - await budget.used('serper', 'month');
    const plan = flag('--plan');
    if (flag('--search')) {
        const known = existsSync(PLAN_FILE) ? JSON.parse(readFileSync(PLAN_FILE, 'utf8')) : null;
        if (!known) throw new Error('run --plan first: the number of searches must be known before any is spent');
        if (known.serperTotal > left) throw new Error(`the plan needs ${known.serperTotal} searches and ${left} are left this month`);
    }
    const { pipeline } = buildPipeline(new FileCache(join(OUT, 'cache.json')), budget, { cutoutCache: new CutoutCache(), ...(plan || flag('--search') ? {} : { searches: [] }) });
    const items: Item[] = new Array(rows.length);
    let next = 0;
    await Promise.all(Array.from({ length: AT_ONCE }, async () => {
        while (next < rows.length) {
            const i = next++;
            const row = rows[i];
            const r = await pipeline.run({ ean: row.ean, name: row.name, brand: row.brand, weight: row.size, category: row.category, market: row.market }, { upload: 'smoke', plan });
            items[i] = { row, r };
            console.log(`${String(i + 1).padStart(2)}/${rows.length} ${row.ean || '(none)'} ${r.status} ${cut(r.reason, 90)}`);
            await alternativesSheet(row, r);
            const { top: _t, chosen: _c, output: _o, preview: _p, ranked: _r, ...plain } = r;
            writeFileSync(join(OUT, `${String(i + 1).padStart(2, '0')}-${row.ean || 'none'}.json`), JSON.stringify(plain, null, 1));
            if (plan || !row.ean) continue;
            const final = join(FINAL, `${row.ean}.jpg`);
            if (r.output) writeFileSync(final, r.output.jpeg);
            else rmSync(final, { force: true });
        }
    }));
    if (plan) { console.log(JSON.stringify(planText(items, left), null, 1)); return; }
    if (!option('--rows')) await compareSheets(items);
    if (option('--final')) await finalSheet(items, join(QA, `${option('--final')}.jpg`));
    const text = summary(items, { used: await budget.used('serper', 'month'), cap: serperCap() }, { used: await budget.used('photoroom', 'ever'), cap: photoroomCap() });
    writeFileSync(join(OUT, 'summary.md'), text);
    console.log(text.split('## Rows')[0]);
}
main().catch((e) => { console.error(String(e?.stack)); process.exit(1); });
