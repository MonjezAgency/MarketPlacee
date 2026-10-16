/**
 * Smart supplier import — reading a real supplier workbook.
 *
 * Supplier offers aren't templates: headers can span two rows, brands can be
 * section headings, a workbook can hold one sheet per manufacturer, and one
 * cell can carry two barcodes. This module reads the file as it is and
 * proposes a mapping with the evidence behind each suggestion. It never
 * decides an unclear meaning: those columns are marked for the supplier.
 */
import * as XLSX from 'xlsx';
import { barcodeProblem, normaliseBarcode, normaliseWeight } from './catalog-rules';
import { ALIAS_INDEX, ALL_FIELDS, AMBIGUOUS, MAX_IMPORT_BYTES, cellText, isEmptyToken, labelOf, normaliseHeader, weightFromName, type FieldKey } from './product-import';

export const MAX_ANALYSE_ROWS = 2500;

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface CellRow {
    row: number;                          // 1-based row number as the supplier sees it
    cells: string[];
    /** Text the cell displays when it differs from its exact value ("€ 1.15" for 1.14926875). */
    shown?: Record<string, string>;
    section?: string;                     // nearest section heading above (e.g. "CHUPA CHUPS")
    /** Pictures placed on this row in the workbook (paths inside the file, e.g. "xl/media/image3.png"). */
    images?: string[];
    /** PDF only: the page the row was read from, how it was read, and the words as they appear on the page. */
    page?: number;
    flags?: { code: string; [k: string]: unknown }[];
    source?: string;
}
export interface SheetColumn { index: number; letter: string; key: string; header: string; parent?: string }
export interface Hint { field: FieldKey; value: string; source: string }
export interface SkippedRow { row: number; reason: string; preview: string }

export interface SheetData {
    name: string;
    headerRows: number[];                 // 1-based
    columns: SheetColumn[];
    rows: CellRow[];
    skipped: SkippedRow[];
    sections: string[];
    emptyColumns: string[];               // headed columns with no data in any row
    hints: Hint[];
    recognised: number;                   // columns matched to a field
    /** Pictures in the sheet that sit on no product row (logos, banners) or use a format browsers can't show. */
    otherImages: { count: number; unsupported: number };
}

export interface ColumnSuggestion {
    key: string;
    header: string;
    parent?: string;
    sheets: string[];
    samples: string[];
    filled: number;
    total: number;
    field: FieldKey | null;
    confidence: Confidence;
    reason: string;
    candidates: FieldKey[];               // fields the supplier must choose between (ambiguous)
    checks: string[];                     // what the cells contain, e.g. "97% valid barcodes"
    decimal?: '.' | ',' | 'ambiguous';
    currency?: { code: string; source: string };
    hiddenDecimals?: { count: number; example: { row: number; sheet: string; shown: string; exact: string } };
}

export interface WorkbookAnalysis {
    fileName: string;
    sheets: SheetData[];
    columns: ColumnSuggestion[];
    hints: Hint[];
    defaultSheets: string[];
    notices: string[];
    totalRows: number;
}

// ─── Header matching with evidence ─────────────────────────────────────

const ALIASES: { field: FieldKey; alias: string; tokens: number }[] = (() => {
    const out: { field: FieldKey; alias: string; tokens: number }[] = [];
    for (const f of ALL_FIELDS) for (const a of [f.header, ...f.aliases]) {
        const n = normaliseHeader(a);
        if (n) out.push({ field: f.key, alias: n, tokens: n.split(' ').length });
    }
    for (const a of Object.keys(AMBIGUOUS)) out.push({ field: '__ambiguous' as any, alias: a, tokens: a.split(' ').length });
    return out;
})();
/** Single words too generic to match inside a longer header. */
const WEAK_WORDS = new Set(['no', 'nr', 'pos', 'row', 'ref', 'item', 'product', 'code', 'reference', 'unit', 'title', 'name', 'content', 'origin', 'image', 'images', 'photo', 'picture', 'order', 'description', 'details', 'stock', 'volume']);

