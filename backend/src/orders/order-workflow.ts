/**
 * Order confirmation workflow — the rules, without the database.
 *
 *   Buyer submits ──► every supplier on the order accepts (or rejects) the
 *   exact terms ──► Ali FMCG approves ──► the buyer has the confirmed terms
 *   (and accepts them when they differ from what was submitted) ──► payment
 *   and fulfilment proceed.
 *
 * Nothing moves forward on a buyer's word alone; any material change creates
 * a new terms version that must be confirmed again. Orders placed before the
 * workflow existed are LEGACY and keep the old behaviour.
 */
import { createHash } from 'crypto';

export type ReviewStatus = 'LEGACY' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type ConfirmationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
export interface Confirmation { supplierId: string; termsVersion: number; status: ConfirmationStatus | string; deadline?: Date | string | null; decidedAt?: Date | string | null; note?: string | null }

/** How long a supplier has to answer, unless the AppConfig ORDER_SUPPLIER_CONFIRM_HOURS says otherwise. */
export const DEFAULT_CONFIRM_HOURS = 72;

export interface TermsLine { itemId?: string; productId: string | null; name: string; tier: string | null; quantity: number; unitPrice: number; lineTotal: number; supplierId: string | null; supplierUnitPrice: number | null; selectedVariants?: any; mixedLoadId?: string | null }
export interface Terms {
    version: number;
    currency: 'EUR';
    lines: TermsLine[];
    goodsTotal: number;
    freight: { amount: number | null; status: 'priced' | 'quote_required' | 'set_by_atlantis'; carrier?: string | null };
    fulfillment: any;
    destinationCountry: string | null;
    coupon?: string | null;
}

/** Hash of the commercial content of the terms (what a party agrees to). */
export function termsHash(t: Pick<Terms, 'lines' | 'goodsTotal' | 'freight' | 'destinationCountry'>): string {
    const content = {
        lines: t.lines.map((l) => [l.productId, l.tier, l.quantity, round2(l.unitPrice), l.supplierUnitPrice == null ? null : round2(l.supplierUnitPrice), l.selectedVariants ?? null, l.mixedLoadId ?? null]),
        goods: round2(t.goodsTotal), freight: t.freight.amount == null ? null : round2(t.freight.amount), dest: t.destinationCountry,
    };
    return createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 24);
}
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

/** The supplier's own part of the terms — the only figures a supplier is asked to confirm (no buyer prices, no margin). */
export function supplierView(t: Terms, supplierId: string) {
    const lines = t.lines.filter((l) => l.supplierId === supplierId).map((l) => ({ itemId: l.itemId, productId: l.productId, name: l.name, tier: l.tier, quantity: l.quantity, unitNet: l.supplierUnitPrice, lineNet: l.supplierUnitPrice == null ? null : round2(l.supplierUnitPrice * l.quantity), selectedVariants: l.selectedVariants }));
    const f = t.fulfillment?.groups?.find?.((g: any) => g.supplierId === supplierId);
    return { version: t.version, lines, netTotal: round2(lines.reduce((s, l) => s + (l.lineNet || 0), 0)), fulfillment: f ? { method: f.method, label: f.label, status: f.status, handover: f.handover, supplierCharges: (f.charges || []).filter((c: any) => c.paidTo !== 'Ali FMCG') } : null, destinationCountry: t.destinationCountry };
}

export function isExpired(c: Confirmation, now = new Date()): boolean {
    return c.status === 'PENDING' && !!c.deadline && new Date(c.deadline).getTime() < now.getTime();
}

/** Where the confirmation stands for the current terms version. */
export function confirmationState(confs: Confirmation[], version: number, supplierIds: string[], now = new Date()) {
    const current = confs.filter((c) => c.termsVersion === version);
    const by = new Map(current.map((c) => [c.supplierId, c]));
    const each = supplierIds.map((id) => {
        const c = by.get(id);
        const status = !c ? 'MISSING' : isExpired(c, now) ? 'EXPIRED' : c.status;
        return { supplierId: id, status, deadline: c?.deadline ?? null, decidedAt: c?.decidedAt ?? null, note: c?.note ?? null };
    });
    return {
        each,
        allAccepted: each.length > 0 && each.every((e) => e.status === 'ACCEPTED'),
        anyRejected: each.some((e) => e.status === 'REJECTED'),
        anyExpired: each.some((e) => e.status === 'EXPIRED'),
        waiting: each.filter((e) => e.status === 'PENDING').length,
    };
}

