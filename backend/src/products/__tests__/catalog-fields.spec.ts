import { brandMatchKey, buildBrandCatalog, resolveBrand, searchBrands } from '../brand-catalog';
import { resolveOrigin } from '../country-canon';
import { applyEditorCatalogFields, applyImportBrands, BRAND_NOT_ON_ATLANTIS, ORIGIN_NOT_A_COUNTRY } from '../catalog-fields';
import { buildFromValues } from '../product-import';

const catalog = buildBrandCatalog([
    { brand: 'Prime', count: 8 }, { brand: 'PRIME', count: 1 }, { brand: ' prime ', count: 1 },
    { brand: "Kellogg's", count: 5 }, { brand: 'Kelloggs', count: 1 },
    { brand: 'Pringles', count: 4 }, { brand: 'Dr. Oetker', count: 3 }, { brand: 'Coca-Cola', count: 6 },
    { brand: 'Nestlé', count: 7 }, { brand: 'Milka', count: 2 },
]);

const errorOf = (fn: () => unknown) => { try { fn(); } catch (e: any) { return e.getResponse ? e.getResponse() : e; } return null; };

describe('brand catalog', () => {
    it('groups spellings by case, spaces, accents, apostrophes and punctuation', () => {
        expect(brandMatchKey(' PRIME ')).toBe('prime');
        expect(brandMatchKey("Kellogg's")).toBe(brandMatchKey('Kelloggs'));
        expect(brandMatchKey('KELLOGG’S')).toBe(brandMatchKey('kelloggs'));
        expect(brandMatchKey('Nestle')).toBe(brandMatchKey('Nestlé'));
        expect(brandMatchKey('Coca Cola')).toBe(brandMatchKey('Coca-Cola'));
        expect(catalog.entries.find((e) => e.name === 'Prime')?.count).toBe(10);
    });

    it('exact canonical match after normalisation', () => {
        expect(resolveBrand(catalog, 'Prime')).toEqual({ kind: 'known', name: 'Prime', changed: false });
        expect(resolveBrand(catalog, 'PRIME')).toEqual({ kind: 'known', name: 'Prime', changed: true });
        expect(resolveBrand(catalog, '  prime  ')).toMatchObject({ kind: 'known', name: 'Prime' });
        expect(resolveBrand(catalog, 'Kelloggs')).toMatchObject({ kind: 'known', name: "Kellogg's" });
        expect(resolveBrand(catalog, 'dr oetker')).toMatchObject({ kind: 'known', name: 'Dr. Oetker' });
        expect(resolveBrand(catalog, 'nestle')).toMatchObject({ kind: 'known', name: 'Nestlé' });
        expect(resolveBrand(catalog, '   ')).toEqual({ kind: 'empty' });
    });

    it('a similar brand is only suggested, never applied', () => {
        const r = resolveBrand(catalog, 'Primee');
        expect(r).toEqual({ kind: 'new', name: 'Primee', similar: ['Prime'] });
        expect(resolveBrand(catalog, 'CocaCola')).toMatchObject({ kind: 'new', name: 'CocaCola', similar: ['Coca-Cola'] });
        expect(resolveBrand(catalog, 'Brand Nobody Sells')).toEqual({ kind: 'new', name: 'Brand Nobody Sells', similar: [] });
    });

    it('search: prefix first, then word, then contains; by usage; with similar spellings', () => {
        const r = searchBrands(catalog, 'pr');
        expect(r.brands.map((b) => b.name)).toEqual(['Prime', 'Pringles']);
        expect(r.brands[0]).toMatchObject({ count: 10 });
        expect(searchBrands(catalog, 'oetker').brands.map((b) => b.name)).toEqual(['Dr. Oetker']);
        expect(searchBrands(catalog, 'cola').brands.map((b) => b.name)).toEqual(['Coca-Cola']);
        expect(searchBrands(catalog, "kellogg's").exact).toBe("Kellogg's");
        const typo = searchBrands(catalog, 'Mlka');
        expect(typo.brands).toEqual([]);
        expect(typo.similar.map((s) => s.name)).toEqual(['Milka']);
        expect(searchBrands(catalog, '').brands[0].name).toBe('Prime');
    });
});

describe('editor save (brand)', () => {
    it('normalises a known brand to its canonical name', () => {
        const body = { brand: ' PRIME ' };
        applyEditorCatalogFields(body, catalog, { enforce: true });
        expect(body.brand).toBe('Prime');
    });
    it('an unknown brand needs explicit confirmation', () => {
        const err: any = errorOf(() => applyEditorCatalogFields({ brand: 'Primee' }, catalog, { enforce: true }));
        expect(err.code).toBe(BRAND_NOT_ON_ATLANTIS);
        expect(err.suggestions).toEqual(['Prime']);
        expect(err.invalid[0].field).toBe('brand');
        const ok: any = { brand: '  Brand   New ', newBrand: true };
        applyEditorCatalogFields(ok, catalog, { enforce: true });
        expect(ok).toEqual({ brand: 'Brand New' });
    });
    it('confirming a new brand never overrides an existing one', () => {
        const body: any = { brand: 'kelloggs', newBrand: true };
        applyEditorCatalogFields(body, catalog, { enforce: true });
        expect(body.brand).toBe("Kellogg's");
    });
    it('staff saves normalise but never reject', () => {
        const body: any = { brand: 'Primee', origin: 'Bucharest, Romania' };
        expect(() => applyEditorCatalogFields(body, catalog, { enforce: false })).not.toThrow();
        expect(body).toEqual({ brand: 'Primee', origin: 'Bucharest, Romania' });
    });
    it('fields not sent are not checked', () => {
        expect(() => applyEditorCatalogFields({ name: 'x' }, catalog, { enforce: true })).not.toThrow();
    });
});

