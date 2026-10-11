/**
 * currency.ts — Multi-currency display
 *
 * All prices in the DB are stored in EUR — the platform's base and
 * settlement currency (Stripe charges in EUR; see backend payments.service).
 * Display conversion uses LIVE rates from /api/fx (ExchangeRate-API, with an
 * ECB fallback), cached in localStorage with their timestamp.
 *
 * Rules:
 *   • No hardcoded/example rates. If a currency has no current rate, it is
 *     unavailable and prices are shown in EUR (never a label-only swap).
 *   • Rates older than MAX_RATE_AGE are treated as unavailable.
 */

export const SUPPORTED_CURRENCIES = [
    { code: 'EUR', symbol: '€',  name: 'Euro',             locale: 'en-IE' },
    { code: 'USD', symbol: '$',  name: 'US Dollar',        locale: 'en-US' },
    { code: 'GBP', symbol: '£',  name: 'British Pound',    locale: 'en-GB' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham',      locale: 'en-AE' },
    { code: 'SAR', symbol: '﷼',  name: 'Saudi Riyal',      locale: 'en-SA' },
    { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar',   locale: 'en-KW' },
    { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal',    locale: 'en-QA' },
    { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound',   locale: 'en-EG' },
    { code: 'TRY', symbol: '₺',  name: 'Turkish Lira',     locale: 'tr-TR' },
    { code: 'INR', symbol: '₹',  name: 'Indian Rupee',     locale: 'en-IN' },
    { code: 'CNY', symbol: '¥',  name: 'Chinese Yuan',     locale: 'zh-CN' },
    { code: 'JPY', symbol: '¥',  name: 'Japanese Yen',     locale: 'ja-JP' },
    { code: 'RUB', symbol: '₽',  name: 'Russian Ruble',    locale: 'ru-RU' },
];

export const BASE_CURRENCY = 'EUR';
const FX_CACHE_KEY = 'atl_fx_rates_v1';
const MAX_RATE_AGE = 72 * 3600 * 1000;   // treat rates older than 72h as unavailable
const REFRESH_AFTER = 6 * 3600 * 1000;    // refetch after 6h

export interface FxMeta { rates: Record<string, number>; updatedAt: string | null; source: string | null; fetchedAt: number }

// Live rate store: 1 EUR = X target currency. Starts with EUR only.
let fx: FxMeta = { rates: { EUR: 1 }, updatedAt: null, source: null, fetchedAt: 0 };

function fresh(meta: FxMeta) {
    const stamp = meta.updatedAt ? new Date(meta.updatedAt).getTime() : meta.fetchedAt;
    return Date.now() - stamp < MAX_RATE_AGE;
}

// Hydrate synchronously from cache so returning visitors see converted prices immediately.
if (typeof window !== 'undefined') {
    try {
        const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null') as FxMeta | null;
        if (cached?.rates && fresh(cached)) fx = { ...cached, rates: { ...cached.rates, EUR: 1 } };
    } catch { /* ignore */ }
}

let inflight: Promise<FxMeta> | null = null;

/** Fetch live rates (deduped; skips the network while the cache is recent). */
export function loadRates(force = false): Promise<FxMeta> {
    if (typeof window === 'undefined') return Promise.resolve(fx);
    if (!force && fx.fetchedAt && Date.now() - fx.fetchedAt < REFRESH_AFTER) return Promise.resolve(fx);
    if (inflight) return inflight;
    inflight = fetch('/api/fx')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`fx ${r.status}`))))
        .then((j) => {
            const next: FxMeta = { rates: { ...(j.rates || {}), EUR: 1 }, updatedAt: j.updatedAt || null, source: j.source || null, fetchedAt: Date.now() };
            if (fresh(next)) {
                fx = next;
                try { localStorage.setItem(FX_CACHE_KEY, JSON.stringify(fx)); } catch { /* ignore */ }
                cachedCurrency = null;
                window.dispatchEvent(new Event('fx-updated'));
            }
            return fx;
        })
        .catch(() => fx) // keep whatever valid rates we already have; never invent
        .finally(() => { inflight = null; });
    return inflight;
}

export function getFxMeta(): FxMeta { return fx; }

