'use client';

import * as React from 'react';
import Link from 'next/link';
import { LayoutDashboard, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const SUPPLIER_DASHBOARD = '/supplier';
const BUYER_DASHBOARD = '/dashboard/customer';
const TEAM = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];

/**
 * Where a Help Center reader should go next, based on who they are:
 * signed out → register (supplier sign-up preselected) or sign in and return
 * to the dashboard; signed in → their own dashboard. Access is still enforced
 * by the dashboards themselves; this only picks the right link.
 */
export default function AccountCta({ audience }: { audience: 'buyer' | 'supplier' | 'both' }) {
    const { user, isLoggedIn, isAuthReady } = useAuth();
    if (!isAuthReady) return null;
    const role = String(user?.role || '').toUpperCase();
    const btn = 'h-9 px-3.5 rounded-lg text-[13.5px] font-semibold inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]';

    if (!isLoggedIn) {
        const supplierFirst = audience === 'supplier';
        return (
            <div className="mt-8 rounded-xl ring-1 ring-line px-5 py-4 flex flex-wrap items-center gap-3">
                <p className="flex-1 min-w-[14rem] text-[14px] text-ink-2">{supplierFirst ? 'Not a supplier on Atlantis yet? Register as a supplier, or sign in to open your supplier dashboard.' : 'Sign in to use these features, or create a business account.'}</p>
                <Link href={supplierFirst ? '/auth/register?role=supplier' : '/auth/register'} className={`${btn} bg-heading text-white`}><UserPlus size={15} /> {supplierFirst ? 'Register as a supplier' : 'Create an account'}</Link>
                <Link href={`/auth/login?redirect=${encodeURIComponent(supplierFirst ? SUPPLIER_DASHBOARD : '/dashboard')}`} className={`${btn} ring-1 ring-line-strong text-heading`}><LogIn size={15} /> Sign in</Link>
            </div>
        );
    }
    if (TEAM.includes(role)) return null;
    const isSupplier = role === 'SUPPLIER';
    if (audience === 'supplier' && !isSupplier) {
        return <p className="mt-8 rounded-xl ring-1 ring-line px-5 py-4 text-[14px] text-ink-2">This article is for suppliers. You’re signed in with a buyer account; supplier tools aren’t available to it.</p>;
    }
    if (audience === 'buyer' && isSupplier) return null;
    return (
        <div className="mt-8 rounded-xl ring-1 ring-line px-5 py-4 flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-[14rem] text-[14px] text-ink-2">{isSupplier ? 'Ready to try it? Your supplier dashboard is one click away.' : 'Ready to try it? Open your account.'}</p>
            <Link href={isSupplier ? SUPPLIER_DASHBOARD : BUYER_DASHBOARD} className={`${btn} bg-heading text-white`}><LayoutDashboard size={15} /> {isSupplier ? 'Open supplier dashboard' : 'Open my account'}</Link>
        </div>
    );
}
