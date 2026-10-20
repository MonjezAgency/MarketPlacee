'use client';

import * as React from 'react';
import Link from 'next/link';
import ProductEditorForm from '@/components/products/ProductEditorForm';
import { adminApi } from '@/lib/admin-api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, ErrorState, Notice, Skeleton } from '@/components/supplier/ui';

/**
 * Admin → Edit product — Atlantis Catalog products only. A supplier's product
 * is reviewed, never edited by Atlantis (the API refuses it with SUPPLIER_OWNED);
 * this page says so and links to the review view instead of showing a form
 * whose save would fail.
 */
export default function AdminEditProductPage({ params }: { params: { id: string } }) {
    const { t } = useLanguage();
    const tp = (k: string) => t('adminProducts', k);
    const [scope, setScope] = React.useState<'catalog' | 'submissions' | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    React.useEffect(() => { adminApi.review(params.id).then((r) => setScope(r.scope)).catch((e) => setError(e.message)); }, [params.id]);

    if (error) return <ErrorState message={error} />;
    if (!scope) return <div className="space-y-3"><Skeleton className="h-9 w-72" /><Skeleton className="h-64" /></div>;
    if (scope === 'submissions') {
        return (
            <div className="max-w-[640px] text-start" data-no-translate>
                <Notice tone="info" title={tp('editBlockedTitle')} action={<Link href={`/admin/products/${params.id}`}><Button variant="primary">{tp('openReview')}</Button></Link>}>
                    {tp('editBlockedBody')}
                </Notice>
            </div>
        );
    }
    return <ProductEditorForm productId={params.id} mode="admin" backHref={`/admin/products/${params.id}`} />;
}
