import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/supplier-api';
import type { AdminWorkflow, Inspection } from '@/lib/order-workflow';

/**
 * Admin order management (`/orders/admin/*`, backend/src/orders/admin-orders.ts).
 * Read calls only; actions use the existing order endpoints.
 */

export const ORDER_STATUSES = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type NextAction = 'APPROVE' | 'DECIDE' | 'LEGACY_CONFIRM' | 'WAIT_SUPPLIERS' | 'WAIT_BUYER' | 'SHIP' | 'DELIVER';
export const REQUIRES_ACTION: NextAction[] = ['APPROVE', 'DECIDE', 'LEGACY_CONFIRM'];
export type Attention = 'requires_action' | 'ready' | 'decision' | 'legacy' | 'waiting_suppliers' | 'waiting_buyer';
/** Same cap as the server export (backend admin-orders.ts EXPORT_MAX_ROWS). */
export const EXPORT_MAX_ROWS = 10_000;
export const ORDER_SORTS = ['newest', 'oldest', 'updated', 'total_desc', 'total_asc'] as const;

export interface AdminOrderRow {
    id: string; ref: string; createdAt: string; updatedAt: string;
    status: string; reviewStatus: string; paymentStatus: string;
    total: number; shippingCost: number | null; lines: number;
    buyer: { id: string; name: string | null; companyName: string | null; email: string | null } | null;
    suppliers: { id: string; name: string | null }[];
    nextAction: NextAction | null;
}

export interface AttentionCounts { readyForApproval: number; needsDecision: number; waitingSuppliers: number; legacyPending: number; waitingBuyer: number; requiresAction: number }

export interface AdminOrderPage {
    asOf: string;
    data: AdminOrderRow[]; total: number; page: number; limit: number; pages: number;
    counts: { total: number; byStatus: Record<OrderStatus, number>; attention: AttentionCounts };
    facets: { suppliers: { id: string; name: string; count: number }[]; buyers: { id: string; name: string; count: number }[]; paymentStatuses: { value: string; count: number }[] };
}

export interface OrderListParams {
    q?: string; status?: string; paymentStatus?: string; supplier?: string; buyer?: string;
    from?: string; to?: string; attention?: string; sort?: string; page?: number; limit?: number;
}

export interface CompositionEntry {
    productId: string | null; name: string | null; signature: string | null; variant: string | null;
    quantity: number | null; unit: string | null; cases: number | null; unitPrice: number | null; lineSubtotal: number | null;
    discountPercent: number | null; ean: string | null; image: string | null;
}
export interface AdminOrderLine {
    id: string; kind: 'product' | 'mixed'; productId: string | null; productExists: boolean; name: string | null;
    image: string | null; ean: string | null; brand: string | null; productUnit: string | null;
    tier: string | null; quantity: number; unitPrice: number; lineTotal: number;
    /** Admin / owner only (absent for other staff). */
    supplierUnitPrice?: number | null; supplierLineTotal?: number | null;
    promotionPercent: number | null; stockCases: number | null;
    selectedVariants: Record<string, string> | null; mixComposition: CompositionEntry[] | null;
    mixedLoad: { id: string; kind: string } | null;
    supplier: { id: string; name: string | null } | null;
}
export interface Party {
    id: string; name: string | null; companyName: string | null; email: string | null; emailVerified: boolean; phone: string | null;
    country: string | null; status: string | null; kycStatus: string | null;
}
export type TimelineKind =
    | 'CREATED' | 'STATUS' | 'NOTE' | 'CONFIRMATION_REQUESTED' | 'CONFIRMATION_DECIDED' | 'REVIEWED' | 'BUYER_ACCEPTED'
    | 'INSPECTION' | 'SHIPMENT_CREATED' | 'SHIPMENT_UPDATE' | 'PAYMENT_MARKED_PAID' | 'CARD_CAPTURED' | 'CARD_RELEASED'
    | 'INVOICE_ISSUED' | 'INVOICE_PAID' | 'DISPUTE_OPENED' | 'DISPUTE_RESOLVED';
export interface TimelineEvent { kind: TimelineKind; at: string; actor?: string | null; status?: string | null; from?: string | null; note?: string | null; supplier?: string | null; version?: number | null; ref?: string | null }

