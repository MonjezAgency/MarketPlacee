import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { barcodeProblem, normaliseBarcode } from './catalog-rules';

/**
 * Barcode → product image, as an assisted step the supplier must confirm.
 *
 * Sources: the Open Food / Beauty / Products / Pet Food Facts databases —
 * open product catalogs keyed by barcode, images licensed CC BY-SA. No web
 * image search is used, so a candidate is always tied to the exact barcode.
 *
 * A candidate is "verified" only when the source record has the same barcode
 * AND its name or brand agrees with what the supplier entered. Otherwise it is
 * returned as "needs confirmation". Nothing is saved until the supplier
 * accepts a candidate, and accepting only adds an image — it never changes
 * name, price, stock or any other field.
 */
const SOURCES = [
    { id: 'openfoodfacts', label: 'Open Food Facts', api: 'https://world.openfoodfacts.org', imgHosts: ['images.openfoodfacts.org', 'static.openfoodfacts.org'] },
    { id: 'openbeautyfacts', label: 'Open Beauty Facts', api: 'https://world.openbeautyfacts.org', imgHosts: ['images.openbeautyfacts.org', 'static.openbeautyfacts.org'] },
    { id: 'openproductsfacts', label: 'Open Products Facts', api: 'https://world.openproductsfacts.org', imgHosts: ['images.openproductsfacts.org', 'static.openproductsfacts.org'] },
    { id: 'openpetfoodfacts', label: 'Open Pet Food Facts', api: 'https://world.openpetfoodfacts.org', imgHosts: ['images.openpetfoodfacts.org', 'static.openpetfoodfacts.org'] },
] as const;
const ALLOWED_IMAGE_HOSTS = new Set<string>(SOURCES.flatMap((s) => [...s.imgHosts]));
const UA = 'AtlantisFMCG/1.0 (supplier catalog image lookup; https://atlantisfmcg.com)';

export interface ImageCandidate {
    url: string;            // full-size image (what gets stored if accepted)
    previewUrl: string;
    kind: 'front' | 'packaging' | 'other';
    language: string | null;
    source: string;
    sourceUrl: string;      // the public product page, for the supplier to check
    license: string;
    productName: string | null;
    brand: string | null;
    barcodeMatch: boolean;
    nameMatch: boolean | null;   // null = nothing to compare
    brandMatch: boolean | null;
    /** Pack size / multipack agreement between the source record and the supplier's listing. */
    packMatch: boolean | null;
    sourceQuantity: string | null;
    confidence: 'verified' | 'needs_confirmation';
    reason: string;
    warnings: string[];
}

export interface LookupResult {
    status: 'found' | 'ambiguous' | 'not_found' | 'invalid_barcode' | 'unavailable';
    barcode: string;
    message: string;
    candidates: ImageCandidate[];
}

const STOP = new Set(['the', 'and', 'with', 'for', 'pack', 'case', 'box', 'bar', 'can', 'bottle', 'jar', 'piece', 'pieces', 'pcs', 'x']);
const tokens = (s: string | null | undefined) =>
    String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, ' ')
        .split(' ').filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+(g|kg|ml|l|cl|gr)?$/.test(t));

/** Quantities that distinguish variants of one brand line: "70%", "400 g", "1.5 L". */
function specs(s: string | null | undefined): Map<string, Set<number>> {
    const out = new Map<string, Set<number>>();
    const re = /(\d+(?:[.,]\d+)?)\s*(%|kg|g|gr|ml|cl|l)(?![a-z])/gi;
    for (const m of String(s || '').toLowerCase().matchAll(re)) {
        let v = Number(m[1].replace(',', '.'));
        let u = m[2] === 'gr' ? 'g' : m[2];
        if (u === 'kg') { v *= 1000; u = 'g'; }
        if (u === 'l') { v *= 1000; u = 'ml'; }
        if (u === 'cl') { v *= 10; u = 'ml'; }
        (out.get(u) || out.set(u, new Set()).get(u)!).add(Math.round(v * 100) / 100);
    }
    return out;
}

export function compareNames(supplierName: string | undefined, sourceName: string | null): boolean | null {
    const a = tokens(supplierName), b = new Set(tokens(sourceName));
    if (!a.length || !b.size) return null;
    // Same brand line but a different percentage / size is a different product.
    const sa = specs(supplierName), sb = specs(sourceName);
    for (const [unit, vals] of sa) {
        const other = sb.get(unit);
        if (other && ![...vals].some((v) => other.has(v))) return false;
    }
    const shared = a.filter((t) => b.has(t)).length;
    return shared >= Math.min(2, a.length, b.size);
}

export function compareBrands(supplierBrand: string | undefined, sourceBrands: string | null): boolean | null {
    const a = String(supplierBrand || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!a || !sourceBrands) return null;
    return sourceBrands.split(',').map((x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '')).some((b) => b && (b.includes(a) || a.includes(b)));
}

