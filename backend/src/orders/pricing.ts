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
 *  • An approved, unexpired wholesale offer (Offer.discountPercent, or a
 *    per-variant override) reduces the case price of a single-product
 *    line — the same discount the product page shows. Supplier price and
 *    buyer price are reduced by the same percentage.
 *  • A running special offer (Promotion, see promotions/promotion-rules.ts)
 *    works the same way. A single line gets ONE discount: the deeper of the
 *    offer and the special offer, never both. In mixed loads only special
 *    offers apply (per product, on its case/variant price), via
 *    `opts.discounts` — wholesale offers never applied to mixed loads.
 *  • Mixed loads: a mixed PALLET is filled with whole cases, a mixed TRUCK
 *    with whole pallets. Because every product has its own capacity
 *    (casesPerPallet / palletsPerShipment), each line occupies
 *    quantity ÷ that product's capacity of the load. The load is orderable
 *    when the shares add up to the required fill (default 100%, the rule
 *    an admin can require via MIX_MIN_FILL_PERCENT; none by default) and
 *    never above 100% of the products' own stated capacity.
 *  • Minimum order in a mixed load: a product's MOQ applies to that product
 *    (its SKU) in the load. Its variants — the only things that share a
 *    SKU on Ali FMCG (one Product row = one supplier listing) — count
 *    together; other products never count toward it. E.g. MOQ 5 pallets:
 *    3 pallets Grape + 2 pallets Lemon of the same product qualify. No supplier /
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
    stock?: number | null;
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
    minimum: LineMinimum | null;
}

/** Minimum-order progress of one line, in the unit the MOQ is set in (5 pallets, 200 cases…). */
export interface LineMinimum { unit: 'piece' | 'case' | 'pallet' | 'truck'; required: number; have: number; remaining: number; percent: number; met: boolean }

const MOQ_UNIT_WORD: Record<string, LineMinimum['unit']> = { PIECE: 'piece', CASE: 'case', PALLET: 'pallet', TRUCK: 'truck' };

/**
 * Progress toward the product's MOQ for `qty` units of `tier`, expressed in
 * the MOQ's own unit. Converted only through the product's real pack data;
 * when a needed pack size is missing, no progress is claimed (null).
 */
export function lineMinimum(p: PricingProduct, tier: Tier, qty: number): LineMinimum | null {
    const moq = pos(p.moq);
    if (!moq) return null;
    const unitKey = String(p.moqUnit || 'PIECE').toUpperCase();
    const unit = MOQ_UNIT_WORD[unitKey] ?? 'piece';
    const upc = pos(p.unitsPerCase), cpp = pos(p.casesPerPallet), ppt = pos(p.palletsPerShipment);
    const casesPerMoqUnit = unit === 'piece' ? (upc ? 1 / upc : 0) : unit === 'case' ? 1 : unit === 'pallet' ? cpp : cpp * ppt;
    const cases = qty * casesInUnit(p, tier);
    if (!casesPerMoqUnit || !Number.isFinite(cases)) return null;
    const have = Math.floor((cases / casesPerMoqUnit) * 100 + EPS) / 100;
    const met = qty >= minUnits(p, tier);
    return { unit, required: moq, have, remaining: met ? 0 : Math.max(0, Math.round((moq - have) * 100) / 100), percent: Math.min(100, Math.round((have / moq) * 1000) / 10), met };
}

/** Price one single-product line at a packaging tier, enforcing availability and MOQ. */
export function priceLine(p: PricingProduct, tierIn: unknown, quantity: unknown, m: Markups, opts: { raw?: boolean; discountPercent?: number } = {}): PricedLine {
    assertOrderable(p);
    const tier = normaliseTier(tierIn);
    if (!tier) throw new PricingError('INVALID_TIER', `${p.name}: choose case, pallet or truckload.`);
    const av = tierAvailability(p)[tier];
    if (!av.ok) {
        throw new PricingError('TIER_UNAVAILABLE', `${p.name} can't be ordered by the ${tier === 'carton' ? 'case' : tier === 'truck' ? 'truckload' : 'pallet'}: the supplier hasn't provided ${av.missing.join(', ')}.`, { productId: p.id, tier, missing: av.missing });
    }
    const qty = assertQuantity(quantity, p.name);
    const discount = offerFactor(opts.discountPercent);
    const perCase = round2(basePerCase(p, m) * (opts.raw ? 1 : tierMarkup(tier, m)) * discount);
    const cases = casesInUnit(p, tier);
    const unitPrice = round2(perCase * cases);
    const min = minUnits(p, tier);
    if (qty < min) {
        // Everything the cart needs to show progress and the "add more" path.
        throw new PricingError('BELOW_MOQ', `${p.name}: minimum order is ${min} ${UNIT_NAMES[tier][min === 1 ? 0 : 1]}.`, {
            productId: p.id, tier, minUnits: min, quantity: qty, remaining: min - qty, unitPrice, minLineTotal: round2(unitPrice * min),
            moq: pos(p.moq) || null, moqUnit: p.moqUnit ? String(p.moqUnit).toUpperCase() : null, mixable: mixOptions(p, tier, qty),
            minimum: lineMinimum(p, tier, qty), casesPerUnit: cases,
        });
    }
    return {
        productId: p.id, tier, quantity: qty, perCase, unitPrice,
        lineTotal: round2(unitPrice * qty),
        casesTotal: cases * qty,
        unitsTotal: cases * qty * pos(p.unitsPerCase),
        minUnits: min,
        minimum: lineMinimum(p, tier, qty),
    };
}

