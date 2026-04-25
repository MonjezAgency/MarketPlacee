'use client';

import Navbar from "./Navbar";
import Footer from "./Footer";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, isLoggedIn, isAuthReady } = useAuth();
    const router = useRouter();

    const isAuthPage = pathname?.startsWith('/auth');
    const isPendingPage = pathname === '/auth/pending';
    const isDashboard = pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin') || pathname?.startsWith('/supplier');
    const isHome = pathname === '/';

    // Enforcement logic: Make the entire marketplace private
    useEffect(() => {
        // 0. Wait for auth to hydrate from localStorage
        if (!isAuthReady) return;

        // 1. If hitting any auth page (login/register/pending), allow it structurally, but
        // if they are logged in, we might want to let them be. For now, just allow auth pages without redirect loops.
        if (isAuthPage && !isPendingPage) {
            // but if they are logged in and pending, and they visit /auth/login, maybe redirect to /auth/pending
            if (isLoggedIn && user?.status === 'PENDING_APPROVAL') {
                router.push('/auth/pending');
            }
            return;
        }

        // 2. Not logged in? Protect dashboards strictly, redirect once for public pages.
        if (!isLoggedIn) {
            if (isDashboard) {
                router.push('/auth/login?session=expired');
                return;
            }

            if (!isAuthPage) {
                const hasRedirected = sessionStorage.getItem('has_redirected_to_login');
                if (!hasRedirected) {
                    sessionStorage.setItem('has_redirected_to_login', 'true');
                    router.push('/auth/login?session=expired');
                    return;
                }
            }
            return;
        }

        // 3. Logged in, but not active (pending, rejected, blocked)? Redirect to pending page
        const upperRole = (user?.role || '').toUpperCase();
        const bypassRoles = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];
        if (isLoggedIn && user?.status !== 'ACTIVE' && !bypassRoles.includes(upperRole)) {
            if (!isPendingPage) {
                router.push('/auth/pending');
            }
        }
    }, [user, isLoggedIn, isAuthReady, pathname, isAuthPage, isPendingPage, router]);

    return (
        <div className="flex flex-col min-h-screen">
            {(!isDashboard && !isHome && !isAuthPage) && <Navbar />}
            <main className={`flex-grow ${(!isDashboard && !isHome && !isAuthPage) ? 'pt-20' : ''}`}>
                {children}
            </main>
            {(!isDashboard) && <Footer />}
        </div>
    );
}
