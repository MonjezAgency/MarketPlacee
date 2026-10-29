import { call } from '@/lib/wholesale';
import { en } from '@/locales/en';
import { formatMessage } from '@/locales/format';

export interface BuyerOrderItem {
    id: string; quantity: number; price: number; productId: string | null; productNameSnapshot?: string | null;
    selectedTier?: string | null; selectedVariants?: Record<string, string> | null; mixedLoadId?: string | null;
    mixComposition?: { productId?: string; name?: string; quantity?: number; unit?: string; variant?: string | null; signature?: string }[] | null;
    product?: {
        id: string; name: string; images?: string[]; brand?: string | null; ean?: string | null; supplierId?: string;
        unit?: string | null; unitsPerCase?: number | null; casesPerPallet?: number | null; palletsPerShipment?: number | null; exwLocation?: string | null;
    } | null;
}
export type FulfillmentMethodKey = 'ATLANTIS_COLLECTION' | 'SUPPLIER_TO_HUB' | 'SUPPLIER_DIRECT';
/** How the goods move — the buyer-safe summary of the server's delivery calculation. */
export interface BuyerDelivery {
    status: 'priced' | 'quote_required' | 'unavailable' | null; freightTotal: number | null;
    methods: { method: FulfillmentMethodKey; status: 'priced' | 'quote_required' | 'unavailable'; total: number | null; transitDays: { min: number; max: number } | null; hub: { name: string; city: string; country: string } | null }[];
}
export interface BuyerOrder {
    id: string; status: 'PENDING' | 'PAID' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'; totalAmount: number; createdAt: string;
    paymentStatus?: string | null;
    shippingCost?: number | null;
    items: BuyerOrderItem[];
    shipment?: { trackingNumber: string | null; carrier: string | null; status: string | null; expectedDelivery: string | null } | null;
    /** Confirmation workflow summary (null for orders placed before it existed). */
    workflow?: { reviewStatus: string; termsVersion: number; party: { key: string; buyer: string } | null; buyerMustAccept: boolean } | null;
    /** Latest inspection Ali FMCG recorded on this order, if any. */
    inspection?: 'SCHEDULED' | 'PASSED' | 'PASSED_WITH_FINDINGS' | 'FAILED' | null;
    delivery?: BuyerDelivery | null;
}

export const fetchMyOrders = (limit = 100) => call<{ data: BuyerOrder[]; total: number }>(`/orders/my-orders?limit=${limit}`);

export const orderRef = (id: string) => `#${id.slice(-8).toUpperCase()}`;

export type Tone = 'wait' | 'ok' | 'move' | 'done' | 'off';

/**
 * Status from what the server actually records (supplier confirmation and
 * Ali FMCG approval for workflow orders), as keys of the `orders` dictionary
 * section so every language shows the same state.
 */
export function statusKeys(o: BuyerOrder): { label: string; tone: Tone; note: string; vars?: Record<string, string> } {
    if (o.status === 'CANCELLED') return { label: 'statusCancelled', tone: 'off', note: 'noteCancelled' };
    if (o.workflow?.buyerMustAccept) return { label: 'statusAcceptance', tone: 'wait', note: 'noteAcceptance' };
    if (o.workflow?.party && o.status === 'PENDING') {
        const k = o.workflow.party.key;
        if (k === 'AWAITING_APPROVAL') return { label: 'statusSupplierConfirmed', tone: 'wait', note: 'noteSupplierConfirmed' };
        if (k === 'SUPPLIER_REJECTED') return { label: 'statusInReview', tone: 'wait', note: 'noteInReview' };
        return { label: 'statusAwaitingSupplier', tone: 'wait', note: 'noteAwaitingSupplier' };
    }
    switch (o.status) {
        case 'PENDING': return { label: 'statusAwaitingConfirmation', tone: 'wait', note: 'noteAwaitingConfirmation' };
        case 'PAID': return { label: 'statusPaid', tone: 'ok', note: 'notePaid' };
        case 'PROCESSING': return { label: 'statusConfirmed', tone: 'ok', note: 'noteConfirmed' };
        case 'SHIPPED': {
            const n = o.shipment?.trackingNumber;
            if (!n) return { label: 'statusShipped', tone: 'move', note: 'noteNoTracking' };
            return o.shipment?.carrier
                ? { label: 'statusShipped', tone: 'move', note: 'noteTrackingCarrier', vars: { number: n, carrier: o.shipment.carrier } }
                : { label: 'statusShipped', tone: 'move', note: 'noteTracking', vars: { number: n } };
        }
        case 'DELIVERED': return { label: 'statusDelivered', tone: 'done', note: 'noteDelivered' };
        default: return { label: 'statusAwaitingConfirmation', tone: 'wait', note: '' };
    }
}

/** English status for pages that aren't on the dictionaries yet (same logic as statusKeys). */
export function orderStatus(o: BuyerOrder): { label: string; tone: Tone; note: string } {
    const k = statusKeys(o);
    const d = en.orders as Record<string, string>;
    return { label: d[k.label], tone: k.tone, note: k.note ? formatMessage(d[k.note], k.vars, 'en-GB') : '' };
}

