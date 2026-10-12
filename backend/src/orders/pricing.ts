/**
 * Server-side wholesale pricing — the single source of truth for what a
 * buyer is charged. Pure functions (no DB) so they can be unit-tested and
 * reused by orders, cart quotes and mixed loads.
 *
 * Business rules, all derived from data that already exists:
 *  • basePrice is the supplier's per-CASE price; when it's missing the list
 *    price is reversed through the piece markup (same as the storefront).
 *  • A packaging tier is offered only when the product has the pack sizes
 *    it depends on:  case → unitsPerCase,  pallet → + casesPerPallet,
 *    truck → + palletsPerShipment.  Nothing is defaulted.
 *  • Each tier applies its admin markup (AppConfig): case = piece,
 *    pallet = pallet, truck = container. A supplier buying their own
 *    listing pays the raw price.
 *  • MOQ is stored as `moq` + `moqUnit` (PIECE|CASE|PALLET|TRUCK) and is
 *    converted to the ordered packaging unit (rounded up).
 *  • Mixed loads: a mixed PALLET is filled with whole cases, a mixed TRUCK
 *    with whole pallets. Because every product has its own capacity
 *    (casesPerPallet / palletsPerShipment), each line occupies
 *    quantity ÷ that product's capacity of the load. The load is orderable
 *    when the shares add up to the required fill (default 100%, the rule
 *    an admin can require via MIX_MIN_FILL_PERCENT; none by default) and
 *    never above 100% of the products' own stated capacity. No supplier /
 *    location compatibility rule is applied (not yet defined by the
 *    business). Price = Σ case price × cases, then the admin mix markup.
 */

export type Tier = 'carton' | 'pallet' | 'truck';
export type LoadKind = 'PALLET' | 'TRUCK';

export interface Markups { piece: number; pallet: number; container: number; mix: number }

export interface PricingProduct {
    id: string;
    name: string;
    price: number;
    basePrice?: number | null;
    unitsPerCase?: number | null;
    casesPerPallet?: number | null;
    palletsPerShipment?: number | null;
    moq?: number | null;
    moqUnit?: string | null;
    status?: string | null;
    supplierId?: string | null;
    exwLocation?: string | null;
    /** Verified stock location (supplier warehouse), when the product is linked to one. */
    warehouse?: { id: string; city?: string | null; country?: string | null } | null;
    variantPrices?: unknown;
    variants?: unknown;
}

export class PricingError extends Error {
    constructor(public code: string, message: string, public detail?: Record<string, unknown>) {
        super(message);
    }
}

export const MAX_UNITS_PER_LINE = 10_000;
export const MAX_LINES_PER_LOAD = 60;
const EPS = 1e-9;

const pos = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function normaliseTier(t: unknown): Tier | null {
    const s = String(t ?? '').toLowerCase();
    if (s === 'truck' || s === 'truckload' || s === 'container') return 'truck';
    if (s === 'pallet') return 'pallet';
    if (s === 'carton' || s === 'case') return 'carton';
    return null;
}

/** Which tiers the product's own pack data supports, and what's missing for the rest. */
export function tierAvailability(p: PricingProduct): Record<Tier, { ok: boolean; missing: string[] }> {
    const upc = pos(p.unitsPerCase), cpp = pos(p.casesPerPallet), ppt = pos(p.palletsPerShipment);
    const miss = (pairs: [string, number][]) => pairs.filter(([, v]) => !v).map(([k]) => k);
    const carton = miss([['unitsPerCase', upc]]);
    const pallet = miss([['unitsPerCase', upc], ['casesPerPallet', cpp]]);
    const truck = miss([['unitsPerCase', upc], ['casesPerPallet', cpp], ['palletsPerShipment', ppt]]);
    return {
        carton: { ok: carton.length === 0, missing: carton },
        pallet: { ok: pallet.length === 0, missing: pallet },
        truck: { ok: truck.length === 0, missing: truck },
    };
}

export function casesInUnit(p: PricingProduct, tier: Tier): number {
    const cpp = pos(p.casesPerPallet), ppt = pos(p.palletsPerShipment);
    return tier === 'carton' ? 1 : tier === 'pallet' ? cpp : cpp * ppt;
}

