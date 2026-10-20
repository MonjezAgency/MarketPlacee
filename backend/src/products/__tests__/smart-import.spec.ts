import { fakes } from './import-fakes';
import * as XLSX from 'xlsx';
import { analyseWorkbook, decimalOf, readPictures, scoreHeader } from '../import-analysis';
import { ALL_FIELDS, buildFromValues, headerUnit, normaliseHeader, parseMoq, weightFromName } from '../product-import';
import { SupplierImportService, brandFromName, compactReview, sniffImage, updatePatch, type ImportRequest } from '../supplier-import.service';

/**
 * Fixtures mirror the structures of real supplier offers (two-row headers,
 * brand section rows, one sheet per manufacturer, "piece / case" barcode
 * cells, pictures placed on rows) without using any supplier's data.
 */
const opts = { currency: 'EUR', moqUnit: 'CASE' };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b30000000049454e44ae426082', 'hex');

/** Workbook like a manufacturer offer: title, two-row header with a merged group, EXW note, brand sections. */
function offerWithSections(): Buffer {
    const aoa: any[][] = [
        [], [], ['', '', '', 'ACME OFFER'], [],
        ['', '', 'Article Code', 'Unit EAN', 'Case EAN', 'Designation', 'Unit per Display', 'Display per case', 'Units per case', 'Unit Weight (G)', 'Palletization', '', '', ''],
        ['', 'EXW SPAIN', '', '', '', '', '', '', '', '', 'Cases per Pallet', 'Cases per Layer', 'Layers per Pallet', ' Price '],
        [],
        ['', '', 'LOLLY'],
        ['', '', '100001', '5000000000005', '15000000000002', 'LOLLY STRAWBERRY 10X12G', 10, 6, 60, 12, 135, 15, 9, 0.80001],
        ['', '', '100002', '-', '15000000000019', 'LOLLY COLA 10X12G', 10, 6, 60, 12, 135, 15, 9, 0.8],
        ['', '', '100003', '5000000000012', '15000000000026', 'LOLLY BIG TUB 200X12G', 200, 1, 200, 12, 75, 15, 5, 17.8],
        [],
        ['', '', 'MINTS'],
        ['', '', '200001', '5000000000029', '15000000000033', 'MINTS PEPPERMINT 35G', 12, 12, 144, 40, 99, 11, 9, 1.3],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s: { r: 4, c: 10 }, e: { r: 4, c: 12 } }];
    // Prices show 3 decimals, as in the real offer ("0.800 €").
    for (let r = 8; r <= 13; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 13 })]; if (c) c.z = '0.000 "€"'; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Workbook with one sheet per manufacturer, combined barcodes, text MOQs and stray rows. */
function multiSheetOffer(): Buffer {
    const head = ['N/S', 'Product description', 'Case Count', 'Cases per layer', 'Cases per Pallet', 'EAN piece / EAN case', 'Min. shelf life upon arrival at our warehouse', 'MOQ', 'Product image', 'Price / pce. \r\nin EUR'];
    const a = [head,
        [1, 'Crunchy Biscuits Original 200g ', '24', '8', '40', '5000000000036 / 15000000000040', '200', 'full pallets ', '', 1.14926875],
        [2, 'Crunchy Biscuits Cocoa 125g ', '12', '21', '147', '5000000000043 / 15000000000057', '200', 'full layers ', '', 1.69],
        [3, ' ', '', '', '', '', '', '', '', 5.97],
    ];
    const b = [head,
        [1, 'Gummy Bears 100g ', '30', '15', '90', '5000000000050 / 15000000000064', '256', '1 pal', '', 0.5],
        [2, 'Gummy Bears 100g ', '30', '15', '90', '5000000000050 / ', '256', 'full pallets', '', 0.5],
        [3, 'Gummy Rings 1kg ', '6', '8', '24', '5000000000067 / 15000000000071', '240', 'on request', '', 9.9],
    ];
    const wb = XLSX.utils.book_new();
    const w1 = XLSX.utils.aoa_to_sheet(a); w1['J2'].z = '"€ "0.00';
    XLSX.utils.book_append_sheet(wb, w1, 'Biscuits Co');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b), 'Gummies');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Adds a picture anchored on a given 0-based row/col of sheet 1 — as Excel stores "Insert → Picture". */
