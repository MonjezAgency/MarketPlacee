'use client';

import { ThemeProvider } from 'next-themes';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        // Only set the platform default currency if the user hasn't manually
        // chosen one yet. This prevents overwriting user preferences on every
        // page navigation.
        const userHasChosen = localStorage.getItem('user-currency-chosen') === 'true';
        if (userHasChosen) return;

        fetch('/api/proxy/config/currency')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.currency) {
                    localStorage.setItem('platform-currency', data.currency);
                    window.dispatchEvent(new Event('currency-changed'));
                }
                // If no platform default is set, leave whatever is in localStorage
                // (timezone heuristic will handle the fallback).
            })
            .catch(() => {/* non-critical — silently ignore */});
    }, []);
    return (
        <SessionProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <ToastProvider>
                <AuthProvider>
                    <LanguageProvider>
                        <CurrencyProvider>
                        <CartProvider>
                            {children}
                        </CartProvider>
                        </CurrencyProvider>
                    </LanguageProvider>
                </AuthProvider>
            </ToastProvider>
        </ThemeProvider>
        </SessionProvider>
    );
}
