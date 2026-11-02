/**
 * The Checkpoint B smoke set. Local only: reads ../qa/smoke-rows.csv, writes ../qa/smoke/ and ../qa/compare.jpg.
 * Touches neither the database nor Supabase. Answers are cached in a local file, so a second run costs nothing.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FileBudget, serperCap } from '../src/products/image-pipeline/budget';
import { buildPipeline } from '../src/products/image-pipeline/factory';
import type { LookupCache } from '../src/products/image-pipeline/http';
import { sharp } from '../src/products/image-pipeline/sharp';
import type { PipelineResult } from '../src/products/image-pipeline/types';

const QA = join(process.cwd(), '..', 'qa');
const OUT = join(QA, 'smoke');
const AT_ONCE = 4;
const THUMB = 300;
const PER_PAGE = 8;
type Item = { row: Record<string, string>; r: PipelineResult };

class FileCache implements LookupCache {
    private map: Record<string, unknown>;
    constructor(private readonly file: string) { this.map = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}; }
    async get(key: string) { return this.map[key]; }
    async set(key: string, value: unknown) { this.map[key] = value; writeFileSync(this.file, JSON.stringify(this.map)); }
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
    const shown = r.output?.jpeg ?? r.preview?.png ?? raw;
    const kind = r.output ? 'OUR OUTPUT' : r.preview ? r.preview.label : raw ? 'RAW CANDIDATE, NOT PUBLISHED' : '';
    const refFile = row.reference ? join(QA, 'reference', row.reference) : '';
    const v = r.trace.vision[r.trace.vision.length - 1];
    const lines = [
        `${row.synthetic === 'yes' ? '[SYNTHETIC] ' : ''}${row.brand} ${row.name} ${row.size} · ${r.status}`,
        `${kind} · source ${r.chosen?.source ?? '-'} · score ${r.chosen?.score ?? '-'} · licence ${r.chosen?.licence ?? '-'} · A ${r.publishable.A || r.wouldPublish?.A ? 'yes' : 'no'} / B ${r.publishable.B || r.wouldPublish?.B ? 'yes' : 'no'}`,
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

async function compareSheets(items: Item[]) {
    const pairs = items.filter((x) => x.row.reference || x.r.output || x.r.chosen || x.r.top.length);
    await sheet(pairs, join(QA, 'compare.jpg'));
    mkdirSync(join(OUT, 'pages'), { recursive: true });
    for (let i = 0; i < pairs.length; i += PER_PAGE) await sheet(pairs.slice(i, i + PER_PAGE), join(OUT, 'pages', `page-${String(i / PER_PAGE + 1).padStart(2, '0')}.jpg`));
}

function summary(items: Item[], searches: { used: number; cap: number }) {
    const n = items.length, real = items.filter((x) => x.row.ean);
    const counts: Record<string, number> = {};
    for (const { r } of items) counts[r.status] = (counts[r.status] || 0) + 1;
    const now = (p: 'A' | 'B') => real.filter((x) => x.r.publishable[p]).length;
    const later = (p: 'A' | 'B') => real.filter((x) => x.r.publishable[p] || x.r.wouldPublish?.[p]).length;
    const sources: Record<string, { candidates: number; won: number }> = {};
    for (const { r } of items) {
        for (const [s, c] of Object.entries(r.trace.candidates.bySource)) (sources[s] ??= { candidates: 0, won: 0 }).candidates += c;
        if (r.publishable.A || r.publishable.B || r.wouldPublish?.A || r.wouldPublish?.B) (sources[r.chosen!.source] ??= { candidates: 0, won: 0 }).won++;
    }
    const all = items.flatMap(({ r }) => r.trace.calls);
    const live = (s: string) => all.filter((c) => c.source === s && typeof c.status === 'number');
    const models = [...new Set(live('vision').filter((c) => c.status === 200).map((c) => c.what))];
    const visionCost = live('vision').reduce((a, c) => a + (c.cost || 0), 0);
    const white = items.filter(({ r }) => r.output).length, cut_ = counts.needs_bg_removal || 0;
    const skipped = (note: string) => all.filter((c) => c.source === 'serper' && c.status === 'skipped' && c.note === note).length;
    const free = ['openfoodfacts', 'upcitemdb', 'ean-db', 'go-upc', 'barcode-spider'];
    return [
        '# Smoke run', '', `Rows: ${n}, of which ${items.filter((x) => x.row.synthetic === 'yes').length} have synthetic names and ${n - real.length} have no barcode.`, '',
        '## Status', ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`), '',
        `## Winners\n- Already white, composed locally: ${white}\n- needs_bg_removal: ${cut_}`, '',
        `## Auto-approve rate (of ${real.length} rows with a barcode)\n- Policy A now: ${now('A')}, once backgrounds are removed: ${later('A')}\n- Policy B now: ${now('B')}, once backgrounds are removed: ${later('B')}`, '',
        '## Sources\n| Source | Candidates | Won (passed vision) |\n|---|---|---|', ...Object.entries(sources).map(([k, v]) => `| ${k} | ${v.candidates} | ${v.won} |`), '',
        '## Cost',
        `- Serper: ${live('serper').length} real searches this run, ${searches.used}/${searches.cap} used this month, ${searches.cap - searches.used} left, ${skipped('over its allowance')} skipped by the cap, ${skipped('key refused')} skipped because the key is refused`,
        `- OpenRouter: ${live('vision').filter((c) => c.status === 200).length} answered calls, ${live('vision').filter((c) => c.status !== 200).length} refused or limited, model(s) ${models.join(', ') || 'none'}, reported cost $${visionCost.toFixed(4)}`,
        `- Photoroom: ${live('photoroom').length} calls`,
        ...free.map((s) => `- ${s}: ${live(s).length} real calls, $0`), '',
        '## Rows\n| EAN | Group | Synthetic | Status | Reason |\n|---|---|---|---|---|', ...items.map(({ row, r }) => `| ${row.ean || '(none)'} | ${row.group} | ${row.synthetic} | ${r.status} | ${cut(r.reason.replace(/\|/g, '/'), 110)} |`), '',
    ].join('\n');
}

async function main() {
    mkdirSync(OUT, { recursive: true });
    const rows = parseCsv(readFileSync(join(QA, 'smoke-rows.csv'), 'utf8'));
    const budget = new FileBudget(join(process.cwd(), '.image-budget.json'));
    const { pipeline } = buildPipeline(new FileCache(join(OUT, 'cache.json')), budget);
    const items: Item[] = new Array(rows.length);
    let next = 0;
    await Promise.all(Array.from({ length: AT_ONCE }, async () => {
        while (next < rows.length) {
            const i = next++;
            const row = rows[i];
            const r = await pipeline.run({ ean: row.ean, name: row.name, brand: row.brand, weight: row.size, category: row.category }, { upload: 'smoke' });
            items[i] = { row, r };
            console.log(`${String(i + 1).padStart(2)}/${rows.length} ${row.ean || '(none)'} ${r.status} ${cut(r.reason, 90)}`);
            const { top: _t, chosen: _c, output: _o, preview: _p, ...plain } = r;
            writeFileSync(join(OUT, `${String(i + 1).padStart(2, '0')}-${row.ean || 'none'}.json`), JSON.stringify(plain, null, 1));
            if (r.output) writeFileSync(join(OUT, `${String(i + 1).padStart(2, '0')}-${row.ean}.jpg`), r.output.jpeg);
        }
    }));
    await compareSheets(items);
    const text = summary(items, { used: await budget.used('serper', 'month'), cap: serperCap() });
    writeFileSync(join(OUT, 'summary.md'), text);
    console.log(text.split('## Rows')[0]);
}
main().catch((e) => { console.error(String(e?.stack)); process.exit(1); });
