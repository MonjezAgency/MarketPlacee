/**
 * Supplier offers often carry product photos inside the workbook, which makes
 * them too large to upload in one request. Before analysis we split an .xlsx:
 * the server gets a copy without the photo bytes (cells, layout and photo
 * positions intact), and the photos stay in the browser until import, when
 * each batch uploads only its own photos.
 */
import * as CFB from 'cfb';

export interface PreparedFile {
    upload: Blob;
    uploadName: string;
    /** Photo bytes by their path inside the workbook, e.g. "xl/media/image3.png". */
    photos: Map<string, Blob>;
    originalSize: number;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export async function prepareWorkbook(file: File): Promise<PreparedFile> {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const photos = new Map<string, Blob>();
    if (ext !== 'xlsx') return { upload: file, uploadName: file.name, photos, originalSize: file.size };
    const bytes = new Uint8Array(await file.arrayBuffer());
    let container: CFB.CFB$Container;
    try { container = CFB.read(bytes, { type: 'array' }); }
    catch { return { upload: file, uploadName: file.name, photos, originalSize: file.size }; } // let the server explain
    let stripped = 0;
    container.FullPaths.forEach((full, i) => {
        const entry = container.FileIndex[i];
        const path = full.replace(/^Root Entry\//, '');
        if (!/^xl\/media\//.test(path) || !entry?.size) return;
        const content = entry.content as unknown as Uint8Array | number[];
        const data = content instanceof Uint8Array ? content : new Uint8Array(content);
        const type = MIME[(path.split('.').pop() || '').toLowerCase()];
        if (type) photos.set(path, new Blob([new Uint8Array(data) as BlobPart], { type }));
        entry.content = new Uint8Array(0) as any;
        entry.size = 0;
        stripped++;
    });
    if (!stripped) return { upload: file, uploadName: file.name, photos, originalSize: file.size };
    const out = CFB.write(container, { type: 'array', fileType: 'zip', compression: true }) as unknown as Uint8Array | number[];
    const data = out instanceof Uint8Array ? out : new Uint8Array(out);
    return { upload: new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), uploadName: file.name, photos, originalSize: file.size };
}

/** Group rows into upload batches that stay under the request size limit (photos dominate). */
export function batchRows<T extends { images?: string[] }>(rows: T[], photos: Map<string, Blob>, maxRows = 100, maxBytes = 3_000_000, maxPhotos = 60): T[][] {
    const batches: T[][] = [];
    let cur: T[] = [], bytes = 0, count = 0;
    for (const r of rows) {
        const own = (r.images || []).filter((p) => photos.has(p));
        const size = own.reduce((s, p) => s + (photos.get(p)?.size || 0), 0);
        if (cur.length && (cur.length >= maxRows || bytes + size > maxBytes || count + own.length > maxPhotos)) { batches.push(cur); cur = []; bytes = 0; count = 0; }
        cur.push(r); bytes += size; count += own.length;
    }
    if (cur.length) batches.push(cur);
    return batches;
}
