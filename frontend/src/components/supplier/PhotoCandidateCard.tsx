'use client';

import * as React from 'react';
import { Check, CheckCircle2, ExternalLink, X } from 'lucide-react';
import type { DiscoveryCandidate } from '@/lib/supplier-api';
import { Badge, Button } from '@/components/supplier/ui';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscoveryReason } from '@/components/supplier/ImageDiscoveryPanel';

const GOOD = new Set(['name_matches', 'brand_matches', 'size_matches']);
/** Score lines the server sends (backend image-quality.ts); each has a `score_<key>` text. */
const SCORE_KEYS = new Set(['barcode_exact', 'name_matches', 'brand_matches', 'size_matches', 'identity_unconfirmed', 'background_white', 'background_neutral',
    'background_busy', 'background_unchecked', 'not_cropped', 'tight_crop', 'cropped', 'product_small', 'resolution_high', 'resolution_ok', 'resolution_low',
    'resolution_unknown', 'kind_front', 'kind_packaging', 'license_cc_by_sa']);

/** The tier badge: how the photo ranks for the main product photo. */
export function TierBadge({ c }: { c: DiscoveryCandidate }) {
    const { t } = useLanguage();
    const tp = (k: string) => t('productPhotos', k);
    if (c.tier === undefined) return null;
    if (c.tier === null) return <Badge tone="warning">{tp('tierNone')}</Badge>;
    return <Badge tone={c.tier === 1 ? 'success' : c.tier === 2 ? 'info' : 'neutral'}>{tp(`tier${c.tier}`)}</Badge>;
}

/**
 * One photo found by barcode: the picture on white (never stretched), how it
 * ranks and why, what the database record says, its source and licence, and
 * the actions. An unconfirmed match needs a tick before it can be used.
 */
export default function PhotoCandidateCard({ c, barcode, busy, canApply, onUse, onDismiss, dismissLabel }: {
    c: DiscoveryCandidate; barcode: string; busy: string | null; canApply: boolean;
    onUse: (c: DiscoveryCandidate) => void; onDismiss: (c: DiscoveryCandidate) => void; dismissLabel: string;
}) {
    const { t, fmt } = useLanguage();
    const ti = (k: string, v?: Record<string, string | number>) => t('imageDiscovery', k, v);
    const tp = (k: string, v?: Record<string, string | number>) => t('productPhotos', k, v);
    const reason = useDiscoveryReason();
    const [ticked, setTicked] = React.useState(false);
    const needsTick = c.confidence !== 'verified';
    const lines = (c.breakdown || []).filter((l) => SCORE_KEYS.has(l.key));

    return (
        <li className="rounded-lg ring-1 ring-line overflow-hidden flex flex-col">
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="relative aspect-square bg-white flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.previewUrl} alt={ti('altFound', { barcode })} className="max-w-[90%] max-h-[90%] object-contain" referrerPolicy="no-referrer" loading="lazy" />
                <span className="absolute top-1.5 start-1.5 flex flex-wrap gap-1">
                    <Badge>{c.kind === 'front' ? ti('kindFront') : c.kind === 'packaging' ? ti('kindPackaging') : ti('kindPhoto')}{c.language ? <> · <bdi dir="ltr">{String(c.language).toUpperCase()}</bdi></> : null}</Badge>
                    {c.role === 'primary' && <Badge tone="success">{tp('rolePrimary')}</Badge>}
                    {c.role === 'gallery' && <Badge>{tp('roleGallery')}</Badge>}
                </span>
            </a>
            <div className="p-3 border-t border-line text-[12.5px] space-y-1.5 flex-1">
                <div className="flex flex-wrap gap-1">
                    {c.confidence === 'verified' ? <Badge tone="success"><CheckCircle2 size={12} />{ti('verified')}</Badge> : <Badge tone="warning">{ti('check')}</Badge>}
                    <TierBadge c={c} />
                </div>
                <ul className="space-y-0.5">
                    {c.reasons.map((r) => { const txt = reason(r); return txt ? <li key={r} className={GOOD.has(r) ? 'text-emerald-700' : 'text-amber-800'}>{txt}</li> : null; })}
                </ul>
                <p className="text-ink-2"><span className="text-ink-3">{ti('inDatabase')}</span> <bdi>{[c.brand, c.productName || ti('noName'), c.quantity].filter(Boolean).join(' · ')}</bdi></p>
                {c.width && c.height ? <p className="text-ink-3 tabular-nums">{ti('size', { width: fmt.number(c.width), height: fmt.number(c.height) })}</p> : null}
                <p className="text-ink-3"><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline inline-flex items-center gap-0.5">{c.source} <ExternalLink size={11} /></a> · <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.license}</a></p>
                {lines.length > 0 && (
                    <details className="text-ink-3">
                        <summary className="cursor-pointer text-ink-2 hover:text-ink">{tp('whyTitle')}{c.score !== undefined ? <> · <span className="tabular-nums">{tp('scoreTotal', { score: fmt.number(c.score) })}</span></> : null}</summary>
                        <ul className="mt-1 space-y-0.5">
                            {lines.map((l) => (
                                <li key={l.key} className="flex justify-between gap-2">
                                    <span>{tp(`score_${l.key}`)}</span>
                                    <span className={`tabular-nums ${l.points > 0 ? 'text-emerald-700' : l.points < 0 ? 'text-amber-800' : ''}`}><bdi dir="ltr">{l.points > 0 ? '+' : ''}{fmt.number(l.points)}</bdi></span>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
                {needsTick && canApply && (
                    <label className="flex items-start gap-2 pt-1 text-ink-2 cursor-pointer">
                        <input type="checkbox" className="mt-0.5 accent-[#0E7C74]" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
                        <span>{ti('confirmCheck')}</span>
                    </label>
                )}
            </div>
            {canApply && (
                <div className="flex flex-wrap gap-2 p-3 pt-0">
                    <Button size="sm" variant="primary" icon={<Check size={13} />} loading={busy === c.url} disabled={!!busy || (needsTick && !ticked)} onClick={() => onUse(c)}>{ti('useThisPhoto')}</Button>
                    <Button size="sm" variant="secondary" icon={<X size={13} />} loading={busy === `x${c.url}`} disabled={!!busy} onClick={() => onDismiss(c)}>{dismissLabel}</Button>
                </div>
            )}
        </li>
    );
}
