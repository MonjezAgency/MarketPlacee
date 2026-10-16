/**
 * Supplier import from a PDF price list or product sheet.
 *
 * A PDF has no cells: only words placed at x/y positions. This module reads
 * the words (text-based PDFs only — scanned pages are reported, not guessed),
 * rebuilds the table the supplier sees and hands it to the same column
 * matching, validation and review as a spreadsheet. Every row keeps its page
 * number and what was done to read it (a name over three lines, a barcode
 * written with a space, text between two rows), so the supplier can compare
 * it with the page before anything is imported.
 *
 * Extracted text is data only: it is never interpreted as instructions, and
 * nothing here writes to the catalog.
 */
import { BadRequestException } from '@nestjs/common';
import { barcodeProblem, normaliseBarcode } from './catalog-rules';
import { finishAnalysis, scoreHeader, type CellRow, type SheetColumn, type SheetData, type WorkbookAnalysis, type Hint } from './import-analysis';
import { normaliseHeader } from './product-import';

export const MAX_PDF_BYTES = 4 * 1024 * 1024;   // uploads pass a ~4.5 MB proxy
export const MAX_PDF_PAGES = 40;
const PDF_TIMEOUT_MS = 25_000;

/** What was done to read a row; the browser shows these in the supplier's language. */
export type RowFlag =
    | { code: 'multiline'; columns: string[] }        // a value was assembled from several text lines
    | { code: 'between_rows'; text: string }           // text sat between two rows; added to the nearer one
    | { code: 'text_repaired' }                        // broken ligatures in the PDF font (SensaƟons → Sensations)
    | { code: 'barcode_spaces'; column: string; value: string } // "5060896 625492"
    | { code: 'key_value' }                            // read from a one-product sheet ("Price per piece: 4,77€")
    | { code: 'no_header_on_page'; fromPage: number }; // page without its own header row: columns of an earlier page

export interface PdfRow extends CellRow { page: number; flags?: RowFlag[]; source?: string }

export interface PdfInfo {
    pages: number;
    textPages: number[];
    scannedPages: number[];   // pages that are pictures of text — OCR is not configured
    emptyPages: number[];
    tablePages: number[];
    keyValuePages: number[];
    ocr: 'not_configured';
    notes: { page: number; text: string }[];  // lines outside the table (offer terms, dates)
    /** Small JPEG pictures of the pages that rows came from, so the supplier can compare without a PDF viewer. */
    previews: Record<number, string>;
}

export type PdfAnalysis = WorkbookAnalysis & { format: 'pdf'; pdf: PdfInfo };

// ─── Words on a page ──────────────────────────────────────────────────

interface Tok { s: string; x0: number; x1: number; y: number; h: number }
interface Line { y: number; toks: Tok[] }