/** Per-case price before tier markup. */
export function basePerCase(p: PricingProduct, m: Markups): number {
    const b = typeof p.basePrice === 'number' && Number.isFinite(p.basePrice) && p.basePrice > 0 ? p.basePrice : null;
    if (b != null) return b;
    return pos(p.price) / (m.piece || 1);
}

export function tierMarkup(tier: Tier, m: Markups): number {
    return tier === 'truck' ? m.container : tier === 'pallet' ? m.pallet : m.piece;
}

/** MOQ expressed in whole units of `tier` (≥ 1). */
export function minUnits(p: PricingProduct, tier: Tier): number {
    const moq = pos(p.moq);
    if (!moq) return 1;
    const upc = pos(p.unitsPerCase) || 1, cpp = pos(p.casesPerPallet) || 1, ppt = pos(p.palletsPerShipment) || 1;
    const unit = String(p.moqUnit || 'PIECE').toUpperCase();
    const moqPieces = unit === 'TRUCK' ? moq * upc * cpp * ppt : unit === 'PALLET' ? moq * upc * cpp : unit === 'CASE' ? moq * upc : moq;
    const piecesPerUnit = upc * (tier === 'carton' ? 1 : tier === 'pallet' ? cpp : cpp * ppt);
    return Math.max(1, Math.ceil(moqPieces / piecesPerUnit - EPS));
}

function assertOrderable(p: PricingProduct) {
    if (p.status && String(p.status).toUpperCase() !== 'APPROVED') {
        throw new PricingError('PRODUCT_NOT_AVAILABLE', `${p.name} is not available for ordering.`, { productId: p.id });
    }
}

function assertQuantity(q: unknown, label: string): number {
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1) throw new PricingError('INVALID_QUANTITY', `${label}: quantity must be a whole number of at least 1.`);
    if (q > MAX_UNITS_PER_LINE) throw new PricingError('INVALID_QUANTITY', `${label}: quantity above ${MAX_UNITS_PER_LINE} — request a quote instead.`);
    return q;
}

export interface PricedLine {
    productId: string;
    tier: Tier;
    quantity: number;
    perCase: number;
    unitPrice: number;   // one case / pallet / truck
    lineTotal: number;
    casesTotal: number;
    unitsTotal: number;
    minUnits: number;
}

/** Price one single-product line at a packaging tier, enforcing availability and MOQ. */
export function priceLine(p: PricingProduct, tierIn: unknown, quantity: unknown, m: Markups, opts: { raw?: boolean } = {}): PricedLine {
    assertOrderable(p);
    const tier = normaliseTier(tierIn);
    if (!tier) throw new PricingError('INVALID_TIER', `${p.name}: choose case, pallet or truckload.`);
    const av = tierAvailability(p)[tier];
    if (!av.ok) {
        throw new PricingError('TIER_UNAVAILABLE', `${p.name} can't be ordered by the ${tier === 'carton' ? 'case' : tier === 'truck' ? 'truckload' : 'pallet'}: the supplier hasn't provided ${av.missing.join(', ')}.`, { productId: p.id, tier, missing: av.missing });
    }
    const qty = assertQuantity(quantity, p.name);
    const min = minUnits(p, tier);
    if (qty < min) throw new PricingError('BELOW_MOQ', `${p.name}: minimum order is ${min} ${tier === 'carton' ? 'case' : tier}${min === 1 ? '' : 's'}.`, { productId: p.id, tier, minUnits: min });
    const perCase = round2(basePerCase(p, m) * (opts.raw ? 1 : tierMarkup(tier, m)));
    const cases = casesInUnit(p, tier);
    const unitPrice = round2(perCase * cases);
    return {
        productId: p.id, tier, quantity: qty, perCase, unitPrice,
        lineTotal: round2(unitPrice * qty),
        casesTotal: cases * qty,
        unitsTotal: cases * qty * pos(p.unitsPerCase),
        minUnits: min,
    };
}

export interface LoadLineInput { productId: string; variant?: string | null; quantity: number }
export interface PricedLoadLine extends LoadLineInput {
    name: string;
    unit: 'case' | 'pallet';
    casePrice: number;
    cases: number;
    units: number;
    share: number;      // fraction of the load this line occupies
    lineSubtotal: number;
}
export interface PricedLoad {
    kind: LoadKind;
    supplierId: string | null;
    lines: PricedLoadLine[];
    fill: number;         // 0..1+
    requiredFill: number;
    subtotal: number;
    markup: number;
    total: number;
    ready: boolean;
    issues: string[];
    origin: LoadOrigin;
}