const UNIT_NAMES: Record<Tier, [string, string]> = { carton: ['case', 'cases'], pallet: ['pallet', 'pallets'], truck: ['truckload', 'truckloads'] };

/** 1 − offer% (0–90% accepted; anything else is ignored). */
export function offerFactor(pct: unknown): number {
    const n = typeof pct === 'number' && Number.isFinite(pct) && pct > 0 && pct <= 90 ? pct : 0;
    return 1 - n / 100;
}

/**
 * Whether a below-minimum single line can instead start a mixed load that
 * keeps the same quantity: cases → mixed pallet, pallets → mixed truck.
 * Only offered when the load could ever satisfy the product's own MOQ.
 */
export function mixOptions(p: PricingProduct, tier: Tier, qty: number): { kind: LoadKind; quantity: number; minUnits: number; capacity: number; variants: number } | null {
    const kind: LoadKind | null = tier === 'carton' ? 'PALLET' : tier === 'pallet' ? 'TRUCK' : null;
    if (!kind || !tierAvailability(p)[kind === 'PALLET' ? 'pallet' : 'truck'].ok) return null;
    // Mixing is within one SKU: the product needs at least two variants to mix.
    const variants = variantSignatures(p).length;
    if (variants < 2) return null;
    const capacity = kind === 'PALLET' ? pos(p.casesPerPallet) : pos(p.palletsPerShipment);
    const need = minUnits(p, kind === 'PALLET' ? 'carton' : 'pallet');
    if (need > capacity || qty > capacity) return null;
    return { kind, quantity: qty, minUnits: need, capacity, variants };
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
    /** Special-offer % already included in casePrice (absent when none applies). */
    discountPercent?: number;
}
export interface LoadMinimum {
    unit: 'case' | 'pallet';
    required: number;     // largest MOQ of this supplier's products, in load units
    have: number;         // this supplier's quantity in the load, in load units
    remaining: number;
    capacity: number;     // the most this load can hold of these products
    satisfiable: boolean; // false when the MOQ is bigger than the load itself
    products: string[];   // names of the products that set the minimum
}
export interface PricedLoad {
    kind: LoadKind;
    supplierId: string | null;
    lines: PricedLoadLine[];
    fill: number;         // 0..1+
    requiredFill: number;
    /** Minimum-order progress per supplier in the load (see header). */
    minimums: LoadMinimum[];
    subtotal: number;
    total: number;
    ready: boolean;
    issues: string[];
    origin: LoadOrigin;
}

