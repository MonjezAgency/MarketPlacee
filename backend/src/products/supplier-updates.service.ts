import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from './products.service';
import { TO_EUR, normaliseBarcode } from './catalog-rules';
import { normaliseHeader, MAX_IMPORT_ROWS } from './product-import';

/**
 * Bulk PRICE and STOCK updates for products the supplier already has.
 * Update-only: rows are matched to the supplier's own products by Ali FMCG
 * ID or barcode; nothing is ever created. Blank cells mean "no change".
 * Prices are the supplier's own case price in the product's own currency
 * (a price update never changes the currency or the price basis).
 *
 * The downloadable file lists the current values in REFERENCE columns that
 * are never written back, and leaves the NEW columns empty — so a file
 * downloaded yesterday can't put back stock that orders have used since.
 */
type UpdField = 'id' | 'ean' | 'price' | 'currency' | 'stock' | 'name' | 'ref';
const UPD_ALIASES: Record<UpdField, string[]> = {
    id: ['ali fmcg id', 'ali fmcg product id', 'atlantis id', 'product id', 'atlantis product id', 'id'],
    ean: ['ean', 'barcode', 'ean code', 'gtin', 'upc', 'الباركود'],
    // "Price per Case" / "Stock (cases)" are the column names of the earlier file; still accepted.
    price: ['new price per case', 'price per case', 'case price', 'سعر الكرتونة الجديد', 'سعر الكرتونة'],
    currency: ['currency', 'العملة'],
    stock: ['new stock (cases)', 'new stock', 'stock (cases)', 'stock cases', 'stock', 'available stock', 'cases in stock', 'المخزون'],
    name: ['product name (reference only)', 'product name', 'name'],
    // Reference columns: shown for context, never applied.
    ref: ['current price per case', 'current stock (cases)', 'current stock', 'price basis', 'currency (reference)'],
};
export const UPDATE_COLUMNS = [
    { header: 'Ali FMCG ID', role: 'Do not change', width: 38, note: 'Matches the row to your product. Keep it exactly as downloaded.' },
    { header: 'EAN', role: 'Do not change', width: 16, note: 'Used to match the row when the Ali FMCG ID is empty.' },
    { header: 'Product Name', role: 'Reference', width: 44, note: 'For your reference — not changed by this file.' },
    { header: 'Currency (reference)', role: 'Reference', width: 12, note: 'Your listing’s currency. Prices are read in this currency; it can’t be changed here.' },
    { header: 'Current Price per Case', role: 'Reference', width: 18, note: 'Your current price for one case. Not applied.' },
    { header: 'New Price per Case', role: 'Edit', width: 18, note: 'Type the new price for one case. Leave empty to keep the current price.' },
    { header: 'Current Stock (cases)', role: 'Reference', width: 18, note: 'Stock when you downloaded the file. Not applied.' },
    { header: 'New Stock (cases)', role: 'Optional', width: 16, note: 'Whole cases available now. Leave empty to keep the current stock.' },
] as const;
const HELPER_WORDS = new Set(['do not change', 'reference', 'edit', 'optional', 'required']);
const AMBIGUOUS = new Set(['price', 'cost', 'unit price', 'quantity', 'qty', 'السعر', 'الكمية']);

export interface UpdateRequest { headers: string[]; rows: string[][]; firstRow?: number; fileName?: string }

/** One owner, or any of several (the Ali FMCG Catalog is owned by staff accounts). */
const owners = (id: string | string[]) => (Array.isArray(id) ? { in: id } : id);

@Injectable()
export class SupplierUpdatesService {
    private readonly logger = new Logger(SupplierUpdatesService.name);
    constructor(private readonly prisma: PrismaService, private readonly products: ProductsService, private readonly notifications: NotificationsService) {}

