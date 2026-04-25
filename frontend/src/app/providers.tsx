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
        const checkAndSetDefault = async () => {
            const userHasChosen = localStorage.getItem('user-currency-chosen') === 'true';
            if (userHasChosen) return;

            try {
                const res = await fetch('/api/proxy/config/currency');
                if (res.ok) {
                    const data = await res.json();
                    // Double check in case user chose while we were fetching
                    const userHasChosenNow = localStorage.getItem('user-currency-chosen') === 'true';
                    if (data && data.currency && !userHasChosenNow) {
                        localStorage.setItem('platform-currency', data.currency);
                        window.dispatchEvent(new Event('currency-changed'));
                    }
                }
            } catch (err) {
                // non-critical — silently ignore
            }
        };

        checkAndSetDefault();
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
