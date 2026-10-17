/**
 * Bulk product import — schema, header matching and row normalisation.
 *
 * The same IMPORT_FIELDS drive the in-app guide, the downloadable template,
 * header matching and validation, so they can't drift apart. Completeness is
 * judged by catalog-rules.ts, exactly like a manually created product.
 */
import * as XLSX from 'xlsx';
import { TO_EUR, MOQ_UNITS, UNIT_TYPES, barcodeProblem, invalidValues, missingForPublish, normaliseBarcode, normaliseWeight, type Missing } from './catalog-rules';
import { originProblem, resolveOrigin } from './country-canon';

export type FieldKey =
    | 'name' | 'brand' | 'category' | 'ean' | 'price' | 'piecePrice' | 'currency' | 'stock' | 'stockPieces' | 'stockPallets'
    | 'unitsPerCase' | 'moq' | 'moqUnit' | 'origin' | 'exwLocation' | 'weight'
    | 'unit' | 'description' | 'shelfLife' | 'casesPerPallet' | 'palletsPerShipment' | 'leadTime' | 'imageUrl' | 'variants'
    | AuxKey;

/**
 * Columns real supplier files carry that are not product fields. They are
 * recognised (so they're not shown as "unknown"), used for cross-checks and
 * conversions, and kept in the product's import record — never stored as
 * product data.
 */
export type AuxKey =
    | 'eanPair' | 'displayPrice' | 'supplierSku' | 'caseEan' | 'displayEan' | 'unitsPerDisplay' | 'displaysPerCase'
    | 'casesPerLayer' | 'layersPerPallet' | 'totalShelfLife' | 'rowNumber' | 'orderQty'
    | 'manufacturer' | 'unitsPerPallet' | 'caseWeight' | 'eanCheck';

export interface ImportField {
    key: FieldKey;
    header: string;            // canonical column name used in the template
    required: 'yes' | 'one-of' | 'no';
    group?: string;            // fields of a 'one-of' group: one of them must be filled
    description: string;
    example: string;
    aliases: string[];         // matched after normalisation (English + Arabic)
    /** false = recognised and checked, but not saved on the product (kept in the import record). */
    stored?: boolean;
}

