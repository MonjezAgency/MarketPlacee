/** Shapes returned by /supplier-catalog/import/* (see backend import-analysis.ts and supplier-import.service.ts). */

import { CATEGORIES_LIST } from '@/lib/products';
import { UNIT_TYPES, digitsOnly } from '@/lib/catalog-rules';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface SheetColumn { index: number; letter: string; key: string; header: string; parent?: string }
/** How a PDF row was read (backend pdf-import.ts RowFlag). */
export type RowFlag =
    | { code: 'multiline'; columns: string[] } | { code: 'between_rows'; text: string } | { code: 'text_repaired' }
    | { code: 'barcode_spaces'; column: string; value: string } | { code: 'key_value' } | { code: 'no_header_on_page'; fromPage: number };
export interface SheetRow {
    row: number; cells: string[]; shown?: Record<string, string>; section?: string; images?: string[];
    /** PDF only: page number, how it was read, and the words as on the page. */
    page?: number; flags?: RowFlag[]; source?: string;
    /** Cells the supplier corrected in the extracted-data step: column header → value read from the file. */
    edited?: Record<string, string>;
}
export interface Hint { field: string; value: string; source: string }

export interface Sheet {
    name: string;
    headerRows: number[];
    columns: SheetColumn[];
    rows: SheetRow[];
    skipped: { row: number; reason: string; preview: string }[];
    sections: string[];
    emptyColumns: string[];
    hints: Hint[];
    recognised: number;
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
    field: string | null;
    confidence: Confidence;
    reason: string;
    candidates: string[];
    checks: string[];
    decimal?: '.' | ',' | 'ambiguous';
    currency?: { code: string; source: string };
    hiddenDecimals?: { count: number; example: { row: number; sheet: string; shown: string; exact: string } };
}

export interface PdfInfo { pages: number; textPages: number[]; scannedPages: number[]; emptyPages: number[]; tablePages: number[]; keyValuePages: number[]; ocr: 'not_configured'; notes: { page: number; text: string }[]; previews?: Record<number, string> }

export interface Analysis {
    fileName: string;
    format?: 'pdf';
    pdf?: PdfInfo;
    sheets: Sheet[];
    columns: ColumnSuggestion[];
    hints: Hint[];
    defaultSheets: string[];
    notices: string[];
    totalRows: number;
}

export interface FieldDef { key: string; header: string; required: 'yes' | 'one-of' | 'no'; group?: string; description: string; stored: boolean }

export interface Source { kind: 'constant' | 'section' | 'sheetName' | 'fromName'; value?: string; perSheet?: Record<string, string> }

export interface Settings { currency: string; moqUnit: string; unit: string; pricePrecision: 'exact' | 'shown'; decimal: Record<string, '.' | ','> }

export interface ReviewRow {
    key: string; sheet: string; row: number;
    state: 'ready' | 'draft' | 'update' | 'unchanged' | 'skip' | 'error';
    action: 'create' | 'update' | 'none';
    name: string; brand: string; ean: string; category: string;
    priceEur: number | null; supplierPrice: number | null; supplierCurrency: string | null;
    stock: number | null; origin: string; exwLocation: string; weight: string;
    unitsPerCase: number | null; casesPerPallet: number | null; moq: number | null; moqUnit: string; shelfLife: string | null;
    images: string[]; imageStatus: 'from_link' | 'from_file' | 'from_lookup' | 'missing'; externalImage?: string | null; page?: number | null;
    from: Record<string, { column: string; value: string }>;
    notes: Record<string, string>;
    aux: Record<string, string>;
    errors: { field: string; label: string; reason: string }[];
    missing: { field: string; label: string; reason: string }[];
    warnings: string[];
    existing: { id: string; name: string; status: string; hasPhoto?: boolean } | null;
    changes: { field: string; label: string; from: string; to: string }[];
}

export interface Review {
    rows: ReviewRow[];
    summary: { total: number; ready: number; draft: number; update: number; unchanged: number; skip: number; error: number; create: number; withWarnings: number; photosFromFile: number; missingImages: number; photosFromLookup?: number };
    mapping: { key: string; field: string; label: string; stored: boolean }[];
    notProvided: string[];
}

