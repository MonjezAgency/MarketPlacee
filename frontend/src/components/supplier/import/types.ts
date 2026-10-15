/** Shapes returned by /supplier-catalog/import/* (see backend import-analysis.ts and supplier-import.service.ts). */

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface SheetColumn { index: number; letter: string; key: string; header: string; parent?: string }
export interface SheetRow { row: number; cells: string[]; shown?: Record<string, string>; section?: string; images?: string[] }
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

export interface Analysis {
    fileName: string;
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
    images: string[]; imageStatus: 'from_link' | 'from_file' | 'missing';
    from: Record<string, { column: string; value: string }>;
    notes: Record<string, string>;
    aux: Record<string, string>;
    errors: { field: string; label: string; reason: string }[];
    missing: { field: string; label: string; reason: string }[];
    warnings: string[];
    existing: { id: string; name: string; status: string } | null;
    changes: { field: string; label: string; from: string; to: string }[];
}

export interface Review {
    rows: ReviewRow[];
    summary: { total: number; ready: number; draft: number; update: number; unchanged: number; skip: number; error: number; create: number; withWarnings: number; photosFromFile: number; missingImages: number };
    mapping: { key: string; field: string; label: string; stored: boolean }[];
    notProvided: string[];
}

export interface CommitResult {
    key: string; sheet: string; row: number; name: string; ean: string;
    outcome: 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed';
    productId?: string; status?: string; missing?: string[]; imageMissing?: boolean; reasons?: string[]; notes?: string[]; changes?: string[];
}

/** Fields shown in the "what Atlantis needs" checklist, in order, and which value sources each can use. */
export const NEEDS: { key: string; label: string; also?: string[]; sources: Source['kind'][] }[] = [
    { key: 'name', label: 'Product name', sources: [] },
    { key: 'ean', label: 'Barcode (EAN/GTIN)', also: ['eanPair'], sources: [] },
    { key: 'brand', label: 'Brand', sources: ['section', 'sheetName', 'fromName', 'constant'] },
    { key: 'category', label: 'Category', sources: ['constant', 'section', 'sheetName'] },
    { key: 'price', label: 'Price', also: ['piecePrice', 'displayPrice'], sources: [] },
    { key: 'unitsPerCase', label: 'Pieces per case', sources: ['constant'] },
    { key: 'casesPerPallet', label: 'Cases per pallet', sources: ['constant'] },
    { key: 'stock', label: 'Stock (cases)', also: ['stockPieces'], sources: ['constant'] },
    { key: 'moq', label: 'Minimum order (MOQ)', sources: ['constant'] },
    { key: 'weight', label: 'Weight per piece', sources: ['fromName', 'constant'] },
    { key: 'origin', label: 'Country of origin', sources: ['constant', 'section', 'sheetName'] },
    { key: 'exwLocation', label: 'EXW location', sources: ['constant'] },
];

export const SOURCE_LABEL: Record<Source['kind'], string> = {
    constant: 'One value for every row',
    section: 'The section headings in the sheet',
    sheetName: 'The sheet name',
    fromName: 'Read from the product name',
};

export const fieldLabel = (fields: FieldDef[], key: string) => fields.find((f) => f.key === key)?.header ?? key;
export const where = (r: { sheet: string; row: number }, multi: boolean) => (multi ? `${r.sheet} · row ${r.row}` : `Row ${r.row}`);

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
