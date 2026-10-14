/**
 * Client mirror of backend/src/products/catalog-rules.ts, for instant
 * feedback in the editor. The server re-checks everything and is the
 * authority — keep the two in step.
 */
export const MOQ_UNITS = ['PIECE', 'CASE', 'PALLET', 'TRUCK'] as const;
export const WEIGHT_UNITS = ['g', 'kg', 'ml', 'cl', 'L', 'oz', 'lb'] as const;

export const digitsOnly = (s: string) => String(s || '').replace(/[\s-]/g, '');

export function gtinProblem(raw: string): string | null {
    const code = digitsOnly(raw);
    if (!code) return 'Barcode is required.';
    if (!/^\d+$/.test(code)) return 'Digits only.';
    if (![8, 12, 13, 14].includes(code.length)) return `Use 8, 12, 13 or 14 digits (this has ${code.length}).`;
    const d = code.split('').map(Number);
    const check = d.pop()!;
    const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === check ? null : 'The check digit doesn’t match — re-check the code.';
}

export const isRealImage = (u?: string | null) => !!u && !u.startsWith('data:image/svg+xml') && /^(https?:\/\/|\/uploads\/|data:image\/)/i.test(u);

export interface Draft {
    name: string; brand: string; category: string; ean: string; origin: string; exwLocation: string;
    weightValue: string; weightUnit: string; priceCaseEur: number | null; stock: string; unitsPerCase: string;
    moq: string; moqUnit: string; images: string[];
}

/** Same required list as the server (description, BBD, pallet sizes, lead time optional). */
export function missingFields(d: Draft): { field: string; label: string }[] {
    const out: { field: string; label: string }[] = [];
    const need = (field: string, label: string, ok: boolean) => { if (!ok) out.push({ field, label }); };
    const posInt = (s: string) => /^\d+$/.test(s.trim()) && Number(s) > 0;
    need('name', 'Product name', d.name.trim().length >= 2);
    need('brand', 'Brand', !!d.brand.trim());
    need('category', 'Category', !!d.category.trim() && d.category.toLowerCase() !== 'general');
    need('ean', 'Barcode', !gtinProblem(d.ean));
    need('origin', 'Country of origin', !!d.origin.trim());
    need('exwLocation', 'EXW location', !!d.exwLocation.trim());
    need('weight', 'Weight per piece', Number(d.weightValue) > 0 && !!d.weightUnit);
    need('price', 'Price', !!d.priceCaseEur && d.priceCaseEur > 0);
    need('stock', 'Stock (cases)', /^\d+$/.test(d.stock.trim()));
    need('unitsPerCase', 'Pieces per case', posInt(d.unitsPerCase));
    need('moq', 'Minimum order', posInt(d.moq));
    need('images', 'Product photo', d.images.some(isRealImage));
    return out;
}

/** "1.5 L" / "6 x 330 ml" → { value, unit, pack } for the editor. */
export function splitWeight(w?: string | null): { value: string; unit: string; pack: string } {
    const m = String(w || '').trim().replace(',', '.').match(/^(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(mg|kg|g|ml|cl|l|oz|lb)$/i);
    if (!m) return { value: '', unit: 'g', pack: '' };
    return { pack: m[1] || '', value: m[2], unit: m[3].toLowerCase() === 'l' ? 'L' : m[3].toLowerCase() };
}
