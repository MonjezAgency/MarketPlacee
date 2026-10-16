import { call } from '@/lib/wholesale';

export interface BuyerOrderItem {
    id: string; quantity: number; price: number; productId: string | null; productNameSnapshot?: string | null;
    selectedTier?: string | null; selectedVariants?: Record<string, string> | null; mixedLoadId?: string | null;
    mixComposition?: { productId?: string; name?: string; quantity?: number; unit?: string; variant?: string | null }[] | null;
    product?: { id: string; name: string; images?: string[]; brand?: string | null; ean?: string | null; supplierId?: string } | null;
}
export interface BuyerOrder {
    id: string; status: 'PENDING' | 'PAID' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'; totalAmount: number; createdAt: string;
    paymentStatus?: string | null;
    items: BuyerOrderItem[];
    shipment?: { trackingNumber: string | null; carrier: string | null; status: string | null; expectedDelivery: string | null } | null;
    /** Confirmation workflow summary (null for orders placed before it existed). */
    workflow?: { reviewStatus: string; termsVersion: number; party: { key: string; buyer: string } | null; buyerMustAccept: boolean } | null;
}

export const fetchMyOrders = (limit = 100) => call<{ data: BuyerOrder[]; total: number }>(`/orders/my-orders?limit=${limit}`);

export const orderRef = (id: string) => `#${id.slice(-8).toUpperCase()}`;

/**
 * Status from what the server actually records (supplier confirmation and
 * Atlantis approval for workflow orders).
 */
export function orderStatus(o: BuyerOrder): { label: string; tone: 'wait' | 'ok' | 'move' | 'done' | 'off'; note: string } {
    // Workflow orders: the server's own wording for where the order stands.
    if (o.workflow?.buyerMustAccept) return { label: 'Your acceptance needed', tone: 'wait', note: 'The confirmed terms changed — review and accept them on the order page.' };
    if (o.workflow?.party && o.status === 'PENDING') {
        const k = o.workflow.party.key;
        return { label: k === 'AWAITING_APPROVAL' ? 'Supplier confirmed' : k === 'SUPPLIER_REJECTED' ? 'In review' : 'Awaiting confirmation', tone: 'wait', note: o.workflow.party.buyer };
    }
    switch (o.status) {
        case 'PENDING': return { label: 'Awaiting confirmation', tone: 'wait', note: 'Quantities and availability are being confirmed with the supplier.' };
        case 'PAID': return { label: 'Paid', tone: 'ok', note: 'Payment received; awaiting dispatch.' };
        case 'PROCESSING': return { label: 'Confirmed', tone: 'ok', note: 'Confirmed and being prepared.' };
        case 'SHIPPED': return { label: 'Shipped', tone: 'move', note: o.shipment?.trackingNumber ? `Tracking ${o.shipment.trackingNumber}${o.shipment.carrier ? ` · ${o.shipment.carrier}` : ''}` : 'Shipped — tracking will appear once the carrier reference is added.' };
        case 'DELIVERED': return { label: 'Delivered', tone: 'done', note: 'Delivered.' };
        case 'CANCELLED': return { label: 'Cancelled', tone: 'off', note: 'This order was cancelled.' };
        default: return { label: String(o.status), tone: 'wait', note: '' };
    }
}

export const TONE_CLASS: Record<ReturnType<typeof orderStatus>['tone'], string> = {
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
