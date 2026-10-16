import { SupplierImportService } from '../supplier-import.service';

/** The import service with its database, notifications, storage and photo search replaced by fakes. */
export function fakes(existing: any[] = [], opts: { storageDown?: boolean; enrichment?: any } = {}) {
    const created: any[] = [], updated: any[] = [], sources: any[] = [], uploads: any[] = [];
    const products: any = {
        findMineForImport: jest.fn(async () => existing),
        knownBrands: jest.fn(async () => ['Crunchy']),
        findOneRaw: jest.fn(async (id: string) => existing.find((e) => e.id === id) || null),
        countPendingSince: jest.fn(async () => 2),
        create: jest.fn(async (p: any) => { if (p.name === 'Explode') throw new Error('Database is down'); const id = `p${created.length + 1}`; created.push({ id, ...p }); return { id, status: p.images?.length && p.stock !== undefined ? 'PENDING' : 'DRAFT' }; }),
        supplierUpdate: jest.fn(async (id: string, _s: string, patch: any) => { updated.push({ id, patch }); return { id, status: 'APPROVED' }; }),
        recordImportSource: jest.fn(async (...a: any[]) => { sources.push(a); }),
        setImageCredits: jest.fn(async () => undefined),
    };
    const notifications: any = { notifyAdmins: jest.fn(async () => undefined) };
    const storage: any = { uploadProductImage: jest.fn(async (buf: Buffer, name: string) => { if (opts.storageDown) throw new Error('Image upload failed: fetch failed. Check Supabase bucket "product-images" exists'); uploads.push(name); return `https://cdn.example.com/${name}`; }) };
    const enrichment = opts.enrichment ?? { candidateFor: () => null, queue: { fetch }, imageQueue: { fetch } };
    const imageLookup: any = { accept: jest.fn(async (url: string) => { if (opts.storageDown) throw new Error('down'); uploads.push(url); return { url: `https://cdn.example.com/lookup-${uploads.length}.jpg` }; }) };
    return { svc: new SupplierImportService(products, notifications, storage, enrichment, imageLookup), imageLookup, products, notifications, storage, created, updated, sources, uploads };
}