/** Glyphs some PDF writers put in place of ligatures ("SensaƟons", "SoŌ"); only repaired between letters. */
const LIGATURES: Record<string, string> = { 'Ɵ': 'ti', 'Ō': 'ft', 'ƫ': 'tt', 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
function repair(s: string): { s: string; repaired: boolean } {
    let repaired = false;
    const out = s.replace(/(?<=\p{L})[ƟŌƫ](?=\p{L}|\b)|[ﬀﬁﬂﬃﬄﬅﬆ]/gu, (m) => { repaired = true; return LIGATURES[m] || m; });
    return { s: out, repaired };
}

const NUMERIC = /^[\s€$£%+-]*\d[\d\s.,]*[\s€$£%]*(eur|euro|usd|gbp)?$/i;
const isNum = (s: string) => NUMERIC.test(s.trim());
const isBarcodeLike = (s: string) => /^\d[\d ]{6,16}\d$/.test(s.trim()) && [8, 12, 13, 14].includes(s.replace(/\s/g, '').length);
const FOOTER = /^(page|seite|pagina|página|strona)\s*\d+(\s*(of|von|din|di|de)\s*\d+)?$|^\d{1,3}$|www\.|https?:\/\/|@[\w-]+\.\w+|\+\d[\d\s]{7,}/i;

function pageLines(items: any[], pageHeight: number): { lines: Line[]; repaired: boolean } {
    let repaired = false;
    const raw: Tok[] = [];
    for (const it of items) {
        const str = String(it?.str ?? '');
        if (!str.trim() || !Array.isArray(it.transform)) continue;
        const [a, b] = it.transform;
        if (Math.abs(b) > Math.abs(a) * 0.2) continue;   // rotated or vertical lettering (side banners)
        // Padding spaces inside an item widen it; keep only the visible text's span.
        const width = Math.max(0, Number(it.width) || 0);
        const cw = str.length ? width / str.length : 0;
        const lead = str.length - str.trimStart().length;
        const x0 = Number(it.transform[4]) + lead * cw;
        const h = Math.abs(Number(it.height) || Math.abs(a) || 8);
        raw.push({ s: str.trim(), x0, x1: x0 + str.trim().length * cw, y: pageHeight - Number(it.transform[5]), h });
    }
    raw.sort((p, q) => p.y - q.y || p.x0 - q.x0);
    // Lines: words whose baselines agree.
    const lines: Line[] = [];
    for (const t of raw) {
        const l = lines.find((x) => Math.abs(x.y - t.y) <= Math.max(2.5, t.h * 0.35));
        if (l) l.toks.push(t); else lines.push({ y: t.y, toks: [t] });
    }
    for (const l of lines) {
        l.toks.sort((p, q) => p.x0 - q.x0);
        // Pieces of one word or number written separately ("25.34" "4", "4," "77" "€").
        const merged: Tok[] = [];
        for (const t of l.toks) {
            const prev = merged[merged.length - 1];
            if (prev && t.x0 - prev.x1 < Math.max(1.5, Math.min(prev.h, t.h) * 0.18)) { prev.s += t.s; prev.x1 = Math.max(prev.x1, t.x1); }
            else merged.push({ ...t });
        }
        l.toks = merged.map((t) => {
            const r = repair(t.s.replace(/\s+/g, ' ').trim());
            if (r.repaired) repaired = true;
            return { ...t, s: r.s };
        }).filter((t) => t.s);
    }
    return { lines: lines.filter((l) => l.toks.length).sort((p, q) => p.y - q.y), repaired };
}

// ─── Tables ──────────────────────────────────────────────────────────

interface Col { x0: number; x1: number; parts: { y: number; s: string }[]; numeric?: boolean }
interface Layout { cols: Col[]; headers: string[]; page: number }

const HEADER_WORD = /\b(s\/?n|product|description|designation|article|item|ean|gtin|barcode|price|pcs|pce|pieces?|units?|cartons?|case|boxe?s?|pallets?|plt|bbd|shelf|weight|qty|quantity|code|origin|moq|languages?|photo|picture|image|stock|available|brand)\b/i;
const headerish = (s: string) => !isNum(s) && (scoreHeader(s).confidence !== 'none' || HEADER_WORD.test(s));

function findHeader(lines: Line[]): number {
    let best = -1, bestScore = 0;
    lines.forEach((l, i) => {
        const nums = l.toks.filter((t) => isNum(t.s)).length;
        if (nums > 1) return;
        const score = l.toks.filter((t) => headerish(t.s)).length;
        if (score >= 3 && score > bestScore) { best = i; bestScore = score; }
    });
    return best;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Header words over one to three lines ("N of cases per" / "pallet") become one column name each. */
function buildLayout(lines: Line[], hi: number, page: number): { layout: Layout; bodyStart: number } {
    const main = lines[hi];
    const band = lines.map((l, i) => ({ l, i })).filter(({ l, i }) => Math.abs(l.y - main.y) <= 14 && (i === hi || l.toks.every((t) => !isNum(t.s) || t.s.length <= 2)));
    const cols: Col[] = main.toks.map((t) => ({ x0: t.x0, x1: t.x1, parts: [{ y: main.y, s: t.s }] }));
    for (const { l, i } of band) {
        if (i === hi) continue;
        for (const t of l.toks) {
            const c = cols.map((c) => ({ c, o: overlap(c.x0 - 3, c.x1 + 3, t.x0, t.x1) })).sort((a, b) => b.o - a.o)[0];
            if (c && c.o > 0) { c.c.parts.push({ y: l.y, s: t.s }); c.c.x0 = Math.min(c.c.x0, t.x0); c.c.x1 = Math.max(c.c.x1, t.x1); }
            else cols.push({ x0: t.x0, x1: t.x1, parts: [{ y: l.y, s: t.s }] });
        }
    }
    cols.sort((a, b) => a.x0 - b.x0);
    const headers = cols.map((c) => c.parts.sort((a, b) => a.y - b.y).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim());
    const last = Math.max(...band.map((b) => b.i));
    return { layout: { cols, headers, page }, bodyStart: last + 1 };
}

/** Column a word belongs to: the one it overlaps most, else the nearest — never a numbers-only column for a word. */
function colOf(cols: Col[], t: Tok): number {
    let best = -1, bestO = 0;
    cols.forEach((c, i) => { const o = overlap(c.x0, c.x1, t.x0, t.x1); if (o > bestO) { bestO = o; best = i; } });
    if (best >= 0) return best;
    const mid = (t.x0 + t.x1) / 2;
    const word = !isNum(t.s) && /\p{L}{2,}/u.test(t.s);
    let bestD = Infinity;
    cols.forEach((c, i) => {
        if (word && c.numeric) return;
        const d = Math.abs((c.x0 + c.x1) / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
    });
    return best >= 0 ? best : 0;
}

/** Does this page's text line up with an earlier page's columns (a table continued without its header)? */
function fitsLayout(lines: Line[], layout: Layout): boolean {
    const data = lines.filter((l) => l.toks.filter((t) => isNum(t.s)).length >= 2);
    if (data.length < 1) return false;
    const toks = data.flatMap((l) => l.toks);
    const hit = toks.filter((t) => layout.cols.some((c) => overlap(c.x0 - 8, c.x1 + 8, t.x0, t.x1) > 0)).length;
    return hit / toks.length >= 0.6;
}

interface Built { rows: PdfRow[]; notes: { page: number; text: string }[] }

const dataLine = (l: Line) => l.toks.filter((t) => isNum(t.s) || isBarcodeLike(t.s)).length >= 2;

/**
 * Values that sit under no header in most rows (a price column without a
 * title) become their own, unnamed column instead of joining a neighbour.
 */
function addUnheadedColumns(layout: Layout, body: Line[]) {
    const rows = body.filter(dataLine);
    if (rows.length < 2) return;
    const loose = rows.flatMap((l) => l.toks.filter((t) => !layout.cols.some((c) => overlap(c.x0 - 1, c.x1 + 1, t.x0, t.x1) > 0)).map((t) => ({ t, y: l.y })));
    const clusters: { x0: number; x1: number; ys: Set<number> }[] = [];
    for (const { t, y } of loose.sort((a, b) => a.t.x0 - b.t.x0)) {
        const c = clusters.find((k) => t.x0 <= k.x1 + 12 && t.x1 >= k.x0 - 12);
        if (c) { c.x0 = Math.min(c.x0, t.x0); c.x1 = Math.max(c.x1, t.x1); c.ys.add(y); }
        else clusters.push({ x0: t.x0, x1: t.x1, ys: new Set([y]) });
    }
    for (const c of clusters) {
        if (c.ys.size < Math.max(2, rows.length * 0.5)) continue;
        // Only where no header column sits between the cluster and its neighbours' values.
        layout.cols.push({ x0: c.x0, x1: c.x1, parts: [] });
        layout.headers.push('');
    }
    const order = layout.cols.map((c, i) => ({ c, h: layout.headers[i] })).sort((a, b) => a.c.x0 - b.c.x0);
    layout.cols = order.map((o) => o.c); layout.headers = order.map((o) => o.h);
}

/** Where each column's values actually sit (names are often left-aligned under a centred header). */
function dataSpans(layout: Layout, body: Line[]): Col[] {
    const spans: Col[] = layout.cols.map((c) => ({ x0: c.x0, x1: c.x1, parts: c.parts }));
    const kinds = layout.cols.map(() => ({ num: 0, text: 0 }));
    for (const l of body.filter(dataLine)) for (const t of l.toks) {
        const i = colOf(layout.cols, t);
        if (i >= 0 && overlap(layout.cols[i].x0 - 2, layout.cols[i].x1 + 2, t.x0, t.x1) > 0) {
            spans[i].x0 = Math.min(spans[i].x0, t.x0); spans[i].x1 = Math.max(spans[i].x1, t.x1);
            if (isNum(t.s)) kinds[i].num++; else kinds[i].text++;
        }
    }
    spans.forEach((c, i) => { c.numeric = kinds[i].num >= 2 && kinds[i].text === 0; });
    return spans;
}

function readRows(lines: Line[], layout: Layout, page: number, repaired: boolean, inherited: number | null): Built {
    const body = lines.filter((l) => !(l.toks.length <= 2 && l.toks.every((t) => FOOTER.test(t.s))));
    const cols = dataSpans(layout, body);
    const isAnchor = (l: Line) => {
        const cs = new Set(l.toks.map((t) => colOf(cols, t)));
        const strong = l.toks.filter((t) => isNum(t.s) || isBarcodeLike(t.s)).length;
        return cs.size >= 2 && strong >= 2;
    };
    const anchors = body.filter(isAnchor);
    const notes: Built['notes'] = [];
    if (!anchors.length) return { rows: [], notes: body.map((l) => ({ page, text: l.toks.map((t) => t.s).join(' ') })) };
    const gaps = anchors.slice(1).map((a, i) => a.y - anchors[i].y).sort((a, b) => a - b);
    const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 30;
    const reach = Math.max(10, pitch * 0.75);
    const groups = new Map<Line, { line: Line; between?: string }[]>(anchors.map((a) => [a, [{ line: a }]]));
    for (const l of body) {
        if (groups.has(l)) continue;
        const ds = anchors.map((a) => ({ a, d: Math.abs(a.y - l.y) })).sort((p, q) => p.d - q.d);
        const [n1, n2] = ds;
        if (!n1 || n1.d > reach) {
            if (l.y > anchors[0].y - reach) notes.push({ page, text: l.toks.map((t) => t.s).join(' ') });
            continue;
        }
        // Equally close to the row above and the row below: added to the nearer one, and said so.
        const unclear = n2 && n2.d <= reach && n2.d - n1.d < pitch * 0.2;
        groups.get(n1.a)!.push({ line: l, between: unclear ? l.toks.map((t) => t.s).join(' ') : undefined });
    }
    const rows: PdfRow[] = [];
    for (const a of anchors) {
        const parts = groups.get(a)!.sort((p, q) => p.line.y - q.line.y);
        const cells: string[][] = layout.cols.map(() => []);
        const linesPerCol = layout.cols.map(() => new Set<number>());
        for (const p of parts) for (const t of p.line.toks) { const c = colOf(cols, t); cells[c].push(t.s); linesPerCol[c].add(p.line.y); }
        const flags: RowFlag[] = [];
        const multi = layout.headers.filter((_, i) => linesPerCol[i].size > 1);
        if (multi.length) flags.push({ code: 'multiline', columns: multi });
        for (const p of parts) if (p.between) flags.push({ code: 'between_rows', text: p.between.slice(0, 80) });
        if (repaired && parts.some((p) => p.line.toks.some((t) => /ti|ft|tt/.test(t.s)))) flags.push({ code: 'text_repaired' });
        if (inherited) flags.push({ code: 'no_header_on_page', fromPage: inherited });
        const out = cells.map((c) => c.join(' ').replace(/\s+/g, ' ').trim());
        out.forEach((v, i) => {
            if (/^\d+( \d+)+$/.test(v) && !barcodeProblem(normaliseBarcode(v))) flags.push({ code: 'barcode_spaces', column: layout.headers[i], value: v });
        });
        rows.push({ row: 0, page, cells: out, ...(flags.length ? { flags } : {}), source: parts.map((p) => p.line.toks.map((t) => t.s).join(' ')).join(' / ').slice(0, 400) });
    }
    return { rows, notes };
}

// ─── One-product sheets ("Price per Piece: ▪ 4,77€") ─────────────────

function readKeyValue(lines: Line[], page: number): { labels: string[]; values: string[]; title: string } | null {
    const labels: { text: string; x0: number; x1: number; y: number }[] = [];
    for (const l of lines) {
        for (let i = 0; i < l.toks.length; i++) {
            const t = l.toks[i];
            if (!/:$/.test(t.s) || t.s.length < 3) continue;
            // Words just before the colon word belong to the label ("Quantity" "Pieces:").
            let j = i, x0 = t.x0;
            while (j > 0 && x0 - l.toks[j - 1].x1 < 14 && !/:$/.test(l.toks[j - 1].s) && l.toks[j - 1].s !== '▪' && !isNum(l.toks[j - 1].s)) { j--; x0 = l.toks[j].x0; }
            labels.push({ text: l.toks.slice(j, i + 1).map((x) => x.s).join(' ').replace(/:$/, '').trim(), x0, x1: t.x1, y: l.y });
        }
    }
    if (labels.length < 3) return null;
    const allToks = lines.flatMap((l) => l.toks.map((t) => ({ ...t, y: l.y })));
    const isLabelTok = (t: Tok) => labels.some((lb) => Math.abs(lb.y - t.y) < 1 && t.x0 >= lb.x0 - 0.5 && t.x1 <= lb.x1 + 0.5);
    const out: { label: string; value: string }[] = [];
    for (const lb of labels) {
        const nextX = Math.min(...labels.filter((o) => o !== lb && o.x0 > lb.x1 && Math.abs(o.y - lb.y) <= 14).map((o) => o.x0), Infinity);
        const cand = allToks.filter((t) => t.x0 >= lb.x1 - 1 && t.x0 < nextX && Math.abs(t.y - lb.y) <= 12 && t.s !== '▪' && !isLabelTok(t) && !/:$/.test(t.s));
        if (!cand.length) continue;
        const dy = Math.min(...cand.map((t) => Math.abs(t.y - lb.y)));
        const v = cand.filter((t) => Math.abs(Math.abs(t.y - lb.y) - dy) < 3).sort((a, b) => a.x0 - b.x0).map((t) => t.s.replace(/^▪\s*/, '')).join(' ').trim();
        if (v) out.push({ label: lb.text, value: v });
    }
    if (out.length < 3) return null;
    // Title: the largest text near the top of the page.
    const top = [...lines].sort((a, b) => Math.max(...b.toks.map((t) => t.h)) - Math.max(...a.toks.map((t) => t.h)) || a.y - b.y)[0];
    const title = top ? top.toks.map((t) => t.s).join(' ').replace(/\s+/g, ' ').trim() : '';
    return { labels: out.map((o) => o.label), values: out.map((o) => o.value), title };
}

// ─── Document ────────────────────────────────────────────────────────

const PICTURE_OPS = new Set([82, 83, 85, 86, 88]); // pdf.js OPS: jpeg, image mask, image, inline image, repeated image

/** Load pdf.js through pdf-parse (bundled CommonJS build, already a dependency). */
async function openPdf(buf: Buffer): Promise<{ doc: any; parser: any; close: () => Promise<void> }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, stopAtErrors: false });
    await parser.getInfo();
    const doc = (parser as any).doc;
    if (!doc) throw new Error('pdf not loaded');
    return { doc, parser, close: () => parser.destroy().catch(() => undefined) };
}

