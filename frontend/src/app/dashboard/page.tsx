'use client';

import { useEffect, useState } from 'react';
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

    const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isAuthReady) setShowTimeoutMessage(true);
        }, 5000);
        return () => clearTimeout(timer);
    }, [isAuthReady]);

    useEffect(() => {
        if (!isAuthReady) return;

        if (!isLoggedIn) {
            router.push('/auth/login?session=expired');
            return;
        }

        const role = user?.role?.toUpperCase();
        
        // Redirect based on role
        if (['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(role || '')) {
            router.replace('/admin');
        } else if (role === 'SUPPLIER') {
            router.replace('/dashboard/supplier');
        } else if (role === 'CUSTOMER' || role === 'BUYER') {
            router.replace('/dashboard/customer');
        } else {
            router.replace('/');
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
                <div className="space-y-3 flex flex-col items-center">
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 animate-pulse">
                        Routing to your workspace...
                    </p>
                    {showTimeoutMessage && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700 max-w-xs">
                            <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-wider">
                                Connection is taking longer than expected. <br/>
                                Please verify the backend service status.
                            </p>
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={() => window.location.reload()}
                                    className="px-4 py-2 bg-primary text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
                                >
                                    Retry Connection
                                </button>
                                <button 
                                    onClick={() => router.push('/')}
                                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    Back to Marketplace
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
