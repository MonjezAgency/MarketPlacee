import { call } from '@/lib/wholesale';

/**
 * Dispute reasons. The English value is what the server stores (and staff
 * read); the buyer sees it in their own language.
 */
export const DISPUTE_REASONS = [
    { value: 'Item not received', key: 'reasonNotReceived' },
    { value: 'Wrong item delivered', key: 'reasonWrongItem' },
    { value: 'Item arrived damaged', key: 'reasonDamaged' },
    { value: 'Item not as described', key: 'reasonNotAsDescribed' },
    { value: 'Missing items in order', key: 'reasonMissing' },
    { value: 'Quality issue', key: 'reasonQuality' },
    { value: 'Other', key: 'reasonOther' },
];
export const disputeReasonKey = (stored: string) => DISPUTE_REASONS.find((r) => r.value === stored)?.key;

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED_REFUND' | 'RESOLVED_NO_REFUND' | 'CLOSED';
export interface BuyerDispute { id: string; orderId: string; reason: string; description: string; status: DisputeStatus; resolution: string | null; createdAt: string; resolvedAt: string | null }
/** The signed-in buyer's own disputes (GET /disputes/my). */
export const fetchMyDisputes = () => call<BuyerDispute[]>('/disputes/my');
