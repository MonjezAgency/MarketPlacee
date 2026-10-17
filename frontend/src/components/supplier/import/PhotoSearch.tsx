'use client';

import * as React from 'react';
import { CheckCircle2, ExternalLink, ImageIcon, Search } from 'lucide-react';
import { Badge, Button, Card, Notice } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { digitsOnly, gtinProblem } from '@/lib/catalog-rules';
import type { PhotoResult, Review, ReviewRow } from './types';
import { useDiscoveryReason } from '@/components/supplier/ImageDiscoveryPanel';

export interface PhotoSearchState {
    jobId: string | null;
    running: boolean;
    total: number;
    completed: number;
    etaSeconds: number;
    results: Map<string, PhotoResult>;
    error: string | null;
}
export const emptyPhotoSearch = (): PhotoSearchState => ({ jobId: null, running: false, total: 0, completed: 0, etaSeconds: 0, results: new Map(), error: null });

/** Rows that can use a photo from the search: no photo of their own, a valid barcode, and something will be imported. */
export const photoCandidates = (rows: ReviewRow[], updateExisting = false) => rows.filter((r) => (r.imageStatus === 'missing' || r.imageStatus === 'from_lookup') && r.state !== 'error'
    && (r.action !== 'none' || (updateExisting && !!r.existing && !r.existing.hasPhoto)) && r.ean && !gtinProblem(digitsOnly(r.ean)));

/** The optional "find photos by barcode" panel shown above the review table. */
export function PhotoSearchPanel({ review, state, picks, onStart, updateExisting }: { review: Review; state: PhotoSearchState; picks: Map<string, PhotoResult>; onStart: () => void; updateExisting: boolean }) {
    const { t, fmt } = useLanguage();
    const ti = (k: string, v?: Record<string, string | number>) => t('catalogImport', k, v);
    const eligible = photoCandidates(review.rows, updateExisting).length;
    const missing = review.rows.filter((r) => r.imageStatus === 'missing' && r.action !== 'none').length;
    if (!eligible && !state.results.size) return null;
    const res = Array.from(state.results.values());
    const n = (s: PhotoResult['status']) => res.filter((r) => r.status === s).length;
    const minutes = Math.max(1, Math.ceil(state.etaSeconds / 60));
    return (
        <Card title={ti('photoTitle')} description={ti('photoDesc')}
            actions={!state.running && !state.jobId ? <Button size="sm" variant="secondary" icon={<Search size={14} />} onClick={onStart} disabled={!eligible}>{ti('photoStart', { count: eligible })}</Button> : undefined}>
            <ul className="text-[12.5px] text-ink-3 space-y-1 list-disc ps-4">
                <li>{ti('photoHow1')}</li>
                <li>{ti('photoHow2')}</li>
                <li>{ti('photoHow3')}</li>
            </ul>
            {!state.jobId && missing > eligible && <p className="mt-2 text-[12.5px] text-ink-3">{ti('photoNotEligible', { count: missing - eligible })}</p>}
            {state.running && (
                <div className="mt-3">
                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.completed} aria-label={ti('photoProgressAria')}>
                        <div className="h-full bg-teal transition-all" style={{ width: `${state.total ? Math.round((state.completed / state.total) * 100) : 0}%` }} />
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-ink-3 tabular-nums">{ti('photoProgress', { done: fmt.number(state.completed), count: state.total })}{state.etaSeconds > 30 ? ` · ${ti('photoEta', { count: minutes })}` : ''} · {ti('photoKeepGoing')}</p>
                </div>
            )}
            {state.jobId && !state.running && (
                <p className="mt-3 text-[13px] text-ink-2">{ti('photoDone', { verified: fmt.number(n('verified')), check: fmt.number(n('needs_confirmation')), none: fmt.number(n('not_found') + n('invalid_barcode')), unavailable: fmt.number(n('unavailable')), selected: fmt.number(picks.size) })}</p>
            )}
            {state.error && <div className="mt-3"><Notice tone="warning">{ti('photoFailed')} <span className="block text-[12px] text-ink-3">{state.error}</span></Notice></div>}
        </Card>
    );
}