/** Plain-language reasons; `code` lets the browser show them in the supplier's language. */
export function pdfError(code: 'pdf_not_pdf' | 'pdf_too_large' | 'pdf_password' | 'pdf_damaged' | 'pdf_too_many_pages' | 'pdf_timeout' | 'pdf_scanned' | 'pdf_no_table', extra: Record<string, unknown> = {}) {
    const msg: Record<string, string> = {
        pdf_not_pdf: 'This file isn’t a PDF. Upload a .pdf, .xlsx, .xls or .csv file.',
        pdf_too_large: `PDFs can be at most ${MAX_PDF_BYTES / 1048576} MB. Export only the price-list pages, or upload the spreadsheet version.`,
        pdf_password: 'This PDF is password-protected. Save a copy without a password and upload that.',
        pdf_damaged: 'This PDF is damaged or incomplete and can’t be read. Download it again, or upload the spreadsheet version.',
        pdf_too_many_pages: `This PDF has more than ${MAX_PDF_PAGES} pages. Upload the price-list pages only.`,
        pdf_timeout: 'Reading this PDF took too long. Upload the price-list pages only, or the spreadsheet version.',
        pdf_scanned: 'This PDF contains pictures of pages, not text, so the products can’t be read. Text recognition (OCR) isn’t available. Upload the spreadsheet version, or a PDF exported from Excel or Word.',
        pdf_no_table: 'No product table was found in this PDF. It may be a brochure with pictures and names only. Upload the spreadsheet version of the price list, or add the products one by one.',
    };
    return new BadRequestException({ statusCode: 400, message: msg[code], code, ...extra });
}

