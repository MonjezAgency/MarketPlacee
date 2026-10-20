'use client';

import * as React from 'react';
import { Badge, type Tone } from '@/components/supplier/ui';
import { REQUIRES_ACTION, type NextAction } from '@/lib/admin-orders-api';

/**
 * Order payment status and "next action" labels shared by the admin order list
 * and detail pages (text in the adminOrders dictionary). Payment values are the
 * ones stored on the order; PAID / REFUNDED are labelled as marked, because the
 * order field is set by hand or by legacy code, not by a confirmed card payment.
 */
export const PAYMENT_TONE: Record<string, Tone> = { UNPAID: 'neutral', PROCESSING: 'info', PAID: 'success', FAILED: 'danger', REFUNDED: 'neutral' };
export const PAYMENT_KEY: Record<string, string> = { UNPAID: 'payUnpaid', PROCESSING: 'payProcessing', PAID: 'payPaid', FAILED: 'payFailed', REFUNDED: 'payRefunded' };
export const ACTION_KEY: Record<NextAction, string> = {
    APPROVE: 'actApprove', DECIDE: 'actDecide', LEGACY_CONFIRM: 'actLegacy', WAIT_SUPPLIERS: 'actWaitSuppliers', WAIT_BUYER: 'actWaitBuyer', SHIP: 'actShip', DELIVER: 'actDeliver',
};

type Tl = (k: string, v?: Record<string, string | number>) => string;

export function PaymentBadge({ value, tl }: { value: string; tl: Tl }) {
    return <Badge tone={PAYMENT_TONE[value] ?? 'neutral'}>{PAYMENT_KEY[value] ? tl(PAYMENT_KEY[value]) : value}</Badge>;
}

export function NextActionCell({ action, tl }: { action: NextAction | null; tl: Tl }) {
    if (!action) return <span className="text-[12.5px] text-ink-4">{tl('actNone')}</span>;
    return REQUIRES_ACTION.includes(action)
        ? <Badge tone="warning" dot>{tl(ACTION_KEY[action])}</Badge>
        : <span className="text-[12.5px] text-ink-2">{tl(ACTION_KEY[action])}</span>;
}
