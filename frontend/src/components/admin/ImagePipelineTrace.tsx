'use client';

import * as React from 'react';
import { Button, Card } from '@/components/supplier/ui';
import { adminApi, type PipelineRun } from '@/lib/admin-api';
import { useLanguage } from '@/contexts/LanguageContext';

/** For debugging: every source asked, every candidate and every check on this product's picture. */
export default function ImagePipelineTrace({ productId }: { productId: string }) {
    const { t } = useLanguage();
    const tu = (k: string, v?: Record<string, string | number>) => t('imageUpload', k, v);
    const [runs, setRuns] = React.useState<PipelineRun[] | null>(null);
    const [open, setOpen] = React.useState(false);
    React.useEffect(() => { adminApi.pipelineTrace(productId).then(setRuns).catch(() => setRuns([])); }, [productId]);
    if (!runs?.length) return null;
    return (
        <Card title={tu('traceTitle')} description={tu('traceDesc')}>
            {runs.map((r) => <p key={r.id} className="text-[13px] text-ink-2" data-no-translate>{tu('traceRun', { outcome: r.outcome ?? r.state, image: r.imageState ?? '—', vision: r.visionCalls, searches: r.searches })}</p>)}
            <Button size="sm" className="mt-2" onClick={() => setOpen((v) => !v)}>{tu(open ? 'traceHide' : 'traceShow')}</Button>
            {open && <pre dir="ltr" className="mt-2 max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 text-[11.5px] leading-relaxed" data-no-translate>{JSON.stringify(runs.map((r) => ({ detail: r.detail, trace: r.trace })), null, 2)}</pre>}
        </Card>
    );
}
