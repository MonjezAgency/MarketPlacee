'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Package, ListChecks, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const TABS = [
    { href: '/dashboard/customer', label: 'Overview', icon: LayoutGrid, exact: true },
    { href: '/dashboard/customer/orders', label: 'Orders & tracking', icon: Package },
    { href: '/dashboard/customer/lists', label: 'My lists', icon: ListChecks },
    { href: '/dashboard/customer/settings', label: 'Settings', icon: Settings },
];

/** Buyer account: one shell, four tabs, inside the storefront header/footer. */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || '';
    const { user } = useAuth();
    return (
        <div className="bg-surface min-h-[70vh] text-start">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[12.5px] text-ink-3">My account</p>
                        <h1 className="text-[22px] sm:text-[24px] font-semibold text-heading truncate">{(user as any)?.companyName || user?.name || 'Your account'}</h1>
                    </div>
                    <Link href="/categories" className="h-10 px-4 inline-flex items-center rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">Start a new order</Link>
                </div>
                <nav aria-label="Account" className="mt-5 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide border-b border-line">
                    <ul className="flex gap-1 min-w-max">
                        {TABS.map((t) => {
                            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
                            const Icon = t.icon;
                            return (
                                <li key={t.href}>
                                    <Link href={t.href} aria-current={active ? 'page' : undefined}
                                        className={cn('relative inline-flex items-center gap-2 h-11 px-3 text-[14px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] rounded-t-md',
                                            active ? 'text-heading' : 'text-ink-3 hover:text-ink')}>
                                        <Icon size={16} /> {t.label}
                                        {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-heading" />}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                <div className="pt-6">{children}</div>
            </div>
        </div>
    );
}
