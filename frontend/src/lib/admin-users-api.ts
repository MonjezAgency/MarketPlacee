import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/supplier-api';

/**
 * Admin → Users. Reads come from GET /admin/users/list, GET /admin/users/:id and its tabs
 * (backend/src/admin/admin-users.*, ADMIN/OWNER, non-sensitive fields only).
 * Account actions call the existing /users endpoints unchanged.
 */

export type AccountStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'BLOCKED' | 'DELETED';
export const ROLES = ['CUSTOMER', 'SUPPLIER', 'OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS', 'PAIR', 'SUBLAYER'] as const;
export const STATUSES: AccountStatus[] = ['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'BLOCKED', 'DELETED'];
export const KYC_STATUSES = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
export const USER_SORTS = ['newest', 'oldest', 'name', 'company', 'email', 'orders', 'products'] as const;
/** Account actions apply to marketplace accounts only; staff accounts are managed under Team. */
export const isMarketAccount = (role: string) => role === 'CUSTOMER' || role === 'SUPPLIER';

export interface UserRow {
    id: string; name: string; email: string; companyName: string | null; country: string | null; avatar: string | null;
    role: string; status: AccountStatus; kycStatus: string; emailVerified: boolean; createdAt: string;
    activity: { orders: number | null; products: number | null; liveProducts: number | null; targetPrices: number | null };
}

export interface UserPage {
    data: UserRow[]; total: number; page: number; limit: number; pages: number;
    counts: { byRole: Record<string, number>; staff: number; byStatus: Record<string, number> };
    facets: { countries: { value: string; count: number }[] };
}

export interface UserProfile {
    id: string; name: string; email: string; emailVerified: boolean; phone: string | null; avatar: string | null;
    companyName: string | null; website: string | null; country: string | null; businessType: string | null; businessCity: string | null;
    preferredBrands: string[]; role: string; status: AccountStatus; kycStatus: string;
    onboardingCompleted: boolean; twoFactorEnabled: boolean; createdAt: string; updatedAt: string;
}

/** Money for one account, defined in backend/src/admin/admin-users-activity.ts. Null = hidden or not recorded. */
export interface AccountMoney {
    currency: 'EUR'; countedOrders: number; grossValue: number; supplierNet: number | null; margin: number | null;
    linesCounted: number; linesWithoutNet: number; netVisible: boolean;
}

export interface ReviewDecision { id: string; action: string; message: string | null; statusAfter: string | null; createdAt: string; product: { id: string; name: string }; by: 'atlantis' | 'system'; actorName: string | null }

export interface UserDetail {
    user: UserProfile;
    netVisible: boolean;
    kycDocuments: { id: string; documentType: string; status: string; adminNotes: string | null; createdAt: string; updatedAt: string }[];
    supplier: null | {
        products: { total: number; byStatus: Record<string, number> };
        offers: { total: number; byStatus: Record<string, number> };
        orders: { total: number };
        reviews: { total: number; average: number | null };
        reviewDecisions: ReviewDecision[];
        money: AccountMoney;
    };
    buyer: null | {
        orders: { total: number; byStatus: Record<string, number>; awaitingReview: number };
        targetPrices: { total: number; byStatus: Record<string, number> };
        reviews: { total: number };
        money: AccountMoney;
    };
}

export interface Paged<T> { data: T[]; total: number; page: number; limit: number; pages: number }
export interface ProductTabRow { id: string; name: string; ean: string | null; brand: string | null; status: string; image: string | null; stock: number; unit: string | null; updatedAt: string; netPrice: number | null }
export interface OfferTabRow { id: string; status: string; unit: string; quantity: number; validUntil: string | null; createdAt: string; product: { id: string; name: string } | null; pricePerUnit: number | null }
export interface OrderTabRow { id: string; createdAt: string; status: string; reviewStatus: string; paymentStatus: string; buyer: { id: string; name: string } | null; lines: number; totalAmount: number | null }
export interface TargetTabRow { id: string; ref: string; status: string; targetCasePrice: number; quantity: number; quantityUnit: string; createdAt: string; product: { id: string; name: string } | null }
export interface ReviewTabRow { id: string; rating: number; comment: string | null; createdAt: string; product: { id: string; name: string } | null; author: { id: string; name: string } | null }

async function json<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const m = body?.message;
        const msg = Array.isArray(m) ? m.join(' ') : typeof m === 'string' && m ? m : `HTTP ${res.status}`;
        throw new ApiError(msg, res.status, body);
    }
    return body as T;
}
const post = (path: string, body: unknown) => apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const qs = (q: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
    return p.toString();
};

const tab = <T,>(id: string, name: string, q: Record<string, string | number | undefined>) =>
    apiFetch(`/admin/users/${encodeURIComponent(id)}/${name}?${qs(q)}`, { cache: 'no-store' }).then((r) => json<T>(r));

export const PAGE_SIZES = [25, 50, 100] as const;

export const adminUsersApi = {
    list: (q: Record<string, string | number | undefined>) => apiFetch(`/admin/users/list?${qs(q)}`, { cache: 'no-store' }).then((r) => json<UserPage>(r)),
    detail: (id: string) => apiFetch(`/admin/users/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => json<UserDetail>(r)),
    /** Account tabs, 14 per page (GET /admin/users/:id/<tab>). */
    products: (id: string, q: { page: number; status?: string }) => tab<Paged<ProductTabRow> & { netVisible: boolean }>(id, 'products', q),
    offers: (id: string, q: { page: number }) => tab<Paged<OfferTabRow> & { netVisible: boolean }>(id, 'offers', q),
    orders: (id: string, q: { page: number }) => tab<Paged<OrderTabRow>>(id, 'orders', q),
    targetPrices: (id: string, q: { page: number }) => tab<Paged<TargetTabRow>>(id, 'target-prices', q),
    reviews: (id: string, q: { page: number }) => tab<Paged<ReviewTabRow>>(id, 'reviews', q),
    /** Existing endpoint (OWNER/ADMIN/MODERATOR): approve = ACTIVE, reject = REJECTED, block = BLOCKED, unblock = ACTIVE. */
    setStatus: (id: string, status: 'ACTIVE' | 'REJECTED' | 'BLOCKED') => post(`/users/${encodeURIComponent(id)}/status`, { status }).then((r) => json<unknown>(r)),
    /** Existing bulk endpoints: approve (OWNER/ADMIN/MODERATOR), block (OWNER/ADMIN). */
    bulkApprove: (ids: string[]) => post('/users/bulk-approve', { ids }).then((r) => json<{ updated: number; failed: number }>(r)),
    bulkBlock: (ids: string[]) => post('/users/bulk-block', { ids }).then((r) => json<{ updated: number; failed: number }>(r)),
};
