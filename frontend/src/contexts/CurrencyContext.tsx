'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
    getActiveCurrency,
    getPreferredCurrency,
    setActiveCurrency as setLibCurrency,
    SUPPORTED_CURRENCIES,
    loadRates,
    getFxMeta,
    isCurrencyAvailable,
    BASE_CURRENCY,
} from '@/lib/currency';

interface CurrencyContextType {
    /** Effective display currency (always has a valid rate; EUR otherwise). */
    currency: string;
    /** What the user picked — may differ from `currency` if its rate is unavailable. */
    preferredCurrency: string;
    setCurrency: (code: string) => void;
    symbol: string;
    /** ISO time the provider published the rates, or null if only EUR is known. */
    ratesUpdatedAt: string | null;
    ratesSource: string | null;
    isAvailable: (code: string) => boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
    // EUR on first render so server and client markup match.
    const [currency, setCurrencyState] = useState<string>(BASE_CURRENCY);
    const [preferredCurrency, setPreferred] = useState<string>(BASE_CURRENCY);
    const [meta, setMeta] = useState(() => getFxMeta());

    const sync = useCallback(() => {
        setCurrencyState(getActiveCurrency());
        setPreferred(getPreferredCurrency());
        setMeta(getFxMeta());
    }, []);

    useEffect(() => {
        sync();
        loadRates().then(sync);

        const onStorage = (e: StorageEvent) => { if (e.key === 'platform-currency') sync(); };
        const onFocus = () => { loadRates().then(sync); };
        window.addEventListener('focus', onFocus);
        window.addEventListener('storage', onStorage);
        window.addEventListener('currency-changed', sync);
        window.addEventListener('fx-updated', sync);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('currency-changed', sync);
            window.removeEventListener('fx-updated', sync);
        };
    }, [sync]);

    const setCurrency = (code: string) => {
        setLibCurrency(code);
        sync();
    };

    const info = SUPPORTED_CURRENCIES.find((c) => c.code === currency);

    return (
        <CurrencyContext.Provider
            value={{
                currency,
                preferredCurrency,
                setCurrency,
                symbol: info?.symbol ?? '€',
                ratesUpdatedAt: meta.updatedAt,
                ratesSource: meta.source,
                isAvailable: isCurrencyAvailable,
            }}
        >
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const context = useContext(CurrencyContext);
    if (context === undefined) {
        throw new Error('useCurrency must be used within a CurrencyProvider');
    }
    return context;
}
