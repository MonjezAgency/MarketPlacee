import * as XLSX from 'xlsx';
import { barcodeProblem, invalidValues, isRealImage, missingForPublish, normaliseBarcode, normaliseWeight } from '../catalog-rules';
import { IMPORT_FIELDS, buildRow, buildTemplate, matchHeaders, normaliseHeader, parseSpreadsheet, parseVariants } from '../product-import';
import { casesForItem } from '../stock-ledger';
import { compareBrands, compareNames, ImageLookupService } from '../image-lookup.service';
import { assertTransition, ORDER_TRANSITIONS } from '../../orders/orders.service';

const complete = {
    name: 'Nutella Hazelnut Spread 400 g', brand: 'Nutella', category: 'Spreads & Breakfast', ean: '3017620422003',
    origin: 'France', exwLocation: 'Bucharest, Romania', weight: '400 g', price: 36, stock: 120, unitsPerCase: 15,
    moq: 10, moqUnit: 'CASE', images: ['https://cdn.example.com/n.jpg'], casesPerPallet: 84, unit: 'jar',
};

describe('catalog rules', () => {
    it('validates GTIN check digits and keeps leading zeros', () => {
        expect(barcodeProblem('3017620422003')).toBeNull();
        expect(barcodeProblem('7622202024939')).toMatch(/check digit/);
        expect(barcodeProblem('12345')).toMatch(/8, 12, 13 or 14/);
        expect(normaliseBarcode('0012345678905')).toBe('0012345678905');
        expect(normaliseBarcode('3.017620422003e+12')).toBe('3017620422003');
        expect(normaliseBarcode('5410188006001.0')).toBe('5410188006001');
    });
    it('normalises weights and rejects unit-less ones', () => {
        expect(normaliseWeight('400g')).toBe('400 g');
        expect(normaliseWeight('1,5 l')).toBe('1.5 L');
        expect(normaliseWeight('6x330ml')).toBe('6 x 330 ml');
        expect(normaliseWeight('400')).toBeNull();
    });
    it('treats the generated SVG placeholder as no image', () => {
        expect(isRealImage('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(false);
        expect(isRealImage('https://x.supabase.co/a.jpg')).toBe(true);
    });
    it('a complete product has nothing missing; each required field is reported', () => {
        expect(missingForPublish(complete)).toEqual([]);
        const m = missingForPublish({ ...complete, ean: '', exwLocation: '', images: [], moq: null }).map((x) => x.field);
        expect(m).toEqual(expect.arrayContaining(['ean', 'exwLocation', 'images', 'moq']));
        expect(missingForPublish({ ...complete, description: '' })).toEqual([]); // description optional
        expect(missingForPublish({ ...complete, stock: 0 })).toEqual([]); // 0 stock is valid, just unsellable
        expect(missingForPublish({ ...complete, category: 'General' }).map((x) => x.field)).toContain('category');
    });
    it('flags invalid numbers without requiring completeness', () => {
        expect(invalidValues({ stock: '12.5' }).map((x) => x.field)).toContain('stock');
        expect(invalidValues({ price: -1 }).map((x) => x.field)).toContain('price');
        expect(invalidValues({ name: 'x' })).toEqual([]);
    });
});

describe('import header matching', () => {
    it('normalises case, punctuation and Arabic', () => {
        expect(normaliseHeader('  EAN-Code ')).toBe('ean code');
        expect(normaliseHeader('بلد المنشأ')).toBe('بلد المنشا');
    });
    it('matches aliases, flags ambiguous and duplicate headers, never drops silently', () => {
        const m = matchHeaders(['Product Title', 'GTIN', 'Price', 'Barcode', 'Ship-from location', 'Mystery', 'الماركة', 'Quantity']);
        expect(m[0]).toMatchObject({ field: 'name', status: 'matched' });
        expect(m[1]).toMatchObject({ field: 'ean', status: 'matched' });
        expect(m[2]).toMatchObject({ field: null, status: 'ambiguous', candidates: ['price', 'piecePrice'] });
        expect(m[3]).toMatchObject({ field: null, status: 'duplicate' });
        expect(m[4]).toMatchObject({ field: 'exwLocation' });
        expect(m[5]).toMatchObject({ field: null, status: 'unmatched' });
        expect(m[6]).toMatchObject({ field: 'brand' });
        expect(m[7]).toMatchObject({ status: 'ambiguous' });
    });
    it('every alias belongs to exactly one field', () => {
        const seen = new Map<string, string>();
        for (const f of IMPORT_FIELDS) for (const a of [f.header, ...f.aliases]) {
            const n = normaliseHeader(a);
            if (seen.has(n)) expect(seen.get(n)).toBe(f.key);
            seen.set(n, f.key);
        }
    });
});

describe('import rows', () => {
    const headers = ['Product Name', 'Brand', 'Category', 'EAN', 'Price per Piece', 'Pieces per Case', 'Stock (cases)', 'MOQ', 'Country of Origin', 'EXW Location', 'Weight per Piece', 'Image URL', 'Cases per Pallet'];
    const mapping = Object.fromEntries(matchHeaders(headers).map((m) => [String(m.index), m.field]));
    const opts = { currency: 'EUR', moqUnit: 'CASE' };

    it('computes the case price from a piece price and keeps the barcode as text', () => {
        const r = buildRow(['Milka Choco & Cake 35 g', 'Milka', 'Chocolates & Sweets', '0012345678905', '0.28', '24', '1000', '10', 'Germany', 'Bucharest, Romania', '35g', 'https://img.example.com/a.jpg', '250'], 2, mapping, opts);
        expect(r.errors).toEqual([]);
        expect(r.missing).toEqual([]);
        expect(r.product.price).toBeCloseTo(6.72, 4);
        expect(r.product.ean).toBe('0012345678905');
        expect(r.product.weight).toBe('35 g');
        // what the supplier typed is kept with its currency
        expect(r.product).toMatchObject({ supplierCurrency: 'EUR', supplierPrice: 6.72, unit: 'piece' });
    });
    it('missing photo → draft (missing), not error', () => {
        const r = buildRow(['Milka', 'Milka', 'Chocolates & Sweets', '0012345678905', '0.28', '24', '1000', '10', 'Germany', 'Bucharest', '35 g', '', '250'], 3, mapping, opts);
        expect(r.errors).toEqual([]);
        expect(r.missing.map((m) => m.field)).toEqual(['images']);
    });
    it('invalid values are errors with reasons', () => {
        const r = buildRow(['X', 'B', 'C', '123', 'abc', '24', '10.5', '10', 'DE', 'B', '35', 'ftp://x'], 4, mapping, opts);
        const fields = r.errors.map((e) => e.field);
        expect(fields).toEqual(expect.arrayContaining(['piecePrice', 'stock', 'imageUrl', 'ean', 'weight']));
    });
    it('piece price without pieces per case is refused, not guessed', () => {
        const m2 = { ...mapping }; delete (m2 as any)['5'];
        const r = buildRow(['X', 'B', 'C', '3017620422003', '0.28', '', '10', '10', 'DE', 'B', '35 g', ''], 5, m2, opts);
        expect(r.errors.map((e) => e.field)).toContain('piecePrice');
    });
    it('converts currencies to EUR and rejects unknown ones', () => {
        const cm = { '0': 'price', '1': 'currency' } as any;
        expect(buildRow(['10', 'USD'], 2, cm, opts).product.price).toBeCloseTo(9.26, 2);
        expect(buildRow(['10', 'XYZ'], 2, cm, opts).errors.map((e) => e.field)).toContain('currency');
    });
    it('rejects the template example row', () => {
        const ex = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, f.example]));
        const hm = Object.fromEntries(IMPORT_FIELDS.map((f, i) => [String(i), f.key]));
        const r = buildRow(IMPORT_FIELDS.map((f) => ex[f.key]), 3, hm as any, opts);
        expect(r.errors.map((e) => e.label)).toContain('Example row');
    });
    it('parses varieties', () => {
        expect(parseVariants('Size: 330 ml | 500 ml; Flavour: Original')).toEqual([{ name: 'Size', values: ['330 ml', '500 ml'] }, { name: 'Flavour', values: ['Original'] }]);
        expect(parseVariants('nonsense')).toBeNull();
    });
});