export interface HeaderScore { field: FieldKey | null; confidence: Confidence; candidates: FieldKey[]; reason: string }

/** Best field for a header, with how sure we are and why. */
export function scoreHeader(header: string): HeaderScore {
    const n = normaliseHeader(header);
    if (!n) return { field: null, confidence: 'none', candidates: [], reason: 'No column name.' };
    if (AMBIGUOUS[n]) return { field: null, confidence: 'low', candidates: AMBIGUOUS[n], reason: `“${header.trim()}” could mean ${AMBIGUOUS[n].map(labelOf).join(' or ')}.` };
    const exact = ALIAS_INDEX.get(n);
    if (exact) return { field: exact, confidence: 'high', candidates: [], reason: 'Column name matches.' };
    const padded = ` ${n} `;
    let best: typeof ALIASES = [];
    let bestLen = 0;
    for (const a of ALIASES) {
        if (a.tokens === 1 && (WEAK_WORDS.has(a.alias) || a.alias.length < 3)) continue;
        if (!padded.includes(` ${a.alias} `)) continue;
        const len = a.alias.length;
        if (len > bestLen) { best = [a]; bestLen = len; } else if (len === bestLen) best.push(a);
    }
    if (!best.length) return { field: null, confidence: 'none', candidates: [], reason: 'Not recognised.' };
    const fields = [...new Set(best.map((b) => b.field))];
    if (fields.length > 1 || fields[0] === ('__ambiguous' as any)) {
        const c = fields[0] === ('__ambiguous' as any) ? AMBIGUOUS[best[0].alias] : (fields as FieldKey[]);
        return { field: null, confidence: 'low', candidates: c, reason: `“${header.trim()}” could mean ${c.map(labelOf).join(' or ')}.` };
    }
    return { field: fields[0], confidence: 'medium', candidates: [], reason: `Column name contains “${best[0].alias}”.` };
}

// ─── Reading the workbook ──────────────────────────────────────────────

const isNumericText = (v: string) => /^[\s€$£%+-]*\d[\d\s.,]*[\s€$£%]*$/.test(v);
const colLetter = (c: number) => XLSX.utils.encode_col(c);
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s,-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

function extractExw(text: string): string | null {
    const m = String(text || '').match(/\bEXW\b[\s:,-]*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,40})/i);
    if (!m) return null;
    const v = m[1].replace(/\.(xlsx?|csv)$/i, '').replace(/\s+/g, ' ').trim();
    return v ? titleCase(v) : null;
}

export function analyseWorkbook(buf: Buffer, fileName: string): WorkbookAnalysis {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) throw new Error('Upload an .xlsx, .xls or .csv file. In Google Sheets use File → Download → .xlsx or .csv.');
    if (buf.length > MAX_IMPORT_BYTES) throw new Error('File is larger than 5 MB. Split it into smaller files.');
    const wb = XLSX.read(buf, ext === 'csv' ? { type: 'buffer', raw: true, codepage: 65001 } : { type: 'buffer', cellDates: true });
    const sheets: SheetData[] = [];
    const pictures = ext === 'xlsx' ? readPictures(buf) : new Map<string, Picture[]>();
    for (const name of wb.SheetNames) {
        if (/instruction|guide|readme|^help$|تعليمات/i.test(name)) continue;
        const sd = readSheet(wb.Sheets[name], name, pictures.get(name) || []);
        if (sd && sd.rows.length) sheets.push(sd);
    }
    if (!sheets.length) throw new Error('No product rows found. The file needs a header row (column names) and at least one row of products.');

    // File-name hint (e.g. "PERFETTI OFFER EXW BELGIUM.xlsx").
    const hints: Hint[] = [];
    const exwFromName = extractExw(fileName.replace(/[_]+/g, ' '));
    if (exwFromName) hints.push({ field: 'exwLocation', value: exwFromName, source: `file name “${fileName}”` });
    return finishAnalysis(fileName, sheets, hints);
}

