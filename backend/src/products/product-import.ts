/**
 * Bulk product import — schema, header matching and row normalisation.
 *
 * The same IMPORT_FIELDS drive the in-app guide, the downloadable template,
 * header matching and validation, so they can't drift apart. Completeness is
 * judged by catalog-rules.ts, exactly like a manually created product.
 */
import * as XLSX from 'xlsx';
import { TO_EUR, MOQ_UNITS, invalidValues, missingForPublish, normaliseBarcode, normaliseWeight, type Missing } from './catalog-rules';

export type FieldKey =
    | 'name' | 'brand' | 'category' | 'ean' | 'price' | 'piecePrice' | 'currency' | 'stock' | 'stockPieces'
    | 'unitsPerCase' | 'moq' | 'moqUnit' | 'origin' | 'exwLocation' | 'weight'
    | 'description' | 'shelfLife' | 'casesPerPallet' | 'palletsPerShipment' | 'leadTime' | 'imageUrl' | 'variants';

export interface ImportField {
    key: FieldKey;
    header: string;            // canonical column name used in the template
    required: 'yes' | 'one-of' | 'no';
    group?: string;            // fields of a 'one-of' group: one of them must be filled
    description: string;
    example: string;
    aliases: string[];         // matched after normalisation (English + Arabic)
}

