/**
 * currency.ts — Multi-currency support
 *
 * All prices in the DB are stored in EGP (Egyptian Pound) — the platform's
 * base currency for this deployment.
 * This file formats EGP amounts and optionally converts to the user's chosen
 * display currency.
 *
 * Exchange rates are approximate fixed rates (updated periodically).
 * For live rates, replace with a real FX API call cached in localStorage.
 */

export const SUPPORTED_CURRENCIES = [
    { code: 'USD', symbol: '$',  name: 'US Dollar',        locale: 'en-US' },
    { code: 'EUR', symbol: '€',  name: 'Euro',              locale: 'en-DE' },
    { code: 'GBP', symbol: '£',  name: 'British Pound',     locale: 'en-GB' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham',       locale: 'ar-AE' },
    { code: 'SAR', symbol: '﷼',  name: 'Saudi Riyal',       locale: 'ar-SA' },
    { code: 'EGP', symbol: 'ج.م', name: 'Egyptian Pound',   locale: 'ar-EG' },
    { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar',    locale: 'ar-KW' },
    { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal',     locale: 'ar-QA' },
    { code: 'TRY', symbol: '₺',  name: 'Turkish Lira',      locale: 'tr-TR' },
    { code: 'INR', symbol: '₹',  name: 'Indian Rupee',      locale: 'en-IN' },
];

// Exchange rates: 1 EGP = X foreign currency
// Prices in the DB are in EGP so we convert FROM EGP, not from USD.
const EGP_RATES: Record<string, number> = {
    EGP: 1,
    USD: 1 / 48.5,
    EUR: 1 / 52.8,
    GBP: 1 / 61.4,
    AED: 1 / 13.2,
    SAR: 1 / 12.9,
    KWD: 1 / 158.0,
    QAR: 1 / 13.3,
    TRY: 1 / 1.49,
    INR: 1 / 0.583,
};

/**
 * Convert an EGP amount to the target currency.
 */
export function convertFromBase(amountEGP: number, toCurrency: string): number {
    const rate = EGP_RATES[toCurrency] ?? 1;
    return amountEGP * rate;
}

/**
 * Convert an amount from a target currency back to the base currency (EGP).
 */
export function convertToBase(amount: number, fromCurrency: string): number {
    const rate = EGP_RATES[fromCurrency] ?? 1;
    return amount / rate;
}

let cachedCurrency: string | null = null;
let lastCacheTime = 0;

/**
 * Get the currently selected currency code.
 * Priority: localStorage override → timezone heuristic → EGP fallback.
 */
export function getActiveCurrency(): string {
    if (typeof window === 'undefined') return 'EGP';
    
    // Cache for 100ms to avoid slamming localStorage in tight loops (like product lists)
    const now = Date.now();
    if (cachedCurrency && (now - lastCacheTime < 100)) {
        return cachedCurrency;
    }

    const saved = localStorage.getItem('platform-currency');
    if (saved && EGP_RATES[saved]) {
        cachedCurrency = saved;
        lastCacheTime = now;
        return saved;
    }

    // Timezone-based default
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        let detected = 'EGP';
        if (tz.startsWith('Africa/Cairo'))   detected = 'EGP';
        else if (tz.startsWith('Asia/Dubai'))     detected = 'AED';
        else if (tz.startsWith('Asia/Riyadh'))    detected = 'SAR';
        else if (tz.startsWith('Asia/Kuwait'))    detected = 'KWD';
        else if (tz.startsWith('Asia/Qatar'))     detected = 'QAR';
        else if (tz.startsWith('Europe/London'))  detected = 'GBP';
        else if (tz.startsWith('Europe/'))        detected = 'EUR';
        else if (tz.startsWith('Asia/Kolkata'))   detected = 'INR';
        else if (tz.startsWith('Europe/Istanbul')) detected = 'TRY';
        
        cachedCurrency = detected;
        lastCacheTime = now;
        return detected;
    } catch (_e) { /* ignore */ }

    cachedCurrency = 'EGP';
    lastCacheTime = now;
    return 'EGP';
}

/**
 * Set user's currency preference.
 */
export function setActiveCurrency(code: string): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem('platform-currency', code);
        cachedCurrency = code;
        lastCacheTime = Date.now();
        // Trigger a storage event so other tabs / components react
        window.dispatchEvent(new Event('currency-changed'));
    }
}

/**
 * Format an EGP amount in the currently active display currency.
 * @param amountEGP  Price in EGP (as stored in the database)
 * @param currencyCode Optional explicit currency code to use (e.g. from Context)
 */
export function formatPrice(amountEGP: number, currencyCode?: string): string {
    const safeAmount = amountEGP ?? 0;

    const activeCode = currencyCode || getActiveCurrency();
    const converted   = convertFromBase(safeAmount, activeCode);
    const info        = SUPPORTED_CURRENCIES.find(c => c.code === activeCode);
    const locale      = info?.locale ?? 'en-US';

    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: activeCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(converted);
    } catch (_e) {
        // Fallback if browser doesn't support the currency
        return `${info?.symbol ?? '$'}${converted.toFixed(2)}`;
    }
}

/**
 * Returns currency symbol and code for UI display.
 */
export function getCurrencyInfo(forceEuro: boolean = false): { symbol: string; code: string } {
    const code = forceEuro ? 'EUR' : getActiveCurrency();
    const info = SUPPORTED_CURRENCIES.find(c => c.code === code);
    return { symbol: info?.symbol ?? '$', code };
}