/** Row limit, hints and column suggestions — shared by spreadsheets and PDFs (pdf-import.ts). */
export function finishAnalysis(fileName: string, sheets: SheetData[], hints: Hint[] = []): WorkbookAnalysis {
    const notices: string[] = [];
    let totalRows = sheets.reduce((s, x) => s + x.rows.length, 0);
    if (totalRows > MAX_ANALYSE_ROWS) {
        notices.push(`The file has ${totalRows} product rows; only the first ${MAX_ANALYSE_ROWS} are read. Split the file to import the rest.`);
        let left = MAX_ANALYSE_ROWS;
        for (const s of sheets) { s.rows = s.rows.slice(0, Math.max(0, left)); left -= s.rows.length; }
        totalRows = MAX_ANALYSE_ROWS;
    }

    for (const s of sheets) for (const h of s.hints) if (!hints.some((x) => x.field === h.field && x.value === h.value)) hints.push(h);

    const columns = suggestColumns(sheets);
    const defaultSheets = sheets.filter((s) => s.recognised >= 2).map((s) => s.name);
    return { fileName, sheets, columns, hints, defaultSheets: defaultSheets.length ? defaultSheets : sheets.map((s) => s.name), notices, totalRows };
}

function readSheet(ws: XLSX.WorkSheet, name: string, pictures: Picture[] = []): SheetData | null {
    if (!ws || !ws['!ref']) return null;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const raw: string[][] = [];
    const shown: (string | undefined)[][] = [];
    for (let r = 0; r <= range.e.r; r++) {
        const row: string[] = [], sh: (string | undefined)[] = [];
        for (let c = 0; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
            row.push(cellText(cell));
            sh.push(cell && cell.t === 'n' && typeof cell.w === 'string' ? cell.w.trim() : undefined);
        }
        raw.push(row); shown.push(sh);
    }
    const width = range.e.c + 1;
    const merges = (ws['!merges'] || []) as XLSX.Range[];
    const filled = (r: string[]) => r.filter((v) => v.trim() !== '').length;

    // Header: the row (in the first 25) whose cells look most like column names.
    let headerIdx = -1, bestScore = 0;
    for (let r = 0; r < Math.min(25, raw.length); r++) {
        const score = raw[r].filter((v) => v.trim() && !isNumericText(v) && scoreHeader(v).confidence !== 'none').length;
        if (score > bestScore && score >= 2) { bestScore = score; headerIdx = r; }
    }
    if (headerIdx < 0) headerIdx = raw.slice(0, 25).findIndex((r) => filled(r) >= 3 && r.filter((v) => v && !isNumericText(v)).length >= 3);
    if (headerIdx < 0) return null;

    // Parent label for cells inside a merged header range ("Palletization" over three columns).
    const mergedParent = (r: number, c: number): string => {
        const m = merges.find((x) => x.s.r <= r && x.e.r >= r && x.s.c <= c && x.e.c >= c && x.e.c > x.s.c);
        return m ? (raw[m.s.r][m.s.c] || '').trim() : '';
    };
    // Second header row: text only, and it names columns or sits under a merged/blank header.
    let subIdx = -1;
    const next = raw[headerIdx + 1];
    if (next && filled(next) >= 1 && next.every((v) => !v.trim() || !isNumericText(v))) {
        const namesColumns = next.some((v) => v.trim() && scoreHeader(v).confidence !== 'none');
        const underGroup = next.some((v, c) => v.trim() && (mergedParent(headerIdx, c) || !raw[headerIdx][c].trim()));
        if (namesColumns && underGroup) subIdx = headerIdx + 1;
    }

    const hints: Hint[] = [];
    const columns: SheetColumn[] = [];
    const keyCount = new Map<string, number>();
    for (let c = 0; c < width; c++) {
        const top = raw[headerIdx][c].trim() || mergedParent(headerIdx, c);
        const sub = subIdx >= 0 ? raw[subIdx][c].trim() : '';
        let header = top, parent: string | undefined;
        if (sub) {
            // A sub-cell like "EXW BELGIUM" under a blank header is a note, not a column name.
            const exw = extractExw(sub);
            if (exw && !ALIAS_INDEX.get(normaliseHeader(sub))) { hints.push({ field: 'exwLocation', value: exw, source: `“${sub}” (cell ${colLetter(c)}${subIdx + 1}, sheet “${name}”)` }); }
            else { header = sub; parent = top && top !== sub ? top : undefined; }
        }
        const base = normaliseHeader(header) || `column ${colLetter(c)}`;
        const k = (keyCount.get(base) || 0) + 1;
        keyCount.set(base, k);
        columns.push({ index: c, letter: colLetter(c), key: k > 1 ? `${base} #${k}` : base, header: header || `Column ${colLetter(c)}`, parent });
    }
    // Notes above the header ("EXW BELGIUM", "Offer valid until…").
    for (let r = 0; r < headerIdx; r++) for (let c = 0; c < width; c++) {
        const v = raw[r][c];
        const exw = v && extractExw(v);
        if (exw) hints.push({ field: 'exwLocation', value: exw, source: `“${v.trim()}” (cell ${colLetter(c)}${r + 1}, sheet “${name}”)` });
    }

    const bodyStart = (subIdx >= 0 ? subIdx : headerIdx) + 1;
    const headed = columns.filter((c) => normaliseHeader(raw[headerIdx][c.index] || c.header) && !c.key.startsWith('column ')).length || width;
    const headerText = raw[headerIdx].map((v) => normaliseHeader(v)).join('|');
    const rows: CellRow[] = [], skipped: SkippedRow[] = [], sections: string[] = [];
    let section: string | undefined;
    for (let r = bodyStart; r < raw.length; r++) {
        const cells = raw[r].map((v) => v.trim());
        const meaningful = cells.filter((v) => v && !isEmptyToken(v));
        if (!meaningful.length) continue;
        const preview = meaningful.slice(0, 4).join(' · ').slice(0, 90);
        if (cells.map((v) => normaliseHeader(v)).join('|') === headerText) { skipped.push({ row: r + 1, reason: 'Repeated header row.', preview }); continue; }
        if (meaningful.length === 1 && !isNumericText(meaningful[0]) && meaningful[0].length <= 60) {
            section = meaningful[0];
            if (!sections.includes(section)) sections.push(section);
            continue;
        }
        if (meaningful.length <= 2 || meaningful.length < Math.ceil(headed * 0.3)) {
            skipped.push({ row: r + 1, reason: `Only ${meaningful.length} value${meaningful.length === 1 ? '' : 's'} — not read as a product.`, preview });
            continue;
        }
        const sh: Record<string, string> = {};
        shown[r].forEach((w, c) => {
            if (w === undefined || !cells[c]) return;
            const exact = Number(cells[c]);
            const disp = Number(w.replace(/[^\d.,-]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, ''));
            // Kept when the display hides decimals, or carries a currency sign the value doesn't have.
            if (/e\+/i.test(w)) return;
            if ((Number.isFinite(exact) && Number.isFinite(disp) && Math.abs(exact - disp) > 1e-9) || /[€$£]/.test(w)) sh[String(c)] = w;
        });
        rows.push({ row: r + 1, cells, ...(Object.keys(sh).length ? { shown: sh } : {}), ...(section ? { section } : {}) });
    }
    // Pictures: a picture belongs to the product row it is placed on.
    const byRow = new Map(rows.map((r) => [r.row, r]));
    let otherCount = 0, unsupported = 0;
    for (const p of pictures) {
        if (!/\.(png|jpe?g|gif|webp)$/i.test(p.path)) { unsupported++; continue; }
        let target: CellRow | undefined;
        for (let r = p.fromRow; r <= Math.max(p.fromRow, p.toRow) && !target; r++) target = byRow.get(r);
        if (!target) { otherCount++; continue; }
        (target.images ||= []).push(p.path);
    }
    // A picture column ("Product image") holds pictures, not text: it isn't empty.
    const pictureCols = new Set(pictures.map((p) => p.col));
    const emptyColumns = columns.filter((c) => !c.key.startsWith('column ') && !pictureCols.has(c.index) && !rows.some((r) => (r.cells[c.index] || '').trim())).map((c) => c.header);
    const recognised = columns.filter((c) => !emptyColumns.includes(c.header) && scoreHeader(c.header).confidence !== 'none').length;
    return { name, headerRows: subIdx >= 0 ? [headerIdx + 1, subIdx + 1] : [headerIdx + 1], columns, rows, skipped, sections, emptyColumns, hints, recognised, otherImages: { count: otherCount, unsupported } };
}

