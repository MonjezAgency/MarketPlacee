/**
 * Fulfilment calculation — the one place logistics charges are worked out.
 *
 * Used by supplier fulfilment settings, product offers, cart quotes and order
 * creation, so every screen shows the same figures. Rules:
 *  • The supplier's net goods price never changes with the method; charges
 *    are separate lines with their basis and source.
 *  • A charge exists only when Atlantis configured a rate for that exact
 *    route and unit, or the supplier declared their own freight. Otherwise
 *    the option is "quote_required" — never estimated.
 *  • Hubs count only when verified and active.
 * Pure: no database access. fulfillment.service.ts loads the inputs.
 */

export type FulfillmentMethod = 'ATLANTIS_COLLECTION' | 'SUPPLIER_TO_HUB' | 'SUPPLIER_DIRECT';
export const FULFILLMENT_METHODS: FulfillmentMethod[] = ['ATLANTIS_COLLECTION', 'SUPPLIER_TO_HUB', 'SUPPLIER_DIRECT'];
export type RateUnit = 'CASE' | 'PALLET' | 'TRUCK';
export type Tier = 'carton' | 'pallet' | 'truck';

export interface Rate {
    id?: string;
    method: 'ATLANTIS_COLLECTION' | 'HUB_TO_BUYER';
    originCountry: string;
    destinationCountry: string;
    hubId?: string | null;
    unit: RateUnit;
    amountEur: number;
    minTransitDays?: number | null;
    maxTransitDays?: number | null;
    active?: boolean;
}
export interface Hub { id: string; name: string; city: string; country: string; services: string[]; verified: boolean; active: boolean }
export interface SupplierFulfillmentSettings { defaultMethod: FulfillmentMethod; hubFreightPerPallet?: number | null; hubId?: string | null }

export interface LoadSpec {
    tier: Tier;
    quantity: number;
    casesPerPallet?: number | null;
    palletsPerShipment?: number | null;
    /** A server-validated mixed pallet / truckload: one pallet or one truck per unit. */
    mixed?: boolean;
}

export interface Charge {
    key: string;
    label: string;
    basis: string;
    amount: number;
    /** Who the charge goes to. Supplier freight is passed through at cost, never marked up. */
    paidTo: 'Atlantis' | 'Supplier (passed through)';
    source: string;
}
export interface Step { who: 'Supplier' | 'Atlantis' | 'Carrier' | 'Buyer'; what: string }
export interface FulfillmentOption {
    method: FulfillmentMethod;
    label: string;
    status: 'priced' | 'quote_required' | 'unavailable';
    reasons: string[];
    charges: Charge[];
    /** Sum of the charges; null unless every charge of the option is known. */
    total: number | null;
    transitDays: { min: number; max: number } | null;
    hub: { id: string; name: string; city: string; country: string } | null;
    steps: Step[];
    /** Where responsibility for the goods passes from the supplier. */
    handover: string;
}

export const METHOD_INFO: Record<FulfillmentMethod, { label: string; summary: string; steps: Step[]; handover: string }> = {
    ATLANTIS_COLLECTION: {
        label: 'Atlantis arranges collection',
        summary: 'A carrier booked by Atlantis collects from your EXW location and delivers to the buyer. Your net price stays the same; freight is added for the buyer.',
        steps: [
            { who: 'Supplier', what: 'Prepares the confirmed goods at the EXW location.' },
            { who: 'Atlantis', what: 'Books the carrier and agrees the collection date with you.' },
            { who: 'Carrier', what: 'Collects from your EXW location and delivers to the buyer.' },
        ],
        handover: 'At collection from your EXW location (Ex Works).',
    },
    SUPPLIER_TO_HUB: {
        label: 'You deliver to an Atlantis hub',
        summary: 'You bring the goods to a verified Atlantis hub at your own cost. Your declared freight is added on top of your net price; Atlantis ships from the hub to the buyer.',
        steps: [
            { who: 'Supplier', what: 'Delivers the confirmed goods to the agreed Atlantis hub.' },
            { who: 'Atlantis', what: 'Receives the goods at the hub (and inspects them where the hub offers inspection).' },
            { who: 'Carrier', what: 'Ships from the hub to the buyer.' },
        ],
        handover: 'When the hub signs for the goods.',
    },
    SUPPLIER_DIRECT: {
        label: 'You ship directly to the buyer',
        summary: 'You arrange transport to the buyer yourself.',
        steps: [
            { who: 'Supplier', what: 'Arranges and pays transport to the buyer.' },
            { who: 'Buyer', what: 'Receives the goods.' },
        ],
        handover: 'On delivery to the buyer.',
    },
};

