'use client';

import { ThemeProvider } from 'next-themes';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        // Fetch global platform currency configuration from Admin settings
        fetch((process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001') + '/config/currency')
            .then(res => res.json())
            .then(data => {
                if (data && data.currency) {
                    localStorage.setItem('platform-currency', data.currency);
                } else {
                    localStorage.removeItem('platform-currency');
                }
                // Notify Navbar + any components listening for currency changes
                window.dispatchEvent(new Event('currency-changed'));
            })
            .catch(err => console.error('Failed to fetch platform currency', err));
    }, []);
    return (
        <SessionProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <ToastProvider>
                <AuthProvider>
                    <LanguageProvider>
                        <CartProvider>
                            {children}
                        </CartProvider>
                    </LanguageProvider>
                </AuthProvider>
            </ToastProvider>
        </ThemeProvider>
        </SessionProvider>
    );
}
