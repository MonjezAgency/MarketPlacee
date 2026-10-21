'use client';

import * as React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, type Tone } from '@/components/supplier/ui';
import type { CampaignStatus, ContactKind, ContactRow } from '@/lib/admin-newsletter-api';

/** Text from the adminNewsletter section. */
export function useTn() {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminNewsletter', k, v), [t]);
}
export type Tn = ReturnType<typeof useTn>;

export function useWhen() {
    const { fmt } = useLanguage();
    return React.useCallback((iso: string | null | undefined) => (iso ? fmt.date(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null), [fmt]);
}
export function useInt() {
    const { fmt } = useLanguage();
    return React.useCallback((n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n)), [fmt]);
}

/** Sendable / not sendable, with the reason in words (never colour alone). */
export function EligibilityBadge({ row }: { row: Pick<ContactRow, 'eligible' | 'reason' | 'basis'> }) {
    const tn = useTn();
    if (row.eligible) return <Badge tone="success" dot>{tn('sendable')}</Badge>;
    const tone: Tone = row.reason === 'UNSUBSCRIBED' || row.reason === 'BLOCKED' || row.reason === 'BOUNCED' || row.reason === 'COMPLAINED' ? 'danger' : row.reason === 'PENDING_CONFIRMATION' ? 'info' : 'warning';
    return <Badge tone={tone} dot>{tn(`reason_${row.reason || 'NO_CONSENT'}`)}</Badge>;
}

const KIND_TONE: Record<ContactKind, Tone> = { ACCOUNT: 'brand', SIGNUP: 'info', MANUAL: 'neutral', IMPORTED: 'neutral', UNKNOWN: 'neutral' };
export function KindBadge({ kind }: { kind: ContactKind }) {
    const tn = useTn();
    return <Badge tone={KIND_TONE[kind] ?? 'neutral'}>{tn(`kind_${kind}`)}</Badge>;
}

const CAMPAIGN_TONE: Record<CampaignStatus, Tone> = { DRAFT: 'neutral', SENDING: 'info', SENT: 'success', PARTIAL: 'warning', FAILED: 'danger' };
export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
    const tn = useTn();
    return <Badge tone={CAMPAIGN_TONE[status] ?? 'neutral'} dot>{tn(`cstatus_${status}`)}</Badge>;
}
