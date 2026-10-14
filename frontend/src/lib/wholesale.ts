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
    error: { code: string; message: string; minUnits?: number } | null;
}
export interface CartQuote { subtotal: number; discountPercent: number; discount: number; coupon: string | null; total: number; lines: QuoteLine[]; ready: boolean }

export const quoteCart = (items: CartItem[], couponCode?: string) =>
    call<CartQuote>('/orders/quote', { method: 'POST', body: JSON.stringify({ items: items.map(toServerItem), couponCode: couponCode || undefined }) });

// ── Mixed pallets / truckloads ───────────────────────────────────────────
export type LoadKind = 'PALLET' | 'TRUCK';
export interface LoadLine { productId: string; variant?: string | null; quantity: number }
export interface MixedLoadQuote {
    kind: LoadKind; supplierId: string | null; fill: number; requiredFill: number; subtotal: number; total: number; ready: boolean; issues: string[];
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