/**
 * Where a mixed load would be dispatched from.
 *  VERIFIED   — every product sits in the same verified warehouse (or the same stated EXW location).
 *  UNVERIFIED — location missing, or same country but different/unknown sites: Atlantis must check first.
 *  (Different countries are rejected outright with ORIGIN_MISMATCH.)
 */
export interface LoadOrigin { status: 'VERIFIED' | 'UNVERIFIED'; label: string | null; country: string | null; unverified: string[] }

const normLoc = (s?: string | null) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function loadOrigin(products: PricingProduct[]): LoadOrigin {
    const unique = [...new Map(products.map((p) => [p.id, p])).values()];
    const sites = unique.map((p) => {
        const w = p.warehouse;
        if (w && w.id) return { p, key: `wh:${w.id}`, country: normLoc(w.country) || null, label: [w.city, w.country].filter(Boolean).join(', ') || null };
        if (normLoc(p.exwLocation)) return { p, key: `exw:${normLoc(p.exwLocation)}`, country: null, label: String(p.exwLocation).trim() };
        return { p, key: null as string | null, country: null, label: null as string | null };
    });
    const countries = [...new Set(sites.map((s) => s.country).filter(Boolean))] as string[];
    if (countries.length > 1) {
        const a = sites.find((s) => s.country === countries[0])!, b = sites.find((s) => s.country === countries[1])!;
        throw new PricingError('ORIGIN_MISMATCH',
            `${a.p.name} ships from ${a.label} and ${b.p.name} from ${b.label}. Products dispatched from different countries can't share one mixed load.`,
            { productIds: [a.p.id, b.p.id] });
    }
    const unknown = sites.filter((s) => !s.key).map((s) => s.p.name);
    const keys = new Set(sites.map((s) => s.key).filter(Boolean));
    const first = sites.find((s) => s.key);
    if (unique.length <= 1 || (unknown.length === 0 && keys.size === 1)) {
        return { status: unknown.length ? 'UNVERIFIED' : 'VERIFIED', label: first?.label ?? null, country: first?.country ?? null, unverified: unknown };
    }
    // Several products, and either a location is missing or they sit at different sites.
    return { status: 'UNVERIFIED', label: keys.size === 1 ? first?.label ?? null : null, country: countries[0] ?? null, unverified: unknown.length ? unknown : sites.map((s) => s.p.name) };
}

