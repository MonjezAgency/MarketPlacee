'use client';

/**
 * Admin → Offers (/admin/offers). One page, two tabs that are never merged:
 *   ?tab=supplier (default) — wholesale offers suppliers submit, reviewed here
 *                             (backend Offer, backend/src/offers)
 *   ?tab=special            — Atlantis special offers (backend Promotion; % off the
 *                             supplier net price, buyer price follows the markup, UTC)
 * The supplier tab keeps its filters in the URL too (status, q, source, id).
 * /admin/wholesale-offers and /admin/promotions redirect here.
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { PageHeader } from '@/components/supplier/ui';
import PromotionsManager from '@/components/promotions/PromotionsManager';
import SupplierOffersReview, {
    SOURCE_FILTERS, STATUS_FILTERS, type SourceFilter, type StatusFilter,
} from '@/components/admin/offers/SupplierOffersReview';

type Tab = 'supplier' | 'special';
const TABS: Tab[] = ['supplier', 'special'];
const TAB_KEY: Record<Tab, string> = { supplier: 'tabSupplier', special: 'tabSpecial' };

export default function AdminOffersPage() {
    return <React.Suspense fallback={null}><OffersPage /></React.Suspense>;
}

function OffersPage() {
    const router = useRouter();
    const params = useSearchParams();
    const { t, fmt } = useLanguage();
    const tl = React.useCallback((k: string, v?: Record<string, string | number>) => t('adminOffers', k, v), [t]);

    const tab: Tab = params.get('tab') === 'special' ? 'special' : 'supplier';
    const focusId = params.get('id');
    const rawStatus = (params.get('status') || '').toUpperCase();
    // Opening one offer by id shows it whatever its status.
    const status: StatusFilter = (STATUS_FILTERS as string[]).includes(rawStatus) ? (rawStatus as StatusFilter) : focusId ? 'ALL' : 'PENDING';
    const rawSource = params.get('source') || '';
    const source: SourceFilter = (SOURCE_FILTERS as string[]).includes(rawSource) ? (rawSource as SourceFilter) : 'all';
    const q = params.get('q') || '';
    const [pending, setPending] = React.useState<number | null>(null);

    const paramsRef = React.useRef(params);
    paramsRef.current = params;
    const replace = React.useCallback((u: URLSearchParams) => {
        const qs = u.toString();
        router.replace(qs ? `/admin/offers?${qs}` : '/admin/offers', { scroll: false });
    }, [router]);

    const selectTab = (next: Tab) => {
        if (next === tab) return;
        // Each tab keeps its own filters; switching starts the other tab clean.
        replace(new URLSearchParams(next === 'special' ? { tab: 'special' } : {}));
    };
    const onSupplierChange = React.useCallback((patch: { status?: StatusFilter; q?: string; source?: SourceFilter; id?: null }) => {
        const u = new URLSearchParams(paramsRef.current.toString());
        u.delete('tab');
        if (patch.status !== undefined) { if (patch.status === 'PENDING') u.delete('status'); else u.set('status', patch.status); }
        if (patch.q !== undefined) { if (patch.q) u.set('q', patch.q); else u.delete('q'); }
        if (patch.source !== undefined) { if (patch.source === 'all') u.delete('source'); else u.set('source', patch.source); }
        if (patch.id === null) u.delete('id');
        replace(u);
    }, [replace]);

    const tabRefs = React.useRef<Record<Tab, HTMLButtonElement | null>>({ supplier: null, special: null });
    const onTabKey = (e: React.KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const i = TABS.indexOf(tab);
        const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
        const fwd = (e.key === 'ArrowRight') !== rtl;
        const next = e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : TABS[(i + (fwd ? 1 : TABS.length - 1)) % TABS.length];
        selectTab(next);
        tabRefs.current[next]?.focus();
    };

    return (
        <div data-no-translate className="text-start -mt-2">
            <PageHeader title={tl('title')} description={tl('subtitle')} />

            <div role="tablist" aria-label={tl('tabsAria')} onKeyDown={onTabKey} className="flex gap-5 border-b border-line mb-4">
                {TABS.map((k) => (
                    <button key={k} ref={(el) => { tabRefs.current[k] = el; }} type="button" role="tab" id={`offers-tab-${k}`}
                        aria-selected={tab === k} aria-controls={`offers-panel-${k}`} tabIndex={tab === k ? 0 : -1} onClick={() => selectTab(k)}
                        className={cn('-mb-px inline-flex items-center gap-2 h-10 border-b-2 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded-t',
                            tab === k ? 'border-teal text-heading' : 'border-transparent text-ink-3 hover:text-ink')}>
                        {tl(TAB_KEY[k])}
                        {k === 'supplier' && pending !== null && pending > 0 && (
                            <>
                                <span aria-hidden className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 text-[11.5px] font-semibold tabular-nums inline-flex items-center justify-center">{fmt.number(pending)}</span>
                                <span className="sr-only">{tl('pendingSr', { count: pending })}</span>
                            </>
                        )}
                    </button>
                ))}
            </div>

            <div role="tabpanel" id={`offers-panel-${tab}`} aria-labelledby={`offers-tab-${tab}`}>
                {tab === 'supplier' ? (
                    <SupplierOffersReview status={status} q={q} source={source} focusId={focusId} onChange={onSupplierChange} onPendingCount={setPending} />
                ) : (
                    <PromotionsManager mode="admin" embedded />
                )}
            </div>
        </div>
    );
}