/** "6 x 330 ml", "4×", "pack of 12" → 6 / 4 / 12; null when it's a single unit. */
export function multipackCount(s: string | null | undefined): number | null {
    const t = String(s || '').toLowerCase();
    const m = t.match(/(\d{1,3})\s*[x×]\s*\d/) || t.match(/\b(\d{1,3})\s*[x×](?!\w)/) || t.match(/pack of (\d{1,3})/) || t.match(/(\d{1,3})\s*-?\s*pack\b/);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n > 1 ? n : null;
}

/**
 * Same pack? Compares sizes (g / ml / %) and multipack counts found in the
 * source record (name + quantity) with the supplier's name + weight.
 * false = a clear difference, true = a size matches, null = nothing to compare.
 */
export function comparePack(supplier: { name?: string; weight?: string }, source: { name: string | null; quantity: string | null }): { match: boolean | null; reason: string | null } {
    const mine = `${supplier.name || ''} ${supplier.weight || ''}`;
    const theirs = `${source.name || ''} ${source.quantity || ''}`;
    const a = specs(mine), b = specs(theirs);
    let compared = false;
    for (const [unit, vals] of a) {
        const other = b.get(unit);
        if (!other || unit === '%') continue;
        compared = true;
        if (![...vals].some((v) => other.has(v))) {
            return { match: false, reason: `Size differs: the source says ${[...other].join('/')} ${unit}, your listing says ${[...vals].join('/')} ${unit}.` };
        }
    }
    const ma = multipackCount(mine), mb = multipackCount(theirs);
    if (mb && mb !== ma) return { match: false, reason: `The source record is a ${mb}-pack${ma ? `, yours is a ${ma}-pack` : ' — your listing doesn’t say it’s a multipack'}.` };
    if (ma && mb === null && source.quantity) return { match: false, reason: `Your listing is a ${ma}-pack; the source record looks like a single unit (${source.quantity}).` };
    return { match: compared ? true : null, reason: null };
}

/** Upgrade an OFF display image URL (…/front_en.12.400.jpg) to the full-size file. */
const fullSize = (u: string) => u.replace(/\.(\d+)\.(100|200|400)\.(jpg|png)$/i, '.$1.full.$3');

@Injectable()
export class ImageLookupService {
    private readonly logger = new Logger(ImageLookupService.name);
    constructor(private readonly storage: SupabaseStorageService) {}

