export const translationCache = new Map<string, string>();
// Perf: dedupe identical in-flight requests (many cards share names) and
// persist per session so navigating between pages doesn't re-translate.
const inflight = new Map<string, Promise<string>>();
const SESSION_KEY = 'atl_tr_cache_v1';
if (typeof window !== 'undefined') {
    try {
        const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
        for (const [k, v] of Object.entries(saved)) if (typeof v === 'string') translationCache.set(k, v);
    } catch { /* ignore */ }
}
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
    if (typeof window === 'undefined' || persistTimer) return;
    persistTimer = setTimeout(() => {
        persistTimer = null;
        try {
            const entries = Array.from(translationCache.entries()).slice(-800);
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(Object.fromEntries(entries)));
        } catch { /* quota — ignore */ }
    }, 1000);
}

export async function translateText(text: string, targetLang: string = 'ar'): Promise<string> {
    if (!text || typeof text !== 'string') return text;
    if (targetLang === 'en') return text;

    const cacheKey = `${targetLang}:${text}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)!;
    const pending = inflight.get(cacheKey);
    if (pending) return pending;
    const job = doTranslate(text, targetLang, cacheKey).finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, job);
    return job;
}

async function doTranslate(text: string, targetLang: string, cacheKey: string): Promise<string> {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) return text;
        const data = await res.json();

        let translatedText = '';
        if (data && data[0] && Array.isArray(data[0])) {
            translatedText = data[0].map((item: any) => item[0]).join('');
            translationCache.set(cacheKey, translatedText);
            persist();
            return translatedText;
        }
        return text;
    } catch (err) {
        console.error('Translation error:', err);
        return text;
    }
}
