import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/supplier-api';

/**
 * Admin → Coupons & Codes. Backend: backend/src/coupons (OWNER/ADMIN for every route used here).
 * Rules (eligibility, limits, rounding) live in backend/src/coupons/coupon-rules.ts and are applied only by the
 * server at quote and order creation; nothing here computes a discount for a buyer.
 */

export type CouponStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'DISABLED' | 'EXHAUSTED';
export type CouponType = 'PERCENT' | 'FIXED';
export type CouponScope = 'ALL' | 'CATEGORY' | 'PRODUCTS';
export const COUPON_STATUSES: CouponStatus[] = ['ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED', 'EXHAUSTED'];

export interface CouponRow {
    id: string; code: string; status: CouponStatus;
    discountType: CouponType; discountPercent: number; amountOff: number | null;
    minOrderAmount: number | null; usageLimit: number | null; perCustomerLimit: number | null;
    /** Orders placed with the code; usedCount = the counter the usage limit is enforced against. */
    redemptions: number; usedCount: number; discountGiven: number | null;
    /** Internal note / campaign name (admins only). */
    description: string | null;
    startsAt: string | null; expirationDate: string; isActive: boolean;
    /** LEGACY = created "for an offer" before scopes existed: that placement's product only. */
    scope: CouponScope | 'LEGACY'; categories: string[];
    products: { id: string; name: string; brand: string | null; ean: string | null; missing?: boolean }[];
    createdAt: string;
}
export interface CouponList {
    rows: CouponRow[];
    summary: { total: number; active: number; scheduled: number; expired: number; disabled: number; exhausted: number; redemptions: number };
    serverTime: string;
}
export interface CatalogProduct { id: string; name: string; brand: string | null; category: string; ean: string | null; status: string; image: string | null }
export interface CategoryOption { category: string; products: number; live: number }

export interface CouponDraft {
    code: string; discountType: CouponType; discountPercent?: number | string; amountOff?: number | string;
    minOrderAmount?: number | string | null; usageLimit?: number | string | null; perCustomerLimit?: number | string | null;
    startsAt?: string | null; expirationDate: string; scope: CouponScope; categories?: string[]; productIds?: string[];
    description?: string | null;
}
/** A product chosen in the picker (from search results or an existing coupon). */
export interface PickedProduct { id: string; name: string; brand: string | null; ean: string | null; category?: string | null; status?: string; image?: string | null; missing?: boolean }

async function json<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const m = body?.message;
        const msg = Array.isArray(m) ? m.join(' ') : typeof m === 'string' && m ? m : `HTTP ${res.status}`;
        throw new ApiError(msg, res.status, body);
    }
    return body as T;
}
const post = (path: string, body?: unknown) => apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export const adminCouponsApi = {
    list: () => apiFetch('/coupons/admin/list', { cache: 'no-store' }).then((r) => json<CouponList>(r)),
    generateCode: () => post('/coupons/admin/generate-code').then((r) => json<{ code: string }>(r)),
    create: (d: CouponDraft) => post('/coupons', d).then((r) => json<CouponRow>(r)),
    update: (id: string, d: CouponDraft) => apiFetch(`/coupons/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).then((r) => json<CouponRow>(r)),
    setActive: (id: string, isActive: boolean) => post(`/coupons/${encodeURIComponent(id)}/status`, { isActive }).then((r) => json<CouponRow>(r)),
    remove: (id: string) => apiFetch(`/coupons/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<{ id: string; deleted: true }>(r)),
    products: (q: string) => apiFetch(`/coupons/admin/products?q=${encodeURIComponent(q)}`, { cache: 'no-store' }).then((r) => json<CatalogProduct[]>(r)),
    categories: () => apiFetch('/coupons/admin/categories', { cache: 'no-store' }).then((r) => json<CategoryOption[]>(r)),
};
