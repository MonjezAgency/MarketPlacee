'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getActiveCurrency, setActiveCurrency as setLibCurrency, SUPPORTED_CURRENCIES } from '@/lib/currency';

interface CurrencyContextType {
    currency: string;
    setCurrency: (code: string) => void;
    symbol: string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
    const [currency, setCurrencyState] = useState<string>('EGP');

    useEffect(() => {
        // Initial load
        setCurrencyState(getActiveCurrency());

        const handleFocus = () => {
             setCurrencyState(getActiveCurrency());
        };

        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'platform-currency') {
                setCurrencyState(getActiveCurrency());
            }
        };

        const handleCustomEvent = () => {
            setCurrencyState(getActiveCurrency());
        };

        window.addEventListener('focus', handleFocus);
        window.addEventListener('storage', handleStorage);
        window.addEventListener('currency-changed', handleCustomEvent);

        return () => {
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('currency-changed', handleCustomEvent);
        };
    }, []);

    const setCurrency = (code: string) => {
        setLibCurrency(code);
        setCurrencyState(code);
    };

    const info = SUPPORTED_CURRENCIES.find(c => c.code === currency);
    const symbol = info?.symbol ?? '$';

    return (
        <CurrencyContext.Provider value={{ currency, setCurrency, symbol }}>
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
