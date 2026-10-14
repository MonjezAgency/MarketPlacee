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
    source: string;
    sourceUrl: string;      // the public product page, for the supplier to check
    license: string;
    productName: string | null;
    brand: string | null;
    barcodeMatch: boolean;
    nameMatch: boolean | null;   // null = nothing to compare
    brandMatch: boolean | null;
    confidence: 'verified' | 'needs_confirmation';
    reason: string;
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

/** Upgrade an OFF display image URL (…/front_en.12.400.jpg) to the full-size file. */
const fullSize = (u: string) => u.replace(/\.(\d+)\.(100|200|400)\.(jpg|png)$/i, '.$1.full.$3');

@Injectable()
export class ImageLookupService {
    private readonly logger = new Logger(ImageLookupService.name);
    constructor(private readonly storage: SupabaseStorageService) {}

    async lookup(rawCode: string, name?: string, brand?: string, fetcher: typeof fetch = fetch): Promise<LookupResult> {
        const barcode = normaliseBarcode(rawCode);
        const problem = barcodeProblem(barcode);
        if (problem) return { status: 'invalid_barcode', barcode, message: problem, candidates: [] };

        let reachable = 0;
        const candidates: ImageCandidate[] = [];
        await Promise.all(SOURCES.map(async (src) => {
            try {
                const res = await fetcher(`${src.api}/api/v2/product/${barcode}.json?fields=code,product_name,product_name_en,brands,image_front_url,image_url`, {
                    headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
                });
                reachable++;
                if (!res.ok) return;
                const j: any = await res.json();
                const p = j?.product;
                if (j?.status !== 1 || !p) return;
                const img: string | undefined = p.image_front_url || p.image_url;
                if (!img) return;
                const barcodeMatch = normaliseBarcode(p.code || j.code) === barcode;
                const productName = p.product_name_en || p.product_name || null;
                const nameMatch = compareNames(name, productName);
                const brandMatch = compareBrands(brand, p.brands || null);
                const agrees = nameMatch === true || brandMatch === true;
                const contradicts = nameMatch === false || brandMatch === false; // a conflicting name or brand is never auto-verified
                const confidence: ImageCandidate['confidence'] = barcodeMatch && agrees && !contradicts ? 'verified' : 'needs_confirmation';
                const reason = !barcodeMatch ? 'The source record has a different barcode.'
                    : confidence === 'verified' ? `Same barcode, and the ${nameMatch ? 'name' : 'brand'} matches.`
                    : nameMatch === null && brandMatch === null ? 'Same barcode, but there is no name or brand to compare — check the photo.'
                    : 'Same barcode, but the name/brand differ from yours — check it is the same product.';
                candidates.push({
                    url: fullSize(img), previewUrl: img, source: src.label,
                    sourceUrl: `${src.api}/product/${barcode}`, license: 'CC BY-SA 3.0 — ' + src.label + ' contributors',
                    productName, brand: p.brands || null, barcodeMatch, nameMatch, brandMatch, confidence, reason,
                });
            } catch (e: any) {
                this.logger.warn(`[image-lookup] ${src.id} ${barcode}: ${e?.message}`);
            }
        }));
        candidates.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'verified' ? -1 : 1));

        if (!reachable) return { status: 'unavailable', barcode, message: 'The product databases didn’t respond. Try again in a minute, or upload your own photo.', candidates: [] };
        if (!candidates.length) return { status: 'not_found', barcode, message: 'No product photo is registered for this barcode. Upload your own photo, or save as a draft and add it later.', candidates: [] };
        const verified = candidates.some((c) => c.confidence === 'verified');
        return {
            status: verified ? 'found' : 'ambiguous',
            barcode,
            message: verified ? 'Found a photo registered for this barcode. Check it and accept it if it’s your product.' : 'Found a photo for this barcode, but we can’t confirm it’s the same product. Only accept it if it clearly is.',
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
