/**
 * Catalog rules — the ONE definition of what makes a product complete and
 * publishable. Used by manual create/edit, bulk import, image acceptance and
 * admin approval so every path enforces the same thing.
 *
 * Units (match pricing.ts, the source of truth for what buyers pay):
 *  • price  = supplier price per CASE, stored in EUR (basePrice).
 *  • stock  = available CASES.
 *  • moq    = minimum order, in moqUnit (PIECE | CASE | PALLET | TRUCK).
 *  • weight = net weight or volume of ONE piece, e.g. "500 g", "1.5 L".
 */

export const MOQ_UNITS = ['PIECE', 'CASE', 'PALLET', 'TRUCK'] as const;
/** What one piece is. Display/labeling only; prices are always per case. */
export const UNIT_TYPES = ['piece', 'bottle', 'can', 'jar', 'bag', 'box', 'pack', 'bar', 'pouch', 'tube', 'carton', 'pallet'] as const;
export const WEIGHT_UNITS = ['g', 'kg', 'mg', 'ml', 'cl', 'l', 'oz', 'lb'] as const;

/** Approximate EUR value of one unit of each accepted input currency. */
export const TO_EUR: Record<string, number> = {
    EUR: 1, USD: 0.926, GBP: 1.162, EGP: 0.018, AED: 0.252,
    SAR: 0.247, KWD: 3.24, QAR: 0.253, TRY: 0.027, INR: 0.011, RON: 0.201,
};

/** Suggested default currency from a supplier's country (null → EUR). */
const COUNTRY_CURRENCY: Record<string, string> = {
    'romania': 'RON', 'egypt': 'EGP', 'united arab emirates': 'AED', 'uae': 'AED', 'saudi arabia': 'SAR', 'united kingdom': 'GBP',
    'uk': 'GBP', 'united states': 'USD', 'usa': 'USD', 'turkey': 'TRY', 'türkiye': 'TRY', 'india': 'INR', 'kuwait': 'KWD', 'qatar': 'QAR',
};
export function suggestedCurrency(country?: string | null): string {
    const c = COUNTRY_CURRENCY[String(country || '').trim().toLowerCase()];
    return c && TO_EUR[c] ? c : 'EUR';
}

/**
 * The supplier enters a case price in their currency; the platform price
 * (basePrice) is EUR. Converts with the platform's fixed TO_EUR table and
 * keeps the typed figure + currency so it is never reinterpreted later.
 * Mutates and returns `o`. Throws on an unsupported currency.
 */
export function applySupplierCurrency(o: any): any {
    if (o.supplierCurrency !== undefined && o.supplierCurrency !== null) {
        const cur = String(o.supplierCurrency).toUpperCase();
        if (!TO_EUR[cur]) throw new Error(`Currency “${o.supplierCurrency}” isn’t supported. Use one of ${Object.keys(TO_EUR).join(', ')}.`);
        o.supplierCurrency = cur;
        if (o.supplierPrice !== undefined && o.supplierPrice !== null && o.supplierPrice !== '') {
            const n = Number(o.supplierPrice);
            if (!Number.isFinite(n) || n <= 0) throw new Error('Price must be a number above 0.');
            o.supplierPrice = Math.round(n * 10000) / 10000;
            o.price = Math.round(n * TO_EUR[cur] * 10000) / 10000; // EUR per case
        }
    } else if (o.price !== undefined && o.price !== null && o.supplierPrice === undefined) {
        // A plain EUR price (older clients): record it as entered in EUR.
        const n = Number(o.price);
        if (Number.isFinite(n) && n > 0) { o.supplierCurrency = 'EUR'; o.supplierPrice = n; }
    }
    return o;
}

/** True for a real image (not empty, not the generated SVG placeholder). */
export function isRealImage(url: unknown): boolean {
    if (typeof url !== 'string') return false;
    const s = url.trim();
    if (!s) return false;
    if (s.startsWith('data:image/svg+xml')) return false; // generated catalog placeholder
    return /^https?:\/\//i.test(s) || s.startsWith('/uploads/') || s.startsWith('data:image/');
}

export const realImages = (images: unknown): string[] =>
    Array.isArray(images) ? images.filter(isRealImage) : [];

/** Digits only; keeps leading zeros. Returns '' for anything that isn't a code. */
export function normaliseBarcode(raw: unknown): string {
    if (raw === null || raw === undefined) return '';
    let s = String(raw).trim();
    // Spreadsheets sometimes store codes as numbers in scientific notation.
    if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) {
        const n = Number(s);
        if (Number.isFinite(n)) s = BigInt(Math.round(n)).toString();
    }
    if (/^\d+\.0+$/.test(s)) s = s.split('.')[0];
    return s.replace(/[\s-]/g, '');
}

/** GTIN-8 / UPC-A (12) / EAN-13 / GTIN-14 with a valid check digit. */
export function barcodeProblem(code: string): string | null {
    if (!code) return 'Barcode is required.';
    if (!/^\d+$/.test(code)) return 'Barcode must contain digits only.';
    if (![8, 12, 13, 14].includes(code.length)) return `Barcode must have 8, 12, 13 or 14 digits (this one has ${code.length}).`;
    const digits = code.split('').map(Number);
    const check = digits.pop()!;
    const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
    if ((10 - (sum % 10)) % 10 !== check) return 'Barcode check digit is wrong — please re-check the code.';
    return null;
}

