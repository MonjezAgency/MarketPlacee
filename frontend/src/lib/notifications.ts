import type { AppNotification } from '@/hooks/useNotifications';

/**
 * Shared notification rules for the bell and the notifications page.
 *
 * • Where a notification opens: the stored internal `data.link` first (the
 *   server derives it for the recipient's role — backend/src/notifications/
 *   notification-links.ts). Older notifications without one fall back to the
 *   same rules here, by the signed-in user's role. External links never open.
 * • What it says: when the server recorded the event (`data.kind` + `data.params`)
 *   it is shown in the reader's language; otherwise the stored title and message.
 */

const STAFF = new Set(['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS']);
export const isStaff = (role?: string | null) => STAFF.has(String(role || '').toUpperCase());

const internal = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/') && !v.startsWith('//');

export function notificationHref(n: AppNotification, role?: string | null): string | null {
    const d = (n.data || {}) as Record<string, any>;
    if (internal(d.link)) return d.link;
    const r = String(role || '').toUpperCase();
    const staff = isStaff(r);
    if (d.disputeId && staff) return `/admin/support?view=disputes&id=${encodeURIComponent(String(d.disputeId))}`;
    if (d.orderId) {
        const id = encodeURIComponent(String(d.orderId));
        if (staff) return `/admin/orders/${id}`;
        if (r === 'SUPPLIER') return `/supplier/orders?view=all&q=${id}`;
        return `/dashboard/customer/orders/${id}`;
    }
    if (d.targetPriceRequestId) {
        if (staff) return `/admin/target-prices${d.targetRef ? `?q=${encodeURIComponent(String(d.targetRef))}` : ''}`;
        if (r === 'SUPPLIER') return d.productId ? `/supplier/products/${encodeURIComponent(String(d.productId))}/edit` : '/supplier/products';
        return '/dashboard/customer/targets';
    }
    if (d.offerId && staff) return '/admin/offers/supplier';
    if (d.productId) {
        const id = encodeURIComponent(String(d.productId));
        if (staff) return `/admin/products/${id}`;
        if (r === 'SUPPLIER') return `/supplier/products/${id}/edit`;
        return `/products/${id}`;
    }
    if (d.userId && staff) return `/admin/users/${encodeURIComponent(String(d.userId))}`;
    if (staff && /\bkyc\b/i.test(`${n.title}`)) return '/admin/support?view=kyc';
    return null;
}

/** Event kinds the server records; each has `<KIND>_t` (title) and `<KIND>_b` (body) in the notificationsCenter section. */
export const KINDS = [
    'TARGET_CREATED', 'TARGET_INTEREST_SUPPLIER', 'TARGET_WITHDRAWN', 'TARGET_RESPONDED', 'TARGET_ACCEPTED', 'TARGET_DECLINED', 'TARGET_REACHED',
    'TARGET_COUNTERED', 'TARGET_COUNTER_ACCEPTED', 'TARGET_COUNTER_DECLINED', 'TARGET_REVISED',
    'PRODUCT_SUBMITTED', 'PRODUCT_RESUBMITTED', 'PRODUCT_CHANGES_REQUESTED', 'PRODUCT_APPROVED', 'PRODUCT_REJECTED', 'PRODUCT_STATUS',
    'STOCK_OUT', 'STOCK_LOW', 'AI_ORDER_PENDING', 'AI_KYC_REQUIRED', 'AI_PRODUCT_REJECTED', 'AI_LOW_STOCK', 'SUPPORT_ROUTED',
    'ORDER_NEW_SUPPLIER', 'ORDER_NEW_ADMIN', 'ORDER_READY', 'ORDER_SUPPLIER_DECLINED_LINES', 'ORDER_SUPPLIER_REJECTED', 'ORDER_CONFIRMED', 'ORDER_CONFIRMED_ACCEPT',
    'ORDER_CONFIRM_REQUEST', 'ORDER_CHANGED_SUPPLIER', 'ORDER_CHANGED_BUYER', 'ORDER_TERMS_ACCEPTED', 'ORDER_CONFIRM_EXPIRED', 'ORDER_DELIVERY_QUOTED', 'ORDER_DELIVERY_REMOVED',
    'ORDER_INSPECTION_PASSED', 'ORDER_INSPECTION_FAILED', 'ORDER_INSPECTION_ISSUES', 'ORDER_STATUS_BUYER', 'ORDER_STATUS_SUPPLIER', 'ORDER_STATUS_BY_SUPPLIER',
] as const;
const ORDER_STATUSES = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
export type NotificationKind = (typeof KINDS)[number];

