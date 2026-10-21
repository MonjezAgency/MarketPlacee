'use client';

/**
 * Admin → Offers → Supplier offers (/admin/offers/supplier): wholesale offers that
 * suppliers submit, reviewed by Atlantis (backend Offer, backend/src/offers).
 * Filters live in the URL (status, q, source, id). Atlantis special offers are a
 * separate page (/admin/offers/special).
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { PageHeader } from '@/components/supplier/ui';
import SupplierOffersReview, {
    SOURCE_FILTERS, STATUS_FILTERS, type SourceFilter, type StatusFilter,
} from '@/components/admin/offers/SupplierOffersReview';

const BASE = '/admin/offers/supplier';

export default function SupplierOffersPage() {
    return <React.Suspense fallback={null}><Page /></React.Suspense>;
}

function Page() {
    const router = useRouter();
    const params = useSearchParams();
    const { t } = useLanguage();
    const tl = React.useCallback((k: string, v?: Record<string, string | number>) => t('adminOffers', k, v), [t]);

    const focusId = params.get('id');
    const rawStatus = (params.get('status') || '').toUpperCase();
    // Opening one offer by id shows it whatever its status.
    const status: StatusFilter = (STATUS_FILTERS as string[]).includes(rawStatus) ? (rawStatus as StatusFilter) : focusId ? 'ALL' : 'PENDING';
    const rawSource = params.get('source') || '';
    const source: SourceFilter = (SOURCE_FILTERS as string[]).includes(rawSource) ? (rawSource as SourceFilter) : 'all';
    const q = params.get('q') || '';

    const paramsRef = React.useRef(params);
    paramsRef.current = params;
    const onChange = React.useCallback((patch: { status?: StatusFilter; q?: string; source?: SourceFilter; id?: null }) => {
        const u = new URLSearchParams(paramsRef.current.toString());
        if (patch.status !== undefined) { if (patch.status === 'PENDING') u.delete('status'); else u.set('status', patch.status); }
        if (patch.q !== undefined) { if (patch.q) u.set('q', patch.q); else u.delete('q'); }
        if (patch.source !== undefined) { if (patch.source === 'all') u.delete('source'); else u.set('source', patch.source); }
        if (patch.id === null) u.delete('id');
        const qs = u.toString();
        router.replace(qs ? `${BASE}?${qs}` : BASE, { scroll: false });
    }, [router]);

    return (
        <div data-no-translate className="text-start -mt-2">
            <PageHeader title={tl('tabSupplier')} description={tl('supplierLead')} />
            <SupplierOffersReview status={status} q={q} source={source} focusId={focusId} onChange={onChange} onPendingCount={() => {}} />
        </div>
    );
}
