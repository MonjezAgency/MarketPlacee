import type { Metadata } from "next";
import { Cairo, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from './providers';
import ClientLayout from "@/components/layout/ClientLayout";
import { Toaster } from 'react-hot-toast';
import { CookieConsent } from '@/components/CookieConsent';
import { cn } from "@/lib/utils";

const cairo = Cairo({
    subsets: ["arabic", "latin"],
    variable: "--font-cairo",
    display: "swap",
});

const poppins = Poppins({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    variable: "--font-poppins",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Atlantis — Premium Beverage Distribution",
    description: "Your trusted B2B Atlantis for Pepsi, Coca-Cola, Red Bull, Lipton and more. Wholesale beverage distribution for businesses.",
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ar" dir="rtl" suppressHydrationWarning>
            <head>
                <link rel="icon" href="/favicon.ico" sizes="any" />
                <link rel="icon" href="/icon.png" type="image/png" />
                <link rel="apple-touch-icon" href="/icon.png" />
                <link rel="manifest" href="/manifest.json" />
                <meta name="theme-color" content="#0a0a0a" />
                <script dangerouslySetInnerHTML={{
                    __html: `
                        if ('serviceWorker' in navigator) {
                            window.addEventListener('load', function() {
                                navigator.serviceWorker.register('/sw.js');
                            });
                        }
                    `
                }} />
            </head>
            <body className={cn(
                'min-h-screen bg-background font-sans antialiased text-end',
                cairo.variable,
                poppins.variable // Keep poppins variable if it's still needed for other elements
            )}>
                <Providers>
                    <Toaster position="top-right" />
                    <ClientLayout>
                        {children}
                    </ClientLayout>
                    <CookieConsent />
                </Providers>
            </body>
        </html>
    );
}