export type NotificationGroup = 'order' | 'target' | 'product' | 'account' | 'payment' | 'other';

export function notificationGroup(n: AppNotification): NotificationGroup {
    const d = (n.data || {}) as Record<string, any>;
    const kind = String(d.kind || '');
    if (kind.startsWith('TARGET_') || d.targetPriceRequestId) return 'target';
    if (kind.startsWith('PRODUCT_') || kind.startsWith('STOCK_') || kind === 'AI_PRODUCT_REJECTED' || kind === 'AI_LOW_STOCK' || (d.productId && !d.orderId)) return 'product';
    if (d.orderId || d.disputeId) return /pay|paid|escrow/i.test(n.title) ? 'payment' : 'order';
    if (d.userId || /kyc|registration|sign-up|identity/i.test(n.title)) return 'account';
    return 'other';
}

/** A short reference to show as a chip: the target ref or the order number, never an internal id the reader can't use. */
export function notificationRef(n: AppNotification): string | null {
    const d = (n.data || {}) as Record<string, any>;
    if (d.targetRef) return String(d.targetRef);
    if (d.params?.ref) return String(d.params.ref);
    if (d.orderId) return `#${String(d.orderId).slice(-8).toUpperCase()}`;
    return null;
}

type T = (section: any, key: string, vars?: Record<string, string | number>) => string;

/** Title and body in the reader's language when the event kind is known; the stored text otherwise. */
export function notificationText(n: AppNotification, t: T, money?: (eur: number) => string): { title: string; body: string } {
    const d = (n.data || {}) as Record<string, any>;
    const kind = String(d.kind || '');
    if ((KINDS as readonly string[]).includes(kind)) {
        const p = d.params || {};
        const vars: Record<string, string | number> = {
            ref: String(p.ref ?? d.targetRef ?? ''), product: String(p.product ?? ''),
            cases: Number(p.cases) || 0, price: p.price != null && p.price !== '' && Number.isFinite(Number(p.price)) ? (money ? money(Number(p.price)) : String(p.price)) : '',
            reason: String(p.reason ?? p.message ?? '').trim(),
            min: Number(p.min) || 0, units: Number(p.units) || 0, version: String(p.version ?? ''), buyer: String(p.buyer ?? ''), actor: String(p.actor ?? ''), name: String(p.name ?? ''), team: String(p.team ?? ''),
            status: ORDER_STATUSES.includes(String(p.status)) ? t('notificationsCenter', `st_${p.status}`) : String(p.status ?? ''),
        };
        const title = t('notificationsCenter', `${kind}_t`, vars);
        let body = t('notificationsCenter', `${kind}_b`, vars);
        // The reviewer's words and the desk's reply are kept as written, after the translated sentence.
        if (/^TARGET_(RESPONDED|ACCEPTED|DECLINED)$/.test(kind) && vars.price) body = `${body} ${t('notificationsCenter', 'counterOffer', { price: vars.price })}`;
        // Words a person wrote (a reviewer's note, a supplier's reason, the desk's reply) are kept as written.
        if (vars.reason) body = `${body} “${vars.reason}”`;
        return { title, body };
    }
    return { title: n.title, body: n.message };
}

export type DayBucket = 'today' | 'yesterday' | 'earlier';
export function dayBucket(iso: string, now = new Date()): DayBucket {
    const d = new Date(iso);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (d.getTime() >= start) return 'today';
    if (d.getTime() >= start - 86_400_000) return 'yesterday';
    return 'earlier';
}