export interface CommitResult {
    key: string; sheet: string; row: number; page?: number; name: string; ean: string; photoFromLookup?: boolean;
    outcome: 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed';
    productId?: string; status?: string; missing?: string[]; imageMissing?: boolean; reasons?: string[]; notes?: string[]; changes?: string[];
}

/** Fields shown in the "what Atlantis needs" checklist, in order, and which value sources each can use. `label` is a supplierCatalog dictionary key. */
export const NEEDS: { key: string; label: string; also?: string[]; sources: Source['kind'][] }[] = [
    { key: 'name', label: 'needName', sources: [] },
    { key: 'ean', label: 'needEan', also: ['eanPair'], sources: [] },
    { key: 'brand', label: 'needBrand', sources: ['section', 'sheetName', 'fromName', 'constant'] },
    { key: 'category', label: 'needCategory', sources: ['constant', 'section', 'sheetName'] },
    { key: 'price', label: 'needPrice', also: ['piecePrice', 'displayPrice'], sources: [] },
    { key: 'unitsPerCase', label: 'needUnitsPerCase', sources: ['constant'] },
    { key: 'casesPerPallet', label: 'needCasesPerPallet', sources: ['constant'] },
    { key: 'stock', label: 'needStock', also: ['stockPieces', 'stockPallets'], sources: ['constant'] },
    { key: 'moq', label: 'needMoq', sources: ['constant'] },
    { key: 'weight', label: 'needWeight', sources: ['fromName', 'constant'] },
    { key: 'origin', label: 'needOrigin', sources: ['constant', 'section', 'sheetName'] },
    { key: 'exwLocation', label: 'needExw', sources: ['constant'] },
];

/** supplierCatalog dictionary keys for each value source. */
export const SOURCE_LABEL: Record<Source['kind'], string> = {
    constant: 'sourceConstant',
    section: 'sourceSection',
    sheetName: 'sourceSheetName',
    fromName: 'sourceFromName',
};

/** The `t` from useLanguage(), narrowed to what these helpers need. */
export type TFn = (section: 'supplierCatalog', key: string, vars?: Record<string, string | number | null | undefined>) => string;

/** Import fields the dictionary has a label for (the server's English header is the fallback for anything new). */
const FIELD_KEYS = new Set(['name', 'brand', 'category', 'ean', 'price', 'piecePrice', 'currency', 'stock', 'stockPieces', 'unitsPerCase', 'moq', 'moqUnit', 'origin', 'exwLocation', 'weight', 'unit', 'description', 'shelfLife', 'casesPerPallet', 'palletsPerShipment', 'leadTime', 'imageUrl', 'variants', 'eanPair', 'displayPrice', 'supplierSku', 'caseEan', 'displayEan', 'unitsPerDisplay', 'displaysPerCase', 'casesPerLayer', 'layersPerPallet', 'totalShelfLife', 'rowNumber', 'orderQty', 'stockPallets', 'manufacturer', 'unitsPerPallet', 'caseWeight', 'eanCheck']);
export const fieldLabel = (fields: FieldDef[], key: string, t: TFn) => (FIELD_KEYS.has(key) ? t('supplierCatalog', `field_${key}`) : fields.find((f) => f.key === key)?.header ?? key);
export const where = (r: { sheet: string; row: number; page?: number | null }, multi: boolean, t: TFn) => {
    const base = multi ? t('supplierCatalog', 'whereSheetRow', { sheet: r.sheet, row: r.row }) : t('supplierCatalog', 'whereRow', { row: r.row });
    return r.page ? (t as any)('catalogImport', 'withPage', { where: base, page: r.page }) : base;
};

/** A photo found by barcode for one review row (backend import-enrichment.service.ts). */
export interface PhotoResult {
    key: string;
    status: 'verified' | 'needs_confirmation' | 'not_found' | 'invalid_barcode' | 'unavailable';
    reasons: string[];
    secondSourceNeeded?: boolean;
    candidate?: { url: string; previewUrl: string; source: string; providerId: string; sourceUrl: string; license: string; licenseUrl: string; attribution: string; productName: string | null; brand: string | null; quantity: string | null; barcode: string };
}

