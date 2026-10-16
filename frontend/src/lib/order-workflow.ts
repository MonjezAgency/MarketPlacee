import { call } from '@/lib/wholesale';
import type { DeliveryQuote } from '@/lib/wholesale';

/**
 * Order confirmation workflow, as the server records it. The browser never
 * decides a status: every action below is checked again on the server.
 *
 *   submitted → every supplier accepts the exact terms → Atlantis approves
 *   → (buyer accepts, only if the terms changed) → fulfilment → inspection
 */
export type ReviewStatus = 'LEGACY' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type ConfirmationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED' | 'MISSING';

export interface BuyerTermsLine { name: string; tier: string | null; quantity: number; unitPrice: number; lineTotal: number; selectedVariants?: Record<string, string> | null }
export interface BuyerTerms {
    version: number; currency: 'EUR'; goodsTotal: number; destinationCountry: string | null; approvedAt: string | null;
    freight: { amount: number | null; status: 'priced' | 'quote_required' | 'set_by_atlantis'; carrier?: string | null };
    lines: BuyerTermsLine[]; fulfillment: DeliveryQuote | null;
}
export interface BuyerWorkflow {
    reviewStatus: ReviewStatus; termsVersion: number;
    party: { key: string; buyer: string; supplier: string } | null;
    suppliersConfirmed: number; suppliersTotal: number;
    buyerMustAccept: boolean; buyerAcceptedAt: string | null;
    approvedTerms: BuyerTerms | null; submittedTerms: BuyerTerms | null; fulfillment: DeliveryQuote | null;
}

export interface InspectionLine { itemId: string; ordered: number; received: number; unit: string; name: string }
export interface InspectionFinding { type: 'BARCODE' | 'QUANTITY' | 'DATE' | 'CONDITION' | 'OTHER'; itemId: string | null; name: string | null; note: string }
export interface Inspection {
    id: string; status: 'SCHEDULED' | 'PASSED' | 'PASSED_WITH_FINDINGS' | 'FAILED'; inspectedAt: string | null; inspectorName: string | null; hubId: string | null;
    lines: InspectionLine[]; findings: InspectionFinding[]; photos: string[];
    resolution: Resolution | null; resolutionNote: string | null; createdAt: string; updatedAt: string;
}

export type Resolution = 'PENDING' | 'ACCEPTED' | 'ACCEPTED_WITH_DISCOUNT' | 'PARTIALLY_ACCEPTED' | 'REJECTED';
export const INSPECTION_STATUS: Record<Inspection['status'], string> = {
    SCHEDULED: 'Scheduled', PASSED: 'Passed', PASSED_WITH_FINDINGS: 'Passed with findings', FAILED: 'Failed',
};
export const RESOLUTION: Record<Resolution, string> = {
    PENDING: 'Resolution pending', ACCEPTED: 'Accepted', ACCEPTED_WITH_DISCOUNT: 'Accepted with a price adjustment', PARTIALLY_ACCEPTED: 'Partially accepted', REJECTED: 'Rejected',
};
export const FINDING_TYPE: Record<InspectionFinding['type'], string> = {
    BARCODE: 'Barcode / variant', QUANTITY: 'Quantity / cartons', DATE: 'Best-before date', CONDITION: 'Packaging condition', OTHER: 'Other',
};

// Buyer
export const acceptTerms = (orderId: string, version: number) =>
    call<{ id: string; buyerAcceptedVersion: number }>(`/orders/${orderId}/accept-terms`, { method: 'POST', body: JSON.stringify({ version }) });

// Supplier
export interface SupplierTerms {
    version: number; destinationCountry: string | null; netTotal: number;
    lines: { itemId?: string; productId: string | null; name: string; tier: string | null; quantity: number; unitNet: number | null; lineNet: number | null; selectedVariants?: Record<string, string> | null }[];
    fulfillment: { method: string; label: string; status: string; handover: string; supplierCharges: { label: string; basis: string; amount: number }[] } | null;
}
export interface SupplierWorkflow {
    reviewStatus: ReviewStatus; termsVersion: number;
    myConfirmation: { status: ConfirmationStatus; deadline: string | null; decidedAt: string | null; note: string | null } | null;
    label: string | null; terms: SupplierTerms | null;
}

