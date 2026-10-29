import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/supplier-api';

/**
 * Endpoints of the bulk import wizard per destination. `supplier` imports into
 * the signed-in supplier's catalog; `catalog` imports into the Ali FMCG Catalog
 * (staff only, server-enforced in admin-catalog.controller.ts).
 */
export type ImportTarget = 'supplier' | 'catalog';

async function json<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const m = body?.message;
        throw new ApiError(Array.isArray(m) ? m.join(' ') : typeof m === 'string' && m ? m : `HTTP ${res.status}`, res.status, body);
    }
    return body as T;
}
const post = (path: string, body: unknown) => apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function importApi(target: ImportTarget) {
    const base = target === 'catalog' ? '/admin-catalog' : '/supplier-catalog';
    return {
        base,
        schema: () => apiFetch(`${base}/import/schema`).then((r) => json<any>(r)),
        analyse: (file: Blob, name: string) => { const fd = new FormData(); fd.append('file', file, name); return apiFetch(`${base}/import/analyse`, { method: 'POST', body: fd }).then((r) => json<any>(r)); },
        validate: (body: any) => post(`${base}/import/validate`, body).then((r) => json<any>(r)),
        photoLookup: (items: { key: string; ean: string; name?: string; brand?: string; weight?: string; category?: string }[]) => post(`${base}/import/photo-lookup`, { items }).then((r) => json<{ jobId: string; total: number; lookups: number; etaSeconds: number }>(r)),
        photoLookupStatus: (jobId: string) => apiFetch(`${base}/import/photo-lookup/${encodeURIComponent(jobId)}`, { cache: 'no-store' }).then((r) => json<{ done: boolean; total: number; completed: number; etaSeconds: number; results: any[]; failed: string | null }>(r)),
        commit: (payload: any, photos: { path: string; blob: Blob }[]) => {
            const fd = new FormData();
            fd.append('payload', JSON.stringify(payload));
            for (const p of photos) fd.append('photos', p.blob, p.path.split('/').pop() || 'photo');
            return apiFetch(`${base}/import/commit`, { method: 'POST', body: fd }).then((r) => json<any>(r)).then((out) => {
                if (target === 'supplier' && typeof window !== 'undefined') window.dispatchEvent(new Event('atl:supplier-data-changed'));
                return out;
            });
        },
    };
}
