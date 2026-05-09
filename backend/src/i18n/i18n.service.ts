import { Injectable, Logger } from '@nestjs/common';

/**
 * Runtime translation service. The marketing/public pages are mostly
 * hardcoded English — instead of touching every component to wrap
 * each string in a translation key, the frontend's auto-translator
 * sends batches of English strings here and we return them in the
 * target language. Result is cached in-memory per (locale, text)
 * pair so a popular page (homepage, category, product) only ever
 * gets translated once per server lifetime.
 *
 * Uses OpenRouter (Gemini 2.0 Flash) — same provider already wired
 * up for the chat bot and EAN validator. Falls back to returning
 * the original English if the API is unavailable, so the page is
 * never blank.
 */
@Injectable()
export class I18nService {
    private readonly logger = new Logger(I18nService.name);
    private readonly apiKey = process.env.OPENROUTER_API_KEY;
    private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

    // locale -> (englishText -> translatedText)
    private cache = new Map<string, Map<string, string>>();

    private static readonly LANGUAGE_NAMES: Record<string, string> = {
        ar: 'Arabic (Modern Standard Arabic)',
        fr: 'French',
        ro: 'Romanian',
        el: 'Greek',
        de: 'German',
        it: 'Italian',
        es: 'Spanish',
        tr: 'Turkish',
        nl: 'Dutch',
        pl: 'Polish',
        pt: 'Portuguese',
        ru: 'Russian',
        zh: 'Simplified Chinese',
        ja: 'Japanese',
        ko: 'Korean',
        hi: 'Hindi',
    };

    async translateBatch(
        texts: string[],
        targetLocale: string,
    ): Promise<{ translations: string[] }> {
        if (!Array.isArray(texts) || texts.length === 0) {
            return { translations: [] };
        }
        // Locale 'en' is the source — return as-is.
        if (!targetLocale || targetLocale === 'en') {
            return { translations: texts.slice() };
        }

        const localeMap = this.cache.get(targetLocale) ?? new Map<string, string>();
        this.cache.set(targetLocale, localeMap);

        // Figure out which strings actually need a network call.
        const need: string[] = [];
        for (const t of texts) {
            if (!t || typeof t !== 'string') continue;
            if (!localeMap.has(t)) need.push(t);
        }

        if (need.length > 0) {
            try {
                const fetched = await this.callOpenRouter(need, targetLocale);
                for (let i = 0; i < need.length; i++) {
                    localeMap.set(need[i], fetched[i] ?? need[i]);
                }
            } catch (err: any) {
                this.logger.warn(
                    `Translation batch failed for locale=${targetLocale}: ${err?.message || err}. Falling back to English.`,
                );
                // Cache English -> English so we don't hammer the API
                // on every retry. Translator will still work for any
                // strings that DO succeed in later batches.
                for (const t of need) {
                    if (!localeMap.has(t)) localeMap.set(t, t);
                }
            }
        }

        return { translations: texts.map((t) => localeMap.get(t) ?? t) };
    }

    private async callOpenRouter(
        texts: string[],
        targetLocale: string,
    ): Promise<string[]> {
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY not configured');
        }
        const langName = I18nService.LANGUAGE_NAMES[targetLocale] || targetLocale;

        const systemPrompt = [
            `You are a professional UI translator for a B2B wholesale marketplace called Atlantis.`,
            `Translate each English string in the user's JSON array into ${langName}.`,
            ``,
            `STRICT RULES — violation breaks the page:`,
            `1. Output a JSON array of strings, one per input, in the SAME order, with EXACTLY ${texts.length} items.`,
            `2. No explanations, no markdown fences, no surrounding text — just the JSON array.`,
            `3. Keep brand names "Atlantis" and "Monjez" exactly as they are (do NOT transliterate).`,
            `4. Keep currency codes (EUR, USD, GBP), country codes (EU, UK), and numbers exactly.`,
            `5. Preserve emojis and any inline HTML/markup tags exactly.`,
            `6. Preserve placeholder syntax like {name}, {{var}}, %s, %d exactly.`,
            `7. If a string is already in ${langName} or is brand-only (e.g. "Atlantis"), return it unchanged.`,
            `8. Use natural, professional B2B/business tone — not literal word-for-word.`,
        ].join('\n');

        const userPrompt = JSON.stringify(texts);

        const resp = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com',
                'X-Title': 'Atlantis Marketplace i18n',
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0,
            }),
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`OpenRouter ${resp.status}: ${errText.slice(0, 200)}`);
        }
        const data: any = await resp.json();
        const content: string = data?.choices?.[0]?.message?.content ?? '[]';
        return this.parseJsonArray(content, texts.length, texts);
    }

    /**
     * Tolerant JSON-array parser. Strips markdown fences, finds the
     * first [ and last ] just in case the model wrapped its output.
     * If parsing fails or the length doesn't match, fall back to the
     * input strings — translation is best-effort, never destructive.
     */
    private parseJsonArray(
        content: string,
        expectedLen: number,
        fallback: string[],
    ): string[] {
        try {
            let cleaned = content.trim();
            // Strip ```json / ``` fences
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
            const start = cleaned.indexOf('[');
            const end = cleaned.lastIndexOf(']');
            if (start !== -1 && end !== -1 && end > start) {
                cleaned = cleaned.slice(start, end + 1);
            }
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed) && parsed.length === expectedLen) {
                return parsed.map((x) => (typeof x === 'string' ? x : String(x)));
            }
            this.logger.warn(
                `Translation length mismatch: expected ${expectedLen}, got ${Array.isArray(parsed) ? parsed.length : 'not-array'}`,
            );
        } catch (err: any) {
            this.logger.warn(`Translation JSON parse failed: ${err?.message || err}`);
        }
        return fallback;
    }
}
