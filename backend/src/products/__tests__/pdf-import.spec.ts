import { MAX_PDF_BYTES, type PdfAnalysis } from '../pdf-import';
import { makePdf, priceListPdf, productSheetPdf } from './pdf-fixture';
import { fakes } from './import-fakes';
import { analyseInChild } from './pdf-child';

// Every PDF used below, read once in a child process (see pdf-child.ts).
const mixedPdf = makePdf([{ image: true }, { words: [
    { x: 30, y: 100, s: 'S/N' }, { x: 90, y: 100, s: 'Product' }, { x: 220, y: 100, s: 'EAN' }, { x: 300, y: 100, s: 'Pcs/Box' }, { x: 380, y: 100, s: 'Unit price' },
    { x: 32, y: 130, s: '1' }, { x: 60, y: 130, s: 'Crunchy Chips 55G' }, { x: 210, y: 130, s: '5941143028849' }, { x: 310, y: 130, s: '48' }, { x: 380, y: 130, s: '0.65' },
] }]);
let R: ReturnType<typeof analyseInChild>;
beforeAll(() => {
    R = analyseInChild({
        list: priceListPdf(), sheet: productSheetPdf(), mixed: mixedPdf,
        notPdf: Buffer.from('PK\x03\x04 not a pdf'), damaged: priceListPdf().slice(0, 400),
        tooLarge: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MAX_PDF_BYTES)]),
        scanned: makePdf([{ image: true }, { image: true }]),
        brochure: makePdf([{ words: [{ x: 50, y: 100, s: 'Spring brochure' }, { x: 50, y: 300, s: 'Hazel Spread 750g' }, { x: 300, y: 300, s: 'Choco Bar 100g' }] }]),
    });
}, 60_000);
const analysePdf = async (name: string): Promise<PdfAnalysis> => { const r = R[name]; if (!r.ok) throw new Error((r as any).code); return (r as any).value; };
const code = (name: string) => (R[name].ok ? 'ok' : (R[name] as any).code);

describe('PDF price lists', () => {
    it('rebuilds the table: wrapped names, "€" apart from the amount, page numbers, a page without header', async () => {
        const a = await analysePdf('list');
        expect(a.format).toBe('pdf');
        expect(a.pdf.textPages).toEqual([1, 2]);
        expect(a.sheets).toHaveLength(1);
        const s = a.sheets[0];
        expect(s.columns.map((c) => c.header)).toEqual(['S/N', 'Product', 'EAN Code', 'Pieces/ Carton', 'Cartons/ Pallet', 'Pieces/Pallet', 'Price at €']);
        expect(s.rows.map((r: any) => r.page)).toEqual([1, 1, 1, 1, 2, 2]);
        expect(s.rows[1].cells[1]).toBe('Crunchy Chips Salt & Vinegar 55G');
        expect((s.rows[1] as any).flags).toEqual(expect.arrayContaining([{ code: 'multiline', columns: ['Product'] }]));
        expect(s.rows[0].cells[6]).toBe('€ 0.65');
        expect(s.rows[2].cells[2]).toBe('');                           // no barcode: left empty, never invented
        expect((s.rows[4] as any).flags).toEqual(expect.arrayContaining([{ code: 'no_header_on_page', fromPage: 1 }, { code: 'barcode_spaces', column: 'EAN Code', value: '5941143 028818' }]));
        // The note under the table is kept as a note, not read as a product.
        expect(a.pdf.notes.map((n) => n.text)).toEqual(expect.arrayContaining(['MOQ 15 pallets mix']));
    });

    it('never assumes what a bare price is per', async () => {
        const a = await analysePdf('list');
        const price = a.columns.find((c) => c.header === 'Price at €')!;
        expect(price.field).toBeNull();
        expect(price.candidates).toEqual(['price', 'piecePrice']);
        expect(price.currency?.code).toBe('EUR');
        expect(a.columns.find((c) => c.header === 'Pieces/Pallet')!.field).toBe('unitsPerPallet');
        expect(a.columns.find((c) => c.header === 'S/N')!.field).toBe('rowNumber');
    });

    it('reads a one-product offer sheet as one row, flagged for checking', async () => {
        const a = await analysePdf('sheet');
        const s = a.sheets[0];
        expect(a.pdf.keyValuePages).toEqual([1]);
        const v = Object.fromEntries(s.columns.map((c) => [c.header, s.rows[0].cells[c.index]]));
        expect(v).toMatchObject({ Product: 'Brandy - Hazel Spread 750g', 'Price per Piece': '4,77€', 'EAN-Piece': '4008400404127', 'Quantity Pallets': '33', BBD: '31.07.2027' });
        expect((s.rows[0] as any).flags).toEqual([{ code: 'key_value' }]);
    });

    it('explains files it cannot read', async () => {
        expect(code('notPdf')).toBe('pdf_not_pdf');
        expect(code('damaged')).toBe('pdf_damaged');
        expect(code('tooLarge')).toBe('pdf_too_large');
        expect(code('scanned')).toBe('pdf_scanned');
        expect(code('brochure')).toBe('pdf_no_table');
    });

    it('reports scanned pages inside an otherwise readable PDF', async () => {
        const a = await analysePdf('mixed');
        expect(a.pdf.scannedPages).toEqual([1]);
        expect(a.sheets[0].rows).toHaveLength(1);
        expect(a.sheets[0].rows[0]).toMatchObject({ page: 2 });
    });
});

