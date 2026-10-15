import * as XLSX from 'xlsx';
import { SupplierUpdatesService, UPDATE_COLUMNS } from '../supplier-updates.service';

/** Bulk price/stock update with an in-memory Prisma double (no DB). */
const MINE = [
    { id: 'p-1', ean: '5449000000996', name: 'Cola 330 ml', status: 'APPROVED', basePrice: 10, stock: 100, supplierCurrency: 'EUR', supplierPrice: 10 },
    { id: 'p-2', ean: '5449000011527', name: 'Orange 330 ml', status: 'APPROVED', basePrice: 9, stock: 50, supplierCurrency: 'RON', supplierPrice: 45 },
    { id: 'p-3', ean: '4000000000001', name: 'Twin A', status: 'APPROVED', basePrice: 5, stock: 5, supplierCurrency: null, supplierPrice: null },
    { id: 'p-4', ean: '4000000000001', name: 'Twin B', status: 'APPROVED', basePrice: 5, stock: 5, supplierCurrency: null, supplierPrice: null },
    { id: 'p-5', ean: '4000000000002', name: 'Rejected', status: 'REJECTED', basePrice: 5, stock: 5, supplierCurrency: null, supplierPrice: null },
];
function setup() {
    const prisma: any = { product: { findMany: jest.fn(async ({ where }: any) => (where.supplierId === 'sup' ? MINE.filter((p) => !where.status || p.status !== 'REJECTED') : [])) } };
    const products: any = { supplierUpdate: jest.fn(async (id: string, _s: string, patch: any) => ({ id, status: 'APPROVED', ...patch })) };
    const notifications: any = { notifyUser: jest.fn(async () => ({})) };
    return { svc: new SupplierUpdatesService(prisma, products, notifications), prisma, products };
}
const H = UPDATE_COLUMNS.map((c) => c.header);
const helper = UPDATE_COLUMNS.map((c) => c.role);
const row = (o: Partial<Record<string, string>>) => H.map((h) => o[h] ?? '');

describe('Bulk price update — template', () => {
    it('catalog export: real identifiers and current values in reference columns, NEW columns left empty', async () => {
        const { svc } = setup();
        const wb = XLSX.read(await svc.template('sup'), { type: 'buffer' });
        const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Price & stock'], { header: 1, defval: '' });
        expect(rows[0]).toEqual(H);
        expect(rows[1]).toEqual(helper);
        const cola = rows.find((r) => r[0] === 'p-1')!;
        expect(cola).toEqual(['p-1', '5449000000996', 'Cola 330 ml', 'EUR', 10, '', 100, '']);
        expect(rows.find((r) => r[0] === 'p-2')!.slice(3, 5)).toEqual(['RON', 45]); // supplier's own currency + price
        expect(wb.SheetNames).toContain('Instructions');
    });
    it('blank template: same columns and guide row, no products', async () => {
        const { svc, prisma } = setup();
        const wb = XLSX.read(await svc.template('sup', true), { type: 'buffer' });
        const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Price & stock'], { header: 1, defval: '' });
        expect(rows).toHaveLength(2);
        expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
});

describe('Bulk price update — preview and apply', () => {
    it('re-uploading the downloaded catalog with one new price changes only that price', async () => {
        const { svc } = setup();
        const p = await svc.preview('sup', { headers: H, rows: [helper, row({ 'Atlantis ID': 'p-1', EAN: '5449000000996', 'Current Price per Case': '10', 'New Price per Case': '11.5', 'Current Stock (cases)': '100' }), row({ 'Atlantis ID': 'p-2', 'Current Stock (cases)': '50' })] });
        expect(p.summary).toEqual({ total: 2, changes: 1, unchanged: 1, errors: 0 });
        expect(p.rows[0]).toMatchObject({ row: 3, productId: 'p-1', state: 'change', fields: ['price'], price: { before: 10, after: 11.5, currency: 'EUR' }, stock: { changed: false } });
    });
    it('a stale "Current Stock" in the file never overwrites stock', async () => {
        const { svc } = setup();
        const p = await svc.preview('sup', { headers: H, rows: [row({ 'Atlantis ID': 'p-1', 'Current Stock (cases)': '999' })] });
        expect(p.rows[0].state).toBe('unchanged');
    });
    it('rejects unknown IDs, duplicates, invalid prices, ambiguous barcodes, rejected listings and a changed currency', async () => {
        const { svc } = setup();
        const p = await svc.preview('sup', { headers: H, rows: [
            row({ 'Atlantis ID': 'someone-elses-id', 'New Price per Case': '5' }),
            row({ 'Atlantis ID': 'p-1', 'New Price per Case': '12' }),
            row({ 'Atlantis ID': 'p-1', 'New Price per Case': '13' }),
            row({ EAN: '4000000000001', 'New Price per Case': '6' }),
            row({ 'Atlantis ID': 'p-2', 'New Price per Case': '-3' }),
            row({ 'Atlantis ID': 'p-5', 'New Price per Case': '6' }),
        ] });
        const errs = p.rows.map((r: any) => r.errors.join(' '));
        expect(errs[0]).toMatch(/isn’t one of your products/);
        expect(p.rows[1].state).toBe('change');
        expect(errs[2]).toMatch(/Same product as row/);
        expect(errs[3]).toMatch(/Several of your products share this barcode/);
        expect(errs[4]).toMatch(/isn’t a valid price/);
        expect(errs[5]).toMatch(/Rejected listings/);
        const cur = await svc.preview('sup', { headers: [...H, 'Currency'], rows: [[...row({ 'Atlantis ID': 'p-2', 'New Price per Case': '50' }), 'EUR']] });
        expect(cur.rows[0].errors.join(' ')).toMatch(/differs from this product’s currency \(RON\)/);
    });
    it('the earlier file format (Price per Case / Stock (cases)) still works', async () => {
        const { svc } = setup();
        const p = await svc.preview('sup', { headers: ['Atlantis ID', 'Price per Case', 'Stock (cases)'], rows: [['p-1', '10', '120']] });
        expect(p.rows[0]).toMatchObject({ state: 'change', fields: ['stock'] });
    });
    it('apply writes only the changed price, in the product’s own currency, with an audit reason; error rows are skipped', async () => {
        const { svc, products } = setup();
        const r = await svc.commit('sup', { headers: H, fileName: 'prices.xlsx', rows: [row({ 'Atlantis ID': 'p-2', 'New Price per Case': '47' }), row({ 'Atlantis ID': 'nope', 'New Price per Case': '1' })] });
        expect(r.summary).toEqual({ total: 2, updated: 1, unchanged: 0, failed: 1 });
        expect(products.supplierUpdate).toHaveBeenCalledTimes(1);
        expect(products.supplierUpdate.mock.calls[0][2]).toEqual({ changeReason: 'Bulk price/stock update (prices.xlsx)', supplierCurrency: 'RON', supplierPrice: 47 });
    });
    it('nothing is created: unmatched rows never reach the product service', async () => {
        const { svc, products } = setup();
        await svc.commit('sup', { headers: H, rows: [row({ EAN: '5000000000000', 'New Price per Case': '3' })] });
        expect(products.supplierUpdate).not.toHaveBeenCalled();
    });
});
