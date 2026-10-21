'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ConfirmProvider, PageHeader } from '@/components/supplier/ui';
import { ContactsPanel } from './ContactsPanel';
import { CampaignsPanel } from './CampaignsPanel';
import { useTn } from './newsletterUi';

/** Admin → Newsletter Hub (/admin/newsletter): audience (contacts) and campaigns. */
export default function NewsletterHub() {
    return <React.Suspense fallback={null}><ConfirmProvider><Hub /></ConfirmProvider></React.Suspense>;
}

const TABS = ['contacts', 'campaigns'] as const;
type Tab = (typeof TABS)[number];

function Hub() {
    const tn = useTn();
    const router = useRouter();
    const params = useSearchParams();
    const tab: Tab = params.get('tab') === 'campaigns' ? 'campaigns' : 'contacts';
    const go = (t: Tab) => router.replace(t === 'contacts' ? '/admin/newsletter' : '/admin/newsletter?tab=campaigns', { scroll: false });
    const onKey = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        go(tab === 'contacts' ? 'campaigns' : 'contacts');
    };
    return (
        <div className="space-y-4">
            <PageHeader title={tn('title')} description={tn('desc')} />
            <div role="tablist" aria-label={tn('tabsAria')} className="flex gap-4 border-b border-line" onKeyDown={onKey}>
                {TABS.map((t) => (
                    <button key={t} type="button" role="tab" id={`nl-tab-${t}`} aria-selected={tab === t} aria-controls={`nl-panel-${t}`} tabIndex={tab === t ? 0 : -1} onClick={() => go(t)}
                        className={cn('-mb-px h-10 px-1 text-[13.5px] font-medium border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded-t', tab === t ? 'border-teal text-heading' : 'border-transparent text-ink-3 hover:text-ink')}>
                        {tn(`tab_${t}`)}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`nl-panel-${tab}`} aria-labelledby={`nl-tab-${tab}`}>
                {tab === 'contacts' ? <ContactsPanel /> : <CampaignsPanel />}
            </div>
        </div>
    );
}