export const IMPORT_FIELDS: ImportField[] = [
    { key: 'name', header: 'Product Name', required: 'yes', description: 'Full product name as buyers should see it.', example: 'Nutella Hazelnut Spread 400 g', aliases: ['name', 'product name', 'product title', 'title', 'item name', 'item description', 'product', 'item', 'designation', 'article designation', 'product designation', 'article name', 'article description', 'اسم المنتج', 'الاسم', 'المنتج', 'اسم الصنف', 'الصنف'] },
    { key: 'brand', header: 'Brand', required: 'yes', description: 'Brand printed on the pack.', example: 'Nutella', aliases: ['brand', 'brand name', 'trade mark', 'trademark', 'marke', 'marque', 'marca', 'brand trade mark', 'العلامة التجارية', 'الماركة', 'البراند', 'العلامه التجاريه'] },
    { key: 'category', header: 'Category', required: 'yes', description: 'Catalog category, e.g. Chocolates & Sweets, Beverages.', example: 'Spreads & Breakfast', aliases: ['category', 'product category', 'categories', 'الفئة', 'التصنيف', 'القسم', 'الفئه'] },
    { key: 'ean', header: 'EAN', required: 'yes', description: 'Barcode — EAN-13, EAN-8, UPC-A (12) or GTIN-14, digits only. Format the column as Text so leading zeros are kept.', example: '3017620422003', aliases: ['ean', 'barcode', 'bar code', 'ean code', 'ean13', 'ean 13', 'ean8', 'gtin', 'gtin13', 'gtin 13', 'upc', 'upc code', 'unit ean', 'ean unit', 'ean piece', 'piece ean', 'ean pce', 'ean pc', 'consumer unit ean', 'cu ean', 'ean cu', 'item ean', 'single ean', 'pcs ean', 'ean pcs', 'ean pieces', 'ean code piece', 'الباركود', 'رمز الباركود', 'باركود'] },
    { key: 'price', header: 'Price per Case', required: 'one-of', group: 'price', description: 'Your price for one case (carton), in the file currency.', example: '36.00', aliases: ['price per case', 'case price', 'price case', 'price per carton', 'carton price', 'price carton', 'سعر الكرتونة', 'سعر الكرتونه', 'سعر الكرتون'] },
    { key: 'piecePrice', header: 'Price per Piece', required: 'one-of', group: 'price', description: 'Your price for one piece. Multiplied by Pieces per Case to get the case price. Use this OR Price per Case.', example: '2.40', aliases: ['price per piece', 'piece price', 'unit price', 'price per unit', 'price unit', 'price piece', 'price pce', 'price per pce', 'price pc', 'price per pc', 'pce price', 'price each', 'سعر القطعة', 'سعر القطعه', 'سعر الوحدة'] },
    { key: 'currency', header: 'Currency', required: 'no', description: `ISO code for this row (${Object.keys(TO_EUR).join(', ')}). Empty = the currency you pick when uploading. Stored in EUR.`, example: 'EUR', aliases: ['currency', 'curr', 'currency code', 'العملة', 'العمله'] },
    { key: 'stock', header: 'Stock (cases)', required: 'one-of', group: 'stock', description: 'Cases available to sell now.', example: '120', aliases: ['stock cases', 'stock', 'cases in stock', 'available cases', 'stock case', 'available stock', 'stock qty', 'المخزون', 'المخزون بالكرتونة', 'عدد الكراتين'] },
    { key: 'stockPieces', header: 'Stock (pieces)', required: 'one-of', group: 'stock', description: 'Pieces available. Converted to whole cases using Pieces per Case. Use this OR Stock (cases).', example: '', aliases: ['stock pieces', 'pieces in stock', 'units in stock', 'stock units', 'المخزون بالقطعة'] },
    { key: 'stockPallets', header: 'Stock (pallets)', required: 'one-of', group: 'stock', description: 'Full pallets available. Converted to cases using Cases per Pallet. Use this OR Stock (cases).', example: '', aliases: ['stock pallets', 'pallets available', 'available pallets', 'pallets in stock', 'quantity pallets', 'qty pallets'] },
    { key: 'unitsPerCase', header: 'Pieces per Case', required: 'yes', description: 'Pieces in one case.', example: '15', aliases: ['pieces per case', 'units per case', 'pcs per case', 'pcs case', 'pieces case', 'qty per case', 'case qty', 'units case', 'unitspercase', 'case count', 'units per carton', 'pieces per carton', 'pcs per carton', 'pcs ctn', 'units ctn', 'pcs carton', 'case size', 'carton size', 'pieces carton', 'pcs box', 'pcs per box', 'pieces per box', 'pcs in box', 'units per box', 'bottles per case', 'n of bottles per case', 'cans per case', 'pcs per crt', 'pcs per carton', 'pieces per crt', 'عدد القطع في الكرتونة', 'قطع في الكرتونة', 'عدد القطع بالكرتونة'] },
    { key: 'moq', header: 'MOQ', required: 'yes', description: 'Minimum order quantity, counted in the MOQ Unit.', example: '10', aliases: ['moq', 'minimum order', 'minimum order quantity', 'min order', 'min order qty', 'min qty', 'minorder', 'الحد الأدنى للطلب', 'الحد الادنى للطلب', 'أقل كمية'] },
    { key: 'moqUnit', header: 'MOQ Unit', required: 'no', description: 'piece, case, pallet or truck. Empty = the MOQ unit you pick when uploading (default: case).', example: 'case', aliases: ['moq unit', 'min order unit', 'minimum order unit', 'وحدة الحد الأدنى'] },
    { key: 'origin', header: 'Country of Origin', required: 'yes', description: 'Where the product was made.', example: 'France', aliases: ['country of origin', 'origin', 'made in', 'coo', 'origin country', 'بلد المنشأ', 'المنشأ', 'بلد الصنع'] },
    { key: 'exwLocation', header: 'EXW Location', required: 'yes', description: 'City and country of the warehouse the goods are collected from (Ex Works).', example: 'Bucharest, Romania', aliases: ['exw location', 'exw', 'warehouse', 'warehouse location', 'ship from location', 'ship from', 'pickup location', 'loading location', 'exw warehouse', 'مكان الاستلام', 'المستودع', 'موقع المستودع', 'مكان التحميل'] },
    { key: 'weight', header: 'Weight per Piece', required: 'yes', description: 'Net weight or volume of one piece, with unit: g, kg, ml, cl, L, oz or lb.', example: '400 g', aliases: ['weight per piece', 'weight', 'net weight', 'unit weight', 'piece weight', 'volume', 'net content', 'weight per unit', 'net weight per piece', 'content', 'الوزن', 'الوزن الصافي', 'الحجم'] },
    { key: 'unit', header: 'Unit Type', required: 'no', description: `What one piece is: ${UNIT_TYPES.slice(0, 10).join(', ')}. Empty = the unit type you pick when uploading.`, example: 'jar', aliases: ['unit type', 'unit', 'uom', 'unit of measure', 'packaging type', 'نوع الوحدة', 'الوحدة'] },
    { key: 'description', header: 'Description', required: 'no', description: 'Optional product description.', example: 'Hazelnut spread with cocoa, 400 g jar.', aliases: ['description', 'product description', 'details', 'الوصف', 'وصف المنتج'] },
    { key: 'shelfLife', header: 'BBD / Shelf Life', required: 'no', description: 'Best-before date or remaining shelf life, e.g. 2027-03-31 or 9 months.', example: '9 months', aliases: ['bbd', 'best before', 'best before date', 'shelf life', 'expiry', 'expiry date', 'exp date', 'min shelf life', 'minimum shelf life', 'remaining shelf life', 'rsl', 'min shelf life upon arrival', 'shelf life on arrival', 'shelf life days', 'تاريخ الانتهاء', 'الصلاحية', 'مدة الصلاحية'] },
    { key: 'casesPerPallet', header: 'Cases per Pallet', required: 'yes', description: 'Cases on one pallet.', example: '84', aliases: ['cases per pallet', 'cartons per pallet', 'cartons pallet', 'cases pallet', 'box plt', 'boxes plt', 'box per plt', 'boxes per plt', 'boxes per pallet', 'box per pallet', 'boxes in pallet', 'carton per pal', 'cartons per pal', 'crt per pal', 'case per pal', 'cs per pallet', 'case per pallet', 'casesperpallet', 'كراتين في البالتة', 'عدد الكراتين في البالتة'] },
    { key: 'palletsPerShipment', header: 'Pallets per Truck', required: 'no', description: 'Needed to offer full-truck prices.', example: '33', aliases: ['pallets per truck', 'pallets per shipment', 'pallets per container', 'pallets truck', 'palletspershipment', 'بالتات في الشاحنة', 'عدد البالتات في الشاحنة'] },
    { key: 'leadTime', header: 'Lead Time (days)', required: 'no', description: 'Days you need to prepare the order. 0 = ready to dispatch.', example: '0', aliases: ['lead time', 'lead time days', 'preparation time', 'مدة التجهيز'] },
    { key: 'imageUrl', header: 'Image URL', required: 'no', description: 'Optional https link(s) to product photos, separated by |. Without a photo the product is saved as a draft; you can then find one by barcode or upload it.', example: '', aliases: ['image url', 'image', 'images', 'image link', 'photo', 'picture', 'photo url', 'product image', 'product photo', 'صورة', 'رابط الصورة', 'الصورة'] },
    { key: 'variants', header: 'Varieties', required: 'no', description: 'Optional. Attribute: value | value; next attribute…', example: '', aliases: ['varieties', 'variants', 'variety', 'options', 'الأنواع', 'الخيارات'] },
];

