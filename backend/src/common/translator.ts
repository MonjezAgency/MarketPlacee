import axios from 'axios';

export async function translateText(text: string, targetLang: string): Promise<string> {
    if (!text || targetLang === 'en') return text;
    
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        // Hard timeout — Google rate-limit/network slowness must not hang
        // the calling request (this is called per-product in bulk uploads).
        const response = await axios.get(url, { timeout: 4000 });
        
        if (response.data && response.data[0]) {
            return response.data[0].map((item: any) => item[0]).join('');
        }
        return text;
    } catch (error) {
        console.error(`Translation error for ${targetLang}:`, error.message);
        return text;
    }
}

export async function translateProduct(product: { name: string; description: string }) {
    const langs = ['ar', 'ro', 'fr'];
    const translations: Record<string, { name: string; description: string }> = {};

    for (const lang of langs) {
        try {
            const [translatedName, translatedDesc] = await Promise.all([
                translateText(product.name, lang),
                translateText(product.description || '', lang)
            ]);
            translations[lang] = { name: translatedName, description: translatedDesc };
        } catch (err) {
            console.error(`Failed to translate product to ${lang}:`, err.message);
        }
    }

    return translations;
}
