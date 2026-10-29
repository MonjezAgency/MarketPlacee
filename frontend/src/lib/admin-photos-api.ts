import { apiFetch } from '@/lib/api';
import { ApiError, type DiscoveryCandidate, type ImageDiscovery } from '@/lib/supplier-api';

/**
 * Admin → Products → Product photos. Backend: backend/src/products/admin-product-photos.controller.ts
 * (list and search again: OWNER/ADMIN/MODERATOR; using or dismissing a found photo: OWNER/ADMIN, Ali FMCG
 * Catalog products only). Ranking and identity checks are the server's (image-discovery.service.ts,
 * image-quality.ts); nothing here decides which photo is right.
 */

export const PHOTO_BUCKETS = ['review', 'no_clean_background', 'searching', 'not_searched', 'no_barcode', 'invalid_barcode', 'not_in_database', 'mismatch', 'no_photo', 'unavailable', 'dismissed'] as const;
export type PhotoBucket = (typeof PHOTO_BUCKETS)[number];
export type PhotoScope = 'catalog' | 'submissions';

/** For supplier products the server sends the outcome only (no photos): found = how many, bestTier = the best one's tier. */
export type StaffDiscovery = ImageDiscovery & { found?: number; bestTier?: 1 | 2 | 3 | null };
export interface PhotoRow {
    id: string; name: string; brand: string | null; ean: string | null; status: string; bucket: PhotoBucket;
    hasPhoto: boolean; photo: string | null; supplier: string | null; discovery: StaffDiscovery | null;
}
export interface PhotoList { scope: PhotoScope; total: number; page: number; limit: number; counts: Record<PhotoBucket, number>; canApply: boolean; items: PhotoRow[] }
export type RetryOutcome = 'started' | 'searching' | 'answered_recently' | 'no_barcode' | 'has_photo' | 'not_found';

async function json<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(body?.message ? (Array.isArray(body.message) ? body.message.join(' ') : String(body.message)) : `HTTP ${res.status}`, res.status, body);
    return body as T;
}
const post = (path: string, body: unknown) => apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const adminPhotosApi = {
    list: (q: { scope: PhotoScope; bucket?: string; q?: string; page?: number }) => {
        const p = new URLSearchParams({ scope: q.scope, page: String(q.page || 1) });
        if (q.bucket) p.set('bucket', q.bucket);
        if (q.q) p.set('q', q.q);
        return apiFetch(`/admin-product-photos?${p}`, { cache: 'no-store' }).then((r) => json<PhotoList>(r));
    },
    retry: (ids: string[]) => post('/admin-product-photos/retry', { ids }).then((r) => json<{ results: { id: string; outcome: RetryOutcome; status?: string | null }[]; started: number }>(r)),
    accept: (id: string, url: string, also: string[] = []) => post(`/admin-product-photos/${id}/accept`, { url, also }).then((r) => json<{ id: string; images: string[]; imageDiscovery: ImageDiscovery | null }>(r)),
    dismiss: (id: string, url?: string) => post(`/admin-product-photos/${id}/dismiss`, url ? { url } : {}).then((r) => json<{ state: ImageDiscovery | null }>(r)),
};
export type { DiscoveryCandidate };