export const IMPORT_FIELDS: ImportField[] = [
    { key: 'name', header: 'Product Name', required: 'yes', description: 'Full product name as buyers should see it.', example: 'Nutella Hazelnut Spread 400 g', aliases: ['name', 'product name', 'product title', 'title', 'item name', 'product', 'item', 'اسم المنتج', 'الاسم', 'المنتج', 'اسم الصنف', 'الصنف'] },
    { key: 'brand', header: 'Brand', required: 'yes', description: 'Brand printed on the pack.', example: 'Nutella', aliases: ['brand', 'brand name', 'العلامة التجارية', 'الماركة', 'البراند', 'العلامه التجاريه'] },
    { key: 'category', header: 'Category', required: 'yes', description: 'Catalog category, e.g. Chocolates & Sweets, Beverages.', example: 'Spreads & Breakfast', aliases: ['category', 'product category', 'categories', 'الفئة', 'التصنيف', 'القسم', 'الفئه'] },
    { key: 'ean', header: 'EAN', required: 'yes', description: 'Barcode — EAN-13, EAN-8, UPC-A (12) or GTIN-14, digits only. Format the column as Text so leading zeros are kept.', example: '3017620422003', aliases: ['ean', 'barcode', 'bar code', 'ean code', 'ean13', 'ean 13', 'ean8', 'gtin', 'gtin13', 'gtin 13', 'upc', 'upc code', 'الباركود', 'رمز الباركود', 'باركود'] },
    { key: 'price', header: 'Price per Case', required: 'one-of', group: 'price', description: 'Your price for one case (carton), in the file currency.', example: '36.00', aliases: ['price per case', 'case price', 'price case', 'price per carton', 'carton price', 'price carton', 'سعر الكرتونة', 'سعر الكرتونه', 'سعر الكرتون'] },
    { key: 'piecePrice', header: 'Price per Piece', required: 'one-of', group: 'price', description: 'Your price for one piece. Multiplied by Pieces per Case to get the case price. Use this OR Price per Case.', example: '2.40', aliases: ['price per piece', 'piece price', 'unit price', 'price per unit', 'price unit', 'price piece', 'سعر القطعة', 'سعر القطعه', 'سعر الوحدة'] },
    { key: 'currency', header: 'Currency', required: 'no', description: `ISO code for this row (${Object.keys(TO_EUR).join(', ')}). Empty = the currency you pick when uploading. Stored in EUR.`, example: 'EUR', aliases: ['currency', 'curr', 'currency code', 'العملة', 'العمله'] },
    { key: 'stock', header: 'Stock (cases)', required: 'one-of', group: 'stock', description: 'Cases available to sell now.', example: '120', aliases: ['stock cases', 'stock', 'cases in stock', 'available cases', 'stock case', 'available stock', 'stock qty', 'المخزون', 'المخزون بالكرتونة', 'عدد الكراتين'] },
    { key: 'stockPieces', header: 'Stock (pieces)', required: 'one-of', group: 'stock', description: 'Pieces available. Converted to whole cases using Pieces per Case. Use this OR Stock (cases).', example: '', aliases: ['stock pieces', 'pieces in stock', 'units in stock', 'stock units', 'المخزون بالقطعة'] },
    { key: 'unitsPerCase', header: 'Pieces per Case', required: 'yes', description: 'Pieces in one case.', example: '15', aliases: ['pieces per case', 'units per case', 'pcs per case', 'pcs case', 'pieces case', 'qty per case', 'case qty', 'units case', 'unitspercase', 'عدد القطع في الكرتونة', 'قطع في الكرتونة', 'عدد القطع بالكرتونة'] },
    { key: 'moq', header: 'MOQ', required: 'yes', description: 'Minimum order quantity, counted in the MOQ Unit.', example: '10', aliases: ['moq', 'minimum order', 'minimum order quantity', 'min order', 'min order qty', 'min qty', 'minorder', 'الحد الأدنى للطلب', 'الحد الادنى للطلب', 'أقل كمية'] },
    { key: 'moqUnit', header: 'MOQ Unit', required: 'no', description: 'piece, case, pallet or truck. Empty = the MOQ unit you pick when uploading (default: case).', example: 'case', aliases: ['moq unit', 'min order unit', 'minimum order unit', 'وحدة الحد الأدنى'] },
    { key: 'origin', header: 'Country of Origin', required: 'yes', description: 'Where the product was made.', example: 'France', aliases: ['country of origin', 'origin', 'made in', 'coo', 'origin country', 'بلد المنشأ', 'المنشأ', 'بلد الصنع'] },
    { key: 'exwLocation', header: 'EXW Location', required: 'yes', description: 'City and country of the warehouse the goods are collected from (Ex Works).', example: 'Bucharest, Romania', aliases: ['exw location', 'exw', 'warehouse', 'warehouse location', 'ship from location', 'ship from', 'pickup location', 'loading location', 'exw warehouse', 'مكان الاستلام', 'المستودع', 'موقع المستودع', 'مكان التحميل'] },
    { key: 'weight', header: 'Weight per Piece', required: 'yes', description: 'Net weight or volume of one piece, with unit: g, kg, ml, cl, L, oz or lb.', example: '400 g', aliases: ['weight per piece', 'weight', 'net weight', 'unit weight', 'piece weight', 'volume', 'net content', 'الوزن', 'الوزن الصافي', 'الحجم'] },
    { key: 'description', header: 'Description', required: 'no', description: 'Optional product description.', example: 'Hazelnut spread with cocoa, 400 g jar.', aliases: ['description', 'product description', 'details', 'الوصف', 'وصف المنتج'] },
    { key: 'shelfLife', header: 'BBD / Shelf Life', required: 'no', description: 'Best-before date or remaining shelf life, e.g. 2027-03-31 or 9 months.', example: '9 months', aliases: ['bbd', 'best before', 'best before date', 'shelf life', 'expiry', 'expiry date', 'exp date', 'تاريخ الانتهاء', 'الصلاحية', 'مدة الصلاحية'] },
    { key: 'casesPerPallet', header: 'Cases per Pallet', required: 'no', description: 'Needed to offer pallet prices.', example: '84', aliases: ['cases per pallet', 'cartons per pallet', 'cs per pallet', 'case per pallet', 'casesperpallet', 'كراتين في البالتة', 'عدد الكراتين في البالتة'] },
    { key: 'palletsPerShipment', header: 'Pallets per Truck', required: 'no', description: 'Needed to offer full-truck prices.', example: '33', aliases: ['pallets per truck', 'pallets per shipment', 'pallets per container', 'pallets truck', 'palletspershipment', 'بالتات في الشاحنة', 'عدد البالتات في الشاحنة'] },
    { key: 'leadTime', header: 'Lead Time (days)', required: 'no', description: 'Days you need to prepare the order. 0 = ready to dispatch.', example: '0', aliases: ['lead time', 'lead time days', 'preparation time', 'مدة التجهيز'] },
    { key: 'imageUrl', header: 'Image URL', required: 'no', description: 'Optional https link(s) to product photos, separated by |. Without a photo the product is saved as a draft; you can then find one by barcode or upload it.', example: '', aliases: ['image url', 'image', 'images', 'image link', 'photo', 'picture', 'photo url', 'صورة', 'رابط الصورة', 'الصورة'] },
    { key: 'variants', header: 'Varieties', required: 'no', description: 'Optional. Attribute: value | value; next attribute…', example: '', aliases: ['varieties', 'variants', 'variety', 'options', 'الأنواع', 'الخيارات'] },
];

