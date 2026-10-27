/**
 * What a shipment read returns to whom.
 *
 *  • Staff: the full record.
 *  • The order's buyer: the shipment's progress plus a small order summary
 *    (id, status, total). A supplier with a line on the order: the progress and
 *    the order id — never the buyer total.
 *  • Anyone else holding a tracking number: the shipment's progress only.
 *
 * Never returned outside staff: the buyer's name/email, shipping address,
 * payment intent, escrow fields, terms snapshots or supplier ids.
 */
export type ShipmentViewer = { sub?: string; userId?: string; role?: string } | null | undefined;

const SHIPMENT_STAFF = new Set(['ADMIN', 'OWNER', 'SUPPORT', 'MODERATOR', 'LOGISTICS', 'DEVELOPER']);
export const isShipmentStaff = (v: ShipmentViewer) => SHIPMENT_STAFF.has(String(v?.role || '').toUpperCase());

type OrderLike = { customerId?: string | null; supplierId?: string | null; items?: { product?: { supplierId?: string | null } | null }[] } | null | undefined;

export function isOrderParty(v: ShipmentViewer, order: OrderLike): boolean {
    const me = v?.sub ?? v?.userId;
    if (!me || !order) return false;
    const role = String(v?.role || '').toUpperCase();
    if (role === 'CUSTOMER') return order.customerId === me;
    if (role === 'SUPPLIER') return order.supplierId === me || (order.items || []).some((i) => i?.product?.supplierId === me);
    return false;
}

export function publicTrackingView(shipment: any, party: boolean, viewer?: ShipmentViewer) {
    const updates = (shipment.updates || []).map((u: any) => ({
        id: u.id, status: u.status, description: u.description, location: u.location ?? null, createdAt: u.createdAt,
    }));
    const out: any = {
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier ?? null,
        status: shipment.status,
        expectedDelivery: shipment.expectedDelivery ?? null,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
        updates,
    };
    if (party && shipment.order) {
        out.orderId = shipment.orderId;
        if (String(viewer?.role || '').toUpperCase() === 'CUSTOMER') {
            out.order = { id: shipment.order.id, status: shipment.order.status, totalAmount: shipment.order.totalAmount ?? null };
        }
    }
    return out;
}
