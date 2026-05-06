import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface ImageValidationResult {
    url: string;
    confidence: number; // 0.0 – 1.0
    reason?: string;
}

/**
 * Vision-based AI validator. Sends candidate image URLs + product context
 * (title, brand, EAN) to an OpenRouter vision model (Gemini 2.0 Flash) in
 * a SINGLE request. The model returns a confidence score per image, and
 * we filter on a threshold (default 0.5).
 *
 * Why one batch call instead of one-per-image: a 3-image product would
 * otherwise take 3 round-trips. Batch = 1 RTT, ~same token cost.
 *
 * Falls back to "trust the API" mode (returns confidence 0.7 for all) if:
 *   - OPENROUTER_API_KEY is not set
 *   - the AI request fails or times out
 *   - the model returns malformed JSON
 * The fallback ensures we never block product creation just because the
 * validator is down.
 */
@Injectable()
export class EanValidatorService {
    private readonly logger = new Logger(EanValidatorService.name);
    // Threshold tightened repeatedly — every step the user shipped us another
    // counter-example (Kit Kat on grass at 0.7). Now at 0.85, which the new
    // strict prompt aligns with: an image must be a clean studio/catalog shot
    // to score above this. Better to return zero images than to leak a phone
    // photo onto a B2B catalog.
    private readonly MIN_CONFIDENCE = 0.85;
    private readonly MODEL = 'google/gemini-2.0-flash-exp:free';
    private readonly TIMEOUT_MS = 12000;

    /**
     * Validate a list of image URLs against a product context. Returns the
     * subset that passed the confidence threshold, plus an aggregate score
     * (max of accepted images).
     */
    async validateImages(
        urls: string[],
        ctx: { ean: string; title?: string; brand?: string },
    ): Promise<{ accepted: ImageValidationResult[]; rejected: ImageValidationResult[]; aggregateConfidence: number }> {
        if (urls.length === 0) {
            return { accepted: [], rejected: [], aggregateConfidence: 0 };
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            // Soft-fallback: trust the source API. Confidence = 0.7 (uncertain).
            const accepted = urls.map(url => ({ url, confidence: 0.7, reason: 'AI validator disabled (no key)' }));
            return { accepted, rejected: [], aggregateConfidence: 0.7 };
        }

        try {
            const scored = await this.scoreImages(urls, ctx, apiKey);
            const accepted = scored.filter(r => r.confidence >= this.MIN_CONFIDENCE);
            const rejected = scored.filter(r => r.confidence < this.MIN_CONFIDENCE);
            const aggregateConfidence = accepted.length > 0
                ? Math.max(...accepted.map(r => r.confidence))
                : 0;
            return { accepted, rejected, aggregateConfidence };
        } catch (err: any) {
            this.logger.warn(`AI validation failed for EAN ${ctx.ean}: ${err.message}. Falling back to trust-source.`);
            const accepted = urls.map(url => ({ url, confidence: 0.7, reason: 'AI validator failed; trusted source API' }));
            return { accepted, rejected: [], aggregateConfidence: 0.7 };
        }
    }

    private async scoreImages(
        urls: string[],
        ctx: { ean: string; title?: string; brand?: string },
        apiKey: string,
    ): Promise<ImageValidationResult[]> {
        const productContext = [
            ctx.title ? `Product title: "${ctx.title}"` : null,
            ctx.brand ? `Brand: "${ctx.brand}"` : null,
            `EAN/barcode: ${ctx.ean}`,
        ].filter(Boolean).join('\n');

        // Multimodal user message: text instruction + each image URL as image_url block.
        const content: any[] = [
            {
                type: 'text',
                text:
                    `You score images for a B2B WHOLESALE CATALOG. Only studio-quality catalog photos may pass. Phone snapshots are forbidden.\n\n${productContext}\n\n` +
                    `Score each of the ${urls.length} image(s) from 0.0 to 1.0.\n\n` +
                    `=== AUTOMATIC HARD-REJECT (score MUST be 0.0–0.3) ===\n` +
                    `• Any visible ground, grass, asphalt, sand, dirt, wood floor, tile floor, carpet, fabric, or ANY textured surface under or around the product → 0.2\n` +
                    `• Any visible table, desk, kitchen counter, sink, shelf, or surface with shadows → 0.2\n` +
                    `• Outdoor setting (visible sky, trees, walls, sidewalks) → 0.1\n` +
                    `• Background that is NOT a uniform white/light-grey studio backdrop → automatic 0.2 max\n` +
                    `• Image is primarily a label, barcode close-up, ingredient list, or nutrition table → 0.0\n` +
                    `• Person/hand visible, or product placed in a real-world scene → 0.1\n` +
                    `• Wrong product (different brand, different size, different flavor) → 0.0\n` +
                    `• Visible JPEG artifacts, blur, motion blur, low resolution → 0.3\n\n` +
                    `=== ACCEPT (score 0.85–1.0) — ALL must be true ===\n` +
                    `• Background is clean WHITE or very light grey (#FFFFFF–#F5F5F5), uniform, no shadows or textures\n` +
                    `• Product is centered, sharp, well-lit, fully in frame\n` +
                    `• Looks like an Amazon / Tesco / official manufacturer catalog photo\n` +
                    `• Brand and product name clearly legible and match the requested product\n\n` +
                    `=== EXAMPLES ===\n` +
                    `• Kit Kat bar lying on grass → 0.2 (textured outdoor surface)\n` +
                    `• Kit Kat case-pack on a clean white studio background → 0.95 (perfect catalog shot)\n` +
                    `• Close-up of nutrition facts text → 0.0 (label, not a product photo)\n` +
                    `• Bottle on a kitchen counter under warm lighting → 0.25 (real-world surface, shadows)\n` +
                    `• Bottle on pure white background, centered, even lighting → 0.9 (catalog quality)\n\n` +
                    `Respond with a JSON array, one object per image in input order:\n` +
                    `  { "confidence": <0.0–1.0>, "reason": "<mention background + product condition in 10–20 words>" }\n\n` +
                    `Output ONLY the JSON array. No markdown fences, no preamble, no trailing text.`,
            },
            ...urls.map(url => ({ type: 'image_url', image_url: { url } })),
        ];

        const resp = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: this.MODEL,
                messages: [{ role: 'user', content }],
                temperature: 0.0,
                max_tokens: 600,
            },
            {
                timeout: this.TIMEOUT_MS,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://atlantisfmcg.com',
                    'X-Title': 'Atlantis EAN Image Validator',
                },
            },
        );

        const raw: string = resp.data?.choices?.[0]?.message?.content || '';
        const cleaned = raw.replace(/```json\s*/i, '').replace(/```/g, '').trim();
        const arr = JSON.parse(cleaned);

        if (!Array.isArray(arr) || arr.length !== urls.length) {
            throw new Error(`Validator returned ${Array.isArray(arr) ? arr.length : 'non-array'} items, expected ${urls.length}`);
        }

        return urls.map((url, i) => {
            const item = arr[i] || {};
            const conf = typeof item.confidence === 'number'
                ? Math.max(0, Math.min(1, item.confidence))
                : 0;
            return { url, confidence: conf, reason: typeof item.reason === 'string' ? item.reason : undefined };
        });
    }
}