describe('country of origin', () => {
    it('names, codes, aliases and local names → canonical English name', () => {
        for (const v of ['PL', 'Poland', 'poland', 'Polska', 'Made in Poland']) expect(resolveOrigin(v)).toMatchObject({ kind: 'country', code: 'PL', name: 'Poland' });
        expect(resolveOrigin('Deutschland')).toMatchObject({ code: 'DE', name: 'Germany' });
        for (const v of ['UK', 'United Kingdom', 'Great Britain', 'England', 'U.K.']) expect(resolveOrigin(v)).toMatchObject({ code: 'GB', name: 'United Kingdom' });
        for (const v of ['Holland', 'Netherlands', 'The Netherlands', 'Nederland']) expect(resolveOrigin(v)).toMatchObject({ code: 'NL' });
        for (const v of ['Türkiye', 'Turkey', 'Turkiye']) expect(resolveOrigin(v)).toMatchObject({ code: 'TR', name: 'Turkey' });
        for (const v of ['UAE', 'United Arab Emirates', 'الإمارات العربية المتحدة']) expect(resolveOrigin(v)).toMatchObject({ code: 'AE' });
        expect(resolveOrigin('Allemagne')).toMatchObject({ code: 'DE' });
        expect(resolveOrigin('România')).toMatchObject({ code: 'RO', name: 'Romania' });
        expect(resolveOrigin('Romania')).toMatchObject({ kind: 'country', changed: false });
        expect(resolveOrigin('Bonaire, Saint Eustatius and Saba')).toMatchObject({ kind: 'country', code: 'BQ' });
    });
    it('"Bucharest, Romania" only suggests Romania', () => {
        expect(resolveOrigin('Bucharest, Romania')).toEqual({ kind: 'suggest', code: 'RO', name: 'Romania' });
        expect(resolveOrigin('Warsaw - Poland')).toMatchObject({ kind: 'suggest', code: 'PL' });
    });
    it('a city is never treated as a country', () => {
        expect(resolveOrigin('Bucharest')).toEqual({ kind: 'unknown' });
        expect(resolveOrigin('Hamburg')).toEqual({ kind: 'unknown' });
        expect(resolveOrigin('no')).toEqual({ kind: 'unknown' }); // lower-case "no" isn't Norway
    });
    it('ambiguous values are rejected', () => {
        expect(resolveOrigin('Congo')).toMatchObject({ kind: 'ambiguous' });
        expect(resolveOrigin('Korea')).toMatchObject({ kind: 'ambiguous' });
        expect(resolveOrigin('EU')).toEqual({ kind: 'ambiguous', options: [] });
        expect(resolveOrigin('Germany / Poland')).toMatchObject({ kind: 'ambiguous', options: [{ code: 'DE' }, { code: 'PL' }] });
    });
    it('editor: normalised, or rejected with a suggestion', () => {
        const body: any = { origin: 'Deutschland' };
        applyEditorCatalogFields(body, catalog, { enforce: true });
        expect(body.origin).toBe('Germany');
        const err: any = errorOf(() => applyEditorCatalogFields({ origin: 'Bucharest, Romania' }, catalog, { enforce: true }));
        expect(err.code).toBe(ORIGIN_NOT_A_COUNTRY);
        expect(err.suggestion).toEqual({ code: 'RO', name: 'Romania' });
        expect(err.invalid[0].field).toBe('origin');
        expect((errorOf(() => applyEditorCatalogFields({ origin: 'Congo' }, catalog, { enforce: true })) as any).options).toHaveLength(2);
    });
});

describe('import rows', () => {
    const opts = { currency: 'EUR', moqUnit: 'CASE' };
    it('origin: recognised values are normalised; others are left empty with a note, never guessed', () => {
        const a = buildFromValues({ name: 'A', origin: 'DE', exwLocation: 'Hamburg, Germany' }, 2, opts);
        expect(a.product.origin).toBe('Germany');
        expect(a.product.exwLocation).toBe('Hamburg, Germany');
        const b = buildFromValues({ name: 'B', origin: 'Bucharest, Romania' }, 3, opts);
        expect(b.product.origin).toBe('');
        expect(b.warnings.join(' ')).toMatch(/Did you mean Romania\?/);
        expect(b.missing.some((m) => m.field === 'origin')).toBe(true);
    });
    it('brands: canonical spelling for known brands; new brands flagged with a suggestion', () => {
        const rows = [
            { product: { brand: 'PRIME' }, warnings: [] as string[], notes: {} as any },
            { product: { brand: 'Primee' }, warnings: [] as string[], notes: {} as any },
            { product: { brand: 'Fresh Farm' }, warnings: [] as string[], notes: {} as any },
            { product: { brand: 'FRESH FARM' }, warnings: [] as string[], notes: {} as any },
            { product: { brand: 'Fresh Farm' }, warnings: [] as string[], notes: {} as any },
        ];
        const fresh = applyImportBrands(rows, catalog);
        expect(rows[0].product.brand).toBe('Prime');
        expect(rows[0].notes.brand).toMatch(/written as Prime/);
        expect(rows[0].warnings).toEqual([]);
        expect(rows[1].product.brand).toBe('Primee');
        expect(rows[1].warnings[0]).toBe('New brand “Primee” — not on Atlantis yet. Importing adds it as a new brand. Did you mean “Prime”?');
        expect(rows[3].product.brand).toBe('Fresh Farm');
        expect(fresh).toEqual(['Fresh Farm', 'Primee']);
    });
});