/** True when a current, trusted rate exists for this currency. */
export function isCurrencyAvailable(code: string): boolean {
    return code === BASE_CURRENCY || (typeof fx.rates[code] === 'number' && fresh(fx));
}

/** Convert a EUR amount to the target currency. Returns null if no valid rate. */
export function convertFromBaseStrict(amountEUR: number, toCurrency: string): number | null {
    if (toCurrency === BASE_CURRENCY) return amountEUR;
    return isCurrencyAvailable(toCurrency) ? amountEUR * fx.rates[toCurrency] : null;
}

/**
 * Convert a EUR amount to the display currency. Callers should pass the
 * effective currency from getActiveCurrency(), which is always convertible.
 */
export function convertFromBase(amountEUR: number, toCurrency: string): number {
    return convertFromBaseStrict(amountEUR, toCurrency) ?? amountEUR;
}

/** Convert an amount from a display currency back to EUR. */
export function convertToBase(amount: number, fromCurrency: string): number {
    if (fromCurrency === BASE_CURRENCY) return amount;
    if (!isCurrencyAvailable(fromCurrency)) {
        throw new Error(`No current exchange rate for ${fromCurrency}`);
    }
    return amount / fx.rates[fromCurrency];
}

let cachedCurrency: string | null = null;
let lastCacheTime = 0;

/** The user's chosen currency, whether or not it's convertible right now. */
export function getPreferredCurrency(): string {
    if (typeof window === 'undefined') return BASE_CURRENCY;
    try {
        const saved = localStorage.getItem('platform-currency');
        if (saved && SUPPORTED_CURRENCIES.some((c) => c.code === saved)) return saved;
    } catch { /* ignore */ }
    return BASE_CURRENCY;
}

/**
 * The EFFECTIVE display currency: the user's choice when a valid rate
 * exists, otherwise EUR. Defaults to EUR (platform base) — no geo-guessing,
 * so the first render matches the server and prices never change silently.
 */
export function getActiveCurrency(): string {
    if (typeof window === 'undefined') return BASE_CURRENCY;
    const now = Date.now();
    if (cachedCurrency && now - lastCacheTime < 100) return cachedCurrency;
    const preferred = getPreferredCurrency();
    cachedCurrency = isCurrencyAvailable(preferred) ? preferred : BASE_CURRENCY;
    lastCacheTime = now;
    return cachedCurrency;
}

/**
 * Set user's currency preference.
 */
export function setActiveCurrency(code: string): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem('platform-currency', code);
        // Re-resolve: the effective currency is only `code` if it has a rate.
        cachedCurrency = null;
        // Trigger a storage event so other tabs / components react
        window.dispatchEvent(new Event('currency-changed'));
    }
}

/**
 * Format a EUR amount in the given (or active) display currency, using the
 * currency's own decimal precision (e.g. JPY 0, KWD 3). If the currency has
 * no valid rate, the EUR amount is formatted as EUR — never relabelled.
 */
export function formatPrice(amountEUR: number, currencyCode?: string): string {
    const safeAmount = Number.isFinite(amountEUR) ? amountEUR : 0;
    let code = currencyCode || getActiveCurrency();
    let value = convertFromBaseStrict(safeAmount, code);
    if (value === null) { code = BASE_CURRENCY; value = safeAmount; }
    const info = SUPPORTED_CURRENCIES.find((c) => c.code === code);
    try {
        return new Intl.NumberFormat(info?.locale ?? 'en-IE', { style: 'currency', currency: code }).format(value);
    } catch {
        return `${info?.symbol ?? code} ${value.toFixed(2)}`;
    }
}

/** Always format in EUR — for settlement/charge amounts. */
export function formatEUR(amountEUR: number): string {
    return formatPrice(amountEUR, BASE_CURRENCY);
}

/**
 * Returns currency symbol and code for UI display.
 */
export function getCurrencyInfo(forceEuro: boolean = false): { symbol: string; code: string } {
    const code = forceEuro ? 'EUR' : getActiveCurrency();
    const info = SUPPORTED_CURRENCIES.find(c => c.code === code);
    return { symbol: info?.symbol ?? '$', code };
}