describe('spreadsheet files', () => {
    it('xlsx template round-trips: headers match the schema and the example row is valid apart from being the example', () => {
        const buf = buildTemplate('xlsx');
        const sheet = parseSpreadsheet(buf, 'template.xlsx');
        expect(sheet.headers).toEqual(IMPORT_FIELDS.map((f) => f.header));
        expect(sheet.rows).toHaveLength(1); // helper row skipped
        const matches = matchHeaders(sheet.headers);
        expect(matches.every((m) => m.status === 'matched')).toBe(true);
        const mapping = Object.fromEntries(matches.map((m) => [String(m.index), m.field]));
        const r = buildRow(sheet.rows[0], 3, mapping as any, { currency: 'EUR', moqUnit: 'CASE' });
        expect(r.errors.map((e) => e.label)).toEqual(['Example row']);
        expect(r.missing.map((m) => m.field)).toEqual(['images']);
    });
    it('csv keeps leading zeros and decimals as typed', () => {
        const csv = 'Name,EAN,Price per Case\nA,0012345678905,13.55\n';
        const s = parseSpreadsheet(Buffer.from(csv), 'x.csv');
        expect(s.rows[0]).toEqual(['A', '0012345678905', '13.55']);
    });
    it('xlsx numeric barcodes and hidden decimals are read from the raw value', () => {
        const ws = XLSX.utils.aoa_to_sheet([['Name', 'EAN', 'Price per Case'], ['A', 3017620422003, 13.55]]);
        ws['C2'].z = '0'; // displayed as "14"
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Products');
        const s = parseSpreadsheet(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'x.xlsx');
        expect(s.rows[0]).toEqual(['A', '3017620422003', '13.55']);
    });
    it('rejects other file types and empty files with a clear message', () => {
        expect(() => parseSpreadsheet(Buffer.from('x'), 'x.pdf')).toThrow(/xlsx or \.csv/);
        expect(() => parseSpreadsheet(Buffer.from('a,b\n'), 'x.csv')).toThrow();
    });
});

