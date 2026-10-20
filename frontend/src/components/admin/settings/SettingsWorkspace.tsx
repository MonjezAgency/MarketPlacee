'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bot, ChevronRight, Coins, ExternalLink, FileText, Globe2, Image as ImageIcon, KeyRound, Lock, MapPin, Monitor, Route, ShieldAlert, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ConfirmProvider, PageHeader, Skeleton, useConfirm } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { NoAccess, sectionAccess, useTs } from './shared';
import { PasswordSection, ProfileSection } from './AccountSections';
import { DisplaySection, PricingSection } from './MarketplaceSections';
import { DeliveryCountriesSection } from './DeliveryCountriesSection';
import { FreightSection, HubsSection } from './LogisticsSections';

/**
 * Admin → Settings (/admin/settings?section=…). One page, one section at a
 * time, each saved on its own against the endpoint it already used:
 *   profile    PATCH /users/me              password  POST /auth/change-password
 *   pricing    /admin/config/markup         display   /admin/config/currency + default-unit
 *   countries  /admin/delivery-policy       hubs/freight /fulfillment/admin
 * /admin/delivery and /admin/fulfillment redirect here.
 */
export const SECTIONS = ['profile', 'password', 'pricing', 'display', 'countries', 'hubs', 'freight'] as const;
export type SectionId = (typeof SECTIONS)[number];
const GROUPS: { key: string; items: { id: SectionId; icon: React.ReactNode }[] }[] = [
    { key: 'groupAccount', items: [{ id: 'profile', icon: <UserRound size={16} /> }, { id: 'password', icon: <KeyRound size={16} /> }] },
    { key: 'groupMarketplace', items: [{ id: 'pricing', icon: <Coins size={16} /> }, { id: 'display', icon: <Monitor size={16} /> }] },
    { key: 'groupDelivery', items: [{ id: 'countries', icon: <Globe2 size={16} /> }, { id: 'hubs', icon: <MapPin size={16} /> }, { id: 'freight', icon: <Route size={16} /> }] },
];
/** Pages that left the sidebar but still do real work. */
const MORE = [
    { href: '/admin/banners', key: 'moreBanners', icon: <ImageIcon size={15} /> },
    { href: '/admin/terms', key: 'moreTerms', icon: <FileText size={15} /> },
    { href: '/admin/security', key: 'moreSecurity', icon: <ShieldAlert size={15} /> },
    { href: '/admin/ai-agent', key: 'moreAi', icon: <Bot size={15} /> },
];
/** Who the backend allows, in words, for the "no access" notice. */
const ROLES_TEXT: Record<SectionId, string> = { profile: 'rolesStaff', password: 'rolesStaff', pricing: 'rolesConfig', display: 'rolesConfig', countries: 'rolesOwnerAdmin', hubs: 'rolesHubs', freight: 'rolesFreight' };

export default function SettingsWorkspace() {
    return <ConfirmProvider><Workspace /></ConfirmProvider>;
}