// ─── Column suggestions (across sheets) ────────────────────────────────

const CURRENCY_WORDS: Record<string, string> = { eur: 'EUR', euro: 'EUR', euros: 'EUR', '€': 'EUR', usd: 'USD', '$': 'USD', gbp: 'GBP', '£': 'GBP', aed: 'AED', sar: 'SAR', egp: 'EGP', ron: 'RON', try: 'TRY', kwd: 'KWD', qar: 'QAR', inr: 'INR' };
const PRICE_FIELDS: FieldKey[] = ['price', 'piecePrice', 'displayPrice'];
const NUMERIC_FIELDS: FieldKey[] = ['price', 'piecePrice', 'displayPrice', 'stock', 'stockPieces', 'stockPallets', 'unitsPerPallet', 'unitsPerCase', 'casesPerPallet', 'palletsPerShipment', 'leadTime', 'unitsPerDisplay', 'displaysPerCase', 'casesPerLayer', 'layersPerPallet'];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function suggestColumns(sheets: SheetData[]): ColumnSuggestion[] {
    const byKey = new Map<string, { col: SheetColumn; sheets: string[]; values: { v: string; sheet: string; row: number; shown?: string }[]; total: number }>();
    const hasDisplayCols = sheets.some((s) => s.columns.some((c) => ['unitsPerDisplay', 'displaysPerCase'].includes(String(scoreHeader(c.header).field))));
    for (const s of sheets) for (const col of s.columns) {
        let e = byKey.get(col.key);
        if (!e) { e = { col, sheets: [], values: [], total: 0 }; byKey.set(col.key, e); }
        e.sheets.push(s.name);
        for (const r of s.rows) {
            e.total++;
            const v = (r.cells[col.index] || '').trim();
            if (v && !isEmptyToken(v)) e.values.push({ v, sheet: s.name, row: r.row, shown: r.shown?.[String(col.index)] });
        }
    }
    const out: ColumnSuggestion[] = [];
    for (const [key, e] of byKey) {
        if (!e.values.length) continue; // empty everywhere: listed per sheet as an empty column
        const sc = scoreHeader(e.col.header);
        const vals = e.values.map((x) => x.v);
        // Samples as the supplier sees them in the file ("1.057 €"), not the raw cell value.
        const samples = [...new Set(e.values.map((x) => x.shown || x.v))].slice(0, 4);
        const n = vals.length;
        const checks: string[] = [];
        const validEan = vals.filter((v) => !barcodeProblem(normaliseBarcode(v))).length;
        const pairs = vals.filter((v) => /^\d{8,14}\s*(\/\s*|\s+)\d{0,14}\s*$/.test(v) && /[\/\s]/.test(v)).length;
        const numeric = vals.filter((v) => isNumericText(v)).length;
        const unique = new Set(vals.map((v) => v.toLowerCase())).size;
        const avgLen = vals.reduce((s, v) => s + v.length, 0) / n;
        const withWeight = vals.filter((v) => weightFromName(v)).length;
        let field = sc.field, confidence = sc.confidence, reason = sc.reason;
        let candidates = sc.candidates;

        // What the cells actually contain decides between close meanings.
        if (pairs / n >= 0.5 && (field === 'ean' || field === 'eanPair' || field === 'caseEan' || !field)) {
            confidence = sc.field === 'eanPair' ? confidence : 'medium';
            field = 'eanPair';
            reason = 'Cells hold two barcodes (piece / case).';
            checks.push(`${pct(pairs, n)}% of cells hold two barcodes`);
        } else if (field === 'eanPair' && pairs / n < 0.5) {
            field = 'ean'; confidence = 'medium'; reason = 'Column name mentions two barcodes, but cells hold one.';
        }
        if (['ean', 'caseEan', 'displayEan', 'eanCheck'].includes(String(field))) {
            checks.push(`${pct(validEan, n)}% valid barcodes`);
            if (validEan / n < 0.5) { confidence = 'low'; reason += ' Most cells are not valid barcodes — check.'; }
        }
        if (field && NUMERIC_FIELDS.includes(field)) {
            checks.push(`${pct(numeric, n)}% numbers`);
            if (numeric / n < 0.7) { confidence = 'low'; reason += ' Many cells are not numbers — check.'; }
        }
        if (candidates.includes('price') && hasDisplayCols && !candidates.includes('displayPrice')) {
            candidates = [...candidates, 'displayPrice'];
            reason = `“${e.col.header.trim()}” could mean ${candidates.map(labelOf).join(', ').replace(/, ([^,]*)$/, ' or $1')} — the file doesn’t say.`;
        }
        // A "Product image" column in a PDF or a pasted sheet holds no links — nothing to import from it.
        if (field === 'imageUrl') {
            const links = vals.filter((v) => /^https?:\/\//i.test(v)).length;
            if (links / n < 0.5) { field = null; confidence = 'none'; reason = 'Column name says image, but the cells hold no image links.'; }
        }
        if (field === 'weight') {
            const ok = vals.filter((v) => normaliseWeight(v) || /^(\d+\s*[x×]\s*)?\d+([.,]\d+)?$/i.test(v)).length;
            checks.push(`${pct(ok, n)}% read as weights`);
        }
        if (field === 'name' || field === 'description') checks.push(`${pct(unique, n)}% unique · ${pct(withWeight, n)}% mention a weight`);
        if (n < e.total) checks.push(`filled in ${n} of ${e.total} rows`);

        // Currency from the header ("Price / pce. in EUR") or the cells' format ("€ 1.15").
        let currency: ColumnSuggestion['currency'];
        // Price columns, or any column whose cells carry a currency sign (a price column without a header).
        const signed = e.values.filter((x) => /[€$£]/.test(x.shown || x.v)).length / n >= 0.8;
        if (field && PRICE_FIELDS.includes(field) || candidates.some((c) => PRICE_FIELDS.includes(c)) || (!field && signed)) {
            const toks = normaliseHeader(e.col.header).split(' ');
            const hw = toks.find((t) => CURRENCY_WORDS[t]) || (e.col.header.match(/[€$£]/) || [])[0];
            if (hw) currency = { code: CURRENCY_WORDS[hw], source: `column name “${e.col.header.trim()}”` };
            else {
                const sym = e.values.map((x) => (x.shown || x.v).match(/[€$£]/)?.[0]).filter(Boolean) as string[];
                if (sym.length / n >= 0.8 && new Set(sym).size === 1) currency = { code: CURRENCY_WORDS[sym[0]], source: `cells shown as “${(e.values[0].shown || e.values[0].v).trim()}”` };
            }
        }
        const shownNum = (t: string) => Number(t.replace(/[^\d.,-]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, ''));
        const hidden = e.values.filter((x) => x.shown && Number.isFinite(Number(x.v)) && Math.abs(Number(x.v) - shownNum(x.shown)) > 1e-9);
        out.push({
            key, header: e.col.header, parent: e.col.parent, sheets: e.sheets, samples, filled: n, total: e.total,
            field: field ?? null, confidence: field || candidates.length ? confidence : 'none', reason, candidates: field ? [] : candidates, checks,
            decimal: field && NUMERIC_FIELDS.includes(field) ? decimalOf(vals) : undefined,
            currency,
            hiddenDecimals: hidden.length ? { count: hidden.length, example: { row: hidden[0].row, sheet: hidden[0].sheet, shown: hidden[0].shown!, exact: hidden[0].v } } : undefined,
        });
    }

    // No name column, but a "description" column holds short unique names with sizes → propose it as the name.
    if (!out.some((c) => c.field === 'name')) {
        const cand = out.filter((c) => c.field === 'description' || (!c.field && c.confidence === 'none'))
            .map((c) => ({ c, stats: c.checks.join(' ') }))
            .find(({ c }) => {
                const e = byKey.get(c.key)!;
                const vals = e.values.map((x) => x.v);
                const uniq = new Set(vals.map((v) => v.toLowerCase())).size / vals.length;
                const len = vals.reduce((s, v) => s + v.length, 0) / vals.length;
                const ww = vals.filter((v) => weightFromName(v)).length / vals.length;
                // Sizes may sit in their own Weight column, so a name without one still counts then.
                const weightCol = out.some((o) => o.field === 'weight');
                return uniq >= 0.8 && len >= 5 && len <= 120 && (ww >= 0.3 || weightCol) && vals.filter(isNumericText).length / vals.length < 0.2;
            });
        if (cand) {
            cand.c.field = 'name'; cand.c.confidence = 'medium';
            cand.c.reason = out.some((o) => o.field === 'weight')
                ? 'No product-name column; this one holds short, unique names (sizes are in the weight column) — check it is the name buyers should see.'
                : 'No product-name column; this one holds short, unique names with pack sizes — check it is the name buyers should see.';
        }
    }
    // Two columns proposed for the same field: keep the more certain one, flag the other.
    const rank: Record<Confidence, number> = { high: 3, medium: 2, low: 1, none: 0 };
    for (const c of out) {
        if (!c.field) continue;
        const rivals = out.filter((o) => o !== c && o.field === c.field && o.sheets.some((s) => c.sheets.includes(s)));
        for (const o of rivals) {
            if (rank[o.confidence] > rank[c.confidence] || (rank[o.confidence] === rank[c.confidence] && out.indexOf(o) < out.indexOf(c))) {
                if (c.field === 'ean' && c.checks.some((x) => /^(\d+)% valid barcodes/.test(x) && Number(x.match(/^(\d+)/)![1]) >= 50)) {
                    c.field = 'eanCheck'; c.confidence = 'medium';
                    c.reason = `A second barcode column. It will be compared with “${o.header}” row by row; rows where they differ are blocked.`;
                    break;
                }
                c.reason = `Could be ${labelOf(c.field)}, but “${o.header}” already matches it better — choose if needed.`;
                c.candidates = [c.field]; c.field = null; c.confidence = 'low';
                break;
            }
        }
    }
    return out;
}

/** Decimal separator a numeric column uses, from values that can only be read one way. */
export function decimalOf(vals: string[]): '.' | ',' | 'ambiguous' | undefined {
    let dot = 0, comma = 0, unclear = 0;
    for (const raw of vals) {
        const v = raw.replace(/[€$£\s]/g, '');
        if (/^\d+\.\d{1,2}$|^0\.\d+$|^\d+\.\d{4,}$|^\d{1,3}(,\d{3})+\.\d+$/.test(v)) dot++;
        else if (/^\d+,\d{1,2}$|^0,\d+$|^\d+,\d{4,}$|^\d{1,3}(\.\d{3})+,\d+$/.test(v)) comma++;
        else if (/^\d{1,3}[.,]\d{3}$/.test(v)) unclear++;
    }
    if (dot && !comma) return '.';
    if (comma && !dot) return ',';
    if (dot && comma) return 'ambiguous';
    return unclear ? 'ambiguous' : undefined;
}

// ─── Pictures placed in the workbook ───────────────────────────────────

interface Picture { path: string; fromRow: number; toRow: number; col: number } // rows 1-based, col 0-based

const decodeXml = (t: string) => t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const joinPath = (base: string, target: string) => {
    if (target.startsWith('/')) return target.slice(1);
    const parts = base.split('/').slice(0, -1);
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
    return parts.join('/');
};
const relsPath = (p: string) => { const i = p.lastIndexOf('/'); return `${p.slice(0, i)}/_rels/${p.slice(i + 1)}.rels`; };

/**
 * Pictures anchored in each sheet (Insert → Picture, placed over a cell),
 * read from the .xlsx package: sheet → drawing → anchor row → media file.
 * Works on a copy whose media bytes were removed (the browser keeps them).
 */
export function readPictures(buf: Buffer): Map<string, Picture[]> {
    const out = new Map<string, Picture[]>();
    let files: Map<string, string>;
    try {
        const cfb = XLSX.CFB.read(buf, { type: 'buffer' });
        files = new Map();
        cfb.FullPaths.forEach((full, i) => {
            const p = full.replace(/^Root Entry\//, '');
            if (/\.(xml|rels)$/i.test(p) && cfb.FileIndex[i]?.content) files.set(p, Buffer.from(cfb.FileIndex[i].content as any).toString('utf8'));
        });
    } catch { return out; }
    const rels = (p: string) => {
        const m = new Map<string, { target: string; type: string }>();
        const x = files.get(relsPath(p));
        if (!x) return m;
        for (const r of x.match(/<Relationship\b[^>]*>/g) || []) {
            const id = r.match(/\bId="([^"]+)"/)?.[1], target = r.match(/\bTarget="([^"]+)"/)?.[1], type = r.match(/\bType="([^"]+)"/)?.[1] || '';
            if (id && target) m.set(id, { target: joinPath(p, decodeXml(target)), type });
        }
        return m;
    };
    const wbXml = files.get('xl/workbook.xml');
    if (!wbXml) return out;
    const wbRels = rels('xl/workbook.xml');
    for (const tag of wbXml.match(/<sheet\b[^>]*>/g) || []) {
        const name = decodeXml(tag.match(/\bname="([^"]*)"/)?.[1] || '');
        const rid = tag.match(/\br:id="([^"]+)"/)?.[1];
        const sheetPath = rid ? wbRels.get(rid)?.target : undefined;
        if (!name || !sheetPath) continue;
        const pics: Picture[] = [];
        for (const [, rel] of rels(sheetPath)) {
            if (!/\/drawing$/.test(rel.type)) continue;
            const dx = files.get(rel.target);
            if (!dx) continue;
            const drels = rels(rel.target);
            for (const a of dx.match(/<(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)>/g) || []) {
                const from = a.match(/<(?:xdr:)?from>[\s\S]*?<(?:xdr:)?col>(\d+)<\/(?:xdr:)?col>[\s\S]*?<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/);
                const to = a.match(/<(?:xdr:)?to>[\s\S]*?<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/);
                const embed = a.match(/r:embed="([^"]+)"/)?.[1];
                const media = embed ? drels.get(embed)?.target : undefined;
                if (!from || !media) continue;
                const fromRow = Number(from[2]) + 1;
                pics.push({ path: media, fromRow, toRow: to ? Number(to[1]) + 1 : fromRow, col: Number(from[1]) });
            }
        }
        if (pics.length) out.set(name, pics);
    }
    return out;
}