const eur = (n: number) => `€${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * What the load physically is. Pallet spaces are only known when the
 * packaging says so: a case order fills ceil(cases / cases per pallet)
 * pallet spaces only if cases per pallet is set.
 */
export function shippingUnits(spec: LoadSpec): { cases: number | null; pallets: number | null; trucks: number | null } {
    const q = Math.max(0, Math.floor(Number(spec.quantity) || 0));
    const cpp = Number(spec.casesPerPallet) > 0 ? Number(spec.casesPerPallet) : null;
    const ppt = Number(spec.palletsPerShipment) > 0 ? Number(spec.palletsPerShipment) : null;
    if (spec.tier === 'truck') return { cases: cpp && ppt ? q * ppt * cpp : null, pallets: spec.mixed ? (ppt ? q * ppt : null) : ppt ? q * ppt : null, trucks: q };
    if (spec.tier === 'pallet') return { cases: cpp ? q * cpp : null, pallets: q, trucks: null };
    return { cases: q, pallets: cpp ? Math.ceil(q / cpp) : null, trucks: null };
}

/** The single configured rate for a route and unit; two active rates for the same key is a configuration conflict, not a choice. */
function findRate(rates: Rate[], method: Rate['method'], origin: string, dest: string, unit: RateUnit, hubId?: string | null): { rate?: Rate; conflict?: boolean } {
    const list = rates.filter((r) => r.active !== false && r.method === method && r.originCountry === origin && r.destinationCountry === dest && r.unit === unit
        && (method !== 'HUB_TO_BUYER' || !r.hubId || r.hubId === hubId));
    // A hub-specific rate beats a country-level one.
    const specific = list.filter((r) => r.hubId && r.hubId === hubId);
    const pool = specific.length ? specific : list;
    if (pool.length > 1) return { conflict: true };
    return { rate: pool[0] };
}

/** Freight for one leg: truck rate per truck, pallet rate per pallet space, case rate per case — whichever applies to the load. */
function legCharge(rates: Rate[], method: Rate['method'], origin: string, dest: string, spec: LoadSpec, hubId: string | null, label: string, routeLabel: string): { charge?: Charge; transit?: { min: number; max: number } | null; reason?: string } {
    const u = shippingUnits(spec);
    const tryUnits: { unit: RateUnit; count: number | null; word: string }[] =
        spec.tier === 'truck' ? [{ unit: 'TRUCK', count: u.trucks, word: 'truck' }, { unit: 'PALLET', count: u.pallets, word: 'pallet' }]
            : spec.tier === 'pallet' ? [{ unit: 'PALLET', count: u.pallets, word: 'pallet' }]
                : [{ unit: 'CASE', count: u.cases, word: 'case' }, { unit: 'PALLET', count: u.pallets, word: 'pallet space' }];
    for (const t of tryUnits) {
        if (!t.count) continue;
        const { rate, conflict } = findRate(rates, method, origin, dest, t.unit, hubId);
        if (conflict) return { reason: `Two different rates are configured for ${routeLabel} per ${t.unit.toLowerCase()} — Atlantis will quote this route.` };
        if (!rate) continue;
        const amount = round2(rate.amountEur * t.count);
        const partial = t.word === 'pallet space' ? ` (${plural(u.cases!, 'case')} fill ${plural(t.count, 'pallet space')})` : '';
        return {
            charge: { key: `${method}:${t.unit}`, label, basis: `${plural(t.count, t.word)} × ${eur(rate.amountEur)}${partial}`, amount, paidTo: 'Atlantis', source: `Atlantis rate, ${routeLabel}` },
            transit: rate.minTransitDays != null && rate.maxTransitDays != null ? { min: rate.minTransitDays, max: rate.maxTransitDays } : null,
        };
    }
    if (spec.tier === 'carton' && !u.pallets) return { reason: `No rate per case for ${routeLabel}, and the product has no cases-per-pallet to work out pallet spaces — Atlantis will quote it.` };
    return { reason: `No Atlantis rate is configured for ${routeLabel} — the freight is quoted after the order.` };
}

export interface PriceArgs {
    method: FulfillmentMethod;
    /** ISO2 of the supplier's EXW location; null when it can't be read. */
    dispatchCountry: string | null;
    /** ISO2 of the buyer's delivery country; null when not chosen yet. */
    destination: string | null;
    destinationSupported?: boolean;
    spec: LoadSpec;
    rates: Rate[];
    hubs: Hub[];
    supplier: SupplierFulfillmentSettings | null;
    countryName?: (c: string) => string;
}

export function priceOption(a: PriceArgs): FulfillmentOption {
    const info = METHOD_INFO[a.method];
    const name = a.countryName || ((c: string) => c);
    const base: FulfillmentOption = { method: a.method, label: info.label, status: 'quote_required', reasons: [], charges: [], total: null, transitDays: null, hub: null, steps: info.steps, handover: info.handover };
    if (a.method === 'SUPPLIER_DIRECT') {
        return { ...base, status: 'unavailable', reasons: ['Direct shipment by suppliers isn’t offered on Atlantis yet.'] };
    }
    if (!a.destination) return { ...base, reasons: ['Choose a delivery country to see delivery charges.'] };
    if (a.destinationSupported === false) return { ...base, status: 'unavailable', reasons: [`Atlantis doesn’t deliver to ${name(a.destination)} at the moment.`] };
    if (!(Number(a.spec.quantity) > 0)) return { ...base, reasons: ['Enter a quantity.'] };

    if (a.method === 'ATLANTIS_COLLECTION') {
        if (!a.dispatchCountry) return { ...base, reasons: ['The EXW location doesn’t name a country Atlantis recognises — freight is quoted after the order.'] };
        const route = `${name(a.dispatchCountry)} → ${name(a.destination)}`;
        const leg = legCharge(a.rates, 'ATLANTIS_COLLECTION', a.dispatchCountry, a.destination, a.spec, null, 'Freight (collection to delivery)', route);
        if (!leg.charge) return { ...base, reasons: [leg.reason!] };
        return { ...base, status: 'priced', charges: [leg.charge], total: leg.charge.amount, transitDays: leg.transit ?? null };
    }

    // SUPPLIER_TO_HUB
    const hub = a.supplier?.hubId ? a.hubs.find((h) => h.id === a.supplier!.hubId) : undefined;
    const verifiedHubs = a.hubs.filter((h) => h.verified && h.active);
    if (!verifiedHubs.length) return { ...base, status: 'unavailable', reasons: ['Atlantis has no verified hub accepting deliveries yet.'] };
    if (!hub) return { ...base, status: 'unavailable', reasons: ['Choose the Atlantis hub you deliver to in your fulfilment settings.'] };
    if (!hub.verified || !hub.active) return { ...base, status: 'unavailable', reasons: [`${hub.name} isn’t a verified, active Atlantis hub.`] };
    const withHub = { ...base, hub: { id: hub.id, name: hub.name, city: hub.city, country: hub.country } };
    const u = shippingUnits(a.spec);
    const charges: Charge[] = [];
    const reasons: string[] = [];
    const perPallet = a.supplier?.hubFreightPerPallet;
    if (perPallet == null || !(perPallet >= 0)) reasons.push('Add what you charge to bring one pallet to the hub.');
    else if (!u.pallets) reasons.push('Pallet spaces can’t be worked out for this load (set cases per pallet).');
    else charges.push({ key: 'SUPPLIER_TO_HUB:PALLET', label: 'Your freight to the hub', basis: `${plural(u.pallets, 'pallet')} × ${eur(perPallet)}`, amount: round2(perPallet * u.pallets), paidTo: 'Supplier (passed through)', source: 'Declared by the supplier' });
    const route = `${hub.city} hub → ${name(a.destination)}`;
    const leg = legCharge(a.rates, 'HUB_TO_BUYER', hub.country, a.destination, a.spec, hub.id, 'Freight (hub to delivery)', route);
    if (leg.charge) charges.push(leg.charge); else reasons.push(leg.reason!);
    if (reasons.length) return { ...withHub, charges, reasons };
    return { ...withHub, status: 'priced', charges, total: round2(charges.reduce((s, c) => s + c.amount, 0)), transitDays: leg.transit ?? null };
}

/** The method a product actually uses: its own override, else the supplier's default, else Atlantis collection. */
export function methodFor(product: { fulfillmentMethod?: string | null }, supplier: SupplierFulfillmentSettings | null): FulfillmentMethod {
    const m = (product.fulfillmentMethod || supplier?.defaultMethod || 'ATLANTIS_COLLECTION') as FulfillmentMethod;
    return FULFILLMENT_METHODS.includes(m) ? m : 'ATLANTIS_COLLECTION';
}

/** "Constanța, Romania" → "RO"; null when no recognised country is named. */
export function dispatchCountryOf(exwLocation: string | null | undefined, resolve: (s: string) => string | null): string | null {
    const parts = String(exwLocation || '').split(/[,;/|–-]/).map((s) => s.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) { const c = resolve(parts[i]); if (c) return c; }
    return null;
}

export function validateRate(r: any): { ok: true; rate: Omit<Rate, 'id'> } | { ok: false; error: string } {
    const method = String(r?.method || '');
    if (!['ATLANTIS_COLLECTION', 'HUB_TO_BUYER'].includes(method)) return { ok: false, error: 'Method must be ATLANTIS_COLLECTION or HUB_TO_BUYER.' };
    const unit = String(r?.unit || '').toUpperCase();
    if (!['CASE', 'PALLET', 'TRUCK'].includes(unit)) return { ok: false, error: 'Unit must be CASE, PALLET or TRUCK.' };
    const amount = Number(r?.amountEur);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000) return { ok: false, error: 'Amount must be a number between 0 and 100,000 EUR.' };
    const min = r?.minTransitDays == null || r?.minTransitDays === '' ? null : Number(r.minTransitDays);
    const max = r?.maxTransitDays == null || r?.maxTransitDays === '' ? null : Number(r.maxTransitDays);
    if ((min != null && (!Number.isInteger(min) || min < 0)) || (max != null && (!Number.isInteger(max) || max < 0))) return { ok: false, error: 'Transit days must be whole numbers.' };
    if ((min == null) !== (max == null) || (min != null && max != null && min > max)) return { ok: false, error: 'Give both transit days, with the minimum not above the maximum.' };
    if (method === 'HUB_TO_BUYER' && !r?.hubId) return { ok: false, error: 'A hub-to-buyer rate needs its hub.' };
    return { ok: true, rate: { method: method as Rate['method'], originCountry: String(r.originCountry), destinationCountry: String(r.destinationCountry), hubId: r?.hubId || null, unit: unit as RateUnit, amountEur: round2(amount), minTransitDays: min, maxTransitDays: max } };
}
