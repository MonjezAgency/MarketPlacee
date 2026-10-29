import { BadRequestException } from '@nestjs/common';
import { brandMatchKey, buildBrandCatalog, resolveBrand, tidyBrand, type BrandCatalog } from './brand-catalog';
import { originProblem, resolveOrigin } from './country-canon';

/** Error codes the product editor understands (shown in the supplier's language). */
export const BRAND_NOT_ON_ATLANTIS = 'BRAND_NOT_ON_ATLANTIS';
export const ORIGIN_NOT_A_COUNTRY = 'ORIGIN_NOT_A_COUNTRY';

/**
 * Brand and country of origin on an editor save (product create / update).
 * Mutates `body`: the brand becomes its canonical spelling, the origin the
 * canonical English country name; `newBrand` is consumed.
 *
 * enforce = true (suppliers): an unknown brand needs `newBrand: true`, and an
 * origin that isn't one recognised country is rejected — both as 400 with a
 * code, the field and suggestions. enforce = false (staff): only exact matches
 * are normalised; nothing is rejected.
 *
 * Only fields present in the body are checked, so an untouched legacy value
 * never blocks an unrelated edit.
 */
export function applyEditorCatalogFields(body: any, catalog: BrandCatalog, opts: { enforce: boolean }) {
    if (!body || typeof body !== 'object') return body;
    const confirmedNew = body.newBrand === true;
    delete body.newBrand;

    if (typeof body.brand === 'string') {
        const r = resolveBrand(catalog, body.brand);
        if (r.kind === 'known') body.brand = r.name;
        else if (r.kind === 'new') {
            if (opts.enforce && !confirmedNew) {
                const reason = `“${r.name.slice(0, 60)}” isn’t a brand on Ali FMCG yet. Choose it from the list${r.similar.length ? ` (did you mean ${r.similar[0]}?)` : ''}, or confirm it as a new brand.`;
                throw new BadRequestException({ code: BRAND_NOT_ON_ATLANTIS, message: reason, brand: r.name, suggestions: r.similar, invalid: [{ field: 'brand', label: 'Brand', reason }] });
            }
            body.brand = r.name;
        }
    }

    if (typeof body.origin === 'string' && body.origin.trim()) {
        const r = resolveOrigin(body.origin);
        if (r.kind === 'country') body.origin = r.name;
        else if (opts.enforce) {
            const reason = originProblem(body.origin, r) as string;
            throw new BadRequestException({
                code: ORIGIN_NOT_A_COUNTRY, message: reason, value: String(body.origin).slice(0, 60),
                suggestion: r.kind === 'suggest' ? { code: r.code, name: r.name } : null,
                options: r.kind === 'ambiguous' ? r.options : [],
                invalid: [{ field: 'origin', label: 'Country of origin', reason }],
            });
        }
    }
    return body;
}

/**
 * Brands on import rows (after buildFromValues). A known brand is written with
 * its canonical spelling; a brand not on Ali FMCG keeps the file's most common
 * spelling for it and gets the row warning "New brand “X” — not on Ali FMCG
 * yet" (with "Did you mean …?" for a close spelling, never applied). Committing
 * the reviewed import is the supplier's confirmation. Returns the new brands.
 */
export function applyImportBrands(rows: { product: any; warnings: string[]; notes: Record<string, any> }[], catalog: BrandCatalog): string[] {
    const fresh: { brand: string; count: number }[] = [];
    const resolved = rows.map((b) => {
        const r = resolveBrand(catalog, typeof b.product?.brand === 'string' ? b.product.brand : '');
        if (r.kind === 'new') fresh.push({ brand: r.name, count: 1 });
        return r;
    });
    // One spelling per new brand within the file (the most common one).
    const inFile = buildBrandCatalog(fresh);
    rows.forEach((b, i) => {
        const r = resolved[i];
        if (r.kind === 'known') {
            if (r.changed) b.notes.brand = `${b.notes.brand ? `${b.notes.brand}; ` : ''}“${tidyBrand(b.product.brand)}” written as ${r.name}, as on Ali FMCG`;
            b.product.brand = r.name;
        } else if (r.kind === 'new') {
            const name = inFile.byKey.get(brandMatchKey(r.name))?.name ?? r.name;
            b.product.brand = name;
            b.warnings.push(`New brand “${name}” — not on Ali FMCG yet. Importing adds it as a new brand.${r.similar.length ? ` Did you mean ${r.similar.map((s) => `“${s}”`).join(' or ')}?` : ''}`);
        }
    });
    return inFile.entries.map((e) => e.name).sort((a, b) => a.localeCompare(b));
}