/** "500 g", "1.5L", "6 x 330 ml" → normalised string, or null if not a weight. */
export function normaliseWeight(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().replace(',', '.');
    const m = s.match(/^(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(mg|kg|g|ml|cl|l|oz|lb)$/i);
    if (!m) return null;
    const unit = m[3].toLowerCase() === 'l' ? 'L' : m[3].toLowerCase();
    return `${m[1] ? `${m[1]} x ` : ''}${m[2]} ${unit}`;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
const posNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0; };
const posInt = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0; };

export interface Missing { field: string; label: string; reason: string }

/**
 * Everything that must be true before a product can be reviewed or sold.
 * Description, BBD, pallets per truck and lead time are optional (truck
 * prices are offered only when pallets per truck is given).
 */
export function missingForPublish(p: any): Missing[] {
    const out: Missing[] = [];
    const need = (field: string, label: string, ok: boolean, reason = `${label} is required.`) => { if (!ok) out.push({ field, label, reason }); };
    need('name', 'Product name', text(p.name).length >= 2);
    need('brand', 'Brand', !!text(p.brand));
    need('category', 'Category', !!text(p.category) && text(p.category).toLowerCase() !== 'general');
    const code = normaliseBarcode(p.ean);
    const bp = barcodeProblem(code);
    need('ean', 'Barcode (EAN/GTIN)', !bp, bp || '');
    need('origin', 'Country of origin', !!text(p.origin));
    need('exwLocation', 'EXW location', !!text(p.exwLocation));
    need('weight', 'Weight per piece', !!normaliseWeight(p.weight), text(p.weight) ? 'Weight needs a number and unit, e.g. "500 g" or "1.5 L".' : 'Weight per piece is required.');
    const price = p.basePrice ?? p.price;
    need('price', 'Price per case', posNum(price));
    need('stock', 'Stock (cases)', Number.isInteger(Number(p.stock)) && Number(p.stock) >= 0 && p.stock !== null && p.stock !== undefined && p.stock !== '');
    need('unitsPerCase', 'Pieces per case', posInt(p.unitsPerCase));
    need('casesPerPallet', 'Cases per pallet', posInt(p.casesPerPallet));
    need('unit', 'Unit type', !!text(p.unit));
    need('moq', 'Minimum order quantity', posInt(p.moq));
    need('moqUnit', 'MOQ unit', MOQ_UNITS.includes(String(p.moqUnit || '').toUpperCase() as any), 'MOQ unit must be piece, case, pallet or truck.');
    need('images', 'Product image', realImages(p.images).length > 0, 'Add at least one real product photo (upload, URL or barcode lookup).');
    return out;
}

/** Numeric sanity checks that apply to any saved value, complete or not. */
export function invalidValues(p: any): Missing[] {
    const out: Missing[] = [];
    const bad = (field: string, label: string, reason: string) => out.push({ field, label, reason });
    const numField = (field: string, label: string, int: boolean) => {
        const v = p[field];
        if (v === null || v === undefined || v === '') return;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || (int && !Number.isInteger(n))) bad(field, label, `${label} must be a ${int ? 'whole ' : ''}number of 0 or more.`);
    };
    numField('price', 'Price per case', false);
    numField('stock', 'Stock (cases)', true);
    numField('moq', 'Minimum order quantity', true);
    numField('unitsPerCase', 'Pieces per case', true);
    numField('casesPerPallet', 'Cases per pallet', true);
    numField('palletsPerShipment', 'Pallets per truck', true);
    numField('leadTime', 'Lead time (days)', true);
    if (text(p.ean)) { const pr = barcodeProblem(normaliseBarcode(p.ean)); if (pr) bad('ean', 'Barcode (EAN/GTIN)', pr); }
    if (text(p.weight) && !normaliseWeight(p.weight)) bad('weight', 'Weight per piece', 'Weight needs a number and unit, e.g. "500 g" or "1.5 L".');
    return out;
}

/** Fields whose change on a live product sends it back to review (identity & media). */
export const REVIEWED_FIELDS = ['name', 'brand', 'category', 'ean', 'images', 'origin', 'weight'] as const;

/** Plain-language explanation of a product status for the supplier. */
export function statusExplanation(status: string, missing: Missing[], adminNotes?: string | null): string {
    switch (status) {
        case 'DRAFT': return missing.length ? `Draft — not visible to buyers. Still missing: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.` : 'Draft — complete. Submit it for review when ready.';
        case 'PENDING': return 'Waiting for Atlantis review. Buyers can’t see it yet.';
        case 'NEEDS_CHANGES': return `Atlantis asked for changes${adminNotes ? `: ${adminNotes}` : '.'} Fix them and resubmit.`;
        case 'REJECTED': return `Rejected${adminNotes ? `: ${adminNotes}` : '.'} Create a new listing that addresses the reason.`;
        case 'APPROVED': return missing.length ? 'Live, but some required details are missing — update them to keep the listing complete.' : 'Live — buyers can find and order it.';
        default: return status;
    }
}