/**
 * The terms version suppliers last answered. Before approval it is always the
 * current version; after approval a change only Ali FMCG makes (e.g. freight)
 * creates a new version without asking suppliers again, so views read this one.
 */
export function answeredVersion(confs: { termsVersion: number }[], current: number): number {
    return confs.length ? Math.max(...confs.map((c) => c.termsVersion)) : current;
}

/** Why Ali FMCG can't approve yet (null = it can). */
export function approvalBlocker(order: { status: string; reviewStatus: string; termsVersion: number }, state: ReturnType<typeof confirmationState>): string | null {
    if (order.reviewStatus === 'APPROVED') return 'This order is already approved.';
    if (order.reviewStatus === 'REJECTED' || order.status === 'CANCELLED') return 'This order was rejected or cancelled.';
    if (order.reviewStatus !== 'PENDING_REVIEW') return 'This order was placed before supplier confirmation existed; manage it with the status controls.';
    if (!['PENDING', 'PAID'].includes(order.status)) return 'Only orders awaiting confirmation can be approved.';
    if (state.anyRejected) return 'A supplier rejected these terms. Amend the order or reject it.';
    if (state.anyExpired) return 'A supplier didn’t answer in time. Ask them again or reject the order.';
    if (!state.allAccepted) return `Waiting for ${state.waiting || 'every'} supplier${state.waiting === 1 ? '' : 's'} to accept these terms (version ${order.termsVersion}).`;
    return null;
}

/** Whether the buyer still has to accept the current terms (they differ from what was submitted). */
export function buyerMustAccept(order: { reviewStatus: string; termsVersion: number; buyerAcceptedVersion?: number | null }): boolean {
    return order.reviewStatus === 'APPROVED' && order.termsVersion > 1 && (order.buyerAcceptedVersion ?? 0) < order.termsVersion;
}

/**
 * Extra rules on top of ORDER_TRANSITIONS for orders under the workflow.
 * Returns why a status change is blocked, or null. LEGACY orders are exempt.
 */
export function workflowBlocker(order: { status: string; reviewStatus: string; termsVersion: number; buyerAcceptedVersion?: number | null }, to: string, opts: { viaApproval?: boolean } = {}): string | null {
    if (order.reviewStatus === 'LEGACY' || to === 'CANCELLED') return null;
    // Approval is the only way out of "awaiting confirmation"; it confirms the order (PROCESSING).
    if (order.status === 'PENDING' && (to === 'PROCESSING' || to === 'PAID') && !opts.viaApproval) {
        return 'An order is confirmed only by Ali FMCG approval, after every supplier accepted its terms.';
    }
    if (['SHIPPED', 'DELIVERED'].includes(to)) {
        if (order.reviewStatus !== 'APPROVED') return 'This order hasn’t been approved by Ali FMCG.';
        if (buyerMustAccept(order)) return 'The buyer hasn’t accepted the changed terms yet.';
    }
    return null;
}

/** Status words for each party (one source for emails, pages and the Support Assistant). */
export function partyStatus(order: { status: string; reviewStatus: string; termsVersion: number; buyerAcceptedVersion?: number | null }, state?: ReturnType<typeof confirmationState>) {
    if (order.status === 'CANCELLED') return { key: 'CANCELLED', buyer: 'Cancelled', supplier: 'Cancelled' };
    if (order.reviewStatus === 'LEGACY') return null;
    if (order.reviewStatus === 'PENDING_REVIEW') {
        if (state?.anyRejected) return { key: 'SUPPLIER_REJECTED', buyer: 'Being reviewed by Ali FMCG', supplier: 'You rejected these terms' };
        if (state?.allAccepted) return { key: 'AWAITING_APPROVAL', buyer: 'Supplier confirmed — Ali FMCG is approving', supplier: 'Accepted — awaiting Ali FMCG approval' };
        return { key: 'AWAITING_SUPPLIER', buyer: 'Waiting for supplier confirmation', supplier: 'Your confirmation is needed' };
    }
    if (buyerMustAccept(order)) return { key: 'AWAITING_BUYER', buyer: 'Updated terms — your acceptance is needed', supplier: 'Approved — waiting for the buyer to accept updated terms' };
    return null; // approved: the normal order status describes it
}