    async lookup(rawCode: string, name?: string, brand?: string, fetcher: typeof fetch = fetch, weight?: string): Promise<LookupResult> {
        const barcode = normaliseBarcode(rawCode);
        const problem = barcodeProblem(barcode);
        if (problem) return { status: 'invalid_barcode', barcode, message: problem, candidates: [] };

        let reachable = 0;
        const candidates: ImageCandidate[] = [];
        await Promise.all(SOURCES.map(async (src) => {
            try {
                const res = await fetcher(`${src.api}/api/v2/product/${barcode}.json?fields=code,product_name,product_name_en,brands,quantity,selected_images,image_front_url,image_url,image_packaging_url`, {
                    headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
                });
                reachable++;
                if (!res.ok) return;
                const j: any = await res.json();
                const p = j?.product;
                if (j?.status !== 1 || !p) return;
                // Every genuine photo the record has: the front packshot in each language, then packaging.
                const photos: { url: string; kind: ImageCandidate['kind']; language: string | null }[] = [];
                const seen = new Set<string>();
                const addPhoto = (u: unknown, kind: ImageCandidate['kind'], language: string | null) => {
                    if (typeof u !== 'string' || !/^https:\/\//.test(u)) return;
                    const key = u.replace(/\.(\d+)\.(100|200|400|full)\./, '.$1.');
                    if (seen.has(key)) return;
                    seen.add(key); photos.push({ url: u, kind, language });
                };
                const sel = p.selected_images || {};
                for (const [lang, u] of Object.entries(sel.front?.display || {})) addPhoto(u, 'front', lang);
                addPhoto(p.image_front_url, 'front', null);
                for (const [lang, u] of Object.entries(sel.packaging?.display || {})) addPhoto(u, 'packaging', lang);
                addPhoto(p.image_packaging_url, 'packaging', null);
                if (!photos.length) addPhoto(p.image_url, 'other', null);
                if (!photos.length) return;
                const barcodeMatch = normaliseBarcode(p.code || j.code) === barcode;
                const productName = p.product_name_en || p.product_name || null;
                const sourceQuantity = typeof p.quantity === 'string' && p.quantity.trim() ? p.quantity.trim() : null;
                const nameMatch = compareNames(name, productName);
                const brandMatch = compareBrands(brand, p.brands || null);
                const pack = comparePack({ name, weight }, { name: productName, quantity: sourceQuantity });
                const agrees = nameMatch === true || brandMatch === true;
                // A conflicting name, brand or pack size is never auto-verified.
                const contradicts = nameMatch === false || brandMatch === false || pack.match === false;
                const confidence: ImageCandidate['confidence'] = barcodeMatch && agrees && !contradicts ? 'verified' : 'needs_confirmation';
                const warnings = [pack.reason, nameMatch === false ? 'The product name differs from yours.' : null, brandMatch === false ? 'The brand differs from yours.' : null].filter(Boolean) as string[];
                const reason = !barcodeMatch ? 'The source record has a different barcode.'
                    : confidence === 'verified' ? `Same barcode, the ${nameMatch ? 'name' : 'brand'} matches${pack.match ? ' and so does the size' : ''}.`
                    : warnings.length ? `Same barcode, but: ${warnings.join(' ')} Check it is exactly your product.`
                    : 'Same barcode, but there is no name or brand to compare — check the photo.';
                for (const ph of photos) {
                    candidates.push({
                        url: fullSize(ph.url), previewUrl: ph.url, kind: ph.kind, language: ph.language, source: src.label,
                        sourceUrl: `${src.api}/product/${barcode}`, license: 'CC BY-SA 3.0 — ' + src.label + ' contributors',
                        productName, brand: p.brands || null, barcodeMatch, nameMatch, brandMatch, packMatch: pack.match, sourceQuantity, confidence, reason, warnings,
                    });
                }
            } catch (e: any) {
                this.logger.warn(`[image-lookup] ${src.id} ${barcode}: ${e?.message}`);
            }
        }));
        // Verified first, then front packshots (preferred as the main photo), then packaging.
        // English packshot first, then other languages (the storefront is English-first).
        const rank = (c: ImageCandidate) => (c.confidence === 'verified' ? 0 : 100) + (c.kind === 'front' ? 0 : c.kind === 'packaging' ? 10 : 20) + (c.language === 'en' ? 0 : c.language === null ? 1 : 2);
        candidates.sort((a, b) => rank(a) - rank(b));
        // Front packshots in many languages are near-identical: keep a few of each kind so packaging photos show too.
        const cap: Record<ImageCandidate['kind'], number> = { front: 4, packaging: 3, other: 2 };
        const kept: ImageCandidate[] = [];
        const used: Record<string, number> = {};
        for (const c of candidates) {
            const k = `${c.source}:${c.kind}`;
            if ((used[k] = (used[k] ?? 0) + 1) <= cap[c.kind]) kept.push(c);
        }
        candidates.splice(0, candidates.length, ...kept.slice(0, 12));

        if (!reachable) return { status: 'unavailable', barcode, message: 'The product databases didn’t respond. Try again in a minute, or upload your own photo.', candidates: [] };
        if (!candidates.length) return { status: 'not_found', barcode, message: 'No product photo is registered for this barcode. Upload your own photo, or save as a draft and add it later.', candidates: [] };
        const verified = candidates.some((c) => c.confidence === 'verified');
        return {
            status: verified ? 'found' : 'ambiguous',
            barcode,
            message: verified
                ? `Found ${candidates.length === 1 ? 'a photo' : `${candidates.length} photos`} registered for this barcode. Check and choose the ones that show your product.`
                : `Found ${candidates.length === 1 ? 'a photo' : `${candidates.length} photos`} for this barcode, but we can’t confirm ${candidates.length === 1 ? 'it shows' : 'they show'} the same product and pack. Only use a photo if it clearly does.`,
            candidates,
        };
    }

    /** Copy an accepted candidate into Atlantis storage. Only lookup-source hosts are allowed. */
    async accept(url: string, fetcher: typeof fetch = fetch): Promise<{ url: string }> {
        let u: URL;
        try { u = new URL(url); } catch { throw new BadRequestException('Invalid image link.'); }
        if (u.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(u.hostname)) throw new BadRequestException('Only images found by the barcode lookup can be accepted here. Upload other photos directly.');
        const res = await fetcher(u.toString(), { headers: { 'User-Agent': UA }, redirect: 'error', signal: AbortSignal.timeout(15000) }).catch(() => null);
        if (!res || !res.ok) throw new BadRequestException('Couldn’t download that image. Try again or upload your own photo.');
        const type = (res.headers.get('content-type') || '').split(';')[0].trim();
        if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new BadRequestException('That link isn’t a JPEG, PNG or WebP image.');
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 10 * 1024 * 1024) throw new BadRequestException('Image is larger than 10 MB.');
        const ext = type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg';
        try {
            const stored = await this.storage.uploadProductImage(buf, `barcode-lookup${ext}`, type);
            return { url: stored };
        } catch (e: any) {
            this.logger.error(`[image-lookup] storing accepted image failed: ${e?.message}`);
            throw new ServiceUnavailableException('We couldn’t save that photo right now. Try again in a minute, or upload your own photo.');
        }
    }
}