describe('PDF rows through validation', () => {
    it('flags duplicates with their page, case barcodes, and pallet arithmetic; pallets of stock become cases', async () => {
        const a = await analysePdf('list');
        const s = a.sheets[0];
        const key = (h: string) => s.columns.find((c) => c.header === h)!.key;
        const { svc } = fakes();
        const out = await svc.validate('sup1', {
            fileName: 'offer.pdf', format: 'pdf',
            sheets: [{ name: s.name, columns: s.columns, rows: s.rows as any }],
            mapping: { [key('Product')]: 'name', [key('EAN Code')]: 'ean', [key('Pieces/ Carton')]: 'unitsPerCase', [key('Cartons/ Pallet')]: 'casesPerPallet', [key('Pieces/Pallet')]: 'unitsPerPallet', [key('Price at €')]: 'piecePrice' },
            sources: { brand: { kind: 'constant', value: 'Crunchy' } },
        });
        const byRow = (n: number) => out.rows.find((r) => r.row === n)!;
        expect(byRow(4).errors.map((e) => e.reason).join(' ')).toMatch(/Same barcode as row 1 \(page 1\)/);
        expect(byRow(1).priceEur).toBeCloseTo(0.65 * 48, 4);              // per piece × pieces, as the supplier chose
        expect(byRow(3).missing.map((m) => m.field)).toContain('ean');        // missing barcode → draft, not invented
        expect(byRow(5).ean).toBe('5941143028818');                          // written with a space in the PDF
        expect(byRow(6).warnings.join(' ')).toMatch(/14 digits and starts with 1/);
        expect(byRow(6).warnings.join(' ')).toMatch(/Pieces per pallet in the file \(1,296\) ≠ .*18 × 70 = 1260/);
        expect(byRow(1).warnings.join(' ')).not.toMatch(/Pieces per pallet/); // 48 × 72 = 3,456 ✓
        expect(byRow(5).page).toBe(2);
    });

    it('a second barcode column must agree with the first', async () => {
        const { svc } = fakes();
        const out = await svc.validate('sup1', {
            sheets: [{ name: 'S', columns: [{ index: 0, key: 'ean', header: 'EAN' }, { index: 1, key: 'ean2', header: 'EAN Code' }, { index: 2, key: 'n', header: 'Name' }], rows: [{ row: 2, cells: ['50985098', '50985098', 'Mints A'] }, { row: 3, cells: ['57023335', '59070689', 'Mints B'] }] }],
            mapping: { ean: 'ean', ean2: 'eanCheck', n: 'name' },
        });
        expect(out.rows[0].errors).toHaveLength(0);
        expect(out.rows[1].errors.map((e) => e.reason).join(' ')).toMatch(/two barcode columns disagree/);
    });

    it('a price cell in another currency than the import is blocked, not converted', async () => {
        const { svc } = fakes();
        const out = await svc.validate('sup1', {
            sheets: [{ name: 'S', columns: [{ index: 0, key: 'n', header: 'Product' }, { index: 1, key: 'u', header: 'pcs in box' }, { index: 2, key: 'p', header: 'Column 9' }], rows: [{ row: 2, cells: ['Choco Bar 100g', '24', '€ 1.19'] }, { row: 3, cells: ['Choco Bar 50g', '24', '0.60'] }] }],
            mapping: { n: 'name', u: 'unitsPerCase', p: 'piecePrice' }, settings: { currency: 'RON' },
        });
        expect(out.rows[0].errors.map((e) => e.reason).join(' ')).toMatch(/is in EUR, but this import is set to RON/);
        expect(out.rows[1].errors).toHaveLength(0);
        const eur = await svc.validate('sup1', { sheets: [{ name: 'S', columns: [{ index: 0, key: 'n', header: 'Product' }, { index: 1, key: 'u', header: 'pcs in box' }, { index: 2, key: 'p', header: 'Column 9' }], rows: [{ row: 2, cells: ['Choco Bar 100g', '24', '€ 1.19'] }] }], mapping: { n: 'name', u: 'unitsPerCase', p: 'piecePrice' }, settings: { currency: 'EUR' } });
        expect(eur.rows[0].errors).toHaveLength(0);
        expect(eur.rows[0].priceEur).toBeCloseTo(1.19 * 24, 4);
    });

    it('pallets available become cases', async () => {
        const { svc } = fakes();
        const out = await svc.validate('sup1', {
            sheets: [{ name: 'S', columns: [{ index: 0, key: 'n', header: 'Product' }, { index: 1, key: 'c', header: 'Cartons/ Pallet' }, { index: 2, key: 'p', header: 'PALLETS AVAILABLE' }], rows: [{ row: 2, cells: ['Truffles 200G', '84', '15'] }] }],
            mapping: { n: 'name', c: 'casesPerPallet', p: 'stockPallets' },
        });
        expect(out.rows[0].stock).toBe(15 * 84);
    });
});
