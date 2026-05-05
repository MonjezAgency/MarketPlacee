import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class EanService {
    private readonly logger = new Logger(EanService.name);

    /**
     * Fetch product images by EAN, optionally enriched with the product name
     * for a smarter Google Image fallback. Sources tried in order:
     *   1. Open Food Facts (best for FMCG/Food)
     *   2. UPCItemDB
     *   3. BarcodeSpider HTML scrape
     *   4. Google Custom Search API (if GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX env vars set)
     *      — restricted to white-dominant photos so we get clean catalog shots
     *   5. Bing Images HTML fallback (no key required) — last resort
     */
    async fetchImagesByEan(ean: string, limit: number = 3, productName?: string): Promise<string[]> {
        const uniqueImages = new Set<string>();

        try {
            // 1. Try Open Food Facts (Best for FMCG/Food)
            try {
                const offResponse = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`, {
                    timeout: 3000,
                    headers: { 'User-Agent': 'AtlantisMarketplace/1.0' }
                });

                if (offResponse.data?.status === 1 && offResponse.data?.product?.image_url) {
                    uniqueImages.add(offResponse.data.product.image_url);
                    if (offResponse.data.product.image_front_url) uniqueImages.add(offResponse.data.product.image_front_url);
                    if (offResponse.data.product.image_ingredients_url) uniqueImages.add(offResponse.data.product.image_ingredients_url);
                }
            } catch (offError) {
                this.logger.debug(`Open Food Facts failed for EAN ${ean}`);
            }

            if (uniqueImages.size >= limit) return Array.from(uniqueImages).slice(0, limit);

            // 2. Try UPCItemDB (Good general coverage)
            try {
                const upcResponse = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`, {
                    timeout: 3000,
                });

                if (upcResponse.data?.items?.[0]?.images) {
                    const images = upcResponse.data.items[0].images;
                    images.forEach((img: string) => {
                        if (img.startsWith('http')) uniqueImages.add(img);
                    });
                }
            } catch (upcError) {
                this.logger.debug(`UPCItemDB failed for EAN ${ean}`);
            }

            if (uniqueImages.size >= limit) return Array.from(uniqueImages).slice(0, limit);

            // 3. Fallback: Search BarcodeSpider (User Requested)
            try {
                const bsResponse = await axios.get(`https://www.barcodespider.com/${ean}`, {
                    timeout: 4000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
                });

                const matches = bsResponse.data.matchAll(/<img[^>]+src=["'](https:\/\/images\.barcodespider\.com\/[^"']+)["']/gi);
                for (const match of matches) {
                    if (match[1]) uniqueImages.add(match[1]);
                    if (uniqueImages.size >= limit) break;
                }
            } catch (bsError) {
                this.logger.debug(`BarcodeSpider fallback failed for EAN ${ean}`);
            }

            if (uniqueImages.size >= limit) return Array.from(uniqueImages).slice(0, limit);

            // 4. Google Custom Search API — gated on env vars. Filters for white
            //    background product photos so we get catalog-style shots.
            const cseKey = process.env.GOOGLE_CSE_API_KEY;
            const cseCx  = process.env.GOOGLE_CSE_CX;
            if (cseKey && cseCx) {
                try {
                    const q = [productName, ean, 'product white background'].filter(Boolean).join(' ');
                    const cseResp = await axios.get('https://www.googleapis.com/customsearch/v1', {
                        timeout: 5000,
                        params: {
                            key: cseKey,
                            cx: cseCx,
                            q,
                            searchType: 'image',
                            imgType: 'photo',
                            imgColorType: 'color',
                            imgDominantColor: 'white',
                            num: Math.max(1, Math.min(limit * 2, 10)),
                            safe: 'active',
                        },
                    });
                    const items: any[] = cseResp.data?.items || [];
                    for (const item of items) {
                        if (item?.link?.startsWith('http')) {
                            uniqueImages.add(item.link);
                            if (uniqueImages.size >= limit) break;
                        }
                    }
                } catch (cseError: any) {
                    this.logger.debug(`Google CSE failed for EAN ${ean}: ${cseError.message}`);
                }
            }

            if (uniqueImages.size >= limit) return Array.from(uniqueImages).slice(0, limit);

            // 5. Bing Images HTML fallback (no API key — best-effort scrape).
            //    Brittle but free. Filters for product-style white-background imagery.
            try {
                const q = encodeURIComponent([productName, ean, 'product white background'].filter(Boolean).join(' '));
                const bingResp = await axios.get(
                    `https://www.bing.com/images/search?q=${q}&qft=+filterui:photo-photo+filterui:color2-bw-white&form=IRFLTR`,
                    {
                        timeout: 5000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                    },
                );
                // Each image card embeds a JSON 'm' attribute with `murl` = original URL.
                const re = /"murl":"(https?:[^"]+?)"/g;
                let m: RegExpExecArray | null;
                while ((m = re.exec(bingResp.data)) !== null) {
                    const url = m[1].replace(/\\\//g, '/').replace(/\\u002f/g, '/');
                    if (url.startsWith('http')) uniqueImages.add(url);
                    if (uniqueImages.size >= limit) break;
                }
            } catch (bingError: any) {
                this.logger.debug(`Bing fallback failed for EAN ${ean}: ${bingError.message}`);
            }

            return Array.from(uniqueImages).slice(0, limit);
        } catch (error) {
            this.logger.warn(`Failed to fetch images for EAN ${ean}: ${error.message}`);
            return Array.from(uniqueImages);
        }
    }
}
