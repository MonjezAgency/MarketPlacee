'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

/**
 * Root Dashboard Redirector
 * 
 * This page handles users who navigate directly to /dashboard.
 * It identifies their role and redirects them to the appropriate sub-dashboard.
 */
export default function DashboardIndex() {
    const { user, isLoggedIn, isAuthReady } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isAuthReady) return;

        if (!isLoggedIn) {
            router.push('/auth/login');
            return;
        }

        const role = user?.role?.toUpperCase();
        
        // Redirect based on role
        if (['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(role || '')) {
            router.replace('/admin');
        } else if (role === 'SUPPLIER') {
            router.replace('/dashboard/supplier');
        } else {
            router.replace('/dashboard/customer');
        }
    }, [user, isLoggedIn, isAuthReady, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
            <div className="flex flex-col items-center gap-4">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 bg-primary/20 rounded-full animate-pulse" />
                    </div>
                </div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 animate-pulse">
                    Routing to your workspace...
                </p>
            </div>
        </div>
    );
}
