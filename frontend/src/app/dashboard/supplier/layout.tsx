'use client';
import React, { useEffect } from 'react';
import Sidebar from '@/components/dashboard/Sidebar';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthReady } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isAuthReady) {
            if (!user) {
                router.replace('/auth/login?session=expired');
            } else if (user.role?.toUpperCase() !== 'SUPPLIER') {
                router.replace('/dashboard/customer');
            }
        }
    }, [isAuthReady, user, router]);

    if (!isAuthReady || (user && user.role?.toUpperCase() !== 'SUPPLIER')) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar role="supplier" />
            <main className="flex-1 overflow-y-auto">
                <div className="container-wide p-8 pb-20">
                    {children}
                </div>
            </main>
        </div>
    );
}
