'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Notice } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

/** Text from the adminSettings dictionary. */
export function useTs() {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminSettings', k, v), [t]);
}

/**
 * Roles the backend accepts per endpoint (RolesGuard; OWNER passes every check).
 * The UI only hides what the server would refuse; the server stays the authority.
 */
export type Access = 'none' | 'view' | 'edit';
const STAFF = ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];
export function sectionAccess(section: string, role: string | undefined | null): Access {
    const r = String(role || '').toUpperCase();
    const ownerAdmin = r === 'OWNER' || r === 'ADMIN';
    switch (section) {
        case 'profile':
        case 'password':
            return STAFF.includes(r) ? 'edit' : 'none';
        // admin/config (app-config.controller.ts): OWNER, ADMIN, MODERATOR, EDITOR
        case 'pricing':
        case 'display':
            return ownerAdmin || r === 'MODERATOR' || r === 'EDITOR' ? 'edit' : 'none';
        // admin/delivery-policy: OWNER, ADMIN
        case 'countries':
            return ownerAdmin ? 'edit' : 'none';
        // fulfillment/admin: list ADMIN/OWNER/LOGISTICS, hubs write ADMIN/OWNER
        case 'hubs':
            return ownerAdmin ? 'edit' : r === 'LOGISTICS' ? 'view' : 'none';
        // fulfillment/admin rates write: ADMIN/OWNER/LOGISTICS
        case 'freight':
            return ownerAdmin || r === 'LOGISTICS' ? 'edit' : 'none';
        default:
            return 'none';
    }
}

/** Header shared by every settings section: title, what it controls, optional actions. */
export function SectionHead({ id, title, lead, actions }: { id: string; title: string; lead: React.ReactNode; actions?: React.ReactNode }) {
    return (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-4 mb-4 border-b border-line">
            <div className="min-w-0">
                <h2 id={id} className="font-sans text-[18px] leading-7 font-semibold text-heading">{title}</h2>
                <div className="mt-1 text-[13.5px] text-ink-3 max-w-[72ch]">{lead}</div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </header>
    );
}

/** Shown instead of a section the signed-in role can't open (no request is made). */
export function NoAccess({ roles }: { roles: string }) {
    const ts = useTs();
    return (
        <div className="flex items-start gap-3 rounded-lg bg-surface-2 ring-1 ring-line px-4 py-3 text-[13.5px] text-ink-2">
            <Lock size={16} className="mt-0.5 shrink-0 text-ink-3" />
            <p>{ts('noAccess', { roles })}</p>
        </div>
    );
}

/** Save result line under a form, announced politely. */
export function SaveStatus({ state }: { state: { tone: 'success' | 'danger'; text: string } | null }) {
    return (
        <div aria-live="polite" className="min-h-0">
            {state && <div className="mt-3"><Notice tone={state.tone}>{state.text}</Notice></div>}
        </div>
    );
}

/** Footer row of a section form: dirty hint + actions, right-aligned. */
export function FormFooter({ dirty, children }: { dirty: boolean; children: React.ReactNode }) {
    const ts = useTs();
    return (
        <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-end gap-3">
            <p className={cn('me-auto text-[12.5px]', dirty ? 'text-amber-800' : 'text-ink-3')}>{dirty ? ts('unsaved') : ts('allSaved')}</p>
            {children}
        </div>
    );
}

/** Localized country name from an ISO code (falls back to the given name or the code). */
export function useCountryName() {
    const { meta } = useLanguage();
    return React.useMemo(() => {
        let dn: Intl.DisplayNames | null = null;
        try { dn = new Intl.DisplayNames([meta.intl], { type: 'region' }); } catch { dn = null; }
        return (code: string, fallback?: string) => {
            try { return dn?.of(code.toUpperCase()) || fallback || code; } catch { return fallback || code; }
        };
    }, [meta.intl]);
}

/** Reads an error body into a message (Nest bodies, arrays included). */
export async function readError(res: Response, fallback: string) {
    // 5xx bodies can carry internal details (e.g. database errors): show the plain message instead.
    if (res.status >= 500) return fallback;
    const body = await res.json().catch(() => null);
    const m = body?.message;
    if (Array.isArray(m)) return m.join(' ');
    if (typeof m === 'string' && m) return m;
    return fallback;
}