export async function analysePdf(buf: Buffer, fileName: string): Promise<PdfAnalysis> {
    if (!buf?.length || buf.slice(0, 1024).indexOf('%PDF-') < 0) throw pdfError('pdf_not_pdf');
    if (buf.length > MAX_PDF_BYTES) throw pdfError('pdf_too_large');
    let opened: Awaited<ReturnType<typeof openPdf>>;
    try { opened = await openPdf(buf); }
    catch (e: any) {
        if (e?.name === 'PasswordException' || /password/i.test(String(e?.message))) throw pdfError('pdf_password');
        throw pdfError('pdf_damaged');
    }
    const { doc, parser, close } = opened;
    const deadline = Date.now() + PDF_TIMEOUT_MS;
    try {
        if (doc.numPages > MAX_PDF_PAGES) throw pdfError('pdf_too_many_pages');
        const info: PdfInfo = { pages: doc.numPages, textPages: [], scannedPages: [], emptyPages: [], tablePages: [], keyValuePages: [], ocr: 'not_configured', notes: [], previews: {} };
        const tables: { layout: Layout; rows: PdfRow[]; pages: number[] }[] = [];
        const kv: { page: number; labels: string[]; values: string[]; title: string; repaired: boolean }[] = [];
        let current: (typeof tables)[number] | null = null;
        for (let p = 1; p <= doc.numPages; p++) {
            if (Date.now() > deadline) throw pdfError('pdf_timeout');
            const page = await doc.getPage(p);
            const vp = page.getViewport({ scale: 1 });
            const tc = await page.getTextContent();
            const chars = tc.items.reduce((s: number, i: any) => s + String(i?.str || '').trim().length, 0);
            if (chars < 20) {
                const ops = await page.getOperatorList().catch(() => null);
                const pictures = ops ? ops.fnArray.filter((f: number) => PICTURE_OPS.has(f)).length : 0;
                (pictures ? info.scannedPages : info.emptyPages).push(p);
                page.cleanup?.();
                continue;
            }
            info.textPages.push(p);
            const { lines, repaired } = pageLines(tc.items, vp.height);
            page.cleanup?.();
            const hi = findHeader(lines);
            if (hi >= 0) {
                const { layout, bodyStart } = buildLayout(lines, hi, p);
                addUnheadedColumns(layout, lines.slice(bodyStart));
                const before = lines.slice(0, hi).map((l) => l.toks.map((t) => t.s).join(' ')).filter((s) => !FOOTER.test(s));
                info.notes.push(...before.map((text) => ({ page: p, text })));
                const { rows, notes } = readRows(lines.slice(bodyStart), layout, p, repaired, null);
                if (rows.length) info.notes.push(...notes);
                if (!rows.length) {
                    // Label words that look like a header but sit next to their values: a one-product sheet.
                    const k = readKeyValue(lines, p);
                    if (k) { kv.push({ page: p, ...k, repaired }); info.keyValuePages.push(p); current = null; }
                    else info.notes.push(...notes);
                    continue;
                }
                const same = current && current.layout.headers.join('|').toLowerCase() === layout.headers.join('|').toLowerCase();
                if (same) { current!.rows.push(...rows); current!.pages.push(p); }
                else { current = { layout, rows, pages: [p] }; tables.push(current); }
                info.tablePages.push(p);
                continue;
            }
            if (current && fitsLayout(lines, current.layout)) {
                const { rows, notes } = readRows(lines, current.layout, p, repaired, current.layout.page);
                info.notes.push(...notes);
                if (rows.length) { current.rows.push(...rows); current.pages.push(p); info.tablePages.push(p); continue; }
            }
            const k = readKeyValue(lines, p);
            if (k) { kv.push({ page: p, ...k, repaired }); info.keyValuePages.push(p); current = null; continue; }
            info.notes.push(...lines.map((l) => ({ page: p, text: l.toks.map((t) => t.s).join(' ') })));
        }

        const sheets: SheetData[] = [];
        const used = new Set<string>();
        const sheetName = (base: string) => { let n = base, i = 2; while (used.has(n)) n = `${base} (${i++})`; used.add(n); return n; };
        const pagesLabel = (ps: number[]) => (ps.length === 1 ? `page ${ps[0]}` : `pages ${ps[0]}–${ps[ps.length - 1]}`);
        for (const t of tables) {
            mergeCurrencyColumns(t);
            const columns = toColumns(t.layout.headers);
            t.rows.forEach((r, i) => { r.row = i + 1; });
            sheets.push(sheetData(sheetName(tables.length > 1 ? `Table, ${pagesLabel(t.pages)}` : 'PDF table'), columns, t.rows));
        }
        if (kv.length) {
            // One row per product sheet; columns are the labels found on any page.
            const labels: string[] = [];
            for (const k of kv) for (const l of k.labels) if (!labels.some((x) => normaliseHeader(x) === normaliseHeader(l))) labels.push(l);
            const headers = ['Product', ...labels];
            const rows: PdfRow[] = kv.map((k, i) => {
                const cells = headers.map((h, c) => (c === 0 ? k.title : k.values[k.labels.findIndex((l) => normaliseHeader(l) === normaliseHeader(h))] ?? ''));
                const flags: RowFlag[] = [{ code: 'key_value' }];
                if (k.repaired) flags.push({ code: 'text_repaired' });
                return { row: i + 1, page: k.page, cells, flags, source: k.labels.map((l, j) => `${l}: ${k.values[j]}`).join(' / ').slice(0, 400) };
            });
            sheets.push(sheetData(sheetName('Product sheets'), toColumns(headers), rows));
        }
        if (!sheets.length) {
            if (info.scannedPages.length && !info.textPages.length) throw pdfError('pdf_scanned', { pdf: info });
            throw pdfError('pdf_no_table', { pdf: info });
        }
        // Offer terms written under or above the table ("MOQ 15 pallets mix", "Expiry: min 5 months").
        const hints: Hint[] = [];
        for (const n of info.notes) {
            const exw = n.text.match(/\bEXW\b[\s:,-]*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,40})/i);
            if (exw) hints.push({ field: 'exwLocation', value: exw[1].trim(), source: `PDF page ${n.page}: “${n.text.slice(0, 80)}”` });
        }
        info.notes = info.notes.filter((n) => n.text.length >= 3).slice(0, 40);
        info.previews = await renderPreviews(parser, [...new Set([...info.tablePages, ...info.keyValuePages])].sort((a, b) => a - b), deadline);
        const base = finishAnalysis(fileName, sheets, hints);
        return { ...base, format: 'pdf', pdf: info };
    } finally {
        await close();
    }
}

