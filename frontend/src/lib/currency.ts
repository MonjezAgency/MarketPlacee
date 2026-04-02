/**
 * currency.ts — Multi-currency support
 *
 * All prices in the DB are stored in USD.
 * This file converts + formats them for display in the user's chosen currency.
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

// Fixed exchange rates vs USD (1 USD = X currency)
// Update these periodically or replace with a live rates fetch
const USD_RATES: Record<string, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    AED: 3.67,
    SAR: 3.75,
    EGP: 48.5,
    KWD: 0.307,
    QAR: 3.64,
    TRY: 32.5,
    INR: 83.2,
};

/**
 * Convert a USD amount to the target currency.
 */
export function convertFromUSD(amountUSD: number, toCurrency: string): number {
    const rate = USD_RATES[toCurrency] ?? 1;
    return amountUSD * rate;
}

/**
 * Get the currently selected currency code.
 * Priority: localStorage override → timezone heuristic → USD fallback.
 */
export function getActiveCurrency(): string {
    if (typeof window === 'undefined') return 'USD';
    const saved = localStorage.getItem('platform-currency');
    if (saved && USD_RATES[saved]) return saved;

    // Timezone-based default
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        if (tz.startsWith('Africa/Cairo'))   return 'EGP';
        if (tz.startsWith('Asia/Dubai'))     return 'AED';
        if (tz.startsWith('Asia/Riyadh'))    return 'SAR';
        if (tz.startsWith('Asia/Kuwait'))    return 'KWD';
        if (tz.startsWith('Asia/Qatar'))     return 'QAR';
        if (tz.startsWith('Europe/London'))  return 'GBP';
        if (tz.startsWith('Europe/'))        return 'EUR';
        if (tz.startsWith('Asia/Kolkata'))   return 'INR';
        if (tz.startsWith('Europe/Istanbul')) return 'TRY';
    } catch { /* ignore */ }

    return 'USD';
}

/**
 * Set user's currency preference.
 */
export function setActiveCurrency(code: string): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem('platform-currency', code);
        // Trigger a storage event so other tabs / components react
        window.dispatchEvent(new Event('currency-changed'));
    }
}

/**
 * Format a USD amount in the currently active currency.
 * @param amountUSD  Price in USD (as stored in the database)
 * @param forceEuro  Legacy flag — kept for backwards compatibility
 */
export function formatPrice(amountUSD: number, forceEuro: boolean = false): string {
    const safeAmount = amountUSD ?? 0;

    const currencyCode = forceEuro ? 'EUR' : getActiveCurrency();
    const converted   = convertFromUSD(safeAmount, currencyCode);
    const info        = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode);
    const locale      = info?.locale ?? 'en-US';

    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(converted);
    } catch {
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
