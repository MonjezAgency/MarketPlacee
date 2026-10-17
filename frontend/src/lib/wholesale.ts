import { apiFetch } from '@/lib/api';
import type { CartItem } from '@/lib/cart';

/**
 * Client side of the server's wholesale rules (backend/src/orders/pricing.ts).
 * Display maths here mirrors the server exactly (per-case price rounded to the
 * cent first); the cart and checkout always show the SERVER quote.
 */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type Tier = 'carton' | 'pallet' | 'truck';

/** MOQ (moq + moqUnit) expressed in whole units of `tier` — same as the server. */
export function minUnitsFor(p: { moq?: number | null; moqUnit?: string | null; unitsPerCase?: number | null; casesPerPallet?: number | null; palletsPerShipment?: number | null }, tier: Tier): number {
    const moq = Number(p.moq) > 0 ? Number(p.moq) : 0;
    if (!moq) return 1;
    const upc = Number(p.unitsPerCase) || 1, cpp = Number(p.casesPerPallet) || 1, ppt = Number(p.palletsPerShipment) || 1;
    const u = String(p.moqUnit || 'PIECE').toUpperCase();
    const pieces = u === 'TRUCK' ? moq * upc * cpp * ppt : u === 'PALLET' ? moq * upc * cpp : u === 'CASE' ? moq * upc : moq;
    const per = upc * (tier === 'carton' ? 1 : tier === 'pallet' ? cpp : cpp * ppt);
    return Math.max(1, Math.ceil(pieces / per - 1e-9));
}

export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public body?: any) { super(message); }
}
export async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const m = body?.message;
        // Route missing on the server (backend not yet deployed with this feature).
        if (res.status === 404 && typeof m === 'string' && m.startsWith('Cannot ')) {
            throw new ApiError(404, 'NOT_DEPLOYED', 'This feature isn’t live on the server yet — the backend update needs to be deployed.', body);
        }
        throw new ApiError(res.status, body?.code || (Array.isArray(m) ? 'ERROR' : body?.error) || 'ERROR', typeof m === 'string' ? m : res.status === 401 ? 'Please sign in again.' : 'Something went wrong. Please try again.', body);
    }
    return body as T;
}

/** Cart line → payload the server prices (never sends trusted prices). */
export const toServerItem = (i: CartItem) => ({
    productId: i.mixedLoadId ? undefined : (i.productId || i.id.split('::')[0]),
    mixedLoadId: i.mixedLoadId,
    quantity: i.quantity,
    tier: i.tier,
    selectedVariants: i.selectedVariants,
    mixComposition: i.mixComposition,
});

export interface QuoteLine {
    productId: string | null; mixedLoadId: string | null; tier: Tier; quantity: number; price: number; lineTotal: number;
    perCase: number | null; casesTotal: number | null; unitsTotal: number | null; minUnits: number | null;
    info: { ean: string | null; unitsPerCase: number | null; shelfLife: string | null; leadTime?: number | null; readyForDispatch?: boolean; exwLocation?: string | null } | null;
    offerPercent?: number | null;
    /** Running special offer honoured in `price` (server clock), and the undiscounted unit price. */
    promotion?: { id: string; discountPercent: number; endsAt: string } | null;
    listUnitPrice?: number | null;
    /** A special offer on this product ended recently; the normal price applies again. */
    promotionEnded?: { discountPercent: number; endedAt: string } | null;
    /** Progress toward the product's MOQ, in the MOQ's own unit (server-computed). */
    minimum?: LineMinimum | null;
    error: {
        code: string; message: string; minUnits?: number;
        // BELOW_MOQ
        quantity?: number; remaining?: number; unitPrice?: number; minLineTotal?: number; moq?: number | null; moqUnit?: string | null;
        mixable?: { kind: LoadKind; quantity: number; minUnits: number; capacity: number; variants?: number } | null;
        minimum?: LineMinimum | null;
        // INSUFFICIENT_STOCK
        availableCases?: number; maxUnits?: number; lineTotal?: number; casesPerUnit?: number;
    } | null;
}
export interface LineMinimum { unit: 'piece' | 'case' | 'pallet' | 'truck'; required: number; have: number; remaining: number; percent: number; met: boolean }
export interface CartQuote { subtotal: number; discountPercent: number; discount: number; coupon: string | null; total: number; lines: QuoteLine[]; ready: boolean; fulfillment?: DeliveryQuote | null }

/** Delivery for the cart, from the shared server calculation (never computed in the browser). */
export interface DeliveryCharge { key: string; label: string; basis: string; amount: number; paidTo: string; source: string; line?: string }
export interface DeliveryGroup {
    supplier?: string; method: string; label: string; handover: string; steps: { who: string; what: string }[];
    hub: { name: string; city: string; country: string } | null;
    status: 'priced' | 'quote_required' | 'unavailable'; reasons: string[]; charges: DeliveryCharge[];
    transitDays: { min: number; max: number } | null; total: number | null; lines: string[];
}
export interface DeliveryQuote { destination: string | null; status: 'priced' | 'quote_required' | 'unavailable'; freightTotal: number | null; groups: DeliveryGroup[] }

