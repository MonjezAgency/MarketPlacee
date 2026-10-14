import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from './products.service';
import { TO_EUR, normaliseBarcode } from './catalog-rules';
import { normaliseHeader, MAX_IMPORT_ROWS } from './product-import';

/**
 * Bulk PRICE and STOCK updates for products the supplier already has.
 * Update-only: rows are matched to the supplier's own products by Atlantis
 * ID or barcode; nothing is ever created. Blank cells mean "no change".
 * Prices are the supplier's own case price in the stated currency (the
 * product's recorded currency when the column is empty).
 */
type UpdField = 'id' | 'ean' | 'price' | 'currency' | 'stock' | 'name';
const UPD_ALIASES: Record<UpdField, string[]> = {
    id: ['atlantis id', 'product id', 'atlantis product id', 'id'],
    ean: ['ean', 'barcode', 'ean code', 'gtin', 'upc', 'الباركود'],
    price: ['price per case', 'case price', 'new price per case', 'سعر الكرتونة'],
    currency: ['currency', 'العملة'],
    stock: ['stock (cases)', 'stock cases', 'stock', 'available stock', 'cases in stock', 'المخزون'],
    name: ['product name (reference only)', 'product name', 'name'],
};
const AMBIGUOUS = new Set(['price', 'cost', 'unit price', 'quantity', 'qty', 'السعر', 'الكمية']);

export interface UpdateRequest { headers: string[]; rows: string[][]; firstRow?: number; fileName?: string }

@Injectable()
export class SupplierUpdatesService {
    private readonly logger = new Logger(SupplierUpdatesService.name);
    constructor(private readonly prisma: PrismaService, private readonly products: ProductsService, private readonly notifications: NotificationsService) {}