/** Recognised supplier-file columns that are not product fields (see AuxKey). */
export const AUX_FIELDS: ImportField[] = [
    { key: 'eanPair', header: 'Barcode: piece / case', required: 'no', stored: false, description: 'One cell with the piece barcode and the case barcode, e.g. "4017100370007 / 4017100037009". The piece barcode becomes the product barcode; the case barcode is kept in the import record.', example: '4017100370007 / 4017100037009', aliases: ['ean piece ean case', 'ean pce ean case', 'ean unit ean case', 'unit ean case ean', 'piece ean case ean', 'ean piece case', 'ean cu ean tu'] },
    { key: 'displayPrice', header: 'Price per Display', required: 'no', stored: false, description: 'Price for one display (inner pack). Converted to a case price with Displays per Case.', example: '', aliases: ['price per display', 'display price', 'price display'] },
    { key: 'supplierSku', header: 'Your article code', required: 'no', stored: false, description: 'Your own article / SKU code. Kept in the import record.', example: '', aliases: ['article code', 'article no', 'article number', 'art no', 'art nr', 'item code', 'item no', 'item number', 'sku', 'product code', 'material code', 'material no', 'supplier code', 'ref', 'reference'] },
    { key: 'caseEan', header: 'Case barcode', required: 'no', stored: false, description: 'Barcode printed on the case. Checked and kept in the import record.', example: '', aliases: ['case ean', 'ean case', 'box ean', 'ean box', 'carton ean', 'ean carton', 'outer ean', 'ean outer', 'ean ctn', 'ctn ean', 'tu ean', 'ean tu', 'dun14', 'dun 14', 'itf14', 'itf 14', 'case barcode'] },
    { key: 'displayEan', header: 'Display barcode', required: 'no', stored: false, description: 'Barcode of the display / inner pack. Kept in the import record.', example: '', aliases: ['display ean', 'ean display', 'inner ean', 'ean inner', 'display barcode'] },
    { key: 'unitsPerDisplay', header: 'Pieces per Display', required: 'no', stored: false, description: 'Used to cross-check Pieces per Case.', example: '', aliases: ['unit per display', 'units per display', 'pieces per display', 'pcs per display'] },
    { key: 'displaysPerCase', header: 'Displays per Case', required: 'no', stored: false, description: 'Used to cross-check Pieces per Case and to convert a display price.', example: '', aliases: ['display per case', 'displays per case', 'displays per carton', 'display per carton'] },
    { key: 'casesPerLayer', header: 'Cases per Layer', required: 'no', stored: false, description: 'Used to convert an MOQ of "full layers" and to cross-check Cases per Pallet.', example: '', aliases: ['cases per layer', 'case per layer', 'cartons per layer', 'cs per layer', 'ctn per layer'] },
    { key: 'layersPerPallet', header: 'Layers per Pallet', required: 'no', stored: false, description: 'Used to cross-check Cases per Pallet.', example: '', aliases: ['layers per pallet', 'layer per pallet', 'rows per pallet', 'n of rows per pallet'] },
    { key: 'totalShelfLife', header: 'Total shelf life', required: 'no', stored: false, description: 'Total days from production to best-before. Kept in the import record.', example: '', aliases: ['total number of days to bbd', 'bbd from production', 'days to bbd', 'total days to bbd', 'total shelf life', 'shelf life total', 'total shelf life days'] },
    { key: 'manufacturer', header: 'Manufacturer', required: 'no', stored: false, description: 'The company that makes the product. Kept in the import record. If it is also the brand printed on the pack, map it to Brand instead.', example: '', aliases: ['manufacturer', 'producer', 'maker', 'manufacturer name'] },
    { key: 'unitsPerPallet', header: 'Pieces per Pallet', required: 'no', stored: false, description: 'Used to cross-check Pieces per Case × Cases per Pallet.', example: '', aliases: ['pieces per pallet', 'pieces pallet', 'pcs per pallet', 'pcs pallet', 'pcs plt', 'pcs per plt', 'units per pallet', 'units pallet', 'bottles per pallet', 'n of bottle per pallet', 'n of bottles per pallet'] },
    { key: 'caseWeight', header: 'Case weight', required: 'no', stored: false, description: 'Weight of a full case (not of one piece). Kept in the import record.', example: '', aliases: ['case weight', 'carton weight', 'box weight', 'box weight gross', 'gross weight', 'gross weight per case', 'net weight per case', 'net weight per cse', 'net weight per cse kg', 'gross weight per cse', 'gross weight per cse kg', 'case weight kg', 'weight per case', 'weight per carton'] },
    { key: 'eanCheck', header: 'Barcode (second column)', required: 'no', stored: false, description: 'A second column with the same piece barcode. Compared with the Barcode column row by row; rows where they differ are blocked until you fix the file.', example: '', aliases: [] },
    { key: 'rowNumber', header: 'Row number', required: 'no', stored: false, description: 'A running number in your file. Not imported.', example: '', aliases: ['n s', 's n', 'no', 'nr', 'pos', 'line no', 's no', 'sr no', 'sl no', 'row'] },
    { key: 'orderQty', header: 'Order quantity', required: 'no', stored: false, description: 'A column for buyers to fill in. Not imported.', example: '', aliases: ['place your order', 'your order', 'order qty', 'order quantity', 'qty ordered'] },
];

/** Every field a column can be mapped to: product fields first, then recognised extras. */
export const ALL_FIELDS: ImportField[] = [...IMPORT_FIELDS, ...AUX_FIELDS];

/** Header names that could mean two different things; the supplier must choose. */
export const AMBIGUOUS: Record<string, FieldKey[]> = {
    'price': ['price', 'piecePrice'], 'السعر': ['price', 'piecePrice'], 'cost': ['price', 'piecePrice'], 'wholesale price': ['price', 'piecePrice'], 'supplier price': ['price', 'piecePrice'], 'net price': ['price', 'piecePrice'],
    'quantity': ['stock', 'stockPieces'], 'quantity pieces': ['stockPieces', 'moq'], 'quantity pcs': ['stockPieces', 'moq'], 'quantity cartons': ['stock', 'moq'], 'quantity crt': ['stock', 'moq'], 'quantity cases': ['stock', 'moq'], 'qty': ['stock', 'stockPieces'], 'الكمية': ['stock', 'stockPieces'], 'الكميه': ['stock', 'stockPieces'],
};

export function normaliseHeader(h: unknown): string {
    return String(h ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[ً-ْـ]/g, '')          // Arabic diacritics + tatweel
        .replace(/[إأآ]/g, 'ا')
        .replace(/[_\-./\\()\[\]{}:#*|,;'"`’]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export const ALIAS_INDEX = (() => {
    const m = new Map<string, FieldKey>();
    for (const f of ALL_FIELDS) for (const a of [f.header, f.key, ...f.aliases]) m.set(normaliseHeader(a), f.key);
    return m;
})();

export interface HeaderMatch {
    index: number;
    header: string;
    field: FieldKey | null;
    status: 'matched' | 'ambiguous' | 'duplicate' | 'unmatched' | 'empty';
    candidates?: FieldKey[];
    note?: string;
}

/** Map each header to a field; never guesses between two meanings. */
export function matchHeaders(headers: string[]): HeaderMatch[] {
    const used = new Map<FieldKey, number>();
    return headers.map((header, index) => {
        const n = normaliseHeader(header);
        if (!n) return { index, header, field: null, status: 'empty' };
        if (AMBIGUOUS[n]) return { index, header, field: null, status: 'ambiguous', candidates: AMBIGUOUS[n], note: `“${header}” could mean ${AMBIGUOUS[n].map(labelOf).join(' or ')} — choose one.` };
        const field = ALIAS_INDEX.get(n) ?? null;
        if (!field) return { index, header, field: null, status: 'unmatched', note: 'Not recognised — map it to a field or leave it out.' };
        if (used.has(field)) return { index, header, field: null, status: 'duplicate', candidates: [field], note: `Also matches ${labelOf(field)}, already taken by “${headers[used.get(field)!]}”.` };
        used.set(field, index);
        return { index, header, field, status: 'matched' };
    });
}

export const labelOf = (k: FieldKey) => ALL_FIELDS.find((f) => f.key === k)?.header ?? k;

// ─── File parsing ──────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Cell → text without losing precision or leading zeros (raw value, not display format). */
export function cellText(c: XLSX.CellObject | undefined): string {
    if (!c || c.v === undefined || c.v === null) return '';
    if (c.t === 'n') {
        const v = c.v as number;
        if (Number.isInteger(v)) return Math.abs(v) >= 1e15 ? BigInt(v).toString() : v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 });
        // Drop binary floating-point noise (1.0573499999999998 → 1.05735); 15 significant digits is all a cell holds.
        return String(Number(v.toPrecision(15)));
    }
    if (c.t === 'b') return c.v ? 'TRUE' : 'FALSE';
    if (c.t === 'd') return (c.v as Date).toISOString().slice(0, 10);
    return String(c.v).trim();
}

