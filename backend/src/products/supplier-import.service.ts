import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProductsService } from './products.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { ALL_FIELDS, IMPORT_FIELDS, buildFromValues, labelOf, weightAmounts, weightFromName, type BuiltRow, type FieldKey } from './product-import';
import { missingForPublish, realImages } from './catalog-rules';
import { ImportEnrichmentService } from './import-enrichment.service';
import { ImageLookupService } from './image-lookup.service';
import { applyImportBrands } from './catalog-fields';

/** Where a field's value comes from when the file has no column for it. */
export interface ImportSource {
    kind: 'constant' | 'section' | 'sheetName' | 'fromName';
    value?: string;
    perSheet?: Record<string, string>;
}

export interface ImportRequest {
    fileName?: string;
    sheets: {
        name: string;
        columns: { index: number; key: string; header: string; parent?: string }[];
        rows: { row: number; cells: string[]; shown?: Record<string, string>; section?: string; images?: string[]; page?: number; source?: string; edited?: Record<string, string> }[];
    }[];
    /** Column key (normalised header) → field, or '' to leave the column out. */
    mapping: Record<string, FieldKey | '' | null>;
    sources?: Partial<Record<FieldKey, ImportSource>>;
    settings?: {
        currency?: string; moqUnit?: string; unit?: string;
        /** 'shown' = use the value a price cell displays (€ 1.15), 'exact' = its full value (1.14926875). */
        pricePrecision?: 'exact' | 'shown';
        /** Decimal separator per column key, when a column's numbers can be read two ways. */
        decimal?: Record<string, '.' | ','>;
    };
    onExisting?: 'skip' | 'update';
    /** 'pdf' when the rows were read from a PDF (row numbers then count within the PDF table). */
    format?: 'pdf' | 'sheet';
    /**
     * Photos the supplier chose from the barcode photo search, by row key.
     * Only a photo the search returned for that row's barcode is accepted.
     */
    externalImages?: Record<string, { url: string }>;
    /** Commit only: when the whole import started, and whether this is its last batch. */
    startedAt?: string;
    last?: boolean;
}

/** Keeps the review response well under the ~4.5 MB proxy limit (≈1.2 KB per row). */
export const MAX_IMPORT_ROWS_TOTAL = 2500;
export const MAX_COMMIT_ROWS = 250;
const FIELD_KEYS = new Set(ALL_FIELDS.map((f) => f.key));
const STORED = new Set(IMPORT_FIELDS.map((f) => f.key));
const PRICE_FIELDS: FieldKey[] = ['price', 'piecePrice', 'displayPrice'];
/** Which fields may take a value from somewhere other than a column. */
const SOURCE_RULES: Record<ImportSource['kind'], FieldKey[]> = {
    constant: ['brand', 'category', 'origin', 'exwLocation', 'currency', 'stock', 'moq', 'moqUnit', 'unit', 'leadTime', 'palletsPerShipment', 'casesPerPallet', 'unitsPerCase', 'shelfLife', 'weight', 'description'],
    section: ['brand', 'category', 'origin'],
    sheetName: ['brand', 'category', 'origin'],
    fromName: ['weight', 'brand'],
};
const DIFF_FIELDS: [string, string][] = [
    ['name', 'Name'], ['brand', 'Brand'], ['category', 'Category'], ['weight', 'Weight'], ['origin', 'Origin'], ['exwLocation', 'EXW location'],
    ['unitsPerCase', 'Pieces per case'], ['casesPerPallet', 'Cases per pallet'], ['palletsPerShipment', 'Pallets per truck'],
    ['moq', 'MOQ'], ['moqUnit', 'MOQ unit'], ['stock', 'Stock (cases)'], ['shelfLife', 'BBD / shelf life'], ['leadTime', 'Lead time'],
];

const fold = (s: string) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();