function Workspace() {
    const ts = useTs();
    const { user, isAuthReady } = useAuth();
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const confirm = useConfirm();
    const raw = params.get('section') || '';
    const active: SectionId = (SECTIONS as readonly string[]).includes(raw) ? (raw as SectionId) : 'profile';
    const dirtyRef = React.useRef(false);
    const onDirty = React.useCallback((d: boolean) => { dirtyRef.current = d; }, []);
    const tabRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});

    // Leaving the page with unsaved edits asks the browser to confirm.
    React.useEffect(() => {
        const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, []);

    const go = async (id: SectionId, e?: React.MouseEvent) => {
        e?.preventDefault();
        if (id === active) return;
        if (dirtyRef.current && !(await confirm({ title: ts('leaveTitle'), body: ts('leaveBody'), confirm: ts('leaveConfirm'), tone: 'danger' }))) return;
        dirtyRef.current = false;
        router.replace(`${pathname}?section=${id}`, { scroll: false });
    };

    const role = user?.role;
    const access = (id: SectionId) => sectionAccess(id, role);
    const flat = GROUPS.flatMap((g) => g.items);
    const onTabKey = (e: React.KeyboardEvent, id: SectionId) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const rtl = document.documentElement.dir === 'rtl';
        const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
        const i = flat.findIndex((x) => x.id === id);
        const nextId = flat[(i + step + flat.length) % flat.length].id;
        tabRefs.current[nextId]?.focus();
    };

    const navItem = (it: { id: SectionId; icon: React.ReactNode }, compact: boolean) => {
        const on = it.id === active;
        const locked = access(it.id) === 'none';
        return (
            <Link key={it.id} href={`/admin/settings?section=${it.id}`} onClick={(e) => go(it.id, e)} aria-current={on ? 'page' : undefined}
                ref={compact ? (el) => { tabRefs.current[it.id] = el; } : undefined} onKeyDown={compact ? (e) => onTabKey(e, it.id) : undefined}
                className={cn('flex items-center gap-2.5 rounded-lg text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                    compact ? 'h-9 px-3 shrink-0 whitespace-nowrap ring-1 ring-inset' : 'h-9 px-2.5',
                    on ? (compact ? 'bg-teal-soft text-teal ring-teal/30' : 'bg-teal-soft text-teal') : (compact ? 'ring-line text-ink-2 hover:bg-surface-2' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'),
                    locked && !on && 'text-ink-3')}>
                <span aria-hidden className={cn('shrink-0', on ? 'text-teal' : 'text-ink-4')}>{it.icon}</span>
                <span className="min-w-0 truncate">{ts(`nav_${it.id}`)}</span>
                {locked && <Lock size={12} className="ms-auto shrink-0 text-ink-4" aria-label={ts('lockedAria')} />}
            </Link>
        );
    };

    const body = () => {
        if (!isAuthReady) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-48" /><Skeleton className="h-40" /></div>;
        const a = access(active);
        if (a === 'none') return <NoAccess roles={ts(ROLES_TEXT[active])} />;
        switch (active) {
            case 'profile': return <ProfileSection onDirty={onDirty} />;
            case 'password': return <PasswordSection onDirty={onDirty} />;
            case 'pricing': return <PricingSection onDirty={onDirty} />;
            case 'display': return <DisplaySection onDirty={onDirty} />;
            case 'countries': return <DeliveryCountriesSection onDirty={onDirty} />;
            case 'hubs': return <HubsSection access={a} />;
            case 'freight': return <FreightSection access={a} canReadCountries={access('countries') !== 'none'} />;
        }
    };

    return (
        <div data-no-translate className="text-start">
            <PageHeader title={ts('title')} description={ts('subtitle')} />
            {/* Below lg: the sections become a scrollable row of tabs. */}
            <nav aria-label={ts('sectionsAria')} className="lg:hidden -mx-4 px-4 sm:mx-0 sm:px-0 mb-4 overflow-x-auto">
                <div className="flex gap-2 pb-1">{flat.map((it) => navItem(it, true))}</div>
            </nav>
            <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] items-start">
                <aside className="hidden lg:block sticky top-20 space-y-5">
                    <nav aria-label={ts('sectionsAria')} className="space-y-4">
                        {GROUPS.map((g) => (
                            <div key={g.key}>
                                <p className="px-2.5 mb-1 text-[12px] font-medium text-ink-3">{ts(g.key)}</p>
                                <div className="space-y-0.5">{g.items.map((it) => navItem(it, false))}</div>
                            </div>
                        ))}
                    </nav>
                    <MoreLinks />
                </aside>
                <div className="min-w-0 space-y-6">
                    <div className="rounded-xl bg-surface ring-1 ring-line shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 sm:p-5">{body()}</div>
                    <div className="lg:hidden"><MoreLinks /></div>
                </div>
            </div>
        </div>
    );
}

function MoreLinks() {
    const ts = useTs();
    return (
        <nav aria-label={ts('moreAria')}>
            <p className="px-2.5 mb-1 text-[12px] font-medium text-ink-3">{ts('moreTitle')}</p>
            <ul className="space-y-0.5">
                {MORE.map((m) => (
                    <li key={m.href}>
                        <Link href={m.href} className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13.5px] text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                            <span aria-hidden className="text-ink-4">{m.icon}</span>
                            <span className="min-w-0 flex-1 truncate">{ts(m.key)}</span>
                            <ChevronRight size={14} aria-hidden className="text-ink-4 rtl:rotate-180" />
                        </Link>
                    </li>
                ))}
            </ul>
            <p className="mt-2 px-2.5 text-[12px] text-ink-3 flex items-start gap-1.5"><ExternalLink size={12} aria-hidden className="mt-0.5 shrink-0" />{ts('moreHint')}</p>
        </nav>
    );
}
