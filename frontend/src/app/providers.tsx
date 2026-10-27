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
                // Public backend endpoint: call it directly. Through /api/proxy it
                // answered 401 for signed-out visitors (proxy allow-list).
                const base = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
                if (!base) return;
                const res = await fetch(`${base}/config/currency`);
                if (res.ok) {
                    const data = await res.json();
                    // Double check in case user chose while we were fetching
                    const userHasChosenNow = localStorage.getItem('user-currency-chosen') === 'true';
                    if (data && data.currency && !userHasChosenNow) {
                        const normalizedCurrency = data.currency.toUpperCase();
                        localStorage.setItem('platform-currency', normalizedCurrency);
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
        <ThemeProvider
            attribute="class"
            // Light is the brand default; buyers can pick System (follows the
            // OS live) or force Light/Dark from the account / locale menu.
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
        >
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