function toColumns(headers: string[]): SheetColumn[] {
    const count = new Map<string, number>();
    return headers.map((h, i) => {
        const base = normaliseHeader(h) || `column ${i + 1}`;
        const k = (count.get(base) || 0) + 1;
        count.set(base, k);
        return { index: i, letter: String(i + 1), key: k > 1 ? `${base} #${k}` : base, header: h || `Column ${i + 1}` };
    });
}

function sheetData(name: string, columns: SheetColumn[], rows: PdfRow[]): SheetData {
    const emptyColumns = columns.filter((c) => !rows.some((r) => (r.cells[c.index] || '').trim())).map((c) => c.header);
    const recognised = columns.filter((c) => !emptyColumns.includes(c.header) && scoreHeader(c.header).confidence !== 'none').length;
    return { name, headerRows: [], columns, rows, skipped: [], sections: [], emptyColumns, hints: [], recognised, otherImages: { count: 0, unsupported: 0 } };
}

/**
 * "€" printed apart from the amount ("€" "8.60") joins the amount; an
 * unnamed column that only ever fills in where its named neighbour is empty
 * is the same column.
 */
function mergeCurrencyColumns(t: { layout: Layout; rows: PdfRow[] }) {
    const n = () => t.layout.headers.length;
    for (const r of t.rows) for (let i = 0; i < n() - 1; i++) {
        if (!/^[€$£]$/.test(r.cells[i] || '')) continue;
        // The amount is in the next filled cell, at most two columns on.
        const j = [i + 1, i + 2].find((k) => k < n() && (r.cells[k] || '').trim());
        if (j !== undefined && isNum(r.cells[j]) && (j === i + 1 || !t.layout.headers[j] || !t.layout.headers[i + 1])) { r.cells[j] = `${r.cells[i]} ${r.cells[j]}`; r.cells[i] = ''; }
    }
    const drop = (i: number) => { for (const r of t.rows) r.cells.splice(i, 1); t.layout.headers.splice(i, 1); t.layout.cols.splice(i, 1); };
    for (let i = n() - 1; i >= 0; i--) {
        const filled = t.rows.filter((r) => (r.cells[i] || '').trim()).length;
        if (!t.layout.headers[i] && !filled) { drop(i); continue; }
        if (t.layout.headers[i] || i === 0) continue;
        const left = i - 1;
        if (t.rows.every((r) => !(r.cells[i] || '').trim() || !(r.cells[left] || '').trim())) {
            for (const r of t.rows) if ((r.cells[i] || '').trim()) r.cells[left] = r.cells[i];
            drop(i);
        }
    }
}