/**
 * Where a mixed load would be dispatched from.
 *  VERIFIED   — every product sits in the same verified warehouse (or the same stated EXW location).
 *  UNVERIFIED — location missing, or same country but different/unknown sites: Ali FMCG must check first.
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
export function priceLoad(kind: LoadKind, lines: LoadLineInput[], products: Map<string, PricingProduct>, m: Markups, opts: { requiredFill?: number; discounts?: Map<string, number> } = {}): PricedLoad {
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
        // A running special offer (promotion) takes its % off the supplier's (variant) case price, once.
        const pct = opts.discounts?.get(l.productId) ?? 0;
        const casePrice = round2(variantCasePrice(p, l.variant, m) * offerFactor(pct));
        const cases = kind === 'PALLET' ? l.quantity : l.quantity * cpp;
        const share = kind === 'PALLET' ? l.quantity / cpp : l.quantity / ppt;
        out.push({ ...l, name: p.name, unit: kind === 'PALLET' ? 'case' : 'pallet', casePrice, cases, units: cases * upc, share, lineSubtotal: round2(casePrice * cases), ...(offerFactor(pct) < 1 ? { discountPercent: pct } : {}) });
    }

    const origin = loadOrigin(out.map((l) => products.get(l.productId)!));
    const fill = out.reduce((s, l) => s + l.share, 0);
    const minimums = loadMinimums(kind, out, products);
    if (fill > 1 + EPS) {
        throw new PricingError('OVER_CAPACITY', `This mixed ${kind === 'PALLET' ? 'pallet' : 'truckload'} is ${Math.round(fill * 100)}% full — remove some quantity.`, { fill });
    }
    const rawSubtotal = round2(out.reduce((s, l) => s + l.lineSubtotal, 0));
    // Same total as always (supplier prices × mix markup, rounded once).
    const total = round2(rawSubtotal * m.mix);
    const issues: string[] = [];
    if (out.length === 0) issues.push('Add at least one product.');
    else if (requiredFill > 0 && fill < requiredFill - EPS) issues.push(`${Math.round(fill * 100)}% full — fill to ${Math.round(requiredFill * 100)}% to order.`);
    // Stock is kept in cases; variant lines of one product share it.
    const casesByProduct = new Map<string, number>();
    for (const l of out) casesByProduct.set(l.productId, (casesByProduct.get(l.productId) ?? 0) + l.cases);
    for (const [pid, cases] of casesByProduct) {
        const p = products.get(pid)!;
        if (typeof p.stock === 'number' && cases > p.stock) issues.push(p.stock > 0 ? `Only ${p.stock.toLocaleString('en-GB')} case${p.stock === 1 ? '' : 's'} of ${p.name} in stock — reduce it.` : `${p.name} is out of stock — remove it.`);
    }
    for (const g of minimums) {
        const u = (n: number) => `${n.toLocaleString('en-GB')} ${g.unit}${n === 1 ? '' : 's'}`;
        if (!g.satisfiable) issues.push(`Minimum order for ${g.products.join(', ')} is ${u(g.required)}, more than this ${kind === 'PALLET' ? 'pallet' : 'truck'} can hold (${u(g.capacity)}). Order it ${kind === 'PALLET' ? 'by the pallet' : 'by the truckload'} instead.`);
        else if (g.remaining > 0) issues.push(`Minimum order: ${u(g.required)}. Add ${g.remaining.toLocaleString('en-GB')} more ${g.unit}${g.remaining === 1 ? '' : 's'} of ${g.products[0]} (any of its variants).`);
    }
    // Mixing several products needs one verified dispatch site; never assumed.
    if (new Set(out.map((l) => l.productId)).size > 1 && origin.status !== 'VERIFIED') {
        issues.push(`Dispatch location needs verification before these products can ship together (${origin.unverified.join(', ')}). Ali FMCG will confirm.`);
    }
    // What leaves the server is buyer-priced: each line carries the mix markup,
    // so neither the supplier price nor the markup is part of a quote.
    const buyerLines = out.map((l) => ({ ...l, casePrice: Math.round(l.casePrice * m.mix * 10000) / 10000, lineSubtotal: round2(l.lineSubtotal * m.mix) }));
    return { kind, supplierId: mixedSuppliers ? null : supplierId, lines: buyerLines, fill, requiredFill, minimums, subtotal: total, total, ready: issues.length === 0, issues, origin };
}

/**
 * Minimum-order groups of a mixed load: one per supplier. The requirement is
 * the largest MOQ among that supplier's products in the load unit; the
 * quantity is everything from that supplier in the load.
 */
export function loadMinimums(kind: LoadKind, lines: { productId: string; quantity: number }[], products: Map<string, PricingProduct>): LoadMinimum[] {
    const unitTier: Tier = kind === 'PALLET' ? 'carton' : 'pallet';
    const groups = new Map<string, { have: number; required: number; setters: string[]; capacity: number }>();
    for (const l of lines) {
        const p = products.get(l.productId);
        if (!p) continue;
        const key = p.id; // one SKU: variants of the product count together, other products never do
        const g = groups.get(key) ?? { have: 0, required: 1, setters: [], capacity: Infinity };
        g.have += l.quantity;
        const cap = kind === 'PALLET' ? pos(p.casesPerPallet) : pos(p.palletsPerShipment);
        if (cap) g.capacity = Math.min(g.capacity, cap);
        if (pos(p.moq)) {
            const need = minUnits(p, unitTier);
            if (need > g.required) { g.required = need; g.setters = [p.name]; }
            else if (need === g.required && need > 1 && !g.setters.includes(p.name)) g.setters.push(p.name);
        }
        groups.set(key, g);
    }
    return [...groups.values()].filter((g) => g.required > 1).map((g) => {
        const capacity = Number.isFinite(g.capacity) ? g.capacity : g.required;
        return {
            unit: kind === 'PALLET' ? 'case' : 'pallet', required: g.required, have: g.have, remaining: Math.max(0, g.required - g.have),
            capacity, satisfiable: g.required <= capacity, products: g.setters,
        } as LoadMinimum;
    });
}