export interface ParsedSheet { sheetName: string; headerRow: number; headers: string[]; rows: string[][]; truncated: boolean }

export function parseSpreadsheet(buf: Buffer, filename: string): ParsedSheet {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) throw new Error('Upload an .xlsx or .csv file. In Google Sheets use File → Download → .xlsx or .csv.');
    if (buf.length > MAX_IMPORT_BYTES) throw new Error('File is larger than 5 MB. Split it into smaller files.');
    // CSV: read every value as text so codes and decimals aren't reinterpreted.
    const wb = XLSX.read(buf, ext === 'csv' ? { type: 'buffer', raw: true, codepage: 65001 } : { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames.find((n) => !/instruction|guide|readme|help|تعليمات/i.test(n)) || wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!ws || !ws['!ref']) throw new Error('The file has no data.');
    const range = XLSX.utils.decode_range(ws['!ref']);
    const grid: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
        const row: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) row.push(cellText(ws[XLSX.utils.encode_cell({ r, c })]));
        grid.push(row);
    }
    // Header = first row (of the first 10) with at least 3 filled cells.
    const headerRow = grid.slice(0, 10).findIndex((r) => r.filter(Boolean).length >= 3);
    if (headerRow < 0) throw new Error('Couldn’t find a header row (a row with at least 3 column names) in the first 10 rows.');
    const headers = grid[headerRow].map((h) => h.trim());
    const body = grid.slice(headerRow + 1).filter((r) => r.some((v) => v !== ''));
    // Skip the template's "required / optional" helper row if present.
    const rows = body.filter((r) => !r.every((v) => v === '' || /^(required|optional|one of)/i.test(v)));
    if (!rows.length) throw new Error('The file has headers but no product rows.');
    return { sheetName, headerRow: headerRow + 1, headers, rows: rows.slice(0, MAX_IMPORT_ROWS), truncated: rows.length > MAX_IMPORT_ROWS };
}

// ─── Row → product ─────────────────────────────────────────────────────

export interface ImportOptions { currency: string; moqUnit: string; unit?: string }
export type Mapping = Record<string, FieldKey | null | ''>; // column index → field

/** Extra context from the smart importer. The classic template path passes none. */
export interface RowContext {
    /** Original header text of the column each field came from ("Unit Weight (G)"). */
    headers?: Partial<Record<FieldKey, string>>;
    /** Decimal separator per field, when the column's number format is known. */
    decimal?: Partial<Record<FieldKey, '.' | ','>>;
    /** Fields whose value didn't come from a column, with where it came from. */
    derived?: Partial<Record<FieldKey, string>>;
}

export interface BuiltRow {
    row: number;                      // spreadsheet row number (1-based, as the supplier sees it)
    values: Partial<Record<FieldKey, string>>;
    product: any;                     // normalised fields ready for ProductsService.create
    errors: Missing[];                // block the row
    missing: Missing[];               // incomplete → saved as DRAFT
    warnings: string[];
    /** Recognised extras (case barcode, article code…): checked, kept in the import record, not stored. */
    aux: Partial<Record<AuxKey, string>>;
    /** How a value was read when it isn't a plain copy ("“full layers” = 8 cases", "from the product name"). */
    notes: Partial<Record<FieldKey, string>>;
}

/** Cell texts suppliers use for "no value". Read as empty, never as data. */
const EMPTY_TOKENS = new Set(['-', '--', '–', '—', 'n/a', 'na', 'n.a.', 'n.a', '/', '?', 'none', 'null', 'tbd', 'nil']);
export const isEmptyToken = (v: unknown) => EMPTY_TOKENS.has(String(v ?? '').trim().toLowerCase());

const num = (s: string | undefined, decimal?: '.' | ',') => {
    if (s === undefined || s === null || String(s).trim() === '') return undefined;
    let t = String(s).replace(/[€$£\s]/g, '').replace(/[^\d.,-]/g, '');
    if (decimal === ',') t = t.replace(/\./g, '').replace(',', '.');
    else if (decimal === '.') t = t.replace(/,/g, '');
    else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');                                   // 6,72
    else t = t.replace(/,/g, '');                                                              // 1,234.56
    const n = Number(t);
    return Number.isFinite(n) && t !== '' ? n : NaN;
};

/** Unit written in a header: "Unit Weight (G)", "Weight in ml", "Net weight [kg]". */
export function headerUnit(header?: string): string | null {
    const h = String(header || '').toLowerCase();
    const m = h.match(/[([]\s*(mg|kg|grams?|grs?|gr|g|ml|cl|ltr|l)\s*[)\]]/) || h.match(/\b(?:in|en)\s+(mg|kg|grams?|grs?|gr|g|ml|cl|ltr|l)\b/);
    return m ? m[1] : null;
}

/** Pack weight written in a product name: "Nutella 450g", "KitKat 10x41,5g", "Red Band 100 pcs. 1kg". */
export function weightFromName(name?: string): string | null {
    const re = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|grs?|gr|g|ml|cl|ltr|l)(?![a-z])/gi;
    let last: RegExpExecArray | null = null, m: RegExpExecArray | null;
    while ((m = re.exec(String(name || '')))) last = m;
    if (!last) return null;
    return normaliseWeight(`${last[1] ? `${last[1]} x ` : ''}${last[2]} ${last[3]}`);
}

/** "5 x 29 g" → { each: 29, total: 145, dim: 'mass' } in g or ml. */
export function weightAmounts(w?: string | null): { each: number; total: number; dim: 'mass' | 'volume' } | null {
    const m = String(w || '').match(/^(?:(\d+) x )?(\d+(?:\.\d+)?) (mg|kg|g|ml|cl|L|oz|lb)$/);
    if (!m) return null;
    const f: Record<string, [number, 'mass' | 'volume']> = { mg: [0.001, 'mass'], g: [1, 'mass'], kg: [1000, 'mass'], oz: [28.35, 'mass'], lb: [453.6, 'mass'], ml: [1, 'volume'], cl: [10, 'volume'], L: [1000, 'volume'] };
    const [k, dim] = f[m[3]];
    const each = Number(m[2]) * k;
    return { each, total: each * (Number(m[1]) || 1), dim };
}

