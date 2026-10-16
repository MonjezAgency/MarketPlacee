'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Package, ListChecks, Settings, Target, LifeBuoy, Receipt } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

const TABS = [
    { href: '/dashboard/customer', label: 'overview', icon: LayoutGrid, exact: true },
    { href: '/dashboard/customer/orders', label: 'orders', icon: Package },
    { href: '/dashboard/customer/payments', label: 'payments', icon: Receipt },
    { href: '/dashboard/customer/lists', label: 'lists', icon: ListChecks },
    { href: '/dashboard/customer/targets', label: 'targets', icon: Target },
    { href: '/dashboard/customer/support', label: 'support', icon: LifeBuoy },
    { href: '/dashboard/customer/settings', label: 'settings', icon: Settings },
];

/** Buyer account: one shell, four tabs, inside the storefront header/footer. */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || '';
    const { user } = useAuth();
    const { t } = useLanguage();
    return (
        <div className="bg-surface min-h-[70vh] text-start">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0" data-no-translate>
                        <p className="text-[12.5px] text-ink-3">{t('account', 'myAccount')}</p>
                        <h1 className="font-sans text-[22px] sm:text-[24px] font-semibold text-heading truncate">{(user as any)?.companyName || user?.name || t('account', 'yourAccount')}</h1>
                    </div>
                    <Link href="/categories" data-no-translate className="h-10 px-4 inline-flex items-center rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">{t('account', 'startOrder')}</Link>
                </div>
                <div className="mt-6 lg:grid lg:grid-cols-[216px_minmax(0,1fr)] lg:gap-8 items-start">
                    {/* Side tabs on desktop; a scrollable tab row on phones/tablets. */}
                    <nav aria-label={t('account', 'navAria')} data-no-translate className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide border-b border-line lg:border-0 lg:overflow-visible lg:sticky lg:top-[120px]">
                        <ul className="flex lg:flex-col gap-1 min-w-max lg:min-w-0">
                            {TABS.map((tab) => {
                                const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
                                const Icon = tab.icon;
                                return (
                                    <li key={tab.href}>
                                        <Link href={tab.href} aria-current={active ? 'page' : undefined}
                                            className={cn('relative flex items-center gap-2.5 h-11 px-3 text-[14px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] rounded-t-md lg:rounded-xl',
                                                active ? 'text-heading lg:bg-surface-2' : 'text-ink-3 hover:text-ink lg:hover:bg-surface-2/60')}>
                                            <Icon size={17} /> {t('account', tab.label)}
                                            {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-heading lg:inset-x-auto lg:start-0 lg:top-2 lg:bottom-2 lg:h-auto lg:w-[3px]" />}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                    <div className="pt-6 lg:pt-0 min-w-0">{children}</div>
                </div>
            </div>
        </div>
    );
}