describe('stock units', () => {
    const product = { unitsPerCase: 24, casesPerPallet: 50, palletsPerShipment: 20 };
    it('counts lines in cases by tier', () => {
        expect(casesForItem({ productId: 'p', quantity: 3, selectedTier: 'carton', order: { status: 'PENDING' }, product })).toBe(3);
        expect(casesForItem({ productId: 'p', quantity: 2, selectedTier: 'pallet', order: { status: 'PENDING' }, product })).toBe(100);
        expect(casesForItem({ productId: 'p', quantity: 1, selectedTier: 'truck', order: { status: 'PENDING' }, product })).toBe(1000);
        expect(casesForItem({ productId: 'p', quantity: 2, selectedTier: 'pallet', stockCases: 7, order: { status: 'PENDING' }, product })).toBe(7);
        expect(casesForItem({ productId: 'p', quantity: 1, mixComposition: [{}], order: { status: 'PENDING' }, product })).toBe(0);
    });
});

describe('order transitions', () => {
    it('allows the lifecycle and refuses repeats and reversals', () => {
        expect(() => assertTransition('PENDING' as any, 'PROCESSING' as any)).not.toThrow();
        expect(() => assertTransition('PROCESSING' as any, 'SHIPPED' as any)).not.toThrow();
        expect(() => assertTransition('PROCESSING' as any, 'PROCESSING' as any)).toThrow(/already/);
        expect(() => assertTransition('DELIVERED' as any, 'PROCESSING' as any)).toThrow(/can't be changed/);
        expect(() => assertTransition('CANCELLED' as any, 'PENDING' as any)).toThrow();
        expect(ORDER_TRANSITIONS.DELIVERED).toEqual([]);
    });
});

describe('barcode image lookup', () => {
    const storage = { uploadProductImage: jest.fn(async () => 'https://storage.example/stored.jpg') };
    const svc = new ImageLookupService(storage as any);
    const offProduct = (code: string, name: string, brands: string) => ({ ok: true, json: async () => ({ status: 1, code, product: { code, product_name: name, brands, image_front_url: `https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.633.400.jpg` } }) });
    const notFound = { ok: false, status: 404, json: async () => ({ status: 0 }) };

    it('compares names and brands', () => {
        expect(compareNames('Nutella Hazelnut Spread 400 g', 'Nutella hazelnut spread')).toBe(true);
        expect(compareNames('Pepsi 330 ml can', 'Nutella hazelnut spread')).toBe(false);
        expect(compareNames('', 'x')).toBeNull();
        // Real case seen with barcode 3046920022606: same line, different cocoa %.
        expect(compareNames('Lindt Excellence 70% 100 g', 'Excellence 85% Cacao Chocolat Noir Lindt')).toBe(false);
        expect(compareNames('Coca-Cola 330 ml can', 'Coca-Cola 33cl')).toBe(true);
        expect(compareNames('Nutella 400 g', 'Nutella 750g')).toBe(false);
        expect(compareBrands('Nutella', 'Nutella, Ferrero')).toBe(true);
        expect(compareBrands('Pepsi', 'Ferrero')).toBe(false);
    });
    it('verified when barcode and name agree; full-size image offered', async () => {
        const f: any = jest.fn(async (url: string) => (url.includes('openfoodfacts') ? offProduct('3017620422003', 'Nutella hazelnut spread', 'Nutella,Ferrero') : notFound));
        const r = await svc.lookup('3017620422003', 'Nutella Hazelnut Spread 400 g', 'Nutella', f);
        expect(r.status).toBe('found');
        expect(r.candidates[0]).toMatchObject({ confidence: 'verified', barcodeMatch: true, nameMatch: true });
        expect(r.candidates[0].url).toMatch(/\.full\.jpg$/);
    });
    it('ambiguous when the record contradicts the supplier’s name', async () => {
        const f: any = jest.fn(async (url: string) => (url.includes('openfoodfacts') ? offProduct('3017620422003', 'Something else entirely', 'OtherBrand') : notFound));
        const r = await svc.lookup('3017620422003', 'Nutella Hazelnut Spread', 'Nutella', f);
        expect(r.status).toBe('ambiguous');
        expect(r.candidates[0].confidence).toBe('needs_confirmation');
    });
    it('same brand but conflicting size/percentage is not verified', async () => {
        const f: any = jest.fn(async (url: string) => (url.includes('openfoodfacts') ? offProduct('3046920022606', 'Excellence 85% Cacao Chocolat Noir', 'Lindt') : notFound));
        const r = await svc.lookup('3046920022606', 'Lindt Excellence 70% 100 g', 'Lindt', f);
        expect(r.status).toBe('ambiguous');
        expect(r.candidates[0]).toMatchObject({ confidence: 'needs_confirmation', nameMatch: false, brandMatch: true });
    });
    it('not found / invalid / unavailable are distinguished', async () => {
        expect((await svc.lookup('3017620422003', 'x', 'y', (async () => notFound) as any)).status).toBe('not_found');
        expect((await svc.lookup('123', 'x', 'y', (async () => notFound) as any)).status).toBe('invalid_barcode');
        expect((await svc.lookup('3017620422003', 'x', 'y', (async () => { throw new Error('timeout'); }) as any)).status).toBe('unavailable');
    });
    it('accept only downloads from lookup sources, then stores the image', async () => {
        await expect(svc.accept('https://evil.example.com/a.jpg', jest.fn() as any)).rejects.toThrow(/Only images found/);
        await expect(svc.accept('http://images.openfoodfacts.org/a.jpg', jest.fn() as any)).rejects.toThrow();
        const f: any = jest.fn(async () => ({ ok: true, headers: new Map([['content-type', 'image/jpeg']]), arrayBuffer: async () => new ArrayBuffer(10) }));
        const r = await svc.accept('https://images.openfoodfacts.org/images/products/x.full.jpg', f);
        expect(r.url).toBe('https://storage.example/stored.jpg');
        expect(storage.uploadProductImage).toHaveBeenCalled();
    });
});


import { applyPricePrivacy, relativeMarkups } from '../../common/price-privacy';
import { applySupplierCurrency, suggestedCurrency } from '../catalog-rules';

describe('price privacy', () => {
    const m = { piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15 };
    const product = () => ({ id: 'p1', supplierId: 'sup-a', name: 'X', price: 7.392, basePrice: 6.72, previousPrice: 7.0, adminNotes: 'internal', supplierPrice: 33, supplierCurrency: 'RON', variantPrices: { 'Size=L': 7 } });

    it('buyers get buyer prices only — never the supplier price, notes or markups', () => {
        const out: any = applyPricePrivacy({ data: [product()] }, { id: 'buyer', role: 'CUSTOMER' }, m);
        const p = out.data[0];
        expect(p.basePrice).toBeCloseTo(7.392, 4); // buyer case price, not 6.72
        expect(p.variantPrices['Size=L']).toBeCloseTo(7.7, 4);
        expect(p).not.toHaveProperty('adminNotes');
        expect(p).not.toHaveProperty('supplierPrice');
        expect(p).not.toHaveProperty('supplierCurrency');
        // storefront maths (basePrice × tier ratio) still yields the exact buyer prices
        const r = relativeMarkups(m);
        expect(r.piece).toBe(1);
        expect(p.basePrice * r.pallet).toBeCloseTo(6.72 * 1.05, 3);
        expect(p.basePrice * r.container).toBeCloseTo(6.72 * 1.02, 3);
    });
    it('another supplier is treated like a buyer', () => {
        const p: any = applyPricePrivacy(product(), { id: 'sup-b', role: 'SUPPLIER' }, m);
        expect(p.basePrice).toBeCloseTo(7.392, 4);
        expect(p).not.toHaveProperty('adminNotes');
    });
    it('the owning supplier sees their own price, never the buyer price', () => {
        const p: any = applyPricePrivacy(product(), { id: 'sup-a', role: 'SUPPLIER' }, m);
        expect(p.price).toBe(6.72);
        expect(p.basePrice).toBe(6.72);
        expect(p).not.toHaveProperty('previousPrice');
        expect(p.adminNotes).toBe('internal');
        const legacy: any = applyPricePrivacy({ ...product(), basePrice: null }, { id: 'sup-a', role: 'SUPPLIER' }, m);
        expect(legacy.price).toBeNull();
    });
    it('owner-scoped supplier routes never inflate the supplier’s own prices', () => {
        const p: any = applyPricePrivacy({ data: [{ id: 'p1', price: 6.72, basePrice: 6.72 }] }, { id: 'sup-a', role: 'SUPPLIER' }, m, 0, true);
        expect(p.data[0].basePrice).toBe(6.72);
    });
    it('staff see everything; supplierUnitPrice is removed for non-staff', () => {
        const staff: any = applyPricePrivacy(product(), { id: 'a', role: 'ADMIN' }, m);
        expect(staff.basePrice).toBe(6.72);
        const order: any = applyPricePrivacy({ items: [{ price: 10, supplierUnitPrice: 9 }] }, { id: 'buyer', role: 'CUSTOMER' }, m);
        expect(order.items[0]).not.toHaveProperty('supplierUnitPrice');
    });
});

describe('supplier currency', () => {
    it('converts the typed price to EUR and keeps the original', () => {
        const o = applySupplierCurrency({ supplierCurrency: 'ron', supplierPrice: '100' });
        expect(o).toMatchObject({ supplierCurrency: 'RON', supplierPrice: 100, price: 20.1 });
        expect(applySupplierCurrency({ price: 12 })).toMatchObject({ supplierCurrency: 'EUR', supplierPrice: 12, price: 12 });
        expect(() => applySupplierCurrency({ supplierCurrency: 'XYZ', supplierPrice: 1 })).toThrow(/isn’t supported/);
    });
    it('suggests a currency from the country', () => {
        expect(suggestedCurrency('Romania')).toBe('RON');
        expect(suggestedCurrency('Germany')).toBe('EUR');
        expect(suggestedCurrency(null)).toBe('EUR');
    });
});