/** Sellable variant signatures ("Flavour=Grape|Size=500ml") from the product's own variant groups. */
export function variantSignatures(p: PricingProduct): string[] {
    const groups = (Array.isArray(p.variants) ? p.variants : [])
        .filter((g: any) => g && g.name && !String(g.name).startsWith('__') && Array.isArray(g.values) && g.values.length)
        .map((g: any) => ({ name: String(g.name), values: g.values.map((v: unknown) => String(v)) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    if (!groups.length) return [];
    let combos: Record<string, string>[] = [{}];
    for (const g of groups) combos = combos.flatMap((c) => g.values.map((v: string) => ({ ...c, [g.name]: v })));
    return combos.map((c) => Object.keys(c).sort().map((k) => `${k}=${c[k]}`).join('|'));
}

function variantCasePrice(p: PricingProduct, variant: string | null | undefined, m: Markups): number {
    if (variant) {
        const priced = p.variantPrices && typeof p.variantPrices === 'object' ? (p.variantPrices as Record<string, unknown>) : {};
        const known = variantSignatures(p);
        if (!known.includes(variant) && priced[variant] === undefined) {
            throw new PricingError('UNKNOWN_VARIANT', `${p.name}: variant "${variant}" doesn't exist.`, { productId: p.id, variant });
        }
        const n = Number(priced[variant]);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return basePerCase(p, m);
}

/**
 * Validate and price a mixed pallet / truckload. Structural problems
 * (ineligible product, wrong supplier, over capacity) throw; an
 * under-filled load is returned with ready=false so a draft can be saved.
 */
export function priceLoad(kind: LoadKind, lines: LoadLineInput[], products: Map<string, PricingProduct>, m: Markups, opts: { requiredFill?: number } = {}): PricedLoad {
    if (kind !== 'PALLET' && kind !== 'TRUCK') throw new PricingError('INVALID_LOAD', 'Mixed loads are either a PALLET or a TRUCK.');
    if (!Array.isArray(lines)) throw new PricingError('INVALID_LOAD', 'Lines must be a list.');
    if (lines.length > MAX_LINES_PER_LOAD) throw new PricingError('INVALID_LOAD', `A mixed load can hold at most ${MAX_LINES_PER_LOAD} lines.`);
    // 0 = no minimum fill (default until the business defines one).
    const requiredFill = typeof opts.requiredFill === 'number' && opts.requiredFill >= 0 && opts.requiredFill <= 1 ? opts.requiredFill : 1;

    // Merge duplicate product+variant lines.
    const merged = new Map<string, LoadLineInput>();
    for (const l of lines) {
        if (!l || typeof l.productId !== 'string') throw new PricingError('INVALID_LOAD', 'Each line needs a productId.');
        const qty = assertQuantity(l.quantity, 'Mixed load line');
        const key = `${l.productId}::${l.variant || ''}`;
        const prev = merged.get(key);
        merged.set(key, { productId: l.productId, variant: l.variant || null, quantity: (prev?.quantity ?? 0) + qty });
    }

    let supplierId: string | null = null, mixedSuppliers = false;
    const out: PricedLoadLine[] = [];
    for (const l of merged.values()) {
        const p = products.get(l.productId);
        if (!p) throw new PricingError('PRODUCT_NOT_FOUND', 'A product in this load no longer exists.', { productId: l.productId });
        assertOrderable(p);
        const av = tierAvailability(p)[kind === 'PALLET' ? 'pallet' : 'truck'];
        if (!av.ok) throw new PricingError('NOT_MIXABLE', `${p.name} can't go in a mixed ${kind === 'PALLET' ? 'pallet' : 'truckload'}: the supplier hasn't provided ${av.missing.join(', ')}.`, { productId: p.id, missing: av.missing });
        // Recorded for display only — no compatibility rule is enforced.
        const sup = p.supplierId ?? null;
        if (supplierId === null) supplierId = sup;
        else if (sup !== supplierId) mixedSuppliers = true;
        const cpp = pos(p.casesPerPallet), ppt = pos(p.palletsPerShipment), upc = pos(p.unitsPerCase);
        const casePrice = round2(variantCasePrice(p, l.variant, m));
        const cases = kind === 'PALLET' ? l.quantity : l.quantity * cpp;
        const share = kind === 'PALLET' ? l.quantity / cpp : l.quantity / ppt;
        out.push({ ...l, name: p.name, unit: kind === 'PALLET' ? 'case' : 'pallet', casePrice, cases, units: cases * upc, share, lineSubtotal: round2(casePrice * cases) });
    }

    const origin = loadOrigin(out.map((l) => products.get(l.productId)!));
    const fill = out.reduce((s, l) => s + l.share, 0);
    if (fill > 1 + EPS) {
        throw new PricingError('OVER_CAPACITY', `This mixed ${kind === 'PALLET' ? 'pallet' : 'truckload'} is ${Math.round(fill * 100)}% full — remove some quantity.`, { fill });
    }
    const subtotal = round2(out.reduce((s, l) => s + l.lineSubtotal, 0));
    const total = round2(subtotal * m.mix);
    const issues: string[] = [];
    if (out.length === 0) issues.push('Add at least one product.');
    else if (requiredFill > 0 && fill < requiredFill - EPS) issues.push(`${Math.round(fill * 100)}% full — fill to ${Math.round(requiredFill * 100)}% to order.`);
    // Mixing several products needs one verified dispatch site; never assumed.
    if (new Set(out.map((l) => l.productId)).size > 1 && origin.status !== 'VERIFIED') {
        issues.push(`Dispatch location needs verification before these products can ship together (${origin.unverified.join(', ')}). Atlantis will confirm.`);
    }
    return { kind, supplierId: mixedSuppliers ? null : supplierId, lines: out, fill, requiredFill, subtotal, markup: m.mix, total, ready: issues.length === 0, issues, origin };
}