export const quoteCart = (items: CartItem[], couponCode?: string, destination?: string) =>
    call<CartQuote>('/orders/quote', { method: 'POST', body: JSON.stringify({ items: items.map(toServerItem), couponCode: couponCode || undefined, destination: destination || undefined }) });

// ── Mixed pallets / truckloads ───────────────────────────────────────────
export type LoadKind = 'PALLET' | 'TRUCK';
export interface LoadLine { productId: string; variant?: string | null; quantity: number }
export interface MixedLoadQuote {
    kind: LoadKind; supplierId: string | null; fill: number; requiredFill: number; subtotal: number; total: number; ready: boolean; issues: string[];
    minimums?: { unit: 'case' | 'pallet'; required: number; have: number; remaining: number; capacity: number; satisfiable: boolean; products: string[] }[];
    origin?: { status: 'VERIFIED' | 'UNVERIFIED'; label: string | null; country: string | null; unverified: string[] };
    lines: (LoadLine & { name: string; unit: 'case' | 'pallet'; casePrice: number; cases: number; units: number; share: number; lineSubtotal: number })[];
}
export interface MixedLoad {
    id: string; kind: LoadKind; status: string; version: number; supplierId: string | null;
    products: Record<string, { id: string; name: string; brand: string | null; ean: string | null; image: string | null; unitsPerCase: number | null; casesPerPallet: number | null; palletsPerShipment: number | null; leadTime?: number | null; readyForDispatch?: boolean; exwLocation?: string | null; dispatch?: string | null }>;
    quote?: MixedLoadQuote; error?: { code?: string; message: string }; ready?: boolean;
}

export const listLoads = () => call<MixedLoad[]>('/mixed-loads');
/** Add one product to a SPECIFIC load (loadId), or start a new load with just that product. */
export const addToLoad = (kind: LoadKind, productId: string, quantity: number, variant?: string | null, loadId?: string) =>
    call<MixedLoad>('/mixed-loads/lines', { method: 'POST', body: JSON.stringify({ kind, productId, quantity, variant: variant ?? undefined, loadId }) });
/** Create a new mixed load from exactly the buyer's selected lines. */
export const createLoad = (kind: LoadKind, lines: LoadLine[]) =>
    call<MixedLoad>('/mixed-loads', { method: 'POST', body: JSON.stringify({ kind, lines }) });

/** Variant signatures ("Flavour=Grape") — same construction as the server. */
export function variantSignatures(variants: unknown): { sig: string; label: string }[] {
    const groups = (Array.isArray(variants) ? variants : [])
        .filter((g: any) => g && g.name && !String(g.name).startsWith('__') && Array.isArray(g.values) && g.values.length)
        .map((g: any) => ({ name: String(g.name), values: g.values.map((v: unknown) => String(v)) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    if (!groups.length) return [];
    let combos: Record<string, string>[] = [{}];
    for (const g of groups) combos = combos.flatMap((c) => g.values.map((v: string) => ({ ...c, [g.name]: v })));
    return combos.map((c) => ({ sig: Object.keys(c).sort().map((k) => `${k}=${c[k]}`).join('|'), label: Object.keys(c).sort().map((k) => c[k]).join(' · ') }));
}
export const updateLoad = (id: string, lines: LoadLine[], version: number) =>
    call<MixedLoad>(`/mixed-loads/${id}`, { method: 'PUT', body: JSON.stringify({ lines, version }) });
export const deleteLoad = (id: string) => call<{ ok: true }>(`/mixed-loads/${id}`, { method: 'DELETE' });

export const loadLabel = (k: LoadKind) => (k === 'PALLET' ? 'Mixed pallet' : 'Mixed truckload');

/** Products that can count toward a mixed load (server-filtered: same supplier, same site, in stock). */
export interface LoadCandidate {
    id: string; variant?: string | null; variantLabel?: string; sku?: string; supplier?: string; name: string; brand: string | null; image: string | null; ean: string | null; origin: string | null;
    unitsPerCase: number; casesPerPallet: number; palletsPerShipment: number | null;
    unit: 'case' | 'pallet'; casesPerUnit: number; casePrice: number; unitPrice: number; maxQuantity: number; shareOfLoadPerUnit: number; minUnits: number;
    variants: string[];
}
export const loadCandidates = (id: string, q?: string) =>
    call<{ kind: LoadKind; items: LoadCandidate[]; reason: string | null }>(`/mixed-loads/${id}/candidates${q ? `?q=${encodeURIComponent(q)}` : ''}`);

/** Delivery destinations (backend policy). */
export interface DestinationCheck { supported: boolean; code: string | null; name: string | null; message: string | null }
export const listDestinations = () => call<{ countries: { code: string; name: string; supported: boolean }[]; note: string }>('/shipping/destinations');
export const checkDestination = (country: string) => call<DestinationCheck>('/shipping/check-destination', { method: 'POST', body: JSON.stringify({ country }) });