/** Longest known brand the product name starts with ("Kellogg's Trésor…" → "Kellogg's"). */
export function brandFromName(name: string, known: string[]): string | null {
    const n = fold(name);
    let best: string | null = null;
    for (const b of known) {
        const f = fold(b);
        if (f.length < 2) continue;
        if ((n === f || n.startsWith(`${f} `)) && (!best || f.length > fold(best).length)) best = b.trim();
    }
    return best;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

@Injectable()
export class SupplierImportService {
    private readonly logger = new Logger(SupplierImportService.name);
    constructor(private readonly products: ProductsService, private readonly notifications: NotificationsService, private readonly storage: SupabaseStorageService, private readonly enrichment: ImportEnrichmentService, private readonly imageLookup: ImageLookupService) {}

    /** Reject malformed requests; return the mapping problems the supplier must fix first. */
    private checkRequest(req: ImportRequest, maxRows = MAX_IMPORT_ROWS_TOTAL) {
        if (!Array.isArray(req?.sheets) || !req.sheets.length) throw new BadRequestException('No sheets to import.');
        const total = req.sheets.reduce((s, x) => s + (Array.isArray(x?.rows) ? x.rows.length : 0), 0);
        if (!total) throw new BadRequestException('No rows to import.');
        if (total > maxRows) throw new BadRequestException(`Import at most ${maxRows} rows at a time.`);
        const mapping: Record<string, FieldKey> = {};
        for (const [key, field] of Object.entries(req.mapping || {})) {
            if (!field) continue;
            if (!FIELD_KEYS.has(field as FieldKey)) throw new BadRequestException(`Unknown field “${field}”.`);
            mapping[key] = field as FieldKey;
        }
        // Within one sheet a field can come from one column only.
        for (const sh of req.sheets) {
            const taken = new Map<FieldKey, string>();
            for (const col of sh.columns || []) {
                const f = mapping[col.key];
                if (!f) continue;
                const as = f === 'eanPair' ? 'ean' : f;
                if (taken.has(as as FieldKey)) throw new BadRequestException(`Sheet “${sh.name}”: two columns are set to ${labelOf(as as FieldKey)} (“${taken.get(as as FieldKey)}” and “${col.header}”). Keep one.`);
                taken.set(as as FieldKey, col.header);
            }
        }
        const sources: Partial<Record<FieldKey, ImportSource>> = {};
        for (const [f, src] of Object.entries(req.sources || {})) {
            if (!src || !src.kind) continue;
            const allowed = SOURCE_RULES[src.kind as ImportSource['kind']];
            if (!allowed) throw new BadRequestException(`Unknown value source “${src.kind}”.`);
            if (!allowed.includes(f as FieldKey)) throw new BadRequestException(`${labelOf(f as FieldKey)} can’t take its value from ${src.kind === 'constant' ? 'one value for all rows' : src.kind}.`);
            if (src.kind === 'constant' && !String(src.value ?? '').trim() && !Object.values(src.perSheet || {}).some((v) => String(v ?? '').trim())) continue;
            sources[f as FieldKey] = { kind: src.kind, value: src.value != null ? String(src.value).slice(0, 200) : undefined, perSheet: src.perSheet };
        }
        return { mapping, sources };
    }

    /** Build and check every row; nothing is written. */
    async validate(supplierId: string, req: ImportRequest, maxRows = MAX_IMPORT_ROWS_TOTAL) {
        const { mapping, sources } = this.checkRequest(req, maxRows);
        const opts = { currency: String(req.settings?.currency || 'EUR').toUpperCase(), moqUnit: String(req.settings?.moqUnit || 'CASE').toUpperCase(), unit: String(req.settings?.unit || 'piece').toLowerCase() };
        const shownPrices = req.settings?.pricePrecision === 'shown';
        const knownBrands = sources.brand?.kind === 'fromName'
            ? [...new Set([...(await this.products.knownBrands(supplierId)), ...req.sheets.map((s) => s.name.trim()), ...req.sheets.flatMap((s) => s.rows.map((r) => r.section || '').filter(Boolean))])]
            : [];

        type Item = { sheet: string; key: string; built: BuiltRow; from: Partial<Record<FieldKey, { column: string; value: string }>>; images: string[]; original: Record<string, string>; page?: number; source?: string; edited?: Record<string, string>; external?: { url: string; credit: any } };
        const items: Item[] = [];
        for (const sh of req.sheets) {
            const cols = (sh.columns || []).filter((c) => mapping[c.key]);
            const colFields = new Set(cols.map((c) => mapping[c.key]));
            for (const r of sh.rows) {
                const cells = Array.isArray(r.cells) ? r.cells.map((c) => String(c ?? '')) : [];
                const values: Partial<Record<FieldKey, string>> = {};
                const headers: Partial<Record<FieldKey, string>> = {};
                const decimal: Partial<Record<FieldKey, '.' | ','>> = {};
                const from: Item['from'] = {};
                for (const c of cols) {
                    const f = mapping[c.key];
                    let v = cells[c.index] ?? '';
                    // A price cell that displays fewer decimals than it holds: use what the supplier chose.
                    if (shownPrices && PRICE_FIELDS.includes(f) && r.shown?.[String(c.index)]) v = r.shown[String(c.index)];
                    values[f] = v;
                    headers[f] = c.parent ? `${c.parent} ${c.header}` : c.header;
                    const d = req.settings?.decimal?.[c.key];
                    if (d === '.' || d === ',') decimal[f] = d;
                    from[f] = { column: c.parent ? `${c.parent} › ${c.header}` : c.header, value: cells[c.index] ?? '' };
                }
                // Fields without a column in this sheet: the supplier's chosen source.
                const derived: Partial<Record<FieldKey, string>> = {};
                for (const [f, src] of Object.entries(sources) as [FieldKey, ImportSource][]) {
                    if (colFields.has(f) || (f === 'ean' && colFields.has('eanPair'))) continue;
                    let v = '', note = '';
                    if (src.kind === 'constant') { v = String(src.perSheet?.[sh.name] ?? src.value ?? '').trim(); note = src.perSheet?.[sh.name] ? `Set by you for sheet “${sh.name}”` : 'Set by you for all rows'; }
                    else if (src.kind === 'section') { v = r.section || ''; note = v ? `From the heading “${v}” above this row` : ''; }
                    else if (src.kind === 'sheetName') { v = sh.name.trim(); note = `From the sheet name “${v}”`; }
                    else if (src.kind === 'fromName' && f === 'weight') { v = weightFromName(values.name) || ''; note = v ? `Read from the product name` : ''; }
                    else if (src.kind === 'fromName' && f === 'brand') {
                        v = brandFromName(values.name || '', knownBrands) || '';
                        note = v ? 'Matched at the start of the product name' : '';
                        // No brand found in the name: the supplier's own value for this sheet (or all rows), if they gave one.
                        const fb = String(src.perSheet?.[sh.name] ?? src.value ?? '').trim();
                        if (!v && fb) { v = fb; note = src.perSheet?.[sh.name] ? `No brand in the name — set by you for sheet “${sh.name}”` : 'No brand in the name — set by you for all rows'; }
                    }
                    if (v) { values[f] = v; derived[f] = note; }
                }
                const built = buildFromValues(values, r.row, opts, { headers, decimal, derived });
                if (sources.brand?.kind === 'fromName' && !colFields.has('brand') && !values.brand) built.warnings.push('No brand found at the start of the name — add the brand before this product can be reviewed.');
                const original: Record<string, string> = {};
                (sh.columns || []).forEach((c) => { const v = cells[c.index]; if (v !== undefined && String(v).trim() !== '') original[c.parent ? `${c.parent} › ${c.header}` : c.header] = String(v); });
                const page = Number.isInteger(r.page) && r.page! > 0 ? r.page : undefined;
                const edited = r.edited && typeof r.edited === 'object' ? Object.fromEntries(Object.entries(r.edited).slice(0, 40).map(([k, v]) => [String(k).slice(0, 80), String(v ?? '').slice(0, 300)])) : undefined;
                items.push({ sheet: sh.name, key: `${sh.name}!${r.row}`, built, from, images: (Array.isArray(r.images) ? r.images : []).filter((p) => typeof p === 'string').slice(0, 5), original, page, source: typeof r.source === 'string' ? r.source.slice(0, 400) : undefined, edited });
            }
        }
        const where = (it: Item) => `${req.sheets.length > 1 ? `sheet “${it.sheet}” row ${it.built.row}` : `row ${it.built.row}`}${it.page ? ` (page ${it.page})` : ''}`;
        // Brands: canonical spelling for known ones; brands not on Atlantis are flagged for the supplier to confirm.
        const newBrands = applyImportBrands(items.map((it) => it.built), await this.products.brandCatalogFor(supplierId));

        // A photo chosen from the barcode search: only for rows without a photo of their own,
        // and only a photo that search returned for this row's barcode.
        for (const it of items) {
            const pick = req.externalImages?.[it.key];
            if (!pick?.url || it.built.product.images?.length || it.images.length || !it.built.product.ean) continue;
            const cand = this.enrichment.candidateFor(it.built.product.ean, String(pick.url));
            if (!cand) { it.built.warnings.push('The photo chosen from the barcode search can’t be used any more — search again or add your own photo.'); continue; }
            it.external = { url: cand.url, credit: { source: cand.source, license: cand.license, licenseUrl: cand.licenseUrl, attribution: cand.attribution, sourceUrl: cand.sourceUrl, barcode: cand.barcode } };
            it.built.missing = it.built.missing.filter((m) => m.field !== 'images');
            it.built.notes.imageUrl = `Photo from ${cand.source} (${cand.license}), chosen by you`;
        }
        // A picture placed on the row counts as the product photo when the file has no image link.
        for (const it of items) {
            if (it.images.length && !it.built.product.images?.length) {
                it.built.missing = it.built.missing.filter((m) => m.field !== 'images');
                it.built.notes.imageUrl = `${it.images.length === 1 ? 'Picture' : `${it.images.length} pictures`} placed on this row in the file`;
            }
        }

        // Duplicates inside the file.
        const byEan = new Map<string, Item>();
        const byNameWeight = new Map<string, Item>();
        for (const it of items) {
            const code = it.built.product.ean;
            if (code) {
                const first = byEan.get(code);
                if (first) {
                    const other = fold(first.built.product.name) !== fold(it.built.product.name);
                    it.built.errors.push({ field: 'ean', label: 'Barcode (EAN/GTIN)', reason: `Same barcode as ${where(first)}${other ? ` (“${first.built.product.name}”)` : ''} — each barcode once per file.${other ? ' If these are designs or flavours of one product, list it once and add them as Varieties.' : ''}` });
                }
                else byEan.set(code, it);
            }
            const nk = `${fold(it.built.product.name)}|${it.built.product.weight || ''}`;
            if (it.built.product.name) {
                const first = byNameWeight.get(nk);
                if (first && first.built.product.ean !== code && !it.built.errors.some((e) => e.field === 'ean')) it.built.warnings.push(`Same name and weight as ${where(first)}, with a different barcode — check it isn’t the same product twice.`);
                else if (!first) byNameWeight.set(nk, it);
            }
        }

        // Prices far from the rest of the file (per kg or per litre) — usually a price on a different basis.
        const perKg = (it: Item) => {
            const p = it.built.product, w = weightAmounts(p.weight);
            if (!p.price || !p.unitsPerCase || !w || !w.total) return null;
            return { v: p.price / (p.unitsPerCase * w.total / 1000), dim: w.dim };
        };
        for (const dim of ['mass', 'volume'] as const) {
            const list = items.map((it) => ({ it, k: perKg(it) })).filter((x) => x.k && x.k.dim === dim && !x.it.built.errors.length) as { it: Item; k: { v: number } }[];
            if (list.length < 8) continue;
            const med = median(list.map((x) => x.k.v));
            for (const { it, k } of list) {
                if (k.v > med * 6 || k.v < med / 6) it.built.warnings.push(`Price looks unusual: €${k.v.toFixed(2)} per ${dim === 'mass' ? 'kg' : 'litre'}, against about €${med.toFixed(2)} for most of this file. Check the price is per ${PRICE_FIELDS.some((f) => it.from[f]) ? labelOf((PRICE_FIELDS.find((f) => it.from[f]) as FieldKey)).replace('Price per ', '').toLowerCase() : 'case'}.`);
            }
        }

        // The supplier's own catalog: by barcode, or by exact name when a row has no barcode.
        const existing = await this.products.findMineForImport(supplierId, [...byEan.keys()], items.filter((i) => !i.built.product.ean).map((i) => i.built.product.name));
        const exByEan = new Map(existing.filter((e: any) => e.ean).map((e: any) => [e.ean, e]));
        const exByName = new Map(existing.map((e: any) => [fold(e.name), e]));
        const onExisting = req.onExisting === 'update' ? 'update' : 'skip';

        const rows = items.map((it) => {
            const b = it.built, p = b.product;
            const ex: any = p.ean ? exByEan.get(p.ean) : exByName.get(fold(p.name));
            let changes: { field: string; label: string; from: string; to: string }[] = [];
            if (ex) {
                const show = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v));
                for (const [f, label] of DIFF_FIELDS) {
                    const nv = p[f];
                    if (nv === undefined || nv === null || nv === '' || (f === 'moqUnit' && p.moq === undefined)) continue;
                    if (String(nv).trim().toLowerCase() !== String(ex[f] ?? '').trim().toLowerCase()) changes.push({ field: f, label, from: show(ex[f]), to: show(nv) });
                }
                if (p.supplierPrice !== undefined) {
                    const sameCur = (ex.supplierCurrency || 'EUR') === p.supplierCurrency;
                    const old = sameCur ? ex.supplierPrice ?? ex.basePrice : ex.basePrice, nw = sameCur ? p.supplierPrice : p.price;
                    if (old == null || Math.abs(Number(old) - Number(nw)) > 0.0001) {
                        changes.push({ field: 'price', label: `Price per case (${sameCur ? p.supplierCurrency : 'EUR'})`, from: old == null ? '—' : Number(old).toFixed(2), to: Number(nw).toFixed(2) });
                        if (old && Math.abs(nw - old) / old > 0.5) b.warnings.push(`Price per case changes by ${nw > old ? '+' : ''}${Math.round(((nw - old) / old) * 100)}% (${Number(old).toFixed(2)} → ${Number(nw).toFixed(2)}). Check before updating.`);
                    }
                }
                // A photo chosen from the barcode search for a saved product that has none: proposed like any other change.
                if (it.external && !realImages(ex.images).length) changes.push({ field: 'images', label: 'Photo', from: '—', to: it.external.credit.source });
                if (ex.status === 'REJECTED') b.errors.push({ field: 'ean', label: 'Rejected listing', reason: 'This product was rejected and can’t be updated. Create a new listing that addresses the reason.' });
                // An update fills in the saved product: judge completeness on the result, not on the row alone.
                const filled = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
                const merged: any = { ...ex, ...filled, images: realImages(ex.images).length ? ex.images : (p.images?.length ? p.images : it.images.length || it.external ? ['https://picture-from-file.invalid/'] : []) }; // marker for the completeness check only
                b.missing = missingForPublish({ ...merged, basePrice: filled.price ?? ex.basePrice }).filter((m) => !b.errors.some((e) => e.field === m.field));
            }
            const state = b.errors.length ? 'error' : ex ? (onExisting === 'skip' ? 'skip' : changes.length ? 'update' : 'unchanged') : b.missing.length ? 'draft' : 'ready';
            const action = state === 'ready' || state === 'draft' ? 'create' : state === 'update' ? 'update' : 'none';
            return {
                key: it.key, sheet: it.sheet, row: b.row, state, action,
                name: p.name, brand: p.brand, ean: p.ean, category: p.category,
                priceEur: p.price ?? null, supplierPrice: p.supplierPrice ?? null, supplierCurrency: p.supplierCurrency ?? null,
                stock: p.stock ?? null, origin: p.origin, exwLocation: p.exwLocation, weight: p.weight,
                unitsPerCase: p.unitsPerCase ?? null, casesPerPallet: p.casesPerPallet ?? null, moq: p.moq ?? null, moqUnit: p.moqUnit, shelfLife: p.shelfLife,
                images: it.images, imageStatus: p.images?.length ? 'from_link' : it.images.length ? 'from_file' : it.external ? 'from_lookup' : 'missing', externalImage: it.external?.url ?? null, page: it.page ?? null,
                from: it.from, notes: b.notes, aux: b.aux,
                errors: b.errors, missing: b.missing, warnings: b.warnings,
                existing: ex ? { id: ex.id, name: ex.name, status: ex.status, hasPhoto: realImages(ex.images).length > 0 } : null, changes,
            };
        });
        const count = (s: string) => rows.filter((r) => r.state === s).length;
        const summary = {
            total: rows.length, ready: count('ready'), draft: count('draft'), update: count('update'), unchanged: count('unchanged'), skip: count('skip'), error: count('error'),
            create: count('ready') + count('draft'), withWarnings: rows.filter((r) => r.warnings.length).length,
            photosFromFile: rows.filter((r) => r.imageStatus === 'from_file').length, missingImages: rows.filter((r) => r.imageStatus === 'missing').length,
            photosFromLookup: rows.filter((r) => r.imageStatus === 'from_lookup').length,
            newBrands,
        };
        // What will be stored where — and what won't be stored at all.
        const usedKeys = new Set(req.sheets.flatMap((s) => (s.columns || []).map((c) => c.key)));
        const mappingReport = Object.entries(mapping).filter(([k]) => usedKeys.has(k)).map(([key, field]) => ({ key, field, label: labelOf(field), stored: STORED.has(field) }));
        const notProvided = IMPORT_FIELDS.filter((f) => f.required !== 'no' && !Object.values(mapping).includes(f.key) && !sources[f.key] && !(f.key === 'ean' && Object.values(mapping).includes('eanPair')))
            .filter((f) => !(f.group === 'price' && Object.values(mapping).some((m) => PRICE_FIELDS.includes(m))) && !(f.group === 'stock' && (Object.values(mapping).includes('stock') || Object.values(mapping).includes('stockPieces') || Object.values(mapping).includes('stockPallets') || sources.stock)))
            .map((f) => f.header);
        return { rows, summary, mapping: mappingReport, notProvided: [...new Set(notProvided)], built: items };
    }

    /**
     * Import one batch. Each row is its own write, so a failure never hides or
     * rolls back the others. Rows already in the catalog are skipped or, when
     * asked, updated with valid values only — an invalid row never touches a
     * saved product. The original spreadsheet row is kept with each product.
     */
    async commit(supplierId: string, req: ImportRequest, files: { originalname: string; buffer: Buffer; mimetype: string; size: number }[] = []) {
        const v = await this.validate(supplierId, req, MAX_COMMIT_ROWS);
        // Media names are unique inside a workbook (xl/media/imageN.ext); uploads may arrive without the folder.
        const base = (p: string) => String(p || '').split('/').pop() || '';
        const photos = new Map(files.map((f) => [base(f.originalname), f]));
        const results: any[] = [];
        for (let i = 0; i < v.rows.length; i++) {
            const r = v.rows[i];
            const it = v.built[i];
            const head = { key: r.key, sheet: r.sheet, row: r.row, name: r.name, ean: r.ean, ...(r.page ? { page: r.page } : {}) };
            if (r.state === 'error') { results.push({ ...head, outcome: 'failed', reasons: r.errors.map((e: any) => e.reason) }); continue; }
            if (r.state === 'skip') { results.push({ ...head, outcome: 'skipped', productId: r.existing?.id, reasons: ['Already in your catalog (you chose to skip these).'] }); continue; }
            if (r.state === 'unchanged') { results.push({ ...head, outcome: 'unchanged', productId: r.existing?.id }); continue; }
            const notes: string[] = [];
            try {
                // Pictures from the file: stored first so a complete product goes straight to review.
                let images: string[] = it.built.product.images?.length ? it.built.product.images : [];
                const wantsPhotos = !images.length && r.images.length && (r.action === 'create' || r.action === 'update');
                if (wantsPhotos) {
                    if (r.action === 'update') {
                        const ex = await this.products.findOneRaw(r.existing!.id);
                        if (realImages(ex?.images).length) { notes.push('Kept your current photos; the picture in the file was not used.'); }
                        else images = await this.storePhotos(r.images, photos, notes);
                    } else images = await this.storePhotos(r.images, photos, notes);
                }
                let credits: Record<string, any> | null = null;
                if (!images.length && it.external && (r.action === 'create' || r.action === 'update')) {
                    const ex = r.action === 'update' ? await this.products.findOneRaw(r.existing!.id) : null;
                    if (ex && realImages(ex.images).length) notes.push('Kept your current photos; the photo from the barcode search was not used.');
                    else {
                        try {
                            const stored = await this.imageLookup.accept(it.external.url, ((u: any, i: any) => this.enrichment.imageQueue.fetch(String(u), i)) as typeof fetch);
                            images = [stored.url];
                            credits = { [stored.url]: { ...it.external.credit, addedAt: new Date().toISOString() } };
                        } catch (e: any) {
                            notes.push('The photo from the barcode search couldn’t be saved right now — the product is a draft; add a photo later.');
                            this.logger.warn(`[import] lookup photo for ${r.key}: ${e?.message}`);
                        }
                    }
                }
                const product = { ...it.built.product, images };
                let saved: any;
                if (r.action === 'update') {
                    const patch = updatePatch(product, it.built.values);
                    saved = await this.products.supplierUpdate(r.existing!.id, supplierId, patch, { submit: true });
                    results.push({ ...head, outcome: 'updated', productId: saved.id, status: saved.status, changes: r.changes.map((c: any) => c.label), notes });
                } else {
                    saved = await this.products.create({ ...product, supplierId } as any, false, true, { submit: true, actorId: supplierId, noInference: true });
                    // What the saved product still lacks — after any photo upload, so a failed photo is counted.
                    const missing = missingForPublish({ ...product, basePrice: product.price }).map((m) => m.label);
                    results.push({ ...head, outcome: 'created', productId: saved.id, status: saved.status, missing, imageMissing: !images.length, photoFromLookup: !!credits, notes });
                }
                if (credits) await this.products.setImageCredits(saved.id, credits).catch((e) => this.logger.warn(`[import] image credit for ${saved.id}: ${e?.message}`));
                await this.products.recordImportSource(saved.id, supplierId, { file: req.fileName, sheet: r.sheet, row: r.row, columns: it.original, ...(it.page ? { page: it.page, extracted: it.source } : {}), ...(it.edited && Object.keys(it.edited).length ? { editedBySupplier: it.edited } : {}), ...(credits ? { imageCredits: credits } : {}) })
                    .catch((e) => this.logger.warn(`[import] source record for ${saved.id}: ${e?.message}`));
            } catch (e: any) {
                const msg = e?.response?.message || e?.message || 'Could not save this row.';
                this.logger.warn(`[import] ${r.key}: ${Array.isArray(msg) ? msg.join(', ') : msg}`);
                results.push({ ...head, outcome: 'failed', reasons: [Array.isArray(msg) ? msg.join(', ') : String(msg)], notes });
            }
        }
        if (req.last) await this.notifyReviewers(supplierId, req.startedAt);
        const count = (o: string) => results.filter((x) => x.outcome === o).length;
        return {
            summary: {
                total: results.length, created: count('created'), updated: count('updated'), unchanged: count('unchanged'), skipped: count('skipped'), failed: count('failed'),
                pendingReview: results.filter((x) => x.status === 'PENDING').length, drafts: results.filter((x) => x.status === 'DRAFT').length,
            },
            results,
        };
    }

    /** Store a row's pictures; a picture that can't be stored is reported, never silently dropped. */
    private async storePhotos(paths: string[], photos: Map<string, { buffer: Buffer; mimetype: string; size: number }>, notes: string[]): Promise<string[]> {
        const out: string[] = [];
        for (const p of paths) {
            const f = photos.get(String(p).split('/').pop() || '');
            if (!f) { notes.push('A picture from the file wasn’t received — add a photo later.'); continue; }
            const type = sniffImage(f.buffer);
            if (!type) { notes.push('A picture in the file isn’t a JPEG, PNG, GIF or WebP image — add a photo later.'); continue; }
            if (f.size > 10 * 1024 * 1024) { notes.push('A picture in the file is larger than 10 MB — add a smaller photo later.'); continue; }
            try { out.push(await this.storage.uploadProductImage(f.buffer, `import-${p.split('/').pop()}`, type)); }
            catch (e: any) {
                this.logger.warn(`[import] photo ${p} not stored: ${e?.message}`);
                notes.push('The picture from your file couldn’t be stored right now — the product is a draft; add a photo later or import the file again.');
            }
        }
        return out;
    }

    /** One notice to the review team per import, counted from the database (not from the client). */
    private async notifyReviewers(supplierId: string, startedAt?: string) {
        const t = new Date(startedAt || Date.now() - 60 * 60 * 1000);
        const since = Number.isFinite(t.getTime()) ? new Date(Math.max(t.getTime(), Date.now() - 6 * 60 * 60 * 1000)) : new Date(Date.now() - 60 * 60 * 1000);
        const pending = await this.products.countPendingSince(supplierId, since).catch(() => 0);
        if (pending) this.notifications.notifyAdmins('Bulk products submitted', `${pending} product${pending === 1 ? '' : 's'} from a supplier import are waiting for review.`, 'INFO', { supplierId, count: pending }).catch(() => {});
    }
}

