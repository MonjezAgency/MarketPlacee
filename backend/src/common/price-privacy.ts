/**
 * Commercial privacy — who may see which price.
 *
 *  • Atlantis staff: everything (supplier price, markups, notes).
 *  • The supplier who owns a product: their own price (basePrice) and the
 *    review notes — never the buyer price, so the margin can't be derived.
 *  • Everyone else (buyers, other suppliers): buyer prices only. `basePrice`
 *    is replaced by the buyer case price (supplier price × case-tier markup)
 *    and the markup endpoint returns only the ratio between tiers, so the
 *    storefront's tier maths still produces the exact buyer prices while the
 *    supplier price and Atlantis's markup never leave the server.
 *
 * Applied to every API response by PricePrivacyInterceptor.
 */
export interface Markups { piece: number; pallet: number; container: number; mix: number }
export type Viewer = { id?: string; role?: string } | null | undefined;

export const PRICE_STAFF = ['ADMIN', 'OWNER', 'MODERATOR', 'EDITOR', 'SUPPORT', 'DEVELOPER'];
export const isPriceStaff = (v: Viewer) => PRICE_STAFF.includes(String(v?.role || '').toUpperCase());
/** Supplier accounts: never shown buyer prices on buyer-demand views (Targets, price history). */
export const isSupplierViewer = (v: Viewer) => !!v?.id && String(v?.role || '').toUpperCase() === 'SUPPLIER';

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const isProductLike = (o: any) => o && typeof o === 'object' && !Array.isArray(o) && ('basePrice' in o || 'variantPrices' in o || 'supplierPrice' in o);

/** Markups as non-staff may see them: tier ratios relative to the case tier. */
export function relativeMarkups(m: Markups): Markups {
    const pc = m.piece > 0 ? m.piece : 1;
    // 10 decimals so storefront maths matches the server's prices to the cent.
    const r10 = (n: number) => Math.round(n * 1e10) / 1e10;
    return { piece: 1, pallet: r10(m.pallet / pc), container: r10(m.container / pc), mix: r10(m.mix / pc) };
}

function viewProduct(p: any, viewer: Viewer, m: Markups, ownerScoped = false) {
    const owner = ownerScoped || !!viewer?.id && String(viewer.role || '').toUpperCase() === 'SUPPLIER' && p.supplierId === viewer.id;
    if (owner) {
        // Their own price only; an old listing without one shows no price rather than the buyer price.
        if ('price' in p || 'basePrice' in p) p.price = typeof p.basePrice === 'number' ? p.basePrice : null;
        delete p.previousPrice;
        return;
    }
    const pc = m.piece > 0 ? m.piece : 1;
    if ('basePrice' in p) p.basePrice = typeof p.basePrice === 'number' ? Math.round(p.basePrice * pc * 1e6) / 1e6 : p.basePrice;
    if (p.variantPrices && typeof p.variantPrices === 'object') {
        p.variantPrices = Object.fromEntries(Object.entries(p.variantPrices).map(([k, v]) => [k, typeof v === 'number' || (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) ? r4(Number(v) * pc) : v]));
    }
    delete p.supplierPrice;
    delete p.supplierCurrency;
    delete p.adminNotes;
}

/** Walks a response (objects, arrays, nested) and applies the viewer's price view in place. */
/**
 * @param ownerScoped the endpoint only ever returns the caller's own products
 *   (supplier workspace routes), so every product is treated as theirs.
 */
export function applyPricePrivacy<T>(body: T, viewer: Viewer, m: Markups, depth = 0, ownerScoped = false): T {
    if (!body || typeof body !== 'object' || depth > 8 || isPriceStaff(viewer)) return body;
    if (Array.isArray(body)) { for (const x of body) applyPricePrivacy(x, viewer, m, depth + 1, ownerScoped); return body; }
    if (body instanceof Date || Buffer.isBuffer(body)) return body;
    const o: any = body;
    if ('supplierUnitPrice' in o) delete o.supplierUnitPrice;
    if (isProductLike(o)) viewProduct(o, viewer, m, ownerScoped);
    for (const k of Object.keys(o)) {
        const v = o[k];
        if (v && typeof v === 'object') applyPricePrivacy(v, viewer, m, depth + 1, ownerScoped);
    }
    return body;
}

/** Supplier routes that only return the caller's own products. */
export const OWNER_SCOPED_PATHS = ['/supplier-catalog', '/products/my-products', '/products/inventory'];
export const isOwnerScoped = (url: string, viewer: Viewer) =>
    String(viewer?.role || '').toUpperCase() === 'SUPPLIER' && OWNER_SCOPED_PATHS.some((p) => url.split('?')[0].startsWith(p));