export type StageKey = 'placed' | 'supplier' | 'approved' | 'confirmed' | 'inspection' | 'shipped' | 'delivered';
export type StageState = 'done' | 'current' | 'todo' | 'off';

/**
 * The stages this order really goes through, from data the server records:
 * workflow orders show supplier confirmation and Ali FMCG approval; an
 * inspection stage appears only when Ali FMCG recorded one. Nothing is
 * inferred beyond the recorded statuses.
 */
export function orderStages(o: BuyerOrder): { key: StageKey; state: StageState }[] {
    const keys: StageKey[] = o.workflow ? ['placed', 'supplier', 'approved'] : ['placed', 'confirmed'];
    if (o.inspection) keys.push('inspection');
    keys.push('shipped', 'delivered');
    if (o.status === 'CANCELLED') return keys.map((key) => ({ key, state: 'off' as StageState }));

    const shippedOrLater = o.status === 'SHIPPED' || o.status === 'DELIVERED';
    const approved = o.workflow ? o.workflow.reviewStatus === 'APPROVED' : ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(o.status);
    const supplierDone = approved || o.workflow?.party?.key === 'AWAITING_APPROVAL';
    const done: Record<StageKey, boolean> = {
        placed: true,
        supplier: supplierDone,
        approved,
        confirmed: approved,
        inspection: !!o.inspection && o.inspection !== 'SCHEDULED',
        shipped: shippedOrLater,
        delivered: o.status === 'DELIVERED',
    };
    let currentSet = false;
    return keys.map((key) => {
        if (done[key]) return { key, state: 'done' as StageState };
        if (!currentSet) { currentSet = true; return { key, state: 'current' as StageState }; }
        return { key, state: 'todo' as StageState };
    });
}

/** Cartons, pallets and trucks in one order line, from the product's packaging. */
export function lineLoad(i: BuyerOrderItem) {
    const p = i.product;
    const tier = (i.selectedTier || '').toLowerCase();
    const kind: 'carton' | 'pallet' | 'truck' = tier === 'pallet' ? 'pallet' : tier === 'truck' ? 'truck' : 'carton';
    const cpp = p?.casesPerPallet || null, pps = p?.palletsPerShipment || null, upc = p?.unitsPerCase || null;
    const cartonsPerTier = kind === 'carton' ? 1 : kind === 'pallet' ? cpp : cpp && pps ? cpp * pps : null;
    const cartons = i.mixedLoadId ? null : cartonsPerTier != null ? i.quantity * cartonsPerTier : null;
    const units = cartons != null && upc ? cartons * upc : null;
    const pallets = kind === 'pallet' ? i.quantity : kind === 'truck' && pps ? i.quantity * pps : null;
    const trucks = kind === 'truck' ? i.quantity : null;
    const unitsPerTier = cartonsPerTier != null && upc ? cartonsPerTier * upc : null;
    return { kind, cartons, units, pallets, trucks, perUnit: unitsPerTier ? i.price / unitsPerTier : null, lineTotal: i.price * i.quantity };
}

export const TONE_CLASS: Record<Tone, string> = {
    wait: 'bg-surface-3 text-ink-2',
    ok: 'bg-teal-soft text-teal',
    move: 'bg-[#EFF6FF] text-[#1D4ED8] dark:bg-blue-500/15 dark:text-blue-300',
    done: 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300',
    off: 'bg-surface-3 text-ink-3',
};

/** Distinct suppliers in an order (via each line's product; mixed loads expand to their products). */
export function supplierCount(o: BuyerOrder): number {
    const s = new Set(o.items.map((i) => i.product?.supplierId).filter(Boolean));
    return s.size;
}

export interface Purchased { productId: string; name: string; image: string | null; brand: string | null; orders: number; lastAt: string }

/** Products the buyer has really ordered (cancelled orders excluded), most recent first. */
export function purchasedProducts(orders: BuyerOrder[]): Purchased[] {
    const map = new Map<string, Purchased>();
    for (const o of orders) {
        if (o.status === 'CANCELLED') continue;
        const seen = new Set<string>();
        const add = (id: string | null | undefined, name: string | undefined, image: string | null, brand: string | null) => {
            if (!id || seen.has(id)) return;
            seen.add(id);
            const prev = map.get(id);
            map.set(id, prev
                ? { ...prev, orders: prev.orders + 1, lastAt: prev.lastAt > o.createdAt ? prev.lastAt : o.createdAt }
                : { productId: id, name: name || 'Product', image, brand, orders: 1, lastAt: o.createdAt });
        };
        for (const i of o.items) {
            if (i.productId) add(i.productId, i.product?.name || i.productNameSnapshot || undefined, i.product?.images?.[0] ?? null, i.product?.brand ?? null);
            for (const c of i.mixComposition ?? []) add(c.productId, c.name, null, null);
        }
    }
    return Array.from(map.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}
