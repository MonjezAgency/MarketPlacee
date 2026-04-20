import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class EanService {
    private readonly logger = new Logger(EanService.name);

    async fetchImagesByEan(ean: string, limit: number = 3): Promise<string[]> {
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

            return Array.from(uniqueImages).slice(0, limit);
        } catch (error) {
            this.logger.warn(`Failed to fetch images for EAN ${ean}: ${error.message}`);
            return Array.from(uniqueImages);
        }
    }
}
