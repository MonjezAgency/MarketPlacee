'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, CreditCard, FileText, Globe2, MapPin, Route, ShieldCheck, Warehouse } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ConfirmProvider, PageHeader } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { isOwnerAdmin, useTf } from './shared';
import { InvoicesPanel } from './InvoicesPanel';
import { CreditTermsPanel, DispatchLocationsPanel, TaxExemptionsPanel } from './OtherPanels';

/**
 * Admin → Finance & logistics (/admin/finance?tab=invoices|credit|tax|warehouses).
 * Everything shown is read from the records the existing endpoints return;
 * write actions appear only for OWNER/ADMIN. Hubs, freight rates and delivery
 * countries are managed in Settings and linked from here.
 */
const TABS = [
    { id: 'invoices', icon: <FileText size={15} /> },
    { id: 'credit', icon: <CreditCard size={15} /> },
    { id: 'tax', icon: <ShieldCheck size={15} /> },
    { id: 'warehouses', icon: <Warehouse size={15} /> },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function FinanceWorkspace() {
    return <ConfirmProvider><Workspace /></ConfirmProvider>;
}

function Workspace() {
    const tf = useTf();
    const { user } = useAuth();
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const raw = params.get('tab') || '';
    const tab: TabId = TABS.some((x) => x.id === raw) ? (raw as TabId) : 'invoices';
    const canWrite = isOwnerAdmin(user?.role);
    const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
    const select = (id: TabId) => router.replace(`${pathname}?tab=${id}`, { scroll: false });
    const onKey = (e: React.KeyboardEvent, i: number) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const rtl = document.documentElement.dir === 'rtl';
        const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
        const next = TABS[(i + step + TABS.length) % TABS.length].id;
        select(next); refs.current[next]?.focus();
    };
    const links = [
        { href: '/admin/settings?section=countries', key: 'linkCountries', icon: <Globe2 size={14} /> },
        { href: '/admin/settings?section=hubs', key: 'linkHubs', icon: <MapPin size={14} /> },
        { href: '/admin/settings?section=freight', key: 'linkFreight', icon: <Route size={14} /> },
    ];

    return (
        <div data-no-translate className="text-start">
            <PageHeader title={tf('title')} description={tf('subtitle')} />
            <nav aria-label={tf('logisticsAria')} className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-ink-3">{tf('logisticsLinks')}</span>
                {links.map((l) => (
                    <Link key={l.href} href={l.href} className="h-8 inline-flex items-center gap-1.5 rounded-lg px-2.5 font-medium text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                        <span aria-hidden className="text-ink-4">{l.icon}</span>{tf(l.key)}<ChevronRight size={13} aria-hidden className="text-ink-4 rtl:rotate-180" />
                    </Link>
                ))}
            </nav>
            <div role="tablist" aria-label={tf('tabsAria')} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
                {TABS.map((x, i) => (
                    <button key={x.id} ref={(el) => { refs.current[x.id] = el; }} type="button" role="tab" id={`fin-tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`fin-panel-${x.id}`} tabIndex={tab === x.id ? 0 : -1}
                        onClick={() => select(x.id)} onKeyDown={(e) => onKey(e, i)}
                        className={cn('h-10 px-3 -mb-px inline-flex items-center gap-2 border-b-2 text-[13.5px] font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded-t-lg',
                            tab === x.id ? 'border-teal text-teal' : 'border-transparent text-ink-3 hover:text-ink')}>
                        <span aria-hidden>{x.icon}</span>{tf(`tab_${x.id}`)}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`fin-panel-${tab}`} aria-labelledby={`fin-tab-${tab}`}>
                {tab === 'invoices' && <InvoicesPanel canWrite={canWrite} />}
                {tab === 'credit' && <CreditTermsPanel canWrite={canWrite} />}
                {tab === 'tax' && <TaxExemptionsPanel canWrite={canWrite} />}
                {tab === 'warehouses' && <DispatchLocationsPanel canWrite={canWrite} />}
            </div>
        </div>
    );
}