/**
 * The review travels through a proxy with a response size limit, so repeated
 * text is sent once: column names and notes as tables, missing fields as keys.
 * The browser expands it back (frontend components/supplier/import/types.ts).
 */
export function compactReview(out: { rows: any[]; [k: string]: any }) {
    const columns: string[] = [], notes: string[] = [];
    const missingLabels: Record<string, string> = {};
    const intern = (list: string[], v: string) => { let i = list.indexOf(v); if (i < 0) { i = list.length; list.push(v); } return i; };
    const rows = out.rows.map((r) => ({
        ...r,
        from: Object.fromEntries(Object.entries(r.from || {}).map(([f, x]: [string, any]) => [f, [intern(columns, x.column), x.value]])),
        notes: Object.fromEntries(Object.entries(r.notes || {}).map(([f, n]) => [f, intern(notes, String(n))])),
        missing: (r.missing || []).map((m: any) => { missingLabels[m.field] = m.label; return m.field; }),
    }));
    return { ...out, rows, tables: { columns, notes, missingLabels } };
}

/**
 * What an update may change: only values that came from the file (or a value the
 * supplier set for the import). Empty cells never clear saved data, and the
 * importer's defaults — MOQ unit, unit type, currency — never travel on their own.
 */
export function updatePatch(product: any, values: Partial<Record<FieldKey, string>>): any {
    const patch: any = {};
    for (const [k, val] of Object.entries(product)) {
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length)) continue;
        patch[k] = val;
    }
    if (!values.moq && !values.moqUnit) delete patch.moqUnit;
    if (!values.unit) delete patch.unit;
    if (patch.supplierPrice === undefined) { delete patch.supplierCurrency; delete patch.price; }
    return patch;
}

/** Image type from the file's first bytes (the extension can't be trusted). */
export function sniffImage(b: Buffer): string | null {
    if (!b || b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (b.slice(0, 6).toString('ascii') === 'GIF87a' || b.slice(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
    if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}