export interface AdminOrderDetail {
    netVisible: boolean;
    id: string; ref: string; createdAt: string; updatedAt: string;
    status: string; reviewStatus: string; reviewedAt: string | null; reviewNote: string | null; reviewedBy: string | null;
    termsVersion: number; buyerAcceptedVersion: number | null; buyerAcceptedAt: string | null;
    nextAction: NextAction | null;
    statusOptions: { to: string; blocker: string | null }[];
    payment: {
        status: string; paidAt: string | null; cardPaymentStarted: boolean;
        card: { status: string; amount: number; currency: string; platformFee: number | null; supplierAmount: number | null; createdAt: string; capturedAt: string | null; releasedAt: string | null } | null;
    };
    money: {
        currency: 'EUR'; linesSubtotal: number; coupon: string | null; couponDiscount: number | null; unexplainedDifference: number | null;
        goodsTotal: number; freight: number | null; freightStatus: 'priced' | 'set_by_atlantis' | 'quote_required'; totalWithFreight: number | null; vat: null;
        supplierNet: number | null; markupOnRecordedLines: number | null; linesWithNet: number | null; linesWithoutNet: number | null;
    };
    lines: AdminOrderLine[];
    buyer: (Party & { createdAt: string }) | null;
    suppliers: (Party & { role: string | null; lines: number })[];
    logistics: {
        shippingAddress: { name?: string; company?: string; street?: string; city?: string; postal?: string; country?: string } | null;
        destinationCountry: string | null; shippingCompany: string | null; customerShippingCompany: string | null; shippingCost: number | null;
        fulfillment: any;
        shipment: { trackingNumber: string; carrier: string | null; status: string; expectedDelivery: string | null; createdAt: string; updates: { status: string; description: string; location: string | null; createdAt: string }[] } | null;
    };
    documents: {
        invoices: { id: string; invoiceNumber: string; status: string; amount: number; tax: number; totalAmount: number; currency: string; dueDate: string | null; paidAt: string | null; createdAt: string; pdfUrl: string | null }[];
        supplierInvoiceUrl: string | null;
    };
    disputes: { id: string; reason: string; status: string; createdAt: string; resolvedAt: string | null; resolution: string | null }[];
    timeline: TimelineEvent[];
    workflow: AdminWorkflow | null;
    inspections: Inspection[];
}

async function json<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const m = body?.message;
        const msg = Array.isArray(m) ? m.join(' ') : typeof m === 'string' && m ? m : `HTTP ${res.status}`;
        throw new ApiError(msg, res.status, body);
    }
    return body as T;
}
const send = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
    apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }).then((r) => json<any>(r));

export function orderQuery(q: OrderListParams): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v));
    return p.toString();
}

export const adminOrdersApi = {
    list: (q: OrderListParams) => apiFetch(`/orders/admin/list?${orderQuery(q)}`, { cache: 'no-store' }).then((r) => json<AdminOrderPage>(r)),
    detail: (id: string) => apiFetch(`/orders/admin/${encodeURIComponent(id)}/detail`, { cache: 'no-store' }).then((r) => json<AdminOrderDetail>(r)),
    /**
     * Downloads the CSV of the filtered list (built on the server, every page, at most EXPORT_MAX_ROWS rows).
     * The browser proxy passes only the body through, so the file name is set here.
     */
    async exportCsv(q: OrderListParams) {
        const { page: _p, limit: _l, ...filters } = q;
        const res = await apiFetch(`/orders/admin/export?${orderQuery(filters)}`, { cache: 'no-store' });
        if (!res.ok) await json(res);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `atlantis-orders-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    // Existing order endpoints (unchanged server rules).
    setStatus: (id: string, status: string, reason?: string) => send(`/orders/${id}/status`, 'PATCH', { status, ...(reason ? { reason } : {}) }),
    setShipping: (id: string, body: { shippingCompany?: string | null; shippingCost?: number | null; trackingNumber?: string | null }) => send(`/orders/${id}/shipping`, 'PATCH', body),
    notifyDeliveryDay: (id: string) => send(`/orders/${id}/notify-delivery-day`, 'POST'),
    remove: (id: string) => send(`/orders/${id}`, 'DELETE'),
};