function withPicture(buf: Buffer, row0: number, col0: number): Buffer {
    const cfb = XLSX.CFB.read(buf, { type: 'buffer' });
    const add = (p: string, s: string | Buffer) => XLSX.CFB.utils.cfb_add(cfb, p, typeof s === 'string' ? Buffer.from(s) : s);
    add('/xl/worksheets/_rels/sheet1.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    add('/xl/drawings/drawing1.xml', `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${col0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${col0}</xdr:col><xdr:colOff>9000</xdr:colOff><xdr:row>${row0}</xdr:row><xdr:rowOff>9000</xdr:rowOff></xdr:to><xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
    add('/xl/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>');
    add('/xl/media/image1.png', Buffer.alloc(0)); // the browser keeps the bytes; only the position travels
    return Buffer.from(XLSX.CFB.write(cfb, { type: 'buffer', fileType: 'zip' }) as any);
}

describe('header matching with evidence', () => {
    it('exact names are certain; names containing a known phrase are suggestions', () => {
        expect(scoreHeader('Designation')).toMatchObject({ field: 'name', confidence: 'high' });
        expect(scoreHeader('Case Count')).toMatchObject({ field: 'unitsPerCase', confidence: 'high' });
        expect(scoreHeader('Unit Weight (G)')).toMatchObject({ field: 'weight', confidence: 'medium' });
        expect(scoreHeader('Price / pce. \r\nin EUR')).toMatchObject({ field: 'piecePrice', confidence: 'medium' });
        expect(scoreHeader('Min. shelf life upon arrival at our warehouse')).toMatchObject({ field: 'shelfLife' });
        expect(scoreHeader('EAN piece / EAN case')).toMatchObject({ field: 'eanPair', confidence: 'high' });
    });
    it('never picks between two meanings', () => {
        expect(scoreHeader(' Price ')).toMatchObject({ field: null, candidates: ['price', 'piecePrice'] });
        expect(scoreHeader('Quantity')).toMatchObject({ field: null });
        expect(scoreHeader('Mystery column')).toMatchObject({ field: null, confidence: 'none' });
    });
    it('every alias (product fields and recognised extras) belongs to exactly one field', () => {
        const seen = new Map<string, string>();
        for (const f of ALL_FIELDS) for (const a of [f.header, ...f.aliases]) {
            const n = normaliseHeader(a);
            if (seen.has(n)) expect(`${n} → ${seen.get(n)}`).toBe(`${n} → ${f.key}`);
            seen.set(n, f.key);
        }
    });
});

describe('reading real-world layouts', () => {
    it('two-row headers with a merged group, an EXW note, brand sections and placeholder dashes', () => {
        const a = analyseWorkbook(offerWithSections(), 'ACME OFFER.xlsx');
        const s = a.sheets[0];
        expect(s.headerRows).toEqual([5, 6]);
        expect(s.sections).toEqual(['LOLLY', 'MINTS']);
        expect(s.rows.map((r) => r.section)).toEqual(['LOLLY', 'LOLLY', 'LOLLY', 'MINTS']);
        expect(a.hints).toEqual([expect.objectContaining({ field: 'exwLocation', value: 'Spain' })]);
        const col = (h: string) => a.columns.find((c) => c.header.trim() === h)!;
        expect(col('Cases per Pallet')).toMatchObject({ field: 'casesPerPallet', parent: 'Palletization' });
        expect(col('Cases per Layer')).toMatchObject({ field: 'casesPerLayer' });
        expect(col('Unit EAN').checks.join(' ')).toMatch(/100% valid barcodes/);   // "-" isn't counted as a value
        expect(col('Price')).toMatchObject({ field: null, confidence: 'low' });
        expect(col('Price').candidates).toEqual(['price', 'piecePrice', 'displayPrice']); // display columns exist
        expect(col('Price').currency).toMatchObject({ code: 'EUR' });
        expect(col('Price').hiddenDecimals).toMatchObject({ count: 1, example: { shown: '0.800 €', exact: '0.80001' } });
    });
    it('several sheets, combined barcodes, a description column used as the name, stray rows reported', () => {
        const a = analyseWorkbook(multiSheetOffer(), 'offer.xlsx');
        expect(a.sheets.map((s) => s.name)).toEqual(['Biscuits Co', 'Gummies']);
        expect(a.sheets[0].rows).toHaveLength(2);
        expect(a.sheets[0].skipped).toEqual([expect.objectContaining({ row: 4, reason: expect.stringMatching(/Only 2 values/) })]);
        const col = (h: string) => a.columns.find((c) => c.header.replace(/\s+/g, ' ').trim() === h)!;
        expect(col('EAN piece / EAN case')).toMatchObject({ field: 'eanPair' });
        expect(col('Product description')).toMatchObject({ field: 'name', confidence: 'medium' });
        expect(col('Price / pce. in EUR')).toMatchObject({ field: 'piecePrice', currency: { code: 'EUR' } });
        expect(col('N/S')).toMatchObject({ field: 'rowNumber' });
        expect(col('Price / pce. in EUR').sheets).toEqual(['Biscuits Co', 'Gummies']);
    });
    it('a picture placed on a row belongs to that product; the picture column is not "empty"', () => {
        const buf = withPicture(multiSheetOffer(), 2, 8); // row 3 (1-based) = second product, column "Product image"
        expect(readPictures(buf).get('Biscuits Co')).toEqual([{ path: 'xl/media/image1.png', fromRow: 3, toRow: 3, col: 8 }]);
        const s = analyseWorkbook(buf, 'offer.xlsx').sheets[0];
        expect(s.rows.find((r) => r.row === 3)!.images).toEqual(['xl/media/image1.png']);
        expect(s.rows.find((r) => r.row === 2)!.images).toBeUndefined();
        expect(s.emptyColumns).not.toContain('Product image');
    });
    it('decimal separators are read from values that can only mean one thing', () => {
        expect(decimalOf(['0.334', '1.057'])).toBe('.');
        expect(decimalOf(['1,25', '0,80'])).toBe(',');
        expect(decimalOf(['1.057', '2.400'])).toBe('ambiguous');
        expect(decimalOf(['12', '24'])).toBeUndefined();
    });
    it('rejects other file types', () => {
        expect(() => analyseWorkbook(Buffer.from('x'), 'x.pdf')).toThrow(/xlsx/);
    });
});

describe('reading values', () => {
    it('text MOQs: pallets and trucks directly, layers only with cases per layer, anything else is not guessed', () => {
        expect(parseMoq('full pallets ', 'CASE')).toMatchObject({ moq: 1, unit: 'PALLET' });
        expect(parseMoq('1 pal', 'CASE')).toMatchObject({ moq: 1, unit: 'PALLET' });
        expect(parseMoq('10', 'CASE')).toMatchObject({ moq: 10, unit: 'CASE' });
        expect(parseMoq('full layers', 'CASE', 21)).toMatchObject({ moq: 21, unit: 'CASE', note: expect.stringMatching(/1 layer × 21 cases/) });
        expect(parseMoq('full layers', 'CASE')).toMatchObject({ problem: expect.stringMatching(/Cases per Layer/) });
        expect(parseMoq('on request', 'CASE')).toMatchObject({ problem: expect.stringMatching(/isn’t understood/) });
    });
    it('weights from a header unit or a product name', () => {
        expect(headerUnit('Unit Weight (G)')).toBe('g');
        expect(weightFromName('KitKat Multipack 10x41,5g')).toBe('10 x 41.5 g');
        expect(weightFromName('Red Band Bubble Fizz 100 pcs. 1kg')).toBe('1 kg');
        expect(weightFromName('TRDNT 43.5G SPEARMINT BAG 24CA')).toBe('43.5 g');
        expect(weightFromName('MENTOS GUM 12X10 M.P.B FRESH MINT')).toBeNull();
    });
    it('a row from a sectioned offer: header unit, display price, cross-checks, name/weight mismatch', () => {
        const r = buildFromValues({ name: 'LOLLY STRAWBERRY 10X12G', ean: '5000000000005', unitsPerCase: '60', unitsPerDisplay: '10', displaysPerCase: '5', weight: '12', displayPrice: '8', casesPerPallet: '135', casesPerLayer: '15', layersPerPallet: '8' },
            8, opts, { headers: { weight: 'Unit Weight (G)' } });
        expect(r.errors).toEqual([]);
        expect(r.product.weight).toBe('12 g');
        expect(r.product.price).toBe(40);                     // 8 per display × 5 displays
        expect(r.notes.price).toMatch(/per display/);
        expect(r.warnings.join(' ')).toMatch(/10 × 5 = 50/);   // pieces per case ≠ display maths
        expect(r.warnings.join(' ')).toMatch(/15 × 8 = 120/);  // cases per pallet ≠ layer maths
        const m = buildFromValues({ name: 'MINTS SOUR 140G', weight: '160', ean: '5000000000029' }, 9, opts, { headers: { weight: 'Unit Weight (G)' } });
        expect(m.warnings.join(' ')).toMatch(/doesn’t match the name/);
    });
    it('placeholders are empty (draft), not data; a dropped leading zero is explained, not fixed', () => {
        const r = buildFromValues({ name: 'Cola 10x12g', ean: '-', unitsPerCase: '12' }, 3, opts);
        expect(r.errors).toEqual([]);
        expect(r.missing.map((m) => m.field)).toContain('ean');
        expect(r.warnings.join(' ')).toMatch(/Read as empty: EAN “-”/);
        const u = buildFromValues({ name: 'Peanut Cups 77g', eanPair: '34000702459 /' }, 4, opts);
        expect(u.errors[0].reason).toMatch(/034000702459 has a valid check digit/);
        expect(u.product.ean).toBe('34000702459'); // kept as typed
    });
    it('a barcode the spreadsheet shortened is refused', () => {
        const r = buildFromValues({ name: 'Nippon 200g', ean: '4.0217E+12' }, 5, opts);
        expect(r.errors[0].reason).toMatch(/shortened/);
    });
    it('combined barcode cells: piece code is the product barcode, case code is kept and checked', () => {
        const r = buildFromValues({ name: 'Biscuits 200g', eanPair: '5000000000036 / 15000000000041' }, 2, opts);
        expect(r.product.ean).toBe('5000000000036');
        expect(r.aux.caseEan).toBe('15000000000041');
        expect(r.warnings.join(' ')).toMatch(/Case barcode 15000000000041: barcode check digit is wrong/);
    });
    it('shelf life in days from the column header', () => {
        expect(buildFromValues({ shelfLife: '200' }, 2, opts, { headers: { shelfLife: 'Min. shelf life upon arrival at our warehouse' } }).product.shelfLife).toBe('min. 200 days');
    });
});

describe('brand from the product name', () => {
    it('longest known brand at the start, accents and apostrophes ignored', () => {
        const known = ['Kinder', 'Kinder Bueno', "Kellogg's", 'Nutella'];
        expect(brandFromName('Kinder Bueno White 39g', known)).toBe('Kinder Bueno');
        expect(brandFromName('Kellogg’s Trésor 410g', known)).toBe("Kellogg's");
        expect(brandFromName('Weetabix Original 430g', known)).toBeNull();
    });
});

// ─── Service: validate & commit ─────────────────────────────────────────


function requestFrom(buf: Buffer, file: string, extra: Partial<ImportRequest> = {}): ImportRequest {
    const a = analyseWorkbook(buf, file);
    const mapping: Record<string, any> = {};
    for (const c of a.columns) mapping[c.key] = c.field && c.confidence !== 'low' ? c.field : '';
    return { fileName: file, sheets: a.sheets.map((s) => ({ name: s.name, columns: s.columns, rows: s.rows })), mapping, settings: { currency: 'EUR', moqUnit: 'CASE' }, ...extra };
}

describe('import review', () => {
    it('applies the supplier’s sources and reports what is missing — nothing is invented', async () => {
        const { svc } = fakes();
        const req = requestFrom(offerWithSections(), 'ACME OFFER.xlsx', {
            mapping: { ...requestFrom(offerWithSections(), 'x.xlsx').mapping, price: 'piecePrice' },
            sources: { brand: { kind: 'section' }, exwLocation: { kind: 'constant', value: 'Spain' }, stock: { kind: 'constant', value: '50' } },
        });
        const v = await svc.validate('sup', req);
        const first = v.rows[0];
        expect(first).toMatchObject({ brand: 'LOLLY', exwLocation: 'Spain', stock: 50, weight: '12 g', ean: '5000000000005' });
        expect(first.notes.brand).toMatch(/heading “LOLLY”/);
        expect(first.from.name).toEqual({ column: 'Designation', value: 'LOLLY STRAWBERRY 10X12G' });
        expect(first.missing.map((m: any) => m.field)).toEqual(expect.arrayContaining(['category', 'origin', 'moq', 'images']));
        expect(v.rows[1].missing.map((m: any) => m.field)).toContain('ean');  // "-" → draft, not error
        expect(v.notProvided).toEqual(expect.arrayContaining(['Category', 'Country of Origin', 'MOQ']));
        expect(v.mapping.find((m: any) => m.field === 'supplierSku')).toMatchObject({ stored: false });
    });
    it('duplicates across sheets are blocked; a second barcode for the same name is flagged; MOQ text converted', async () => {
        const { svc } = fakes();
        const v = await svc.validate('sup', requestFrom(multiSheetOffer(), 'offer.xlsx', { sources: { brand: { kind: 'fromName', perSheet: { Gummies: 'Gummy Co' } } } }));
        const by = (sheet: string, row: number) => v.rows.find((r: any) => r.sheet === sheet && r.row === row)!;
        expect(by('Gummies', 3).errors[0].reason).toMatch(/Same barcode as sheet “Gummies” row 2/);
        expect(by('Biscuits Co', 2)).toMatchObject({ moq: 1, moqUnit: 'PALLET', brand: 'Crunchy' });
        expect(by('Biscuits Co', 3)).toMatchObject({ moq: 21, moqUnit: 'CASE' });
        expect(by('Biscuits Co', 3).notes.moq).toMatch(/layer/);
        expect(by('Gummies', 2)).toMatchObject({ brand: 'Gummy Co' });
        expect(by('Gummies', 2).notes.brand).toMatch(/No brand in the name — set by you for sheet “Gummies”/);
        expect(by('Gummies', 4).warnings.join(' ')).toMatch(/on request/);
        expect(by('Gummies', 4).moq).toBeNull();
        expect(by('Biscuits Co', 2).priceEur).toBeCloseTo(1.14926875 * 24, 4);  // exact value by default
    });
    it('the supplier can choose the price a cell shows instead of its hidden decimals', async () => {
        const { svc } = fakes();
        const v = await svc.validate('sup', requestFrom(multiSheetOffer(), 'offer.xlsx', { settings: { currency: 'EUR', pricePrecision: 'shown' } }));
        expect(v.rows[0].priceEur).toBeCloseTo(1.15 * 24, 4);
    });
    it('existing products: old → new changes, big price moves flagged, unchanged rows left alone, rejected never updated', async () => {
        const existing = [
            { id: 'e1', ean: '5000000000036', name: 'Crunchy Biscuits Original 200g', status: 'APPROVED', unitsPerCase: 24, casesPerPallet: 40, supplierPrice: 10, supplierCurrency: 'EUR', basePrice: 10, moq: 1, moqUnit: 'PALLET', shelfLife: 'min. 200 days', weight: '200 g', images: ['https://x/y.jpg'] },
            { id: 'e2', ean: '5000000000043', name: 'Crunchy Biscuits Cocoa 125g', status: 'REJECTED' },
        ];
        const { svc } = fakes(existing);
        const v = await svc.validate('sup', requestFrom(multiSheetOffer(), 'offer.xlsx', { onExisting: 'update', sources: { weight: { kind: 'fromName' } } }));
        const r1 = v.rows[0];
        expect(r1.state).toBe('update');
        expect(r1.changes).toEqual([expect.objectContaining({ field: 'price', from: '10.00', to: '27.58' })]);
        expect(r1.warnings.join(' ')).toMatch(/changes by \+176%/);
        // completeness is judged on the saved product plus the file — not on the row alone
        expect(r1.missing.map((m: any) => m.field)).not.toContain('images');
        expect(r1.missing.map((m: any) => m.field)).toEqual(expect.arrayContaining(['category', 'stock']));
        expect(v.rows[1].state).toBe('error');
        expect(v.rows[1].errors[0].reason).toMatch(/rejected/);
        const skip = await svc.validate('sup', requestFrom(multiSheetOffer(), 'offer.xlsx', { onExisting: 'skip' }));
        expect(skip.rows[0].state).toBe('skip');
    });
    it('a price far from the rest of the file (per kg) is flagged — typically a price on another basis', async () => {
        const { svc } = fakes();
        const rows = Array.from({ length: 9 }, (_, i) => ({ row: i + 2, cells: [`Lolly ${i} 12g`, String(5000000000005 + i * 0), '60', i === 8 ? '17.8' : '0.08'] }));
        const v = await svc.validate('sup', {
            sheets: [{ name: 'S', columns: [{ index: 0, key: 'name', header: 'Name' }, { index: 1, key: 'ean', header: 'EAN' }, { index: 2, key: 'units per case', header: 'Units per case' }, { index: 3, key: 'price', header: 'Price' }], rows }],
            mapping: { name: 'name', 'units per case': 'unitsPerCase', price: 'piecePrice' }, sources: { weight: { kind: 'fromName' } },
        });
        expect(v.rows[8].warnings.join(' ')).toMatch(/Price looks unusual: €1483\.33 per kg, against about €6\.67/);
        expect(v.rows[0].warnings.join(' ')).not.toMatch(/unusual/);
    });
    it('the review is sent compactly and expands back without loss', async () => {
        const { svc } = fakes();
        const { built, ...out } = await svc.validate('sup', requestFrom(multiSheetOffer(), 'offer.xlsx', { sources: { brand: { kind: 'fromName' } } }));
        void built;
        const c = compactReview(out);
        expect(JSON.stringify(c).length).toBeLessThan(JSON.stringify(out).length);
        const t = c.tables;
        const back = c.rows.map((r: any) => ({
            ...r,
            from: Object.fromEntries(Object.entries(r.from).map(([f, x]: [string, any]) => [f, { column: t.columns[x[0]], value: x[1] }])),
            notes: Object.fromEntries(Object.entries(r.notes).map(([f, n]: [string, any]) => [f, t.notes[n]])),
            missing: r.missing.map((m: string) => ({ field: m, label: t.missingLabels[m] })),
        }));
        expect(back.map((r: any) => r.from)).toEqual(out.rows.map((r: any) => r.from));
        expect(back.map((r: any) => r.notes)).toEqual(out.rows.map((r: any) => r.notes));
        expect(back.map((r: any) => r.missing)).toEqual(out.rows.map((r: any) => r.missing.map((m: any) => ({ field: m.field, label: m.label }))));
    });
    it('two columns set to the same field in one sheet are refused', async () => {
        const { svc } = fakes();
        const req = requestFrom(multiSheetOffer(), 'offer.xlsx');
        req.mapping['case count'] = 'unitsPerCase'; req.mapping['cases per layer'] = 'unitsPerCase';
        await expect(svc.validate('sup', req)).rejects.toThrow(/two columns are set to Pieces per Case/);
    });
    it('only sources that make sense are accepted', async () => {
        const { svc } = fakes();
        await expect(svc.validate('sup', requestFrom(multiSheetOffer(), 'x.xlsx', { sources: { ean: { kind: 'constant', value: '5000000000036' } } as any }))).rejects.toThrow(/can’t take its value/);
    });
});

describe('import commit', () => {
    const base = () => requestFrom(withPicture(multiSheetOffer(), 1, 8), 'offer.xlsx', {
        sources: { category: { kind: 'constant', value: 'Snacks & Biscuits' }, origin: { kind: 'constant', value: 'Germany' }, exwLocation: { kind: 'constant', value: 'Hamburg, Germany' }, stock: { kind: 'constant', value: '40' }, brand: { kind: 'fromName', value: 'Gummy Co' }, weight: { kind: 'fromName' } },
    });
    it('Atlantis Catalog mode: owned by the platform, matched against staff products only, complete rows published, no supplier review notice', async () => {
        const f = fakes();
        f.products.updateStatus = jest.fn(async (id: string, status: string) => ({ id, status }));
        const actor = { id: 'admin-1', role: 'ADMIN' };
        const out = await f.svc.commit('platform', { ...base(), last: true, startedAt: new Date().toISOString() }, [{ originalname: 'image1.png', buffer: PNG, mimetype: 'image/png', size: PNG.length }], { catalog: { ownerIds: ['platform', 'admin-1'], actor } });
        expect(f.products.findMineForImport.mock.calls[0][0]).toEqual(['platform', 'admin-1']); // duplicates: staff-owned products only
        expect(f.created[0]).toMatchObject({ supplierId: 'platform' });
        expect(f.products.create.mock.calls[0][3]).toMatchObject({ actorId: 'admin-1', actorRole: 'ADMIN' });
        expect(f.products.updateStatus).toHaveBeenCalledWith(expect.any(String), 'APPROVED', '', actor, { notify: false });
        expect(out.results[0]).toMatchObject({ outcome: 'created', status: 'APPROVED' });
        expect(out.summary.published).toBe(1);
        expect(f.notifications.notifyAdmins).not.toHaveBeenCalled();
        expect(f.sources[0][1]).toBe('admin-1'); // import source recorded under the admin who ran it
    });
    it('Atlantis Catalog mode: an existing catalog product is updated as its own staff owner, never as another account', async () => {
        const existing = [{ id: 'cat-1', supplierId: 'owner-2', ean: '5000000000036', name: 'Crunchy Biscuits Original 200g', status: 'APPROVED', images: ['https://cdn.example.com/a.jpg'] }];
        const f = fakes(existing);
        f.products.updateStatus = jest.fn(async (id: string, status: string) => ({ id, status }));
        await f.svc.commit('platform', { ...base(), onExisting: 'update' }, [], { catalog: { ownerIds: ['platform', 'owner-2'], actor: { id: 'admin-1', role: 'ADMIN' } } });
        expect(f.products.supplierUpdate.mock.calls.every((c: any[]) => c[1] === 'owner-2')).toBe(true);
    });
    it('stores the row’s picture first, so a complete product goes to review; the original row is kept', async () => {
        const f = fakes();
        const out = await f.svc.commit('sup', { ...base(), last: true, startedAt: new Date().toISOString() }, [{ originalname: 'image1.png', buffer: PNG, mimetype: 'image/png', size: PNG.length }]);
        expect(f.uploads).toEqual(['import-image1.png']);
        expect(f.created[0]).toMatchObject({ name: 'Crunchy Biscuits Original 200g', images: ['https://cdn.example.com/import-image1.png'], price: expect.any(Number) });
        expect(f.products.create.mock.calls[0][3]).toMatchObject({ noInference: true }); // nothing filled in from the name on save
        expect(out.results[0]).toMatchObject({ outcome: 'created', status: 'PENDING', imageMissing: false });
        expect(f.sources[0][2]).toMatchObject({ file: 'offer.xlsx', sheet: 'Biscuits Co', row: 2, columns: expect.objectContaining({ 'EAN piece / EAN case': '5000000000036 / 15000000000040', 'N/S': '1' }) });
        expect(out.summary.failed).toBe(1);                       // the duplicate barcode row
        expect(f.notifications.notifyAdmins).toHaveBeenCalledTimes(1); // once per import, counted from the database
    });
    it('a picture that can’t be stored leaves a draft with a reason — never a silent loss', async () => {
        const f = fakes();
        const out = await f.svc.commit('sup', base(), [{ originalname: 'image1.png', buffer: Buffer.from('not an image at all'), mimetype: 'image/png', size: 19 }]);
        expect(out.results[0]).toMatchObject({ outcome: 'created', imageMissing: true });
        expect(out.results[0].missing).toContain('Product image');
        expect(out.results[0].notes.join(' ')).toMatch(/isn’t a JPEG, PNG, GIF or WebP/);
    });
    it('a storage outage is reported in plain words, and the product is a draft missing its photo', async () => {
        const f = fakes([], { storageDown: true });
        const out = await f.svc.commit('sup', base(), [{ originalname: 'image1.png', buffer: PNG, mimetype: 'image/png', size: PNG.length }]);
        expect(out.results[0]).toMatchObject({ outcome: 'created', imageMissing: true });
        expect(out.results[0].missing).toContain('Product image');
        expect(out.results[0].notes.join(' ')).toMatch(/couldn’t be stored right now/);
        expect(out.results[0].notes.join(' ')).not.toMatch(/Supabase|bucket/);
    });
    it('updates keep live photos and send only filled values', async () => {
        const existing = [{ id: 'e1', ean: '5000000000036', name: 'Crunchy Biscuits Original 200g', status: 'APPROVED', images: ['https://x/live.jpg'], supplierPrice: 27.58, supplierCurrency: 'EUR' }];
        const f = fakes(existing);
        const out = await f.svc.commit('sup', { ...base(), onExisting: 'update' }, [{ originalname: 'image1.png', buffer: PNG, mimetype: 'image/png', size: PNG.length }]);
        expect(f.uploads).toEqual([]);
        expect(f.updated[0].patch.images).toBeUndefined();
        expect(out.results[0]).toMatchObject({ outcome: 'updated' });
        expect(out.results[0].notes.join(' ')).toMatch(/Kept your current photos/);
    });
    it('an update only carries what came from the file — never the importer’s defaults', async () => {
        const existing = [{ id: 'e1', ean: '5000000000036', name: 'Crunchy Biscuits Original 200g', status: 'APPROVED', images: ['https://x/live.jpg'], moq: 1, moqUnit: 'PALLET', unit: 'box', supplierPrice: 10, supplierCurrency: 'EUR' }];
        const f = fakes(existing);
        const req = requestFrom(multiSheetOffer(), 'offer.xlsx', { onExisting: 'update' });
        req.mapping['moq'] = '';                                   // the file's MOQ column is left out
        await f.svc.commit('sup', req, []);
        const patch = f.updated[0].patch;
        expect(patch.moqUnit).toBeUndefined();                     // not reset to the default CASE
        expect(patch.unit).toBeUndefined();                        // not reset to the default piece
        expect(patch.supplierPrice).toBeCloseTo(27.58, 2);
        expect(updatePatch({ name: 'X', moqUnit: 'CASE', unit: 'piece', price: undefined, supplierCurrency: undefined, stock: undefined, images: [] }, { name: 'X' })).toEqual({ name: 'X' });
    });
    it('one failing row doesn’t stop the others', async () => {
        const f = fakes();
        const req = base();
        req.sheets[0].rows[0].cells[1] = 'Explode';
        const out = await f.svc.commit('sup', req, []);
        expect(out.results[0]).toMatchObject({ outcome: 'failed', reasons: ['Database is down'] });
        expect(out.results[1]).toMatchObject({ outcome: 'created' });
    });
    it('a commit batch is limited in size', async () => {
        const f = fakes();
        const req = base();
        req.sheets[0].rows = Array.from({ length: 251 }, (_, i) => ({ ...req.sheets[0].rows[0], row: i + 2 }));
        await expect(f.svc.commit('sup', req, [])).rejects.toThrow(/at most 250 rows/);
    });
    it('image type is read from the bytes', () => {
        expect(sniffImage(PNG)).toBe('image/png');
        expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg');
        expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    });
});
