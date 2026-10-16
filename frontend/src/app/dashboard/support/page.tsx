'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/** Old address: buyers' Support now lives in the account area; suppliers have their own in the Business Hub. */
export default function SupportRedirect() {
    const { user, isAuthReady } = useAuth();
    const router = useRouter();
    React.useEffect(() => {
        if (!isAuthReady) return;
        const role = String(user?.role || '').toUpperCase();
        const qs = typeof window !== 'undefined' ? window.location.search : '';
        router.replace(`${role === 'SUPPLIER' ? '/supplier/support' : '/dashboard/customer/support'}${qs}`);
    }, [isAuthReady, user, router]);
    return <div className="min-h-[50vh]" aria-busy="true" />;
}