const REASON_KEY: Record<string, string> = {
    name_matches: 'whyNameMatches', brand_matches: 'whyBrandMatches', size_matches: 'whySizeMatches',
    barcode_differs: 'whyBarcodeDiffers', name_differs: 'whyNameDiffers', brand_differs: 'whyBrandDiffers', size_differs: 'whySizeDiffers',
    nothing_to_compare: 'whyNothingToCompare', second_source_needed: 'whySecondSource', kind_unknown: 'whyKindUnknown',
    no_photo: 'whyNoPhoto', not_in_database: 'whyNotInDatabase', source_unavailable: 'whyUnavailable', invalid_barcode: 'whyInvalidBarcode',
};

/** Thumbnail cell: the candidate photo with its match level, when there's no photo from the file. */
export function PhotoThumb({ result, picked }: { result?: PhotoResult; picked: boolean }) {
    const { t } = useLanguage();
    if (!result?.candidate) return null;
    return (
        <span className={cn('relative w-10 h-10 rounded-lg bg-white ring-2 overflow-hidden flex items-center justify-center', picked ? (result.status === 'verified' ? 'ring-emerald-500' : 'ring-amber-500') : 'ring-line opacity-60')}
            title={picked ? t('catalogImport', 'photoPickedTitle', { source: result.candidate.source }) : t('catalogImport', 'photoNotPickedTitle')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.candidate.previewUrl} alt="" className="max-w-full max-h-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
        </span>
    );
}

/** In the opened row: the photo, why it is (or isn't) a match, its source and licence, and the choice. */
export function PhotoChoice({ result, picked, onToggle, ownPhoto }: { result?: PhotoResult; picked: boolean; onToggle: (on: boolean) => void; ownPhoto: boolean }) {
    const { t } = useLanguage();
    const more = useDiscoveryReason(); // newer reason codes (case code, store-internal code, low resolution)
    const ti = (k: string, v?: Record<string, string | number>) => t('catalogImport', k, v);
    if (!result || ownPhoto) return null;
    const c = result.candidate;
    return (
        <div className="rounded-lg ring-1 ring-line p-2.5 space-y-2">
            <p className="text-[12px] font-semibold text-heading flex items-center gap-1.5"><ImageIcon size={13} />{ti('photoFromSearch')}</p>
            {c ? (<>
                <div className="flex gap-2.5">
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="w-24 h-24 shrink-0 rounded-lg bg-white ring-1 ring-line flex items-center justify-center overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.previewUrl} alt={c.productName || ''} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                    </a>
                    <div className="min-w-0 text-[12px] space-y-0.5">
                        <Badge tone={result.status === 'verified' ? 'success' : 'warning'}>{result.status === 'verified' ? <><CheckCircle2 size={12} />{ti('photoVerified')}</> : ti('photoCheck')}</Badge>
                        <p className="text-ink-2"><bdi>{[c.brand, c.productName, c.quantity].filter(Boolean).join(' · ') || '—'}</bdi></p>
                        <p className="text-ink-3"><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">{c.source}<ExternalLink size={11} /></a> · <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.license}</a></p>
                    </div>
                </div>
                <ul className="text-[11.5px] space-y-0.5">{result.reasons.map((r) => <li key={r} className={cn(/differs|second|nothing|unknown|case_code|low_resolution/.test(r) ? 'text-amber-800' : 'text-emerald-700')}>{REASON_KEY[r] ? ti(REASON_KEY[r]) : more(r) || r}</li>)}</ul>
                <label className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                    <input type="checkbox" className="mt-0.5 accent-[#0E7C74]" checked={picked} onChange={(e) => onToggle(e.target.checked)} />
                    <span>{ti('photoUse', { attribution: c.attribution, license: c.license })}</span>
                </label>
            </>) : (
                <p className="text-[12px] text-ink-3">{result.reasons.map((r) => (REASON_KEY[r] ? ti(REASON_KEY[r]) : more(r) || r)).join(' ')}</p>
            )}
        </div>
    );
}
