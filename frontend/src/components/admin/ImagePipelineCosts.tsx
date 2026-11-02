'use client';

import * as React from 'react';
import { adminApi, type PipelineCosts } from '@/lib/admin-api';
import { useLanguage } from '@/contexts/LanguageContext';

/** This month's web searches and today's vision checks, against their free limits. */
export default function ImagePipelineCosts() {
    const { t, fmt } = useLanguage();
    const tu = (k: string, v?: Record<string, string | number>) => t('imageUpload', k, v);
    const [c, setC] = React.useState<PipelineCosts | null>(null);
    React.useEffect(() => { adminApi.pipelineCosts().then(setC).catch(() => setC(null)); }, []);
    if (!c) return null;
    const rows: [string, { used: number; cap: number }][] = [[tu('costSerper'), c.serper], [tu('costVision'), c.vision]];
    return (
        <section aria-label={tu('costTitle')} className="rounded-xl ring-1 ring-line px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13px]">
            <h2 className="font-medium text-ink">{tu('costTitle')}</h2>
            {rows.map(([label, v]) => <p key={label} className="text-ink-2">{label}: <span className="font-medium tabular-nums text-ink">{tu('costOf', { used: fmt.number(v.used), cap: fmt.number(v.cap) })}</span></p>)}
            {!c.enabled && <p className="text-ink-3">{tu('costOff')}</p>}
        </section>
    );
}
