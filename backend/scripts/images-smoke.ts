/**
 * The Checkpoint B smoke set. Local only: reads ../qa/smoke-rows.csv, writes ../qa/smoke/ and ../qa/compare.jpg.
 * Touches neither the database nor Supabase. Answers are cached in a local file, so a second run costs nothing.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildPipeline } from '../src/products/image-pipeline/factory';
import type { LookupCache } from '../src/products/image-pipeline/http';
import { DEFAULT_VISION_MODEL, SHADOW_VISION_MODEL } from '../src/products/image-pipeline/vision';
import { sharp } from '../src/products/image-pipeline/sharp';
import type { PipelineResult } from '../src/products/image-pipeline/types';

const QA = join(process.cwd(), '..', 'qa');
const OUT = join(QA, 'smoke');
const AT_ONCE = 4;
const THUMB = 300;

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

async function compareSheet(items: { row: Record<string, string>; r: PipelineResult }[]) {
    const pairs = items.filter((x) => x.row.reference || x.r.output);
    const W = THUMB * 2 + 30, H = THUMB + 96, columns = 2;
    const rows = Math.ceil(pairs.length / columns);
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < pairs.length; i++) {
        const { row, r } = pairs[i];
        const left = (i % columns) * W + 12, top = Math.floor(i / columns) * H + 12;
        const refFile = row.reference ? join(QA, 'reference', row.reference) : '';
        layers.push({ input: await tile(refFile && existsSync(refFile) ? readFileSync(refFile) : null, 'no reference'), left, top });
        layers.push({ input: await tile(r.output?.jpeg ?? null, r.status), left: left + THUMB + 6, top });
        const v = r.trace.vision[0];
        const lines = [
            `${row.synthetic === 'yes' ? '[SYNTHETIC] ' : ''}${row.brand} ${row.name} ${row.size} · ${r.status}`,
            `source ${r.chosen?.source ?? '-'} · score ${r.chosen?.score ?? '-'} · licence ${r.chosen?.licence ?? '-'} · A ${r.publishable.A ? 'yes' : 'no'} / B ${r.publishable.B ? 'yes' : 'no'}`,
            `vision: ${v ? `${v.passed ? 'pass' : 'fail'} ${v.confidence.toFixed(2)} ${v.reason}` : r.reason}`,
        ].map((l) => cut(l, 88));
        const svg = `<svg width="${W - 16}" height="84">${lines.map((l, n) => `<text x="0" y="${18 + n * 22}" font-family="Arial" font-size="13" fill="#222">${esc(l)}</text>`).join('')}</svg>`;
        layers.push({ input: Buffer.from(svg), left, top: top + THUMB + 4 });
    }
    await sharp({ create: { width: columns * W + 12, height: rows * H + 24, channels: 3, background: '#ffffff' } }).composite(layers).jpeg({ quality: 82 }).toFile(join(QA, 'compare.jpg'));
}

function summary(items: { row: Record<string, string>; r: PipelineResult }[]) {
    const n = items.length, real = items.filter((x) => x.row.ean);
    const counts: Record<string, number> = {};
    for (const { r } of items) counts[r.status] = (counts[r.status] || 0) + 1;
    const a = real.filter((x) => x.r.publishable.A).length, b = real.filter((x) => x.r.publishable.B).length;
    const sources: Record<string, { candidates: number; won: number }> = {};
    for (const { r } of items) {
        for (const [s, c] of Object.entries(r.trace.candidates.bySource)) (sources[s] ??= { candidates: 0, won: 0 }).candidates += c;
        if (r.publishable.A || r.publishable.B) (sources[r.chosen!.source] ??= { candidates: 0, won: 0 }).won++;
    }
    const cost: Record<string, number> = {};
    let total = 0;
    for (const { r } of items) for (const [s, c] of Object.entries(r.trace.cost.bySource)) { cost[s] = (cost[s] || 0) + c; total += c; }
    const pairs = items.map(({ r }) => ({ sonnet: r.trace.vision.find((v) => v.model === DEFAULT_VISION_MODEL), haiku: r.trace.vision.find((v) => v.model === SHADOW_VISION_MODEL) })).filter((p) => p.sonnet && p.haiku);
    const agree = pairs.filter((p) => p.sonnet!.passed === p.haiku!.passed).length;
    const haikuOnly = items.filter(({ r }) => { const s = r.trace.vision.find((v) => v.model === DEFAULT_VISION_MODEL), h = r.trace.vision.find((v) => v.model === SHADOW_VISION_MODEL); return s && h && h.passed && !s.passed; });
    return [
        '# Smoke run', '', `Rows: ${n}, of which ${items.filter((x) => x.row.synthetic === 'yes').length} have synthetic names and ${n - real.length} have no barcode.`, '',
        '## Status', ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`), '',
        `## Auto-approve rate\n- Policy A: ${a}/${real.length}\n- Policy B: ${b}/${real.length}`, '',
        '## Sources\n| Source | Candidates | Approved won |\n|---|---|---|', ...Object.entries(sources).map(([k, v]) => `| ${k} | ${v.candidates} | ${v.won} |`), '',
        `## Sonnet vs Haiku\n- Compared: ${pairs.length}\n- Same verdict: ${agree}\n- Haiku passed, Sonnet failed (each needs a look): ${haikuOnly.map((x) => x.row.ean).join(', ') || 'none'}`, '',
        `## Cost\n- This run: $${total.toFixed(4)} (cached answers cost 0)\n- Per 100 rows: $${n ? ((total / n) * 100).toFixed(2) : '0'}\n${Object.entries(cost).map(([k, v]) => `- ${k}: $${v.toFixed(4)}`).join('\n')}`, '',
        '## Rows\n| EAN | Group | Synthetic | Status | Reason |\n|---|---|---|---|---|', ...items.map(({ row, r }) => `| ${row.ean || '(none)'} | ${row.group} | ${row.synthetic} | ${r.status} | ${cut(r.reason.replace(/\|/g, '/'), 110)} |`), '',
    ].join('\n');
}

async function main() {
    mkdirSync(OUT, { recursive: true });
    const rows = parseCsv(readFileSync(join(QA, 'smoke-rows.csv'), 'utf8'));
    const { pipeline } = buildPipeline(new FileCache(join(OUT, 'cache.json')), { cutoutCache: new FileCache(join(OUT, 'cutouts.json')) });
    const items: { row: Record<string, string>; r: PipelineResult }[] = new Array(rows.length);
    let next = 0;
    await Promise.all(Array.from({ length: AT_ONCE }, async () => {
        while (next < rows.length) {
            const i = next++;
            const row = rows[i];
            const r = await pipeline.run({ ean: row.ean, name: row.name, brand: row.brand, weight: row.size, category: row.category }, { shadow: true, upload: 'smoke' });
            items[i] = { row, r };
            console.log(`${String(i + 1).padStart(2)}/${rows.length} ${row.ean || '(none)'} ${r.status} ${cut(r.reason, 90)}`);
            const { top: _t, chosen: _c, output: _o, ...plain } = r;
            writeFileSync(join(OUT, `${String(i + 1).padStart(2, '0')}-${row.ean || 'none'}.json`), JSON.stringify(plain, null, 1));
            if (r.output) writeFileSync(join(OUT, `${String(i + 1).padStart(2, '0')}-${row.ean}.jpg`), r.output.jpeg);
        }
    }));
    await compareSheet(items);
    writeFileSync(join(OUT, 'summary.md'), summary(items));
    console.log(summary(items).split('## Rows')[0]);
}
main().catch((e) => { console.error(String(e?.stack)); process.exit(1); });