/** Text MOQs from real offers: "full pallets", "1 pal", "full layers", "10 cases". */
export function parseMoq(raw: string, defaultUnit: string, casesPerLayer?: number): { moq?: number; unit?: string; note?: string; problem?: string } {
    const t = String(raw || '').trim().toLowerCase().replace(/\.$/, '');
    if (!t) return {};
    if (/^\d+(\.0+)?$/.test(t)) return { moq: parseInt(t, 10), unit: defaultUnit };
    const m = t.match(/^(\d+)?\s*(?:x\s*)?(full\s+)?(pieces?|pcs?|units?|cases?|cartons?|ctns?|cs|pallets?|pal|plts?|trucks?|truckloads?|ftl|layers?)$/);
    if (!m) return { problem: `MOQ “${raw.trim()}” isn’t understood — use a number (e.g. 10) or e.g. “1 pallet”.` };
    const n = m[1] ? parseInt(m[1], 10) : 1;
    const w = m[3];
    if (/^layers?$/.test(w)) {
        if (!casesPerLayer || !Number.isInteger(casesPerLayer) || casesPerLayer <= 0) return { problem: `MOQ “${raw.trim()}” is in layers; Atlantis needs Cases per Layer to convert it to cases.` };
        return { moq: n * casesPerLayer, unit: 'CASE', note: `“${raw.trim()}” = ${n} layer${n === 1 ? '' : 's'} × ${casesPerLayer} cases` };
    }
    const unit = /^(pieces?|pcs?|units?)$/.test(w) ? 'PIECE' : /^(cases?|cartons?|ctns?|cs)$/.test(w) ? 'CASE' : /^(pallets?|pal|plts?)$/.test(w) ? 'PALLET' : 'TRUCK';
    return { moq: n, unit, note: m[1] ? undefined : `“${raw.trim()}” read as ${n} ${unit.toLowerCase()}` };
}

/** Barcode read from a cell; refuses codes the spreadsheet shortened ("4.0217E+12"). */
function readBarcode(raw?: string): { code: string; problem?: string } {
    const s = String(raw ?? '').trim();
    const sci = s.match(/^(\d+)(?:\.(\d+))?e\+(\d+)$/i);
    if (sci) {
        const significant = (sci[1] + (sci[2] || '')).replace(/^0+/, '').length;
        const length = sci[1].length + Number(sci[3]);
        if (significant < length) return { code: '', problem: `The spreadsheet shortened this barcode to “${s}” — the full code is lost. Type it again as text.` };
    }
    return { code: normaliseBarcode(s) };
}

/** Classic path: column index → field mapping (template uploads, tests). */
export function buildRow(cells: string[], rowNumber: number, mapping: Mapping, opts: ImportOptions): BuiltRow {
    const values: Partial<Record<FieldKey, string>> = {};
    for (const [idx, field] of Object.entries(mapping)) if (field) values[field] = (cells[Number(idx)] ?? '').toString().trim();
    return buildFromValues(values, rowNumber, opts);
}

