import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { EanCacheService } from './ean-cache.service';
import { EanValidatorService } from './ean-validator.service';

/**
 * Structured result returned by `fetchProductByEan` — matches the user-facing spec:
 *   { ean, title, images: [...], cached, confidence_score }
 * plus diagnostic fields the bulk uploader can log.
 */
export interface EanProductResult {
    ean: string;
    title: string;
    images: string[];
    matched: boolean;                       // true = API + AI verification passed
    source: 'openfoodfacts' | 'none';       // which API the data came from
    reason?: string;                        // populated when matched === false
    cached?: boolean;                       // true when result came out of cache
    confidence_score?: number;              // 0.0 – 1.0, max AI score across accepted images
}

@Injectable()
export class EanService {
    private readonly logger = new Logger(EanService.name);

    constructor(
        private readonly cache: EanCacheService,
        private readonly validator: EanValidatorService,
    ) {}

    /** Minimum Jaccard similarity (token-set) between input title and API title to accept a match. */
    private readonly TITLE_MATCH_THRESHOLD = 0.4;

    /**
     * Single-source lookup: Open Food Facts.
     * Returns up to `imageCount` images (default 3) ordered semantically:
     *   front-of-pack → packaging shot → ingredients → nutrition → other.
     *
     * VERIFICATION: rejects the API result if either
     *   (a) returned EAN doesn't match the requested EAN, OR
     *   (b) a `title` was provided AND token-set similarity < threshold.
     * On mismatch, returns `{ matched: false, images: [] }` instead of leaking
     * a wrong-product image.
     */
    async fetchProductByEan(
        ean: string,
        title?: string,
        imageCount: number = 3,
        opts: { brand?: string; skipCache?: boolean; skipAiValidation?: boolean } = {},
    ): Promise<EanProductResult> {
        const cleanEan = String(ean || '').trim();
        if (!cleanEan) {
            return {
                ean: cleanEan,
                title: title || '',
                images: [],
                matched: false,
                source: 'none',
                reason: 'Empty EAN',
                cached: false,
                confidence_score: 0,
            };
        }

        // Clamp imageCount to a sane range
        const count = Math.max(1, Math.min(imageCount || 3, 10));

        // ── Cache check ────────────────────────────────────────────────
        if (!opts.skipCache) {
            const hit = this.cache.get(cleanEan, title, count);
            if (hit) return hit;
        }

        try {
            const resp = await axios.get(
                `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanEan)}.json`,
                {
                    timeout: 5000,
                    headers: { 'User-Agent': 'AtlantisMarketplace/1.0 (atlantisfmcg.com)' },
                },
            );

            // OFF returns { status: 0, ... } when product not found
            if (resp.data?.status !== 1 || !resp.data?.product) {
                const result: EanProductResult = {
                    ean: cleanEan,
                    title: title || '',
                    images: [],
                    matched: false,
                    source: 'none',
                    reason: 'EAN not found in Open Food Facts',
                    cached: false,
                    confidence_score: 0,
                };
                this.cache.set(cleanEan, title, count, result);
                return result;
            }

            const product = resp.data.product;
            const apiTitle: string = product.product_name || product.product_name_en || '';
            const apiEan: string = product.code || cleanEan;
            const apiBrand: string = product.brands || opts.brand || '';

            // (a) EAN sanity check
            if (apiEan && apiEan !== cleanEan) {
                const result: EanProductResult = {
                    ean: cleanEan,
                    title: title || apiTitle,
                    images: [],
                    matched: false,
                    source: 'none',
                    reason: `EAN mismatch: requested ${cleanEan}, API returned ${apiEan}`,
                    cached: false,
                    confidence_score: 0,
                };
                this.cache.set(cleanEan, title, count, result);
                return result;
            }

            // (b) Title match check (only when caller supplied a title)
            if (title && apiTitle) {
                const sim = this.titleSimilarity(apiTitle, title);
                if (sim < this.TITLE_MATCH_THRESHOLD) {
                    const result: EanProductResult = {
                        ean: cleanEan,
                        title: title,
                        images: [],
                        matched: false,
                        source: 'none',
                        reason: `Title mismatch (similarity ${sim.toFixed(2)} < ${this.TITLE_MATCH_THRESHOLD}): API returned "${apiTitle}"`,
                        cached: false,
                        confidence_score: sim,
                    };
                    this.cache.set(cleanEan, title, count, result);
                    return result;
                }
            }

            // Pull semantically ordered candidate URLs from OFF.
            const candidates = this.orderOpenFoodFactsImages(product, count);

            if (candidates.length === 0) {
                const result: EanProductResult = {
                    ean: cleanEan,
                    title: apiTitle || title || '',
                    images: [],
                    matched: false,
                    source: 'none',
                    reason: 'Product matched but has no images on Open Food Facts',
                    cached: false,
                    confidence_score: 0,
                };
                this.cache.set(cleanEan, title, count, result);
                return result;
            }

            // ── AI validation layer ────────────────────────────────────
            // Send the candidates to a vision model; only keep images that
            // confidently show the same product (brand + packaging + title).
            let images = candidates;
            let confidence = 0.7; // Default if AI is skipped
            if (!opts.skipAiValidation) {
                const validation = await this.validator.validateImages(candidates, {
                    ean: cleanEan,
                    title: apiTitle || title,
                    brand: apiBrand || opts.brand,
                });
                images = validation.accepted.map(r => r.url);
                confidence = validation.aggregateConfidence;

                // If AI rejected everything → return empty with reason instead of bad images.
                if (images.length === 0) {
                    const result: EanProductResult = {
                        ean: cleanEan,
                        title: apiTitle || title || '',
                        images: [],
                        matched: false,
                        source: 'none',
                        reason: `AI validator rejected all ${candidates.length} candidate images (max conf ${validation.rejected.length > 0 ? Math.max(...validation.rejected.map(r => r.confidence)).toFixed(2) : '0.00'})`,
                        cached: false,
                        confidence_score: validation.rejected.length > 0 ? Math.max(...validation.rejected.map(r => r.confidence)) : 0,
                    };
                    this.cache.set(cleanEan, title, count, result);
                    return result;
                }
            }

            const result: EanProductResult = {
                ean: cleanEan,
                title: apiTitle || title || '',
                images,
                matched: true,
                source: 'openfoodfacts',
                cached: false,
                confidence_score: confidence,
            };
            this.cache.set(cleanEan, title, count, result);
            return result;
        } catch (err: any) {
            this.logger.warn(`Open Food Facts lookup failed for EAN ${cleanEan}: ${err.message}`);
            // Don't cache transient API failures so we retry on next request.
            return {
                ean: cleanEan,
                title: title || '',
                images: [],
                matched: false,
                source: 'none',
                reason: `API failure: ${err.message}`,
                cached: false,
                confidence_score: 0,
            };
        }
    }