/** Header names that could mean two different things; the supplier must choose. */
const AMBIGUOUS: Record<string, FieldKey[]> = {
    'price': ['price', 'piecePrice'], 'السعر': ['price', 'piecePrice'], 'cost': ['price', 'piecePrice'], 'wholesale price': ['price', 'piecePrice'],
    'quantity': ['stock', 'stockPieces'], 'qty': ['stock', 'stockPieces'], 'الكمية': ['stock', 'stockPieces'], 'الكميه': ['stock', 'stockPieces'],
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

const ALIAS_INDEX = (() => {
    const m = new Map<string, FieldKey>();
    for (const f of IMPORT_FIELDS) for (const a of [f.header, f.key, ...f.aliases]) m.set(normaliseHeader(a), f.key);
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

export const labelOf = (k: FieldKey) => IMPORT_FIELDS.find((f) => f.key === k)?.header ?? k;

// ─── File parsing ──────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Cell → text without losing precision or leading zeros (raw value, not display format). */
function cellText(c: XLSX.CellObject | undefined): string {
    if (!c || c.v === undefined || c.v === null) return '';
    if (c.t === 'n') {
        const v = c.v as number;
        if (Number.isInteger(v)) return Math.abs(v) >= 1e15 ? BigInt(v).toString() : v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 });
        return String(v);
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

export interface ImportOptions { currency: string; moqUnit: string }
export type Mapping = Record<string, FieldKey | null | ''>; // column index → field

export interface BuiltRow {
    row: number;                      // spreadsheet row number (1-based, as the supplier sees it)
    values: Partial<Record<FieldKey, string>>;
    product: any;                     // normalised fields ready for ProductsService.create
    errors: Missing[];                // block the row
    missing: Missing[];               // incomplete → saved as DRAFT
    warnings: string[];
}

const num = (s: string | undefined) => {
    if (s === undefined || s === null || String(s).trim() === '') return undefined;
    let t = String(s).replace(/[€$£\s]/g, '').replace(/[^\d.,-]/g, '');
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');                                   // 6,72
    else t = t.replace(/,/g, '');                                                              // 1,234.56
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
};

export function buildRow(cells: string[], rowNumber: number, mapping: Mapping, opts: ImportOptions): BuiltRow {
    const values: Partial<Record<FieldKey, string>> = {};
    for (const [idx, field] of Object.entries(mapping)) if (field) values[field] = (cells[Number(idx)] ?? '').toString().trim();
    const errors: Missing[] = [];
    const warnings: string[] = [];
    const err = (field: string, label: string, reason: string) => errors.push({ field, label, reason });

    const currency = (values.currency || opts.currency || 'EUR').toUpperCase();
    const rate = TO_EUR[currency];
    if (!rate) err('currency', 'Currency', `Currency “${currency}” isn’t supported. Use one of ${Object.keys(TO_EUR).join(', ')}.`);

    const upc = num(values.unitsPerCase);
    const casePrice = num(values.price);
    const piecePrice = num(values.piecePrice);
    let priceCase: number | undefined;
    if (casePrice !== undefined && piecePrice !== undefined && !Number.isNaN(casePrice) && !Number.isNaN(piecePrice) && upc && Math.abs(piecePrice * upc - casePrice) > 0.011 * Math.max(1, casePrice)) {
        err('price', 'Price', `Price per Case (${casePrice}) doesn’t equal Price per Piece × Pieces per Case (${piecePrice} × ${upc}). Fix one of them.`);
    } else if (casePrice !== undefined) {
        if (Number.isNaN(casePrice) || casePrice <= 0) err('price', 'Price per Case', `“${values.price}” isn’t a valid price.`); else priceCase = casePrice;
    } else if (piecePrice !== undefined) {
        if (Number.isNaN(piecePrice) || piecePrice <= 0) err('piecePrice', 'Price per Piece', `“${values.piecePrice}” isn’t a valid price.`);
        else if (!upc || Number.isNaN(upc)) err('piecePrice', 'Price per Piece', 'A price per piece needs Pieces per Case to work out the case price.');
        else priceCase = piecePrice * upc;
    }

    let stock: number | undefined;
    const sc = num(values.stock), sp = num(values.stockPieces);
    if (sc !== undefined) {
        if (Number.isNaN(sc) || sc < 0 || !Number.isInteger(sc)) err('stock', 'Stock (cases)', `“${values.stock}” must be a whole number of cases.`); else stock = sc;
    } else if (sp !== undefined) {
        if (Number.isNaN(sp) || sp < 0) err('stockPieces', 'Stock (pieces)', `“${values.stockPieces}” isn’t a valid quantity.`);
        else if (!upc || Number.isNaN(upc)) err('stockPieces', 'Stock (pieces)', 'Stock in pieces needs Pieces per Case to convert to cases.');
        else { stock = Math.floor(sp / upc); if (sp % upc) warnings.push(`${sp} pieces = ${stock} full cases; ${sp % upc} loose pieces not counted.`); }
    }

    const moqUnitRaw = (values.moqUnit || opts.moqUnit || 'CASE').toUpperCase().replace(/S$/, '').replace('CARTON', 'CASE').replace('PCS', 'PIECE').replace('UNIT', 'PIECE');
    if (!MOQ_UNITS.includes(moqUnitRaw as any)) err('moqUnit', 'MOQ Unit', `“${values.moqUnit}” isn’t a valid MOQ unit (piece, case, pallet, truck).`);

    const ean = normaliseBarcode(values.ean);
    const ex = (k: FieldKey) => IMPORT_FIELDS.find((f) => f.key === k)!.example;
    if (ean === ex('ean') && (values.name || '') === ex('name')) err('name', 'Example row', 'This is the template’s example row — delete it from your file.');
    if (values.ean && /e\+/i.test(values.ean)) warnings.push('Barcode was stored as a number in scientific notation — check it wasn’t rounded. Format the column as Text.');

    const images = (values.imageUrl || '').split(/[|\n]+/).map((s) => s.trim()).filter(Boolean);
    const badImg = images.filter((u) => !/^https:\/\/[^\s]+$/i.test(u));
    if (badImg.length) err('imageUrl', 'Image URL', `Image links must start with https:// (${badImg[0].slice(0, 40)}).`);

    const variants = parseVariants(values.variants);
    if (values.variants && !variants) err('variants', 'Varieties', 'Write varieties as “Size: 330 ml | 500 ml; Flavor: Original | Zero”.');

    const product: any = {
        name: values.name || '',
        brand: values.brand || '',
        category: values.category || '',
        ean: ean || '',
        description: values.description || '',
        origin: values.origin || '',
        exwLocation: values.exwLocation || '',
        weight: values.weight ? (normaliseWeight(values.weight) || values.weight) : '',
        shelfLife: values.shelfLife || null,
        price: priceCase !== undefined && rate ? Math.round(priceCase * rate * 10000) / 10000 : undefined,
        stock,
        unit: 'case',
        unitsPerCase: upc !== undefined && !Number.isNaN(upc) ? upc : undefined,
        moq: num(values.moq),
        moqUnit: moqUnitRaw,
        casesPerPallet: num(values.casesPerPallet),
        palletsPerShipment: num(values.palletsPerShipment),
        leadTime: num(values.leadTime),
        images: badImg.length ? [] : images,
        variants: variants || undefined,
    };
    for (const k of ['moq', 'unitsPerCase', 'casesPerPallet', 'palletsPerShipment', 'leadTime']) {
        if (Number.isNaN(product[k])) { err(k, labelOf(k as FieldKey), `“${(values as any)[k]}” isn’t a number.`); product[k] = undefined; }
    }
    for (const inv of invalidValues(product)) if (!errors.some((e) => e.field === inv.field)) errors.push(inv);
    if (currency !== 'EUR' && rate && priceCase !== undefined) warnings.push(`Price converted from ${currency} to EUR at ${rate}.`);

    // Missing required data doesn't block the row — it is imported as a DRAFT
    // and listed so the supplier can finish it. Invalid data blocks the row.
    const missing = missingForPublish({ ...product, basePrice: product.price }).filter((m) => !errors.some((e) => e.field === m.field));
    return { row: rowNumber, values, product, errors, missing, warnings };
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

export function buildTemplate(format: 'xlsx' | 'csv'): Buffer {
    const fields = IMPORT_FIELDS;
    const headers = fields.map((f) => f.header);
    const need = fields.map((f) => (f.required === 'yes' ? 'Required' : f.required === 'one-of' ? 'One of (see guide)' : 'Optional'));
    const example = fields.map((f) => f.example);
    if (format === 'csv') {
        const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        return Buffer.from('﻿' + [headers, example].map((r) => r.map(esc).join(',')).join('\n') + '\n', 'utf8');
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, need, example]);
    // Keep barcodes as text so leading zeros survive.
    const eanCol = headers.indexOf('EAN');
    for (let r = 1; r <= 200; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: eanCol });
        if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; } else ws[ref] = { t: 's', v: '', z: '@' } as any;
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 200, c: headers.length - 1 } });
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    const guide = [['Column', 'Required', 'What to enter', 'Example', 'Also accepted as'],
        ...fields.map((f) => [f.header, f.required === 'yes' ? 'Required' : f.required === 'one-of' ? `One of: ${fields.filter((x) => x.group === f.group).map((x) => x.header).join(' / ')}` : 'Optional', f.description, f.example, f.aliases.slice(0, 6).join(', ')]),
        [], ['Delete row 2 (Required / Optional) and the example row before uploading, or keep them — the importer skips the helper row.'],
        ['Price is stored in EUR per case. Stock is counted in cases. Weight is per piece.']];
    const gs = XLSX.utils.aoa_to_sheet(guide);
    gs['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 70 }, { wch: 22 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, gs, 'Instructions');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