/** Validate and normalise one row of field values. Nothing is guessed: unclear values are errors, missing ones make a draft. */
export function buildFromValues(input: Partial<Record<FieldKey, string>>, rowNumber: number, opts: ImportOptions, ctx: RowContext = {}): BuiltRow {
    const values: Partial<Record<FieldKey, string>> = {};
    const errors: Missing[] = [];
    const warnings: string[] = [];
    const notes: Partial<Record<FieldKey, string>> = { ...(ctx.derived || {}) };
    const err = (field: string, label: string, reason: string) => errors.push({ field, label, reason });
    const emptied: string[] = [];
    for (const [k, v] of Object.entries(input)) {
        const t = String(v ?? '').replace(/\s+/g, ' ').trim();
        if (isEmptyToken(t)) { if (t && (IMPORT_FIELDS.some((f) => f.key === k) || k === 'eanPair')) emptied.push(`${labelOf(k as FieldKey)} “${t}”`); values[k as FieldKey] = ''; }
        else values[k as FieldKey] = t;
    }
    if (emptied.length) warnings.push(`Read as empty: ${emptied.join(', ')}.`);
    const n = (k: FieldKey) => num(values[k], ctx.decimal?.[k]);

    const currency = (values.currency || opts.currency || 'EUR').toUpperCase().replace('€', 'EUR').replace('£', 'GBP').replace('$', 'USD');
    const rate = TO_EUR[currency];
    if (!rate) err('currency', 'Currency', `Currency “${currency}” isn’t supported. Use one of ${Object.keys(TO_EUR).join(', ')}.`);

    // Barcodes: a combined "piece / case" cell is split; the case code is kept, not stored.
    const aux: Partial<Record<AuxKey, string>> = {};
    let eanRaw = values.ean;
    if (values.eanPair) {
        const parts = values.eanPair.split(/\s*[\/|;,]\s*|\s+/).filter(Boolean);
        eanRaw = parts[0] || '';
        if (parts[1]) aux.caseEan = parts[1];
        if (parts.length > 2) warnings.push(`Barcode cell “${values.eanPair}” has more than two codes; the first is used as the product barcode.`);
        notes.ean = `First code of “${values.eanPair}”`;
    }
    for (const k of ['supplierSku', 'caseEan', 'displayEan', 'unitsPerDisplay', 'displaysPerCase', 'casesPerLayer', 'layersPerPallet', 'totalShelfLife', 'manufacturer', 'unitsPerPallet', 'caseWeight', 'eanCheck'] as AuxKey[]) if (values[k]) aux[k] = values[k];
    const bc = readBarcode(eanRaw);
    if (bc.problem) err('ean', 'Barcode (EAN/GTIN)', bc.problem);
    const ean = bc.code;
    // An 11-digit code is usually a UPC whose leading 0 was dropped by the spreadsheet. Say so; don't fix it silently.
    if (/^\d{11}$/.test(ean) && !barcodeProblem(`0${ean}`)) {
        err('ean', 'Barcode (EAN/GTIN)', `Barcode ${ean} has 11 digits — probably a UPC whose leading 0 was dropped by the spreadsheet. 0${ean} has a valid check digit; correct it in your file (format the column as Text) and upload again.`);
    }
    // A second barcode column must agree with the first; which one is right can't be decided here.
    if (values.eanCheck && ean) {
        const other = normaliseBarcode(values.eanCheck);
        if (other && other !== ean) err('ean', 'Barcode (EAN/GTIN)', `The two barcode columns disagree on this row (${ean} and ${other}). Correct the file so both show the same piece barcode.`);
    }
    // GTIN-14 with an indicator digit 1–8 identifies a case or outer pack, not the piece buyers scan.
    if (/^[1-8]\d{13}$/.test(ean) && !barcodeProblem(ean)) {
        warnings.push(`Barcode ${ean} has 14 digits and starts with ${ean[0]} — that usually identifies the case, not the piece. Use the piece barcode (EAN-13/UPC) if you have it.`);
    }
    if (aux.caseEan) {
        const cp = barcodeProblem(normaliseBarcode(aux.caseEan));
        if (cp) warnings.push(`Case barcode ${aux.caseEan}: ${cp.charAt(0).toLowerCase()}${cp.slice(1)} (kept in the import record only).`);
    }

    // A price cell that names its currency must agree with the import's currency ("€ 1.19" in a RON import).
    const CUR_SIGNS: [RegExp, string][] = [[/€|\beur(o|os)?\b/i, 'EUR'], [/\$|\busd\b/i, 'USD'], [/£|\bgbp\b/i, 'GBP'], [/\bron\b|\blei\b/i, 'RON']];
    for (const f of ['price', 'piecePrice', 'displayPrice'] as FieldKey[]) {
        const raw = values[f];
        if (!raw || values.currency) continue;
        const named = CUR_SIGNS.find(([re]) => re.test(raw))?.[1];
        if (named && rate && named !== currency) err(f, labelOf(f), `The price “${raw}” is in ${named}, but this import is set to ${currency}. Choose ${named} as the currency of the file (or fix the cell).`);
    }

    // Price: per case, per piece or per display — always stored per case.
    const upc = n('unitsPerCase');
    const casePrice = n('price');
    const piecePrice = n('piecePrice');
    const displayPrice = n('displayPrice');
    const dpc = n('displaysPerCase');
    let priceCase: number | undefined;
    if (casePrice !== undefined && piecePrice !== undefined && !Number.isNaN(casePrice) && !Number.isNaN(piecePrice) && upc && Math.abs(piecePrice * upc - casePrice) > 0.011 * Math.max(1, casePrice)) {
        err('price', 'Price', `Price per Case (${casePrice}) doesn’t equal Price per Piece × Pieces per Case (${piecePrice} × ${upc}). Fix one of them.`);
    } else if (casePrice !== undefined) {
        if (Number.isNaN(casePrice) || casePrice <= 0) err('price', 'Price per Case', `“${values.price}” isn’t a valid price.`); else priceCase = casePrice;
    } else if (piecePrice !== undefined) {
        if (Number.isNaN(piecePrice) || piecePrice <= 0) err('piecePrice', 'Price per Piece', `“${values.piecePrice}” isn’t a valid price.`);
        else if (!upc || Number.isNaN(upc)) err('piecePrice', 'Price per Piece', 'A price per piece needs Pieces per Case to work out the case price.');
        else { priceCase = piecePrice * upc; notes.price = `${piecePrice} per piece × ${upc} pieces`; }
    } else if (displayPrice !== undefined) {
        if (Number.isNaN(displayPrice) || displayPrice <= 0) err('displayPrice', 'Price per Display', `“${values.displayPrice}” isn’t a valid price.`);
        else if (!dpc || Number.isNaN(dpc) || !Number.isInteger(dpc)) err('displayPrice', 'Price per Display', 'A price per display needs Displays per Case to work out the case price.');
        else { priceCase = displayPrice * dpc; notes.price = `${displayPrice} per display × ${dpc} displays`; }
    }

    let stock: number | undefined;
    const sc = n('stock'), sp = n('stockPieces'), spl = n('stockPallets');
    if (sc !== undefined) {
        if (Number.isNaN(sc) || sc < 0 || !Number.isInteger(sc)) err('stock', 'Stock (cases)', `“${values.stock}” must be a whole number of cases.`); else stock = sc;
    } else if (sp !== undefined) {
        if (Number.isNaN(sp) || sp < 0) err('stockPieces', 'Stock (pieces)', `“${values.stockPieces}” isn’t a valid quantity.`);
        else if (!upc || Number.isNaN(upc)) err('stockPieces', 'Stock (pieces)', 'Stock in pieces needs Pieces per Case to convert to cases.');
        else { stock = Math.floor(sp / upc); if (sp % upc) warnings.push(`${sp} pieces = ${stock} full cases; ${sp % upc} loose pieces not counted.`); }
    } else if (spl !== undefined) {
        const cppS = n('casesPerPallet');
        if (Number.isNaN(spl) || spl < 0 || !Number.isInteger(spl)) err('stockPallets', 'Stock (pallets)', `“${values.stockPallets}” must be a whole number of pallets.`);
        else if (!cppS || Number.isNaN(cppS)) err('stockPallets', 'Stock (pallets)', 'Stock in pallets needs Cases per Pallet to convert to cases.');
        else { stock = spl * cppS; notes.stock = `${spl} pallet${spl === 1 ? '' : 's'} × ${cppS} cases`; }
    }

    // MOQ: a number in the MOQ unit, or text such as "full pallets" / "full layers".
    const defaultMoqUnit = (values.moqUnit || opts.moqUnit || 'CASE').toUpperCase().replace(/S$/, '').replace('CARTON', 'CASE').replace('PCS', 'PIECE').replace('UNIT', 'PIECE');
    let moqUnitRaw = defaultMoqUnit;
    let moq: number | undefined;
    if (values.moq) {
        const pm = parseMoq(values.moq, defaultMoqUnit, n('casesPerLayer'));
        if (pm.problem) warnings.push(`${pm.problem} Saved as a draft until you set it.`);
        else { moq = pm.moq; if (pm.unit) moqUnitRaw = pm.unit; if (pm.note) notes.moq = pm.note; }
    }
    if (!MOQ_UNITS.includes(moqUnitRaw as any)) err('moqUnit', 'MOQ Unit', `“${values.moqUnit}” isn’t a valid MOQ unit (piece, case, pallet, truck).`);

    const u0 = String(values.unit || opts.unit || 'piece').trim().toLowerCase();
    const unitType = (UNIT_TYPES as readonly string[]).includes(u0) ? u0 : (UNIT_TYPES.find((t) => u0 === `${t}s` || u0 === `${t}es`) ?? u0);
    if (!(UNIT_TYPES as readonly string[]).includes(unitType)) err('unit', 'Unit Type', `“${values.unit}” isn’t a supported unit type (${UNIT_TYPES.join(', ')}).`);
    const ex = (k: FieldKey) => IMPORT_FIELDS.find((f) => f.key === k)!.example;
    if ((ean === ex('ean') && (values.name || '') === ex('name')) || (EXAMPLE_ROWS.some((r) => r.ean === ean) && /^example /i.test(values.name || ''))) err('name', 'Example row', 'This is the template’s example row — delete it from your file.');

    // Weight: as written, or a bare number with the unit from the header ("Unit Weight (G)").
    let weight = '';
    if (values.weight) {
        const direct = normaliseWeight(values.weight);
        const hu = headerUnit(ctx.headers?.weight);
        const withUnit = !direct && hu && /^(\d+\s*[x×]\s*)?\d+([.,]\d+)?$/i.test(values.weight) ? normaliseWeight(`${values.weight} ${hu}`) : null;
        weight = direct || withUnit || values.weight;
        if (withUnit) notes.weight = `“${values.weight}” + unit from the column header`;
    }
    const nameWeight = weightFromName(values.name);
    if (weight && nameWeight) {
        const a = weightAmounts(normaliseWeight(weight)), b = weightAmounts(nameWeight);
        const close = (x: number, y: number) => Math.abs(x - y) <= 0.03 * Math.max(x, y);
        if (a && b && a.dim === b.dim && !close(a.total, b.total) && !close(a.each, b.each) && !close(a.total, b.each) && !close(a.each, b.total)) {
            warnings.push(`Weight ${normaliseWeight(weight)} doesn’t match the name (“${nameWeight}”). Check which is right.`);
        }
    }

    const shelfRaw = values.shelfLife || '';
    let shelfLife: string | null = shelfRaw || null;
    if (/^\d+$/.test(shelfRaw)) {
        const h = String(ctx.headers?.shelfLife || '').toLowerCase();
        const unitWord = /month/.test(h) ? 'months' : /week/.test(h) ? 'weeks' : 'days';
        shelfLife = `${/\bmin/.test(h) ? 'min. ' : ''}${shelfRaw} ${unitWord}`;
        if (!/day|month|week/.test(h)) notes.shelfLife = `“${shelfRaw}” read as ${unitWord}`;
    }

    // Cross-checks between packaging columns (never corrected, only reported).
    const upd = n('unitsPerDisplay');
    if (upc && upd && dpc && !Number.isNaN(upc) && !Number.isNaN(upd) && !Number.isNaN(dpc) && upd * dpc !== upc) {
        warnings.push(`Pieces per case (${upc}) ≠ pieces per display × displays per case (${upd} × ${dpc} = ${upd * dpc}). Check which is right.`);
    }
    const cpp = n('casesPerPallet'), cpl = n('casesPerLayer'), lpp = n('layersPerPallet');
    if (cpp && cpl && lpp && !Number.isNaN(cpp) && cpl * lpp !== cpp) {
        warnings.push(`Cases per pallet (${cpp}) ≠ cases per layer × layers (${cpl} × ${lpp} = ${cpl * lpp}). Check which is right.`);
    }

    // Pieces per pallet, when the file gives it: "2,376" can only be a whole number of pieces.
    if (values.unitsPerPallet && upc && cpp && !Number.isNaN(upc) && !Number.isNaN(cpp)) {
        const digits = values.unitsPerPallet.replace(/[\s.,']/g, '');
        const raw = /^\d+$/.test(digits) ? Number(digits) : NaN;
        if (Number.isFinite(raw) && raw !== upc * cpp) warnings.push(`Pieces per pallet in the file (${values.unitsPerPallet}) ≠ pieces per case × cases per pallet (${upc} × ${cpp} = ${upc * cpp}). Check which is right.`);
    }
    const images = (values.imageUrl || '').split(/[|\n]+/).map((s) => s.trim()).filter(Boolean);
    const badImg = images.filter((u) => !/^https:\/\/[^\s]+$/i.test(u));
    if (badImg.length) err('imageUrl', 'Image URL', `Image links must start with https:// (${badImg[0].slice(0, 40)}).`);

    const variants = parseVariants(values.variants);
    if (values.variants && !variants) err('variants', 'Varieties', 'Write varieties as “Size: 330 ml | 500 ml; Flavor: Original | Zero”.');

    // Country of origin: a recognised country, stored as its canonical English name. Never guessed:
    // "Bucharest, Romania" or "EU" is left empty with a note, so the supplier chooses (see country-canon.ts).
    let origin = values.origin || '';
    if (origin) {
        const o = resolveOrigin(origin);
        if (o.kind === 'country') { if (o.changed) notes.origin = `${notes.origin ? `${notes.origin}; ` : ''}“${origin}” read as ${o.name}`; origin = o.name; }
        else if (o.kind !== 'empty') { warnings.push(`${originProblem(origin, o)} Country of origin left empty until you choose it.`); origin = ''; }
    }

    const product: any = {
        name: values.name || '',
        brand: values.brand || '',
        category: values.category || '',
        ean: ean || '',
        description: values.description || '',
        origin,
        exwLocation: values.exwLocation || '',
        weight: weight ? (normaliseWeight(weight) || weight) : '',
        shelfLife,
        price: priceCase !== undefined && rate ? Math.round(priceCase * rate * 10000) / 10000 : undefined,
        // Keep what the supplier typed, in their currency (never reinterpreted later).
        supplierCurrency: priceCase !== undefined && rate ? currency : undefined,
        supplierPrice: priceCase !== undefined && rate ? Math.round(priceCase * 10000) / 10000 : undefined,
        stock,
        unit: unitType,
        unitsPerCase: upc !== undefined && !Number.isNaN(upc) ? upc : undefined,
        moq: moq !== undefined ? moq : undefined,
        moqUnit: moqUnitRaw,
        casesPerPallet: cpp,
        palletsPerShipment: n('palletsPerShipment'),
        leadTime: n('leadTime'),
        images: badImg.length ? [] : images,
        variants: variants || undefined,
    };
    for (const k of ['unitsPerCase', 'casesPerPallet', 'palletsPerShipment', 'leadTime']) {
        if (Number.isNaN(product[k])) { err(k, labelOf(k as FieldKey), `“${(values as any)[k]}” isn’t a number.`); product[k] = undefined; }
    }
    for (const inv of invalidValues(product)) if (!errors.some((e) => e.field === inv.field || (inv.field === 'price' && ['piecePrice', 'displayPrice'].includes(e.field)))) errors.push(inv);
    if (currency !== 'EUR' && rate && priceCase !== undefined) warnings.push(`Price converted from ${currency} to EUR at ${rate}.`);

    // Missing required data doesn't block the row — it is imported as a DRAFT
    // and listed so the supplier can finish it. Invalid data blocks the row.
    const missing = missingForPublish({ ...product, basePrice: product.price }).filter((m) => !errors.some((e) => e.field === m.field));
    return { row: rowNumber, values, product, errors, missing, warnings, aux, notes };
}

export function parseVariants(raw?: string): { name: string; values: string[] }[] | null {
    if (!raw || !raw.trim()) return null;
    const groups = raw.split(';').map((g) => g.trim()).filter(Boolean).map((g) => {
        const i = g.indexOf(':');
        if (i < 1) return null;
        const name = g.slice(0, i).trim();
        const values = g.slice(i + 1).split('|').map((v) => v.trim()).filter(Boolean);
        return name && values.length ? { name, values } : null;
    });
    return groups.every(Boolean) && groups.length ? (groups as any) : null;
}

// ─── Template ──────────────────────────────────────────────────────────

/** GS1 prefix 200–299 is for in-store use only, so these example barcodes can never be a real product. */
const exampleEan = (body12: string) => {
    const d = body12.split('').map(Number);
    const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
    return body12 + ((10 - (sum % 10)) % 10);
};

/** Illustrative rows for the completed example: one per common way suppliers state price, stock and MOQ. */
const EXAMPLE_ROWS: Partial<Record<FieldKey, string>>[] = [
    { name: 'Example Hazelnut Spread 400 g', brand: 'Example Brand', category: 'Pantry & Grains', ean: exampleEan('200000000001'), price: '36.00', currency: 'EUR', stock: '120', unitsPerCase: '15', moq: '10', moqUnit: 'case', origin: 'Italy', exwLocation: 'Bucharest, Romania', weight: '400 g', unit: 'jar', description: 'Example row — replace with your product.', shelfLife: '2027-03-31', casesPerPallet: '84', palletsPerShipment: '33', leadTime: '0' },
    { name: 'Example Cola 24 x 330 ml', brand: 'Example Brand', category: 'Soft Drinks', ean: exampleEan('200000000002'), piecePrice: '0.35', currency: 'EUR', stockPieces: '23760', unitsPerCase: '24', moq: '1', moqUnit: 'pallet', origin: 'Poland', exwLocation: 'Warsaw, Poland', weight: '330 ml', unit: 'can', shelfLife: '9 months', casesPerPallet: '99', palletsPerShipment: '26', leadTime: '3' },
    { name: 'Example Chocolate Bar 100 g', brand: 'Example Brand', category: 'Chocolates & Sweets', ean: exampleEan('200000000003'), price: '21.60', currency: 'EUR', stockPallets: '4', unitsPerCase: '24', moq: '5', moqUnit: 'case', origin: 'Germany', exwLocation: 'Hamburg, Germany', weight: '100 g', unit: 'bar', shelfLife: 'min. 180 days', casesPerPallet: '120', leadTime: '0' },
];

export function buildTemplate(format: 'xlsx' | 'csv', variant: 'blank' | 'example' = 'blank'): Buffer {
    const fields = IMPORT_FIELDS;
    const headers = fields.map((f) => f.header);
    const need = fields.map((f) => (f.required === 'yes' ? 'Required' : f.required === 'one-of' ? 'One of (see guide)' : 'Optional'));
    const rows = variant === 'example' ? EXAMPLE_ROWS.map((r) => fields.map((f) => r[f.key] ?? '')) : [];
    if (format === 'csv') {
        const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        return Buffer.from('﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n', 'utf8');
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, need, ...rows]);
    // Keep barcodes as text so leading zeros survive.
    const eanCol = headers.indexOf('EAN');
    for (let r = 1; r <= 200; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: eanCol });
        if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; } else ws[ref] = { t: 's', v: '', z: '@' } as any;
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 200, c: headers.length - 1 } });
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    const formats: string[][] = [
        ['EAN', 'The barcode on one piece (the unit buyers scan): EAN-13, EAN-8, UPC-A (12 digits) or GTIN-14. Digits only, with a valid check digit. Format the column as Text so Excel keeps leading zeros and doesn’t turn it into 4.0E+12. A 14-digit code starting with 1–8 is usually the case barcode — put that in a separate “Case EAN” column.'],
        ['Product Name', 'As printed on the pack, including size: “Brand Product Variant 400 g”. One product per row; flavours of one product can share a row with Varieties.'],
        ['Brand', 'The brand on the pack (e.g. Milka), not the manufacturer (e.g. Mondelez). A “Manufacturer” column is kept in the import record.'],
        ['Country of Origin', 'Where the product was made (e.g. Poland). Not the warehouse location — that is EXW Location.'],
        ['Price', 'Fill ONE of Price per Case or Price per Piece. A column called just “Price” or “Price at €” must be confirmed as per case or per piece during upload; Atlantis never assumes it. Use a dot or comma for decimals consistently.'],
        ['Currency', 'ISO code (EUR, USD, GBP, RON …). Prices are converted to EUR for the marketplace; your original price and currency are kept.'],
        ['Pieces per Case', 'Pieces in one case/carton (e.g. 24). Needed to convert a piece price or a piece stock.'],
        ['Cases per Pallet', 'Cases on one full pallet. Optional cross-check: a “Pieces per Pallet” column is compared with Pieces per Case × Cases per Pallet.'],
        ['Stock', 'Fill ONE of Stock (cases), Stock (pieces) or Stock (pallets). Pieces are converted to whole cases; pallets to cases using Cases per Pallet.'],
        ['MOQ / MOQ Unit', 'Minimum order: a number plus its unit (piece, case, pallet, truck). Text such as “1 pallet” or “full layers” (with Cases per Layer) is understood.'],
        ['Weight per Piece', 'Net weight or volume of one piece with its unit: 400 g, 1.5 L, 6 x 330 ml. Not the case weight.'],
        ['PDF price lists', 'You can also upload a PDF price list. Atlantis reads the table, shows every row with its page number for you to check and correct, and imports nothing until you confirm. Scanned PDFs (pictures of pages) can’t be read.'],
    ];
    const guide = [['Column', 'Required', 'What to enter', 'Example', 'Also accepted as'],
        ...fields.map((f) => [f.header, f.required === 'yes' ? 'Required' : f.required === 'one-of' ? `One of: ${fields.filter((x) => x.group === f.group).map((x) => x.header).join(' / ')}` : 'Optional', f.description, f.example, f.aliases.slice(0, 6).join(', ')]),
        [], ['Formats that matter'], ...formats,
        [], [variant === 'example'
            ? 'The rows in “Products” are EXAMPLES with made-up products (their barcodes start with 2, which is reserved for in-store use and never a real product). Replace them with your products before uploading.'
            : 'Row 2 (Required / Optional) can stay — the importer skips it.'],
        ['Price is stored in EUR per case. Stock is counted in cases. Weight is per piece. Missing required values make a product a draft you can finish later; nothing is invented to fill them.']];
    const gs = XLSX.utils.aoa_to_sheet(guide);
    gs['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 70 }, { wch: 22 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, gs, 'Instructions');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