    /** Template pre-filled with the supplier's own catalog (current values). */
    async template(supplierId: string): Promise<Buffer> {
        const rows = await this.prisma.product.findMany({ where: { supplierId, status: { not: 'REJECTED' } }, orderBy: { name: 'asc' }, select: { id: true, ean: true, name: true, basePrice: true, stock: true, supplierCurrency: true, supplierPrice: true } as any });
        const aoa = [['Atlantis ID', 'EAN', 'Product Name (reference only)', 'Price per Case', 'Currency', 'Stock (cases)'],
            ...(rows as any[]).map((p) => [p.id, p.ean || '', p.name, p.supplierCurrency && p.supplierPrice ? p.supplierPrice : (p.basePrice ?? ''), p.supplierCurrency || 'EUR', p.stock ?? 0])];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        for (let r = 1; r < aoa.length; r++) { const ref = XLSX.utils.encode_cell({ r, c: 1 }); if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; } }
        ws['!cols'] = [{ wch: 38 }, { wch: 16 }, { wch: 44 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Price & stock');
        const help = XLSX.utils.aoa_to_sheet([['How to use'], ['Change Price per Case and/or Stock (cases). Leave a cell empty to keep the current value.'], ['Rows are matched by Atlantis ID (or EAN). Products are never created from this file.'], ['Price is your own price per case, in the Currency column. Stock is whole cases available now.'], ['Product Name is for reference only and is not changed.']]);
        XLSX.utils.book_append_sheet(wb, help, 'Instructions');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    private mapHeaders(headers: string[]) {
        const map: Partial<Record<UpdField, number>> = {};
        const problems: string[] = [];
        headers.forEach((h, i) => {
            const n = normaliseHeader(h);
            if (!n) return;
            if (AMBIGUOUS.has(n)) { problems.push(`Column “${h}” is ambiguous — rename it to “Price per Case” or “Stock (cases)”.`); return; }
            const f = (Object.keys(UPD_ALIASES) as UpdField[]).find((k) => UPD_ALIASES[k].map(normaliseHeader).includes(n));
            if (!f) return;
            if (map[f] !== undefined) problems.push(`Two columns mean ${f === 'price' ? 'Price per Case' : f}: “${headers[map[f]!]}” and “${h}”. Keep one.`);
            else map[f] = i;
        });
        if (map.id === undefined && map.ean === undefined) problems.push('Add an “Atlantis ID” or “EAN” column so rows can be matched to your products.');
        if (map.price === undefined && map.stock === undefined) problems.push('Add a “Price per Case” and/or “Stock (cases)” column — there is nothing to update.');
        return { map, problems };
    }

    async preview(supplierId: string, req: UpdateRequest) {
        if (!Array.isArray(req?.rows) || !req.rows.length) throw new BadRequestException('No rows in the file.');
        if (req.rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Update at most ${MAX_IMPORT_ROWS} rows at a time.`);
        const { map, problems } = this.mapHeaders(req.headers || []);
        if (problems.length) throw new BadRequestException({ code: 'MAPPING', message: problems.join(' '), problems });

        const mine: any[] = await this.prisma.product.findMany({ where: { supplierId }, select: { id: true, ean: true, name: true, status: true, basePrice: true, stock: true, supplierCurrency: true, supplierPrice: true } as any });
        const byId = new Map(mine.map((p) => [p.id, p]));
        const byEan = new Map<string, any[]>();
        for (const p of mine) if (p.ean) byEan.set(p.ean, [...(byEan.get(p.ean) || []), p]);

        const start = Number(req.firstRow) || 2;
        const seen = new Map<string, number>();
        const cell = (r: string[], f: UpdField) => (map[f] === undefined ? '' : String(r[map[f]!] ?? '').trim());
        const rows = req.rows.map((r, i) => {
            const row = start + i;
            const errors: string[] = [];
            let product: any = null;
            const id = cell(r, 'id'), ean = normaliseBarcode(cell(r, 'ean'));
            if (id) { product = byId.get(id) ?? null; if (!product) errors.push('This Atlantis ID isn’t one of your products.'); }
            else if (ean) {
                const hits = byEan.get(ean) || [];
                if (!hits.length) errors.push('No product of yours has this barcode. This file only updates existing products.');
                else if (hits.length > 1) errors.push('Several of your products share this barcode — add the Atlantis ID column to choose one.');
                else product = hits[0];
            } else errors.push('Row has no Atlantis ID or EAN.');
            if (product?.status === 'REJECTED') errors.push('Rejected listings can’t be updated.');
            if (product) { if (seen.has(product.id)) errors.push(`Same product as row ${seen.get(product.id)}.`); else seen.set(product.id, row); }

            const curBefore = product?.supplierCurrency || 'EUR';
            const priceBefore = product ? (product.supplierCurrency && product.supplierPrice ? product.supplierPrice : product.basePrice) : null;
            const rawPrice = cell(r, 'price'), rawCur = cell(r, 'currency').toUpperCase(), rawStock = cell(r, 'stock');
            let priceAfter: number | null = null, currency = rawCur || curBefore, stockAfter: number | null = null;
            if (rawCur && !TO_EUR[rawCur]) errors.push(`Currency “${rawCur}” isn’t supported.`);
            if (rawPrice) {
                const n = Number(rawPrice.replace(/[€$£\s]/g, '').replace(/^(\d+),(\d+)$/, '$1.$2'));
                if (!Number.isFinite(n) || n <= 0) errors.push(`Price “${rawPrice}” isn’t a valid price.`); else priceAfter = Math.round(n * 10000) / 10000;
            }
            if (rawStock) {
                const n = Number(rawStock);
                if (!Number.isInteger(n) || n < 0) errors.push(`Stock “${rawStock}” must be a whole number of cases (0 or more).`); else stockAfter = n;
            }
            const priceChanged = priceAfter !== null && (priceAfter !== priceBefore || currency !== curBefore);
            const stockChanged = stockAfter !== null && stockAfter !== product?.stock;
            return {
                row, productId: product?.id ?? null, name: product?.name ?? cell(r, 'name') ?? null, ean: product?.ean ?? ean ?? null,
                price: { before: priceBefore, after: priceAfter, currencyBefore: curBefore, currency, changed: priceChanged },
                stock: { before: product?.stock ?? null, after: stockAfter, changed: stockChanged },
                state: errors.length ? 'error' : priceChanged || stockChanged ? 'change' : 'unchanged',
                errors,
            };
        });
        return { rows, summary: { total: rows.length, changes: rows.filter((r) => r.state === 'change').length, unchanged: rows.filter((r) => r.state === 'unchanged').length, errors: rows.filter((r) => r.state === 'error').length } };
    }

    async commit(supplierId: string, req: UpdateRequest) {
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
                const saved: any = await this.products.supplierUpdate(r.productId!, supplierId, patch, {});
                results.push({ row: r.row, name: r.name, productId: r.productId, outcome: 'updated', status: saved.status });
            } catch (e: any) {
                const msg = e?.response?.message || e?.message || 'Could not update this row.';
                results.push({ row: r.row, name: r.name, outcome: 'failed', reasons: [Array.isArray(msg) ? msg.join(', ') : String(msg)] });
            }
        }
        const count = (o: string) => results.filter((x) => x.outcome === o).length;
        const summary = { total: results.length, updated: count('updated'), unchanged: count('unchanged'), failed: count('failed') };
        if (summary.failed) this.notifications.notifyUser(supplierId, 'Price & stock update: some rows failed', `${summary.failed} of ${summary.total} rows weren’t applied. Open Inventory & Products to see why and upload a corrected file.`, 'WARNING', { type: 'BULK_UPDATE' }).catch(() => {});
        return { summary, results };
    }
}