/** The server sends repeated text once (see backend compactReview); expand it back. */
export function expandReview(raw: any): Review {
    const t = raw.tables || { columns: [], notes: [], missingLabels: {} };
    return {
        ...raw,
        rows: raw.rows.map((r: any) => ({
            ...r,
            from: Object.fromEntries(Object.entries(r.from || {}).map(([f, x]: [string, any]) => [f, Array.isArray(x) ? { column: t.columns[x[0]], value: x[1] } : x])),
            notes: Object.fromEntries(Object.entries(r.notes || {}).map(([f, n]) => [f, typeof n === 'number' ? t.notes[n] : n])),
            missing: (r.missing || []).map((m: any) => (typeof m === 'string' ? { field: m, label: t.missingLabels[m] || m, reason: '' } : m)),
        })),
    };
}

// ── Display labels shared by the supplier catalog screens (values sent to the API never change) ──

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const CATEGORY_SLUGS = new Set(CATEGORIES_LIST.map(slug));
/** Catalog category name for display; categories outside the standard list are shown as stored. */
export const categoryLabel = (c: string | null | undefined, t: TFn) => (c && CATEGORY_SLUGS.has(slug(c)) && CATEGORIES_LIST.includes(c) ? t('supplierCatalog', `cat_${slug(c)}`) : c || '');
/** Product review status (DRAFT, PENDING, NEEDS_CHANGES, APPROVED, REJECTED). */
export const statusLabel = (s: string, t: TFn) => (['DRAFT', 'PENDING', 'NEEDS_CHANGES', 'APPROVED', 'REJECTED'].includes(s) ? t('supplierCatalog', `status_${s}`) : s);
/** What one piece is (piece, bottle, can…). */
export const unitLabel = (u: string, t: TFn) => ((UNIT_TYPES as readonly string[]).includes(u) ? t('supplierCatalog', `unit_${u}`) : u);
/** MOQ unit (PIECE, CASE, PALLET, TRUCK) as a plural noun for selects ("cases"). */
export const moqUnitsLabel = (u: string, t: TFn) => (['PIECE', 'CASE', 'PALLET', 'TRUCK'].includes(u.toUpperCase()) ? t('supplierCatalog', `moqUnits_${u.toUpperCase()}`) : u.toLowerCase());
/** "12 cases" for an MOQ value and unit. */
export const moqAmount = (n: number, u: string, t: TFn) => (['PIECE', 'CASE', 'PALLET', 'TRUCK'].includes(u.toUpperCase()) ? t('supplierCatalog', `moqCount_${u.toUpperCase()}`, { count: n }) : `${n} ${u.toLowerCase()}`);
/** Translates a gtinProblem() message (lib/catalog-rules) for display. */
export const gtinText = (problem: string | null, raw: string, t: TFn) => {
    if (!problem) return null;
    if (problem.startsWith('Barcode is required')) return t('supplierCatalog', 'gtinRequired');
    if (problem.startsWith('Digits only')) return t('supplierCatalog', 'gtinDigits');
    if (problem.startsWith('Use 8')) return t('supplierCatalog', 'gtinLength', { count: digitsOnly(raw).length });
    return t('supplierCatalog', 'gtinCheckDigit');
};
/** Label of a field reported by missingFields() (lib/catalog-rules) or by the server. */
const MISSING_KEYS = new Set(['name', 'brand', 'category', 'ean', 'origin', 'exwLocation', 'weight', 'price', 'stock', 'unitsPerCase', 'casesPerPallet', 'unit', 'moq', 'images']);
export const missingLabel = (m: { field: string; label: string }, t: TFn) => (MISSING_KEYS.has(m.field) ? t('supplierCatalog', `missing_${m.field}`) : m.label);
/** Joins a list the way the current language does ("a, b and c"). */
export const listJoin = (items: string[], intl: string) => { try { return new Intl.ListFormat(intl, { type: 'conjunction' }).format(items); } catch { return items.join(', '); } };
