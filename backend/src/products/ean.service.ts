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
    source: 'openfoodfacts' | 'openbeautyfacts' | 'openproductsfacts' | 'bing' | 'none';       // which API the data came from
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
        // Strip any non-digit chars (keep X for ISBN-10 checksums). Belt-
        // and-suspenders defence: Excel sometimes leaves a trailing period
        // on long numeric strings, and other callers might forget to clean.
        // The previous trim() only handled whitespace.
        const cleanEan = String(ean || '').replace(/[^0-9X]/gi, '').trim();
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

                // If AI rejected everything from OFF, try the Bing fallback —
                // OFF images are crowdsourced phone photos, often on real
                // surfaces. Bing's catalog crawl gives us official product
                // shots from retailer/manufacturer sites which are usually
                // white-bg studio photos.
                if (images.length === 0) {
                    this.logger.log(`OFF candidates all rejected for EAN ${cleanEan}; trying Bing fallback`);
                    const bingCandidates = await this.fetchBingCatalogImages(cleanEan, apiTitle || title, count * 2);

                    if (bingCandidates.length > 0) {
                        const bingValidation = await this.validator.validateImages(bingCandidates, {
                            ean: cleanEan,
                            title: apiTitle || title,
                            brand: apiBrand || opts.brand,
                        });
                        if (bingValidation.accepted.length > 0) {
                            const bingImages = bingValidation.accepted
                                .sort((a, b) => b.confidence - a.confidence)
                                .slice(0, count)
                                .map(r => r.url);
                            const result: EanProductResult = {
                                ean: cleanEan,
                                title: apiTitle || title || '',
                                images: bingImages,
                                matched: true,
                                source: 'openfoodfacts', // primary source still wins on metadata
                                cached: false,
                                confidence_score: bingValidation.aggregateConfidence,
                            };
                            this.cache.set(cleanEan, title, count, result);
                            return result;
                        }
                    }

                    // Both sources rejected → empty with full diagnostic reason
                    const offMaxConf = validation.rejected.length > 0
                        ? Math.max(...validation.rejected.map(r => r.confidence))
                        : 0;
                    const result: EanProductResult = {
                        ean: cleanEan,
                        title: apiTitle || title || '',
                        images: [],
                        matched: false,
                        source: 'none',
                        reason: `No catalog-quality images found. OFF returned ${candidates.length} (max conf ${offMaxConf.toFixed(2)}); Bing fallback returned ${bingCandidates.length}. Try a different EAN or upload an image manually.`,
                        cached: false,
                        confidence_score: offMaxConf,
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
            // Open Food Facts is FOOD-only and returns 404 for hygiene /
            // beauty / household products (TENA, soap, shampoo, etc).
            // Before giving up, try the sibling Open* databases that share
            // the exact same response schema (so orderOpenFoodFactsImages
            // works on them unchanged), then fall back to Bing image search.
            this.logger.warn(`OFF lookup failed for ${cleanEan}: ${err.message} — trying alternatives`);

            // ── Helper: validate + return a cached success from a sibling-DB
            //    response when it has at least one usable image.
            //
            // We ALWAYS run the AI validator on fallback-source candidates
            // even if `skipAiValidation` was set. The flag exists for bulk
            // uploads that pre-trust the data source; once we've fallen
            // through to scraped/sibling sources we have no provenance and
            // must validate. The validator itself hard-fails on missing
            // OPENROUTER_API_KEY, returning zero images instead of
            // pretending to validate at 0.7.
            const tryCandidates = async (
                candidates: string[],
                source: 'openbeautyfacts' | 'openproductsfacts',
            ): Promise<EanProductResult | null> => {
                if (candidates.length === 0) return null;
                const validation = await this.validator.validateImages(candidates, {
                    ean: cleanEan,
                    title,
                    brand: opts.brand,
                });
                if (validation.accepted.length === 0) return null;
                const images = validation.accepted
                    .sort((a, b) => b.confidence - a.confidence)
                    .slice(0, count)
                    .map(r => r.url);
                const result: EanProductResult = {
                    ean: cleanEan,
                    title: title || '',
                    images,
                    matched: true,
                    source,
                    cached: false,
                    confidence_score: validation.aggregateConfidence,
                };
                this.cache.set(cleanEan, title, count, result);
                return result;
            };

            // 1) Open Beauty Facts — covers hygiene, cosmetics, shampoo, etc.
            try {
                const beautyResp = await axios.get(
                    `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(cleanEan)}.json`,
                    {
                        timeout: 5000,
                        headers: { 'User-Agent': 'AtlantisMarketplace/1.0 (atlantisfmcg.com)' },
                    },
                );
                if (beautyResp.data?.status === 1 && beautyResp.data?.product) {
                    const candidates = this.orderOpenFoodFactsImages(beautyResp.data.product, count);
                    const ok = await tryCandidates(candidates, 'openbeautyfacts');
                    if (ok) return ok;
                }
            } catch (_e) { /* fall through */ }

            // 2) Open Products Facts — covers general consumer goods.
            try {
                const prodResp = await axios.get(
                    `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(cleanEan)}.json`,
                    {
                        timeout: 5000,
                        headers: { 'User-Agent': 'AtlantisMarketplace/1.0 (atlantisfmcg.com)' },
                    },
                );
                if (prodResp.data?.status === 1 && prodResp.data?.product) {
                    const candidates = this.orderOpenFoodFactsImages(prodResp.data.product, count);
                    const ok = await tryCandidates(candidates, 'openproductsfacts');
                    if (ok) return ok;
                }
            } catch (_e) { /* fall through */ }

            // 3) Bing image search — always-available last resort. Same
            //    pattern as the OFF "all candidates rejected" branch.
            const bingCandidates = await this.fetchBingCatalogImages(cleanEan, title, count * 2);
            if (bingCandidates.length > 0) {
                // Always validate Bing results — Bing returns wildly off-topic
                // images for short brand names that overlap with personal
                // names (e.g. "TENA" → fashion-week portraits + basketball
                // game shots). The previous skip-validator-at-0.7-confidence
                // shortcut was the cause of those photos appearing as "AI
                // VERIFIED 70%" in the catalog.
                const bingValidation = await this.validator.validateImages(bingCandidates, {
                    ean: cleanEan,
                    title,
                    brand: opts.brand,
                });
                if (bingValidation.accepted.length > 0) {
                    const bingImages = bingValidation.accepted
                        .sort((a, b) => b.confidence - a.confidence)
                        .slice(0, count)
                        .map(r => r.url);
                    const result: EanProductResult = {
                        ean: cleanEan,
                        title: title || '',
                        images: bingImages,
                        matched: true,
                        source: 'bing',
                        cached: false,
                        confidence_score: bingValidation.aggregateConfidence,
                    };
                    this.cache.set(cleanEan, title, count, result);
                    return result;
                }
            }

            // 4) Everything failed. Don't cache transient API failures so we
            //    retry on next request.
            return {
                ean: cleanEan,
                title: title || '',
                images: [],
                matched: false,
                source: 'none',
                reason:
                    `Not found in Open Food Facts, Open Beauty Facts, or Open Products Facts. ` +
                    `Bing returned ${bingCandidates.length} candidate${bingCandidates.length === 1 ? '' : 's'} ` +
                    `but none passed AI validation. Original error: ${err.message}`,
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
     * Bing image search fallback — runs when Open Food Facts has only
     * crowdsourced phone photos and the AI validator rejected them all.
     * Uses Bing's white-background filter (`color2-bw-white`) to bias
     * toward studio catalog shots from retailer/manufacturer sites.
     *
     * No API key required — scrapes the public results HTML. Brittle but
     * free and effective. Returns more candidates than `count` so the
     * caller can re-run the AI validator and pick the highest-confidence.
     */
    private async fetchBingCatalogImages(ean: string, productName?: string, max: number = 6): Promise<string[]> {
        const found = new Set<string>();

        /**
         * Parse image URLs from a Bing Images HTML response.
         * Bing embeds original URLs in JSON blobs inside data-m attributes.
         * We try multiple regex patterns because Bing's structure changes occasionally.
         */
        const parseBingHtml = (html: string): string[] => {
            const urls: string[] = [];
            const patterns = [
                /"murl":"(https?:[^"]+?)"/g,          // current format
                /data-src="(https?[^"]+\.(jpg|png|webp)[^"]*)"/gi, // img src fallback
                /"imgurl":"(https?:[^"]+?)"/g,          // older format
                /mediaurl=(https?[^&]+)/g,              // URL-encoded in query params
            ];
            for (const re of patterns) {
                let m: RegExpExecArray | null;
                re.lastIndex = 0;
                while ((m = re.exec(html)) !== null && urls.length < max * 3) {
                    let candidate = m[1].replace(/\\\//g, '/').replace(/\\u002f/g, '/');
                    try { candidate = decodeURIComponent(candidate); } catch (_) { /* ignore decode errors */ }
                    if (
                        candidate.startsWith('http') &&
                        !candidate.includes('bing.com/th') &&
                        !candidate.startsWith('data:') &&
                        (candidate.match(/\.(jpg|jpeg|png|webp)/i) || candidate.includes('image'))
                    ) {
                        urls.push(candidate);
                    }
                }
                if (urls.length > 0) break; // stop at first pattern that yields results
            }
            return [...new Set(urls)]; // deduplicate
        };

        const browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
        };

        // Strategy 1 — Bing: simple query (EAN + product name, no restrictive filters)
        // The white-background filter was causing 0 results for hygiene products.
        try {
            const querySimple = encodeURIComponent([productName, ean].filter(Boolean).join(' '));
            const urlSimple = `https://www.bing.com/images/search?q=${querySimple}&form=HDRSC2&first=1`;
            const resp = await axios.get(urlSimple, { timeout: 7000, headers: browserHeaders });
            const urls = parseBingHtml(resp.data as string);
            urls.forEach(u => found.size < max && found.add(u));
        } catch (err: any) {
            this.logger.debug(`Bing simple query failed for EAN ${ean}: ${err.message}`);
        }

        // Strategy 2 — Bing: EAN-only query (more precise, less noise)
        if (found.size < max) {
            try {
                const queryEan = encodeURIComponent(`${ean} product`);
                const urlEan = `https://www.bing.com/images/search?q=${queryEan}&form=HDRSC2&first=1`;
                const resp = await axios.get(urlEan, { timeout: 7000, headers: browserHeaders });
                const urls = parseBingHtml(resp.data as string);
                urls.forEach(u => found.size < max && found.add(u));
            } catch (_e) { /* ignore */ }
        }

        // Strategy 3 — DuckDuckGo images (different bot-detection threshold)
        if (found.size < max) {
            try {
                const q = encodeURIComponent([productName, ean].filter(Boolean).join(' '));
                const ddgUrl = `https://duckduckgo.com/?q=${q}&iax=images&ia=images`;
                const resp = await axios.get(ddgUrl, { timeout: 7000, headers: browserHeaders });
                // DDG embeds image URLs in JSON inside a script tag
                const re = /"thumbnail":"(https?:[^"]+?)"/g;
                const html: string = resp.data;
                let m: RegExpExecArray | null;
                while ((m = re.exec(html)) !== null && found.size < max) {
                    const u = m[1].replace(/\\\//g, '/');
                    if (u.startsWith('http') && !u.includes('duckduckgo.com/i')) found.add(u);
                }
            } catch (_e) { /* ignore */ }
        }

        if (found.size === 0) {
            this.logger.debug(`All image search strategies returned 0 results for EAN ${ean}`);
        } else {
            this.logger.log(`Found ${found.size} image candidates for EAN ${ean} via web search`);
        }

        return Array.from(found).slice(0, max);
    }

    /**
     * Pick up to `count` image URLs from an Open Food Facts product object.
     * STRICT: only catalog-style product shots (front + packaging) — never
     * ingredients lists or nutrition labels (those are tiny crops of text on
     * the back of the pack, not what a buyer wants to see). The user
     * specifically called this out: "أنا قلت لك لازم يجيب الصورة لازم
     * تكون خلفية بيضاء وظهر الصورة بشكل كويس".
     *
     * The AI validator downstream is a final gate that filters out any
     * remaining photos with messy backgrounds (kitchen counters, grass, etc).
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

        // Priority 1 — curated selected images. Only `front` and `packaging`
        // — these are the angles a B2B buyer needs. Ingredients/nutrition
        // labels are macro-shots of fine print and never make sense as a
        // catalog image.
        //
        // Order: packaging FIRST, then front. B2B buyers buy the case /
        // display box, not a single piece. On Open Food Facts the
        // "packaging" angle is usually the multi-pack carton shot (when
        // present); "front" is usually the single-piece front-of-pack.
        // Pulling packaging first lines up the candidate list with what
        // the AI validator's "packaging-level preference" rule wants to
        // promote. Single-piece is still returned as a fallback.
        const selected = product.selected_images || {};
        const lang = product.lang || 'en';
        const angleOrder = ['packaging', 'front'];
        for (const angle of angleOrder) {
            const angleData = selected[angle];
            if (!angleData) continue;
            const display = angleData.display || {};
            // Prefer the requested language, then English, then any available
            push(display[lang] || display['en'] || Object.values(display)[0] as string | undefined);
            if (out.length >= count) return out;
        }

        // Priority 2 — top-level front/packaging URLs. Packaging first for
        // the same reason as the priority-1 ordering above.
        push(product.image_packaging_url);
        push(product.image_front_url);
        push(product.image_url);

        // Priority 3 — `front_*` localized variants if still need more
        if (out.length < count) {
            for (const key of Object.keys(product)) {
                if (key.startsWith('image_front_url_') && out.length < count) {
                    push((product as any)[key]);
                }
            }
        }

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
