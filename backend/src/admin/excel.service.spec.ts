import { ExcelService } from './excel.service';
import { CreateProductDto } from '../products/dto/create-product.dto';
import * as XLSX from 'xlsx';

function workbookBuffer(rows: any[][]): Buffer {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Products');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('ExcelService product import', () => {
    it('keeps Product Name and Description separate even if AI swaps them', async () => {
        const service = new ExcelService({
            detectColumnMapping: async () => ({
                headerRowIndex: 0,
                mapping: { 0: 'description', 1: 'name', 2: 'price', 3: 'stock' },
                confidence: 'high',
            }),
        } as any);

        const report = await service.processProductsExcel(workbookBuffer([
            ['Product Name', 'Description', 'UnitPriceEUR', 'Stock'],
            ['Pepsi Diet 150ml', 'Sugar-free soft drink in export-ready cartons.', 0.5, 100],
        ]), CreateProductDto);

        expect(report.successCount).toBe(1);
        expect(report.errorCount).toBe(0);
        expect(report.results[0].data.name).toBe('Pepsi Diet 150ml');
        expect(report.results[0].data.description).toBe('Sugar-free soft drink in export-ready cartons.');
        expect(report.results[0].data.brand).toBe('Pepsi');
        expect(report.results[0].data.weight).toBe('150ml');
    });

    it('creates a factual description when a supplier provides only a product name', async () => {
        const service = new ExcelService({
            detectColumnMapping: async () => ({
                headerRowIndex: 0,
                mapping: { 0: 'name', 1: 'price', 2: 'stock' },
                confidence: 'medium',
            }),
        } as any);

        const report = await service.processProductsExcel(workbookBuffer([
            ['Name', 'Price', 'Stock'],
            ['KitKat Mini 200g', 1.25, 48],
        ]), CreateProductDto);

        expect(report.successCount).toBe(1);
        expect(report.results[0].data.name).toBe('KitKat Mini 200g');
        expect(report.results[0].data.description).toContain('KitKat Mini 200g');
    });

    it('accepts standard supplier headers used by Parallel-style spreadsheets', async () => {
        const service = new ExcelService({ detectColumnMapping: async () => null } as any);

        const report = await service.processProductsExcel(workbookBuffer([
            ['UnitBarcode', 'Description', 'UnitPriceEUR', 'BBD', 'Units/Carton', 'Cartons/Pallet', 'MOQcartons'],
            ['4006381333931', 'Haribo Goldbears 200g', 0.8, '2027-12-31', 'C24', 60, 5],
        ]), CreateProductDto);

        expect(report.successCount).toBe(1);
        const data = report.results[0].data;
        expect(data.name).toBe('Haribo Goldbears 200g');
        expect(data.price).toBe(0.8);
        expect(data.ean).toBe('4006381333931');
        expect(data.unitsPerCase).toBe(24);
        expect(data.casesPerPallet).toBe(60);
        expect(data.moq).toBe(5);
    });
});