// Atlantis staff
export interface AdminWorkflow {
    reviewStatus: ReviewStatus; termsVersion: number; reviewedAt: string | null; reviewNote: string | null;
    buyerMustAccept: boolean; buyerAcceptedVersion: number | null; buyerAcceptedAt: string | null;
    party: { key: string; buyer: string; supplier: string } | null;
    approvalBlocker: string | null;
    suppliers: { supplierId: string; name: string; status: ConfirmationStatus; deadline: string | null; decidedAt: string | null; note: string | null }[];
    history: { supplier: string; version: number; status: ConfirmationStatus; deadline: string | null; decidedAt: string | null; note: string | null }[];
    terms: any; submittedTerms: any;
}
export const getWorkflow = (orderId: string) => call<AdminWorkflow>(`/orders/${orderId}/workflow`);
export const approveOrder = (orderId: string, note?: string) => call<any>(`/orders/${orderId}/approve`, { method: 'POST', body: JSON.stringify({ note }) });
export const rejectOrder = (orderId: string, reason: string) => call<any>(`/orders/${orderId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export const requestConfirmation = (orderId: string) => call<{ requested: number }>(`/orders/${orderId}/request-confirmation`, { method: 'POST' });
export const amendOrder = (orderId: string, body: { lines: { itemId: string; quantity?: number; unitPrice?: number }[]; reason: string }) =>
    call<any>(`/orders/${orderId}/amend`, { method: 'POST', body: JSON.stringify(body) });
export const saveInspection = (orderId: string, body: any, inspectionId?: string) =>
    call<Inspection>(inspectionId ? `/orders/${orderId}/inspections/${inspectionId}` : `/orders/${orderId}/inspections`, { method: inspectionId ? 'PATCH' : 'POST', body: JSON.stringify(body) });

export const CONFIRMATION_LABEL: Record<ConfirmationStatus, string> = {
    PENDING: 'Waiting for answer', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'Didn’t answer in time', SUPERSEDED: 'Replaced by newer terms', MISSING: 'Not asked yet',
};
export const CONFIRMATION_TONE: Record<ConfirmationStatus, string> = {
    PENDING: 'bg-surface-3 text-ink-2', ACCEPTED: 'bg-teal-soft text-teal', REJECTED: 'bg-[#FEF2F2] text-[#B91C1C]',
    EXPIRED: 'bg-[#FFFBEB] text-[#B45309]', SUPERSEDED: 'bg-surface-3 text-ink-3', MISSING: 'bg-surface-3 text-ink-3',
};

/**
 * The six steps every workflow order goes through, with where this order is.
 * Derived only from server fields; nothing is assumed complete.
 */
export function workflowSteps(o: { status: string; workflow: BuyerWorkflow | null; inspections?: Inspection[] }) {
    const w = o.workflow;
    if (!w) return null;
    const cancelled = o.status === 'CANCELLED';
    const approved = w.reviewStatus === 'APPROVED';
    const inspected = (o.inspections || []).some((i) => i.status !== 'SCHEDULED');
    type S = 'done' | 'current' | 'todo' | 'stopped';
    // Keys of the `workflow` dictionary section; the state logic is unchanged.
    const allConfirmed = w.suppliersTotal > 0 && w.suppliersConfirmed === w.suppliersTotal;
    const steps: { key: string; title: string; who: string; detail: string; vars?: Record<string, number>; state: S }[] = [
        { key: 'submitted', title: 'stepSubmitted', who: 'whoYou', detail: approved ? 'detailSubmittedApproved' : 'detailSubmittedPending', state: 'done' },
        { key: 'suppliers', title: 'stepSuppliers', who: 'whoSupplier', detail: w.suppliersTotal ? 'detailSuppliersCount' : 'detailSuppliers', vars: { confirmed: w.suppliersConfirmed, total: w.suppliersTotal }, state: approved || allConfirmed ? 'done' : 'current' },
        { key: 'approval', title: 'stepApproval', who: 'whoAtlantis', detail: approved ? 'detailApprovalDone' : 'detailApprovalPending', state: approved ? 'done' : allConfirmed ? 'current' : 'todo' },
        { key: 'terms', title: 'stepTerms', who: w.buyerMustAccept ? 'whoYou' : 'whoAtlantis', detail: w.buyerMustAccept ? 'detailTermsAccept' : 'detailTermsSent', state: !approved ? 'todo' : w.buyerMustAccept ? 'current' : 'done' },
        { key: 'fulfilment', title: 'stepFulfilment', who: 'whoBoth', detail: inspected ? 'detailFulfilmentInspected' : 'detailFulfilment', state: !approved || w.buyerMustAccept ? 'todo' : o.status === 'DELIVERED' ? 'done' : 'current' },
        { key: 'settlement', title: 'stepSettlement', who: 'whoAtlantis', detail: 'detailSettlement', state: o.status === 'DELIVERED' ? 'current' : 'todo' },
    ];
    if (cancelled) {
        const firstOpen = steps.findIndex((s) => s.state !== 'done');
        steps.forEach((s, i) => { if (i >= firstOpen) s.state = i === firstOpen ? 'stopped' : 'todo'; });
    }
    return steps;
}
