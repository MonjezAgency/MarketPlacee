/**
 * currency.ts — Multi-currency support
 *
 * All prices in the DB are stored in EUR (Euro) — the platform's base currency
 * for this Romania/EU-focused B2B marketplace deployment.
 * This file formats EUR amounts and optionally converts to the user's chosen
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

// Exchange rates: 1 EUR = X target currency
// Prices in the DB are stored in EUR, so we convert FROM EUR to display currency.
const EUR_RATES: Record<string, number> = {
    EUR: 1,        // 1 EUR = 1 EUR  (identity — no conversion)
    USD: 1.089,    // 1 EUR ≈ 1.09 USD
    GBP: 0.860,    // 1 EUR ≈ 0.86 GBP
    AED: 4.0,      // 1 EUR ≈ 4.0 AED
    SAR: 4.09,     // 1 EUR ≈ 4.09 SAR
    EGP: 52.8,     // 1 EUR ≈ 52.8 EGP
    KWD: 0.334,    // 1 EUR ≈ 0.334 KWD
    QAR: 3.97,     // 1 EUR ≈ 3.97 QAR
    TRY: 35.4,     // 1 EUR ≈ 35.4 TRY
    INR: 90.6,     // 1 EUR ≈ 90.6 INR
};

/**
 * Convert a EUR amount to the target display currency.
 */
export function convertFromBase(amountEUR: number, toCurrency: string): number {
    const rate = EUR_RATES[toCurrency] ?? 1;
    return amountEUR * rate;
}

/**
 * Convert an amount from a display currency back to the base currency (EUR).
 */
export function convertToBase(amount: number, fromCurrency: string): number {
    const rate = EUR_RATES[fromCurrency] ?? 1;
    return amount / rate;
}

let cachedCurrency: string | null = null;
let lastCacheTime = 0;

/**
 * Get the currently selected currency code.
 * Priority: localStorage override → timezone heuristic → EGP fallback.
 */
export function getActiveCurrency(): string {
    // Default to EUR — this is a Romania-based, EU-focused B2B marketplace.
    // The previous EGP default caused bulk uploads to send "EGP" to the
    // backend, which then multiplied prices by the EGP→EUR rate (0.018),
    // shrinking €16 supplier prices to €0.288 in the database.
    if (typeof window === 'undefined') return 'EUR';

    // Cache for 100ms to avoid slamming localStorage in tight loops (like product lists)
    const now = Date.now();
    if (cachedCurrency && (now - lastCacheTime < 100)) {
        return cachedCurrency;
    }

    const saved = localStorage.getItem('platform-currency');
    if (saved && EUR_RATES[saved]) {
        cachedCurrency = saved;
        lastCacheTime = now;
        return saved;
    }

    // Timezone-based default. Africa/Cairo keeps EGP because the original
    // operator team is in Cairo, but every other unknown timezone now
    // resolves to EUR (the platform base) rather than EGP.
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        let detected = 'EUR';
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

    cachedCurrency = 'EUR';
    lastCacheTime = now;
    return 'EUR';
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
 * Format a EUR amount in the currently active display currency.
 * @param amountEUR  Price in EUR (as stored in the database)
 * @param currencyCode Optional explicit currency code to use (e.g. from Context)
 */
export function formatPrice(amountEUR: number, currencyCode?: string): string {
    const safeAmount = amountEUR ?? 0;

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
