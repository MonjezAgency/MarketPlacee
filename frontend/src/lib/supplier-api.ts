import { apiFetch } from '@/lib/api';

/** Typed calls for the supplier workspace (`/supplier-catalog/*`, `/orders/*`). */

export interface Missing { field: string; label: string; reason: string }

export interface SupplierProduct {
    id: string; name: string; brand: string | null; category: string; status: string; adminNotes: string | null;
    images: string[]; ean: string | null; price: number | null; basePrice: number | null; stock: number; unit: string | null;
    moq: number | null; moqUnit: string | null; unitsPerCase: number | null; casesPerPallet: number | null; palletsPerShipment: number | null;
    supplierCurrency?: string | null; supplierPrice?: number | null;
    weight: string | null; origin: string | null; exwLocation: string | null; shelfLife: string | null; leadTime: number | null;
    description?: string; videos?: string[]; readyForDispatch?: boolean;
    variants: { name: string; values: string[] }[];
    createdAt: string; updatedAt: string; reserved?: number;
    missing: Missing[]; statusNote: string;
    movement?: { reserved: number; inTransit: number; delivered: number; cancelled: number; ordered: number };
}

export interface ProductPage {
    data: SupplierProduct[]; total: number; page: number; limit: number; pages: number;
    summary: { total: number; byStatus: Record<string, number>; categories: number; outOfStock: number };
    categories: string[];
}

export class ApiError extends Error {
    constructor(message: string, public status: number, public body: any) { super(message); }
}

async function json<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const m = body?.message;
        const msg = Array.isArray(m) ? m.join(' ') : typeof m === 'string' && m ? m
            : res.status === 401 ? 'Your session has expired — sign in again.'
                : res.status === 403 ? 'You don’t have access to this.'
                    : res.status >= 500 ? 'The server had a problem. Please try again in a moment.' : 'Request failed.';
        throw new ApiError(msg, res.status, body);
    }
    return body as T;
}

const post = (path: string, body: unknown) => apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const supplierApi = {
    overview: (from: string, to: string) => apiFetch(`/supplier-catalog/overview?from=${from}&to=${to}`, { cache: 'no-store' }).then((r) => json<any>(r)),
    products: (q: Record<string, string | number | undefined>) => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
        return apiFetch(`/supplier-catalog/products?${p}`, { cache: 'no-store' }).then((r) => json<ProductPage>(r));
    },
    product: (id: string) => apiFetch(`/supplier-catalog/products/${id}`, { cache: 'no-store' }).then((r) => json<SupplierProduct>(r)),
    history: (id: string) => apiFetch(`/supplier-catalog/products/${id}/history`, { cache: 'no-store' }).then((r) => json<any[]>(r)),
    create: (body: any) => post('/products', body).then((r) => json<SupplierProduct>(r)),
    update: (id: string, body: any) => apiFetch(`/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<SupplierProduct>(r)),
    remove: (id: string) => apiFetch(`/products/${id}`, { method: 'DELETE' }).then((r) => json<any>(r)),
    removeMany: (ids: string[]) => post('/products/bulk-delete', { ids }).then((r) => json<{ count: number; skipped: number }>(r)),
    resend: (id: string) => apiFetch(`/products/${id}/resend`, { method: 'PATCH' }).then((r) => json<any>(r)),
    uploadImage: (file: File) => { const fd = new FormData(); fd.append('file', file); return apiFetch('/products/upload-image', { method: 'POST', body: fd }).then((r) => json<{ url: string }>(r)); },
    imageLookup: (ean: string, name?: string, brand?: string) => post('/supplier-catalog/image-lookup', { ean, name, brand }).then((r) => json<any>(r)),
    acceptImage: (url: string) => post('/supplier-catalog/image-lookup/accept', { url }).then((r) => json<{ url: string }>(r)),
    preferences: () => apiFetch('/supplier-catalog/preferences', { cache: 'no-store' }).then((r) => json<{ defaultCurrency: string | null; suggestedCurrency: string; effectiveCurrency: string; country: string | null; currencies: string[]; rates: Record<string, number> }>(r)),
    setPreferences: (body: { defaultCurrency: string | null }) => apiFetch('/supplier-catalog/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<any>(r)),
    inventory: () => apiFetch('/products/inventory', { cache: 'no-store' }).then((r) => json<any[]>(r)),
    updatesPreview: (body: any) => post('/supplier-catalog/updates/preview', body).then((r) => json<any>(r)),
    updatesCommit: (body: any) => post('/supplier-catalog/updates/commit', body).then((r) => json<any>(r)),
    reputation: () => apiFetch('/supplier-catalog/reputation', { cache: 'no-store' }).then((r) => json<any>(r)),
    importSchema: () => apiFetch('/supplier-catalog/import/schema').then((r) => json<any>(r)),
    importParse: (file: File) => { const fd = new FormData(); fd.append('file', file); return apiFetch('/supplier-catalog/import/parse', { method: 'POST', body: fd }).then((r) => json<any>(r)); },
    importValidate: (body: any) => post('/supplier-catalog/import/validate', body).then((r) => json<any>(r)),
    importCommit: (body: any) => post('/supplier-catalog/import/commit', body).then((r) => json<any>(r)),
    orders: () => apiFetch('/orders/my-orders', { cache: 'no-store' }).then((r) => json<any[]>(r)),
    acceptOrder: (id: string) => apiFetch(`/orders/${id}/supplier-accept`, { method: 'POST' }).then((r) => json<any>(r)),
    declineOrder: (id: string, reason: string) => post(`/orders/${id}/supplier-decline`, { reason }).then((r) => json<any>(r)),
};

/** Today and N days back as YYYY-MM-DD (UTC, matching the server's day buckets). */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
