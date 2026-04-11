'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function GoogleSyncPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (status === 'loading') return;

        if (status === 'unauthenticated') {
            router.push('/auth/login');
            return;
        }

        if (status === 'authenticated' && session) {
            const s = session as any;

            if (s.authError) {
                setErrorMsg(s.authError);
                return;
            }

            if (s.backendToken && s.backendUser) {
                localStorage.setItem('bev-token', s.backendToken);
                localStorage.setItem('bev-user', JSON.stringify(s.backendUser));

                if (!s.backendUser.companyName || !s.backendUser.phone) {
                    router.replace('/auth/onboarding');
                    return;
                }

                if (s.pendingApproval) {
                    router.push('/auth/pending');
                    return;
                }

                const role = (s.backendUser.role || '').toUpperCase();
                if (role === 'ADMIN' || role === 'MODERATOR' || role === 'SUPPORT' || role === 'EDITOR') {
                    router.push('/admin');
                } else if (role === 'SUPPLIER') {
                    router.push('/supplier');
                } else {
                    router.push('/');
                }
            } else {
                setErrorMsg('Could not sync your account. Please try logging in with email instead.');
            }
        }
    }, [session, status, router]);

    if (errorMsg) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-8">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="text-red-500" size={32} />
                    </div>
                    <h1 className="text-xl font-black text-[#0A1A2F] mb-3">Google Sign-In Failed</h1>
                    <p className="text-slate-500 text-sm mb-8">{errorMsg}</p>
                    <button
                        onClick={() => router.push('/auth/login')}
                        className="h-12 px-8 bg-[#0A1A2F] text-white rounded-xl font-black text-xs uppercase tracking-widest"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-[#1BC7C9]/20 border-t-[#1BC7C9] rounded-full animate-spin mx-auto mb-6" />
                <p className="text-[#0A1A2F] font-black text-sm uppercase tracking-[0.3em]">Syncing Account</p>
                <p className="text-slate-400 text-xs mt-2">Connecting to Atlantis...</p>
            </div>
        </div>
    );
}
