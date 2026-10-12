'use client';

import Navbar from "./Navbar";
import Footer from "./Footer";
import { ProfileReminderBanner } from "@/components/account/ProfileReminderBanner";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, isLoggedIn, isAuthReady } = useAuth();
    const router = useRouter();

    const isAuthPage = pathname?.startsWith('/auth');
    // Pages a not-yet-approved or incomplete account may use.
    const isPendingPage = pathname === '/auth/pending' || pathname === '/auth/complete-profile';
    const isDashboard = pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin') || pathname?.startsWith('/supplier');
    // The buyer dashboard lives inside the storefront chrome (header + footer).
    const isBuyerDashboard = pathname?.startsWith('/dashboard/customer');

    // Dashboards are private; the catalog is public (prices are withheld by the API).
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

        // 2. Not logged in? Protect dashboards; public pages stay browsable.
        if (!isLoggedIn) {
            if (isDashboard) router.push('/auth/login?session=expired');
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

    const showNav = (!isDashboard || isBuyerDashboard) && !isAuthPage;

    return (
        <div className="flex flex-col min-h-screen">
            {/* Single source of truth: Navbar on all public pages */}
            {showNav && <Navbar />}
            {showNav && <ProfileReminderBanner />}
            <main className="flex-grow">
                {children}
            </main>
            {(!isDashboard || isBuyerDashboard) && !isAuthPage && <Footer />}
        </div>
    );
}
