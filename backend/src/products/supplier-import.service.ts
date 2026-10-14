import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProductsService } from './products.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IMPORT_FIELDS, MAX_IMPORT_ROWS, buildRow, labelOf, type BuiltRow, type FieldKey, type Mapping } from './product-import';

export interface ImportRequest {
    headers: string[];
    rows: string[][];
    mapping: Mapping;
    currency?: string;
    moqUnit?: string;
    unit?: string;
    firstRow?: number;          // spreadsheet row number of rows[0]
    onExisting?: 'skip' | 'update';
}

const FIELD_KEYS = new Set(IMPORT_FIELDS.map((f) => f.key));

@Injectable()
export class SupplierImportService {
    private readonly logger = new Logger(SupplierImportService.name);
    constructor(private readonly products: ProductsService, private readonly notifications: NotificationsService) {}

    private checkRequest(req: ImportRequest) {
        if (!Array.isArray(req?.rows) || !req.rows.length) throw new BadRequestException('No rows to import.');
        if (req.rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
        const mapping: Mapping = {};
        const taken = new Map<FieldKey, string>();
        for (const [col, field] of Object.entries(req.mapping || {})) {
            if (!field) continue;
            if (!FIELD_KEYS.has(field as FieldKey)) throw new BadRequestException(`Unknown field “${field}”.`);
            if (taken.has(field as FieldKey)) throw new BadRequestException(`Two columns are mapped to ${labelOf(field as FieldKey)} (“${req.headers?.[Number(taken.get(field as FieldKey))]}” and “${req.headers?.[Number(col)]}”). Keep one.`);
            taken.set(field as FieldKey, col);
            mapping[col] = field;
        }
        const has = (k: FieldKey) => taken.has(k);
        const mappingWarnings: string[] = [];
        for (const f of IMPORT_FIELDS.filter((x) => x.required === 'yes')) {
            if (!has(f.key)) mappingWarnings.push(`No column for ${f.header} — every product will be saved as a draft until you add it.`);
        }
        if (!has('price') && !has('piecePrice')) mappingWarnings.push('No price column (Price per Case or Price per Piece) — products will be saved as drafts.');
        if (!has('stock') && !has('stockPieces')) mappingWarnings.push('No stock column — products will be saved as drafts.');
        if (!has('imageUrl')) mappingWarnings.push('No image column — products are saved as drafts; add photos by barcode lookup or upload afterwards.');
        return { mapping, mappingWarnings };
    }

    /** Build + validate every row; nothing is written. */
    async validate(supplierId: string, req: ImportRequest) {
        const { mapping, mappingWarnings } = this.checkRequest(req);
        const opts = { currency: String(req.currency || 'EUR').toUpperCase(), moqUnit: String(req.moqUnit || 'CASE').toUpperCase(), unit: String(req.unit || 'piece').toLowerCase() };
        const start = Number(req.firstRow) || 2;
        const built: BuiltRow[] = req.rows.map((cells, i) => buildRow(Array.isArray(cells) ? cells.map((c) => String(c ?? '')) : [], start + i, mapping, opts));

        // Duplicate barcodes inside the file: the first occurrence wins.
        const firstSeen = new Map<string, number>();
        for (const b of built) {
            const code = b.product.ean;
            if (!code) continue;
            if (firstSeen.has(code)) b.errors.push({ field: 'ean', label: 'Barcode (EAN/GTIN)', reason: `Same barcode as row ${firstSeen.get(code)} — each product once per file.` });
            else firstSeen.set(code, b.row);
        }
        const existing = await this.products.findMineByBarcodes(supplierId, [...firstSeen.keys()]);
        const byCode = new Map(existing.map((e) => [e.ean!, e]));

        const rows = built.map((b) => {
            const ex = b.product.ean ? byCode.get(b.product.ean) : undefined;
            const state = b.errors.length ? 'error' : b.missing.length ? 'draft' : 'ready';
            return {
                row: b.row, state,
                name: b.product.name, brand: b.product.brand, ean: b.product.ean, category: b.product.category,
                priceEur: b.product.price ?? null, stock: b.product.stock ?? null, origin: b.product.origin, exwLocation: b.product.exwLocation,
                weight: b.product.weight, moq: b.product.moq ?? null, moqUnit: b.product.moqUnit,
                imageStatus: b.product.images?.length ? 'from_file' : 'missing',
                errors: b.errors, missing: b.missing, warnings: b.warnings,
                existing: ex ? { id: ex.id, name: ex.name, status: ex.status } : null,
            };
        });
        const summary = {
            total: rows.length,
            ready: rows.filter((r) => r.state === 'ready' && !r.existing).length,
            draft: rows.filter((r) => r.state === 'draft' && !r.existing).length,
            error: rows.filter((r) => r.state === 'error').length,
            existing: rows.filter((r) => r.state !== 'error' && r.existing).length,
            missingImages: rows.filter((r) => r.imageStatus === 'missing').length,
        };
        return { rows, summary, mappingWarnings, built };
    }

    /**
     * Commit row by row. Each row is its own write, so a failure on one row
     * never hides or rolls back the others — the report lists exactly what was
     * saved. Re-uploading the same file is safe: rows whose barcode already
     * exists are skipped (or updated, if asked), never duplicated.
     */
    async commit(supplierId: string, req: ImportRequest) {
        const v = await this.validate(supplierId, req);
        const onExisting = req.onExisting === 'update' ? 'update' : 'skip';
        const results: any[] = [];
        let pending = 0;
        for (let i = 0; i < v.rows.length; i++) {
            const r = v.rows[i];
            const b = v.built[i];
            const base = { row: r.row, name: r.name, ean: r.ean };
            if (r.state === 'error') { results.push({ ...base, outcome: 'failed', reasons: r.errors.map((e) => e.reason) }); continue; }
            try {
                if (r.existing) {
                    if (onExisting === 'skip') { results.push({ ...base, outcome: 'skipped', productId: r.existing.id, reasons: ['A product with this barcode is already in your catalog.'] }); continue; }
                    // Only send filled values: an empty cell never clears saved data.
                    const patch: any = {};
                    for (const [k, val] of Object.entries(b.product)) {
                        if (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length)) continue;
                        patch[k] = val;
                    }
                    const saved: any = await this.products.supplierUpdate(r.existing.id, supplierId, patch, { submit: true });
                    if (saved.status === 'PENDING') pending++;
                    results.push({ ...base, outcome: 'updated', productId: saved.id, status: saved.status, missing: saved.missing?.map((m: any) => m.label) ?? [] });
                } else {
                    const created: any = await this.products.create({ ...b.product, supplierId } as any, false, true, { submit: true, actorId: supplierId });
                    if (created.status === 'PENDING') pending++;
                    results.push({ ...base, outcome: 'created', productId: created.id, status: created.status, missing: r.missing.map((m) => m.label), imageMissing: r.imageStatus === 'missing' });
                }
            } catch (e: any) {
                const msg = e?.response?.message || e?.message || 'Could not save this row.';
                this.logger.warn(`[import] row ${r.row}: ${msg}`);
                results.push({ ...base, outcome: 'failed', reasons: [Array.isArray(msg) ? msg.join(', ') : String(msg)] });
            }
        }
        if (pending) {
            this.notifications.notifyAdmins('Bulk products submitted', `${pending} product${pending === 1 ? '' : 's'} from a supplier import are waiting for review.`, 'INFO', { supplierId, count: pending }).catch(() => {});
        }
        const count = (o: string) => results.filter((x) => x.outcome === o).length;
        return {
            summary: {
                total: results.length,
                created: count('created'), updated: count('updated'), skipped: count('skipped'), failed: count('failed'),
                pendingReview: results.filter((x) => x.status === 'PENDING').length,
                drafts: results.filter((x) => x.status === 'DRAFT').length,
            },
            results,
        };
    }
}
