/**
 * Where a notification opens, by the RECIPIENT's role — the same record seen
 * through the pages that role is allowed to use. Used when a notification is
 * created without an explicit `link`, and mirrored in the frontend for older
 * notifications (frontend/src/lib/notifications.ts). Only existing pages.
 */
const STAFF = new Set(['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS']);

export interface NotificationData { link?: string; orderId?: string; productId?: string; targetPriceRequestId?: string; targetRef?: string; offerId?: string; disputeId?: string; userId?: string; type?: string; [k: string]: unknown }

export function notificationLink(role: string | null | undefined, data: NotificationData | null | undefined): string | null {
    if (!data) return null;
    if (typeof data.link === 'string' && data.link.startsWith('/') && !data.link.startsWith('//')) return data.link;
    const r = String(role || '').toUpperCase();
    const staff = STAFF.has(r);
    if (data.disputeId && staff) return '/admin/disputes';
    if (data.orderId) {
        const id = String(data.orderId);
        if (staff) return `/admin/orders/${id}`;
        if (r === 'SUPPLIER') return `/supplier/orders?view=all&q=${encodeURIComponent(id)}`;
        return `/dashboard/customer/orders/${id}`;
    }
    if (data.targetPriceRequestId) {
        if (staff) return `/admin/target-prices${data.targetRef ? `?q=${encodeURIComponent(String(data.targetRef))}` : ''}`;
        if (r === 'SUPPLIER') return data.productId ? `/supplier/products/${data.productId}/edit` : '/supplier/products';
        return '/dashboard/customer/targets';
    }
    if (data.offerId && staff) return '/admin/offers?tab=supplier';
    if (data.productId) {
        if (staff) return `/admin/products/${data.productId}`;
        if (r === 'SUPPLIER') return `/supplier/products/${data.productId}/edit${data.type === 'LOW_STOCK' ? '' : '#feedback'}`;
        return `/products/${data.productId}`;
    }
    if (data.userId && staff) return `/admin/users/${encodeURIComponent(String(data.userId))}`;
    return null;
}