const PREVIEW_PAGES = 20;
const PREVIEW_BYTES = 2_400_000;

/**
 * Page pictures for the review (900 px wide, JPEG). Optional: if rendering
 * isn't available or takes too long, the review still works without them.
 */
async function renderPreviews(parser: any, pages: number[], deadline: number): Promise<Record<number, string>> {
    const out: Record<number, string> = {};
    if (!pages.length) return out;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createRequire } = require('module');
        const { createCanvas, loadImage } = createRequire(require.resolve('pdf-parse'))('@napi-rs/canvas');
        let total = 0;
        for (const p of pages.slice(0, PREVIEW_PAGES)) {
            if (Date.now() > deadline) break;
            const shot = await parser.getScreenshot({ partial: [p], desiredWidth: 900, imageDataUrl: false, imageBuffer: true });
            const png = shot?.pages?.[0]?.data;
            if (!png) continue;
            const img = await loadImage(Buffer.from(png));
            const c = createCanvas(img.width, img.height);
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, img.width, img.height);
            ctx.drawImage(img, 0, 0);
            const jpg: Buffer = await c.encode('jpeg', 60);
            if (total + jpg.length > PREVIEW_BYTES) break;
            total += jpg.length;
            out[p] = `data:image/jpeg;base64,${jpg.toString('base64')}`;
        }
    } catch { /* previews are optional */ }
    return out;
}
