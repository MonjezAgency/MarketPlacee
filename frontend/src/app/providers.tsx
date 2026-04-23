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
        // Fetch global platform currency configuration from Admin settings
        fetch(('/api') + '/config/currency')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.currency) {
                    localStorage.setItem('platform-currency', data.currency);
                } else {
                    localStorage.removeItem('platform-currency');
                }
                window.dispatchEvent(new Event('currency-changed'));
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
