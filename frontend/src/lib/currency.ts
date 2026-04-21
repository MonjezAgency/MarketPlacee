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
 * Kept name generic so callers don't need updating.
 */
export function convertFromUSD(amountEGP: number, toCurrency: string): number {
    const rate = EGP_RATES[toCurrency] ?? 1;
    return amountEGP * rate;
}

/**
 * Get the currently selected currency code.
 * Priority: localStorage override → timezone heuristic → USD fallback.
 */
export function getActiveCurrency(): string {
    if (typeof window === 'undefined') return 'EGP';
    const saved = localStorage.getItem('platform-currency');
    if (saved && EGP_RATES[saved]) return saved;

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
    } catch (_e) { /* ignore */ }

    return 'EGP';
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
 * Format an EGP amount in the currently active display currency.
 * @param amountEGP  Price in EGP (as stored in the database)
 * @param forceEuro  Legacy flag — kept for backwards compatibility
 */
export function formatPrice(amountEGP: number, forceEuro: boolean = false): string {
    const safeAmount = amountEGP ?? 0;

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
