'use client';

import * as React from 'react';
import { MessageSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, Skeleton } from '@/components/supplier/ui';
import { ReviewTrail } from '@/components/products/ReviewTrail';
import type { ReviewEvent } from '@/lib/admin-api';

/**
 * Supplier side of product review: Atlantis feedback and the submission
 * history of one product (GET /products/:id/review-history, own products
 * only). Rendered in the editor at #feedback — the destination of the
 * "needs changes" notification. The current request also appears at the top
 * of the editor; this keeps the full thread after a resubmission clears it.
 */
export default function ReviewFeedback({ productId, refreshKey }: { productId: string; refreshKey?: string | number }) {
    const { t } = useLanguage();
    const tr = (k: string, v?: Record<string, string | number>) => t('productReview', k, v);
    const [events, setEvents] = React.useState<ReviewEvent[] | null>(null);
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => {
        let alive = true;
        setFailed(false);
        apiFetch(`/products/${productId}/review-history`, { cache: 'no-store' })
            .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
            .then((rows) => { if (alive) setEvents(rows); })
            .catch(() => { if (alive) { setEvents([]); setFailed(true); } });
        return () => { alive = false; };
    }, [productId, refreshKey]);
    // Scroll into view when the page is opened from a notification link (#feedback).
    React.useEffect(() => {
        if (!events || typeof window === 'undefined' || window.location.hash !== '#feedback') return;
        // After the editor has laid out (on phones the card sits below the form).
        const h = setTimeout(() => document.getElementById('feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
        return () => clearTimeout(h);
    }, [events]);
    return (
        <Card id="feedback" title={<span className="inline-flex items-center gap-2"><MessageSquare size={15} className="text-teal" />{tr('supplierTitle')}</span>} description={tr('supplierDesc')}>
            {events === null ? <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
                : failed ? <p className="text-[13px] text-ink-3">{tr('loadFailed')}</p>
                : <ReviewTrail events={events} viewer="supplier" compact />}
        </Card>
    );
}
