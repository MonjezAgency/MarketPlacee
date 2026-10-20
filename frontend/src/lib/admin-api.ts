import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/supplier-api';

/** Typed calls for the founder/admin workspace (`/dashboard/admin/*`, `/products/admin/*`). */

export type CatalogScope = 'catalog' | 'submissions';

export interface AdminProductRow {
    id: string; name: string; brand: string | null; category: string; status: string; adminNotes: string | null;
    images: string[]; image: string | null; hasImage: boolean; ean: string | null;
    basePrice: number | null; price: number; supplierCurrency?: string | null; supplierPrice?: number | null; stock: number; unit: string | null; moq: number | null; moqUnit: string | null;
    unitsPerCase: number | null; casesPerPallet: number | null; palletsPerShipment: number | null;
    weight: string | null; origin: string | null; exwLocation: string | null; createdAt: string; updatedAt: string;
    supplier: { id: string; name: string; companyName: string | null; email: string; role: string } | null;
    missing: string[]; missingFields: string[];
}

export interface AdminProductPage {
    scope: CatalogScope;
    data: AdminProductRow[]; total: number; page: number; limit: number; pages: number;
    counts: { total: number; byStatus: Record<string, number>; missingInfo: number; missingImages: number; scopes: { catalog: number; submissions: number; submissionsPending: number } };
    facets: { categories: { value: string; count: number }[]; brands: { value: string; count: number }[]; suppliers: { id: string; name: string; count: number }[] };
}

export interface ReviewEvent {
    id: string; action: string; message: string | null; statusAfter: string | null; createdAt: string;
    by: 'atlantis' | 'supplier' | 'system'; actorName?: string | null; actorId?: string | null;
}

export interface Missing { field: string; label: string; reason: string }

export interface AdminProductReview {
    product: any;
    scope: CatalogScope;
    missing: Missing[]; invalid: Missing[]; canApprove: boolean;
    history: ReviewEvent[];
    changes: { id: string; field: string; oldValue: string | null; newValue: string | null; reason: string | null; createdAt: string; actor: { id: string; name: string | null; role: string | null } | null }[];
    usage: { orderLines: number; buyersWatching: number; approvedOffers: number; activePromotions: number };
    supplierCatalog: { byStatus: Record<string, number>; total: number };
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
const post = (path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') => apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const qs = (q: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
    return p.toString();
};

export const adminApi = {
    /** Founder Overview; the period is resolved on the server. */
    overview: (q: { range: string; from?: string; to?: string }) => apiFetch(`/dashboard/admin/overview?${qs(q)}`, { cache: 'no-store' }).then((r) => json<any>(r)),
    products: (scope: CatalogScope, q: Record<string, string | number | undefined>) => apiFetch(`/products/admin/list?${qs({ scope, ...q })}`, { cache: 'no-store' }).then((r) => json<AdminProductPage>(r)),
    review: (id: string) => apiFetch(`/products/admin/${id}/review`, { cache: 'no-store' }).then((r) => json<AdminProductReview>(r)),
    approve: (id: string) => apiFetch(`/products/${id}/approve`, { method: 'PATCH' }).then((r) => json<any>(r)),
    reject: (id: string, reason: string) => post(`/products/${id}/reject`, { reason }, 'PATCH').then((r) => json<any>(r)),
    requestChanges: (id: string, message: string) => post(`/products/${id}/comment`, { message }, 'PATCH').then((r) => json<any>(r)),
    setStatus: (id: string, status: string, adminNotes?: string) => post(`/products/${id}/status`, { status, adminNotes }, 'PATCH').then((r) => json<any>(r)),
    bulkApprove: (ids: string[]) => post('/products/bulk-approve', { ids }).then((r) => json<{ count: number; skipped: { id: string; name: string; missing: string[] }[]; message: string }>(r)),
    bulkReject: (ids: string[], reason: string) => post('/products/bulk-reject', { ids, reason }).then((r) => json<any>(r)),
    remove: (id: string) => apiFetch(`/products/${id}`, { method: 'DELETE' }).then((r) => json<any>(r)),
    /** Review trail of one product (staff view, with team member names). */
    reviewHistory: (id: string) => apiFetch(`/products/${id}/review-history`, { cache: 'no-store' }).then((r) => json<ReviewEvent[]>(r)),
};