    /**
     * The update file. `blank` gives the empty template; otherwise every
     * product of the supplier (except rejected ones) with its current values
     * in the reference columns and the NEW columns left empty.
     */
    async template(supplierId: string | string[], blank = false): Promise<Buffer> {
        const rows: any[] = blank ? [] : await this.prisma.product.findMany({ where: { supplierId: owners(supplierId), status: { not: 'REJECTED' } }, orderBy: { name: 'asc' }, select: { id: true, ean: true, name: true, basePrice: true, stock: true, supplierCurrency: true, supplierPrice: true } as any });
        const aoa: any[][] = [UPDATE_COLUMNS.map((c) => c.header), UPDATE_COLUMNS.map((c) => c.role),
            ...rows.map((p) => [p.id, p.ean || '', p.name, p.supplierCurrency || 'EUR', p.supplierCurrency && p.supplierPrice ? p.supplierPrice : (p.basePrice ?? ''), '', p.stock ?? 0, ''])];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Barcodes as text so leading zeros survive.
        for (let r = 2; r < aoa.length; r++) { const ref = XLSX.utils.encode_cell({ r, c: 1 }); if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; } }
        ws['!cols'] = UPDATE_COLUMNS.map((c) => ({ wch: c.width }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Price & stock');
        const help = XLSX.utils.aoa_to_sheet([
            ['Column', 'Use', 'What to enter'],
            ...UPDATE_COLUMNS.map((c) => [c.header, c.role, c.note]),
            [],
            ['Recommended: download your catalog, type new values in “New Price per Case” (and, if needed, “New Stock (cases)”), then upload the same file.'],
            ['Keep “Ali FMCG ID” and “EAN” unchanged so every row updates the right product. Rows are never created from this file.'],
            ['Empty cells change nothing. Price is per case, in your listing’s currency. Stock is whole cases.'],
            ['You can also start from the blank template: add the Ali FMCG ID (or EAN) and the new values of only the products you want to change.'],
            ['Row 2 (Do not change / Reference / Edit / Optional) is a guide row and is skipped on upload.'],
        ]);
        help['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 90 }];
        XLSX.utils.book_append_sheet(wb, help, 'Instructions');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    private mapHeaders(headers: string[]) {
        const map: Partial<Record<UpdField, number>> = {};
        const problems: string[] = [];
        headers.forEach((h, i) => {
            const n = normaliseHeader(h);
            if (!n) return;
            if (AMBIGUOUS.has(n)) { problems.push(`Column “${h}” is ambiguous — rename it to “New Price per Case” or “New Stock (cases)”.`); return; }
            const f = (Object.keys(UPD_ALIASES) as UpdField[]).find((k) => UPD_ALIASES[k].map(normaliseHeader).includes(n));
            if (!f || f === 'ref') return;
            if (map[f] !== undefined) problems.push(`Two columns mean ${f === 'price' ? 'Price per Case' : f}: “${headers[map[f]!]}” and “${h}”. Keep one.`);
            else map[f] = i;
        });
        if (map.id === undefined && map.ean === undefined) problems.push('Add an “Ali FMCG ID” or “EAN” column so rows can be matched to your products.');
        if (map.price === undefined && map.stock === undefined) problems.push('Add a “New Price per Case” and/or “New Stock (cases)” column — there is nothing to update.');
        return { map, problems };
    }

    async preview(supplierId: string | string[], req: UpdateRequest) {
        if (!Array.isArray(req?.rows) || !req.rows.length) throw new BadRequestException('No rows in the file.');
        if (req.rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Update at most ${MAX_IMPORT_ROWS} rows at a time.`);
        const { map, problems } = this.mapHeaders(req.headers || []);
        if (problems.length) throw new BadRequestException({ code: 'MAPPING', message: problems.join(' '), problems });

        const mine: any[] = await this.prisma.product.findMany({ where: { supplierId: owners(supplierId) }, select: { id: true, supplierId: true, ean: true, name: true, status: true, basePrice: true, stock: true, supplierCurrency: true, supplierPrice: true } as any });
        const byId = new Map(mine.map((p) => [p.id, p]));
        const byEan = new Map<string, any[]>();
        for (const p of mine) if (p.ean) byEan.set(p.ean, [...(byEan.get(p.ean) || []), p]);

        const start = Number(req.firstRow) || 2;
        const seen = new Map<string, number>();
        const cell = (r: string[], f: UpdField) => (map[f] === undefined ? '' : String(r[map[f]!] ?? '').trim());
        // The guide row (Do not change / Reference / Edit …) and fully empty rows are skipped.
        const isHelper = (r: string[]) => { const v = (r || []).map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean); return v.length === 0 || v.every((x) => HELPER_WORDS.has(x)); };
        const rows = req.rows.map((r, i) => ({ r, row: start + i })).filter(({ r }) => !isHelper(r)).map(({ r, row }) => {
            const errors: string[] = [];
            let product: any = null;
            const id = cell(r, 'id'), ean = normaliseBarcode(cell(r, 'ean'));
            if (id) { product = byId.get(id) ?? null; if (!product) errors.push('This Ali FMCG ID isn’t one of your products.'); }
            else if (ean) {
                const hits = byEan.get(ean) || [];
                if (!hits.length) errors.push('No product of yours has this barcode. This file only updates existing products.');
                else if (hits.length > 1) errors.push('Several of your products share this barcode — add the Ali FMCG ID column to choose one.');
                else product = hits[0];
            } else errors.push('Row has no Ali FMCG ID or EAN.');
            if (product?.status === 'REJECTED') errors.push('Rejected listings can’t be updated.');
            if (product) { if (seen.has(product.id)) errors.push(`Same product as row ${seen.get(product.id)}.`); else seen.set(product.id, row); }

            const curBefore = product?.supplierCurrency || 'EUR';
            const priceBefore = product ? (product.supplierCurrency && product.supplierPrice ? product.supplierPrice : product.basePrice) : null;
            const rawPrice = cell(r, 'price'), rawCur = cell(r, 'currency').toUpperCase(), rawStock = cell(r, 'stock');
            let priceAfter: number | null = null, stockAfter: number | null = null;
            const currency = curBefore;
            // The currency (and per-case basis) of a listing never changes through a price update.
            if (rawCur && rawCur !== curBefore) errors.push(TO_EUR[rawCur] ? `Currency ${rawCur} differs from this product’s currency (${curBefore}). Enter the price in ${curBefore}, or change the currency in the product editor.` : `Currency “${rawCur}” isn’t supported.`);
            if (rawPrice) {
                const n = Number(rawPrice.replace(/[€$£\s]/g, '').replace(/^(\d+),(\d+)$/, '$1.$2'));
                if (!Number.isFinite(n) || n <= 0) errors.push(`Price “${rawPrice}” isn’t a valid price.`); else priceAfter = Math.round(n * 10000) / 10000;
            }
            if (rawStock) {
                const n = Number(rawStock);
                if (!Number.isInteger(n) || n < 0) errors.push(`Stock “${rawStock}” must be a whole number of cases (0 or more).`); else stockAfter = n;
            }
            const priceChanged = priceAfter !== null && priceAfter !== priceBefore;
            const stockChanged = stockAfter !== null && stockAfter !== product?.stock;
            return {
                row, productId: product?.id ?? null, ownerId: product?.supplierId ?? null, name: product?.name ?? cell(r, 'name') ?? null, ean: product?.ean ?? ean ?? null,
                price: { before: priceBefore, after: priceAfter, currencyBefore: curBefore, currency, changed: priceChanged },
                stock: { before: product?.stock ?? null, after: stockAfter, changed: stockChanged },
                state: errors.length ? 'error' : priceChanged || stockChanged ? 'change' : 'unchanged',
                fields: [...(priceChanged ? ['price'] : []), ...(stockChanged ? ['stock'] : [])],
                errors,
            };
        });
        return { rows, summary: { total: rows.length, changes: rows.filter((r) => r.state === 'change').length, unchanged: rows.filter((r) => r.state === 'unchanged').length, errors: rows.filter((r) => r.state === 'error').length } };
    }

    /**
     * `supplierId` is the supplier (their own catalog) or, for the Ali FMCG Catalog, the list of
     * staff accounts; each row is then saved as its own owner through the same rules (supplierUpdate).
     */
    async commit(supplierId: string | string[], req: UpdateRequest) {
        const p = await this.preview(supplierId, req);
        const results: any[] = [];
        const reason = `Bulk price/stock update${req.fileName ? ` (${String(req.fileName).slice(0, 80)})` : ''}`;
        for (const r of p.rows) {
            if (r.state === 'error') { results.push({ row: r.row, name: r.name, outcome: 'failed', reasons: r.errors }); continue; }
            if (r.state === 'unchanged') { results.push({ row: r.row, name: r.name, outcome: 'unchanged' }); continue; }
            const patch: any = { changeReason: reason };
            if (r.price.changed) { patch.supplierCurrency = r.price.currency; patch.supplierPrice = r.price.after; }
            if (r.stock.changed) patch.stock = r.stock.after;
            try {
                const saved: any = await this.products.supplierUpdate(r.productId!, Array.isArray(supplierId) ? r.ownerId! : supplierId, patch, {});
                results.push({ row: r.row, name: r.name, productId: r.productId, outcome: 'updated', status: saved.status });
            } catch (e: any) {
                const msg = e?.response?.message || e?.message || 'Could not update this row.';
                results.push({ row: r.row, name: r.name, outcome: 'failed', reasons: [Array.isArray(msg) ? msg.join(', ') : String(msg)] });
            }
        }
        const count = (o: string) => results.filter((x) => x.outcome === o).length;
        const summary = { total: results.length, updated: count('updated'), unchanged: count('unchanged'), failed: count('failed') };
        if (summary.failed && !Array.isArray(supplierId)) this.notifications.notifyUser(supplierId, 'Price & stock update: some rows failed', `${summary.failed} of ${summary.total} rows weren’t applied. Open Inventory & Products to see why and upload a corrected file.`, 'WARNING', { type: 'BULK_UPDATE' }).catch(() => {});
        return { summary, results };
    }
}