    /**
     * Legacy wrapper — used by older callers that just want a string[] of URLs.
     * Internally delegates to the new structured method and discards the verification metadata.
     */
    async fetchImagesByEan(
        ean: string,
        limit: number = 3,
        productName?: string,
    ): Promise<string[]> {
        const result = await this.fetchProductByEan(ean, productName, limit);
        return result.images;
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    /**
     * Pick up to `count` image URLs from an Open Food Facts product object,
     * ordered: front → packaging → ingredients → nutrition → any other.
     * The "selected" set in `selected_images` carries the curated full-size URLs.
     */
    private orderOpenFoodFactsImages(product: any, count: number): string[] {
        const out: string[] = [];
        const seen = new Set<string>();

        const push = (url?: string | null) => {
            if (!url || typeof url !== 'string') return;
            if (!url.startsWith('http')) return;
            if (seen.has(url)) return;
            seen.add(url);
            out.push(url);
        };

        // Priority 1 — curated selected images (highest quality, semantic)
        const selected = product.selected_images || {};
        const lang = product.lang || 'en';
        const angleOrder = ['front', 'packaging', 'ingredients', 'nutrition', 'other'];
        for (const angle of angleOrder) {
            const angleData = selected[angle];
            if (!angleData) continue;
            const display = angleData.display || {};
            // Prefer the requested language, then English, then any available
            push(display[lang] || display['en'] || Object.values(display)[0] as string | undefined);
            if (out.length >= count) return out;
        }

        // Priority 2 — top-level *_url fields
        push(product.image_front_url);
        push(product.image_url);
        push(product.image_packaging_url);
        push(product.image_ingredients_url);
        push(product.image_nutrition_url);

        return out.slice(0, count);
    }

    /**
     * Token-set Jaccard similarity over normalized titles.
     * Strips punctuation, lowercases, removes very short noise tokens.
     * Returns 0.0–1.0; 1.0 = identical token sets.
     */
    private titleSimilarity(a: string, b: string): number {
        const tokenize = (s: string): Set<string> => {
            const tokens = String(s)
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(t => t.length >= 2);
            return new Set(tokens);
        };

        const ta = tokenize(a);
        const tb = tokenize(b);
        if (ta.size === 0 || tb.size === 0) return 0;

        let intersect = 0;
        for (const t of ta) if (tb.has(t)) intersect++;
        const union = ta.size + tb.size - intersect;
        return union === 0 ? 0 : intersect / union;
    }
}
