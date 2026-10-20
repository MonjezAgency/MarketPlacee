import { missingForPublish } from './catalog-rules';
import type { CatalogScope } from './catalog-scope';

/**
 * Bulk actions on the admin Products page — which selected products an action
 * may touch, decided on the server per row. Nothing here writes; the
 * controller runs the action only on `eligible` and returns `skipped` with the
 * reason for every other id, so the page reports exactly what happened.
 *
 *  Supplier Submissions (supplier-owned products only)
 *   • approve  — submitted (PENDING) and complete (the publish checklist).
 *   • reject   — PENDING or NEEDS_CHANGES, with a reason the supplier reads.
 *   • changes  — PENDING, with the message the supplier reads.
 *   Drafts were never submitted, approved products are live and rejected ones are
 *   closed: none of those change in bulk (each can still be opened on its own).
 *
 *  Atlantis Catalog (staff-owned products only)
 *   • approve  — publish a complete draft or pending catalog product.
 *   • delete   — only products nothing else depends on. Deleting cascades to
 *     target-price requests, special offers and wholesale offers, and detaches
 *     order lines, so products with order history, open target prices, active
 *     special offers or approved offers are skipped.
 */
export const BULK_ACTIONS = ['approve', 'reject', 'changes', 'delete'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const BULK_MAX = 200;

export const ACTION_SCOPES: Record<BulkAction, CatalogScope[]> = { approve: ['submissions', 'catalog'], reject: ['submissions'], changes: ['submissions'], delete: ['catalog'] };

export type SkipReason =
    | 'NOT_FOUND' | 'WRONG_SCOPE' | 'ALREADY_APPROVED' | 'ALREADY_REJECTED' | 'ALREADY_CHANGES' | 'NOT_SUBMITTED' | 'LIVE' | 'CLOSED' | 'INCOMPLETE'
    | 'HAS_ORDERS' | 'HAS_TARGETS' | 'HAS_PROMOTIONS' | 'HAS_OFFERS';

export interface BulkCandidate {
    id: string; name: string; status: string; scope: CatalogScope; product: any;
    usage?: { orderLines: number; openTargets: number; activePromotions: number; approvedOffers: number };
}
export interface BulkSkip { id: string; name: string | null; reason: SkipReason; detail?: string[] }
export interface BulkPlan { eligible: { id: string; name: string }[]; skipped: BulkSkip[] }

export function planBulk(action: BulkAction, ids: string[], found: BulkCandidate[]): BulkPlan {
    const byId = new Map(found.map((c) => [c.id, c]));
    const eligible: BulkPlan['eligible'] = [];
    const skipped: BulkSkip[] = [];
    const skip = (c: BulkCandidate, reason: SkipReason, detail?: string[]) => skipped.push({ id: c.id, name: c.name, reason, ...(detail?.length ? { detail } : {}) });
    for (const id of Array.from(new Set(ids))) {
        const c = byId.get(id);
        if (!c) { skipped.push({ id, name: null, reason: 'NOT_FOUND' }); continue; }
        if (!ACTION_SCOPES[action].includes(c.scope)) { skip(c, 'WRONG_SCOPE'); continue; }
        const s = String(c.status).toUpperCase();
        if (action === 'approve') {
            if (s === 'APPROVED') { skip(c, 'ALREADY_APPROVED'); continue; }
            if (s === 'REJECTED') { skip(c, 'CLOSED'); continue; }
            // A supplier draft was never submitted; an Atlantis draft is ours to publish.
            if (s === 'DRAFT' && c.scope === 'submissions') { skip(c, 'NOT_SUBMITTED'); continue; }
            if (s === 'NEEDS_CHANGES' && c.scope === 'submissions') { skip(c, 'ALREADY_CHANGES'); continue; }
            const missing = missingForPublish(c.product).map((m) => m.label);
            if (missing.length) { skip(c, 'INCOMPLETE', missing); continue; }
        } else if (action === 'reject') {
            if (s === 'REJECTED') { skip(c, 'ALREADY_REJECTED'); continue; }
            if (s === 'APPROVED') { skip(c, 'LIVE'); continue; }
            if (s === 'DRAFT') { skip(c, 'NOT_SUBMITTED'); continue; }
        } else if (action === 'changes') {
            if (s === 'NEEDS_CHANGES') { skip(c, 'ALREADY_CHANGES'); continue; }
            if (s === 'APPROVED') { skip(c, 'LIVE'); continue; }
            if (s === 'REJECTED') { skip(c, 'CLOSED'); continue; }
            if (s === 'DRAFT') { skip(c, 'NOT_SUBMITTED'); continue; }
        } else if (action === 'delete') {
            const u = c.usage || { orderLines: 0, openTargets: 0, activePromotions: 0, approvedOffers: 0 };
            if (u.orderLines > 0) { skip(c, 'HAS_ORDERS'); continue; }
            if (u.openTargets > 0) { skip(c, 'HAS_TARGETS'); continue; }
            if (u.activePromotions > 0) { skip(c, 'HAS_PROMOTIONS'); continue; }
            if (u.approvedOffers > 0) { skip(c, 'HAS_OFFERS'); continue; }
        }
        eligible.push({ id: c.id, name: c.name });
    }
    return { eligible, skipped };
}
