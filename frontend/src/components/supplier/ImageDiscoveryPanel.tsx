'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Check, CheckCircle2, ExternalLink, Loader2, RefreshCw, ScanBarcode, Upload, X } from 'lucide-react';
import { supplierApi, type DiscoveryCandidate, type ImageDiscovery, type SupplierProduct } from '@/lib/supplier-api';
import { Badge, Button, Notice } from '@/components/supplier/ui';
import { digitsOnly, gtinProblem } from '@/lib/catalog-rules';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

/** Reason codes the server sends (backend import-enrichment / image-discovery); each has a `reason_<code>` text. */
const REASONS = new Set(['not_in_database', 'no_photo', 'source_unavailable', 'invalid_barcode', 'internal_code', 'variable_measure', 'dismissed',
    'name_matches', 'brand_matches', 'size_matches', 'barcode_differs', 'name_differs', 'brand_differs', 'size_differs', 'nothing_to_compare',
    'kind_unknown', 'second_source_needed', 'case_code', 'low_resolution']);
const GOOD = new Set(['name_matches', 'brand_matches', 'size_matches']);

/** Translated reason text, or null for a code this version doesn't know. */
export function useDiscoveryReason() {
    const { t } = useLanguage();
    return React.useCallback((code: string) => (REASONS.has(code) ? t('imageDiscovery', `reason_${code}`) : null), [t]);
}

/** Keeps a "searching" state fresh: asks the server every few seconds until it has an answer. */
export function useDiscoveryState(productId: string | undefined, initial: ImageDiscovery | null | undefined) {
    const [state, setState] = React.useState<ImageDiscovery | null>(initial ?? null);
    React.useEffect(() => { setState(initial ?? null); }, [initial]);
    React.useEffect(() => {
        if (!productId || state?.status !== 'searching') return;
        let stop = false;
        const timer = setInterval(() => {
            supplierApi.imageDiscovery(productId).then((r) => { if (!stop) setState(r.state); }).catch(() => {});
        }, 5000);
        return () => { stop = true; clearInterval(timer); };
    }, [productId, state?.status]);
    return [state, setState] as const;
}

/**
 * Editor panel: the background photo search for this product's saved
 * barcode. Shows "Finding image…", the photos found (each needs the
 * supplier's "Use this photo"; an uncertain match needs a tick first), or
 * why nothing reliable was found, with Search again and Upload. Accepting
 * saves the photo on the server right away (copied, credited); nothing else
 * on the product changes.
 */
export default function ImageDiscoveryPanel({ productId, product, ean, hasImages, onAccepted, onUpload }: {
    productId?: string; product: SupplierProduct | null; ean: string; hasImages: boolean;
    onAccepted: (saved: SupplierProduct) => void; onUpload: () => void;
}) {
    const { t, fmt } = useLanguage();
    const ti = (k: string, v?: Record<string, string | number>) => t('imageDiscovery', k, v);
    const reason = useDiscoveryReason();
    const [state, setState] = useDiscoveryState(productId, product?.imageDiscovery);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [confirmed, setConfirmed] = React.useState<Set<string>>(new Set());
    const [error, setError] = React.useState<string | null>(null);

    if (hasImages) return null;
    const saved = digitsOnly(product?.ean || '');
    const typed = digitsOnly(ean);
    const typedValid = !!typed && !gtinProblem(typed);

    const run = async (key: string, fn: () => Promise<void>) => { // i18n-ignore (type, not text)
        setBusy(key); setError(null);
        try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(null); }
    };
    const retry = () => run('retry', async () => { const r = await supplierApi.retryImageDiscovery(productId!); setState(r.state); toast.success(ti('toastRetry')); });
    const accept = (c: DiscoveryCandidate) => run(c.url, async () => { const p = await supplierApi.acceptDiscoveredImage(productId!, c.url); onAccepted(p); toast.success(ti('toastAccepted')); });
    const dismiss = (c: DiscoveryCandidate) => run(`x${c.url}`, async () => { const r = await supplierApi.dismissDiscoveredImage(productId!, c.url); setState(r.state); });

    const frame = (body: React.ReactNode) => (
        <div className="rounded-xl ring-1 ring-line p-3 space-y-3" aria-live="polite">
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-heading"><ScanBarcode size={16} className="text-teal" />{ti('panelTitle')}</p>
            {body}
            {error && <Notice tone="danger">{error}</Notice>}
        </div>
    );

    // Not saved yet, or no barcode: say what will happen.
    if (!productId || !saved) return frame(<p className="text-[12.5px] text-ink-3">{typedValid ? ti('notSavedYet') : ti('noBarcode')}</p>);
    if (typed && typed !== saved) return frame(<p className="text-[12.5px] text-ink-3">{ti('barcodeChanged')}</p>);

    const checked = state?.checkedAt ? ti('checkedOn', { date: fmt.date(state.checkedAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }) : null;
    const retryBtn = <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={busy === 'retry'} disabled={!!busy} onClick={retry}>{ti('retry')}</Button>;
    const uploadBtn = <Button size="sm" variant="ghost" icon={<Upload size={13} />} onClick={onUpload}>{ti('upload')}</Button>;

    if (!state) {
        return frame(<div className="flex flex-wrap gap-2"><Button size="sm" variant="brand" icon={<ScanBarcode size={13} />} loading={busy === 'retry'} disabled={!!busy} onClick={retry}>{ti('searchNow')}</Button>{uploadBtn}</div>);
    }
    if (state.status === 'searching') {
        return frame(
            <div className="flex items-start gap-2 text-[13px] text-ink-2">
                <Loader2 size={15} className="mt-0.5 animate-spin text-teal shrink-0" aria-hidden />
                <div><p className="font-medium text-ink">{ti('searching')}</p><p className="text-[12.5px] text-ink-3">{ti('searchingBody', { barcode: state.barcode })}</p></div>
            </div>,
        );
    }
    if (state.status !== 'found_review' || !state.candidates.length) {
        const title = state.status === 'invalid_barcode' ? ti('invalidTitle') : state.status === 'unavailable' ? ti('unavailableTitle') : ti('notFoundTitle');
        const why = (state.reasons?.length ? state.reasons : state.reason ? [state.reason] : []).map(reason).filter(Boolean) as string[];
        return frame(<>
            <div className="flex items-start gap-2 text-[13px]">
                <AlertCircle size={15} className="mt-0.5 text-amber-700 shrink-0" aria-hidden />
                <div className="space-y-0.5">
                    <p className="font-medium text-ink">{title}</p>
                    {why.map((w) => <p key={w} className="text-[12.5px] text-ink-2">{w}</p>)}
                    <p className="text-[12.5px] text-ink-3">{ti('uploadInstead')}{checked ? ` · ${checked}` : ''}</p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">{state.status !== 'invalid_barcode' && retryBtn}{uploadBtn}</div>
        </>);
    }

    return frame(<>
        <div>
            <p className="text-[13px] font-medium text-ink">{ti('foundTitle')}</p>
            <p className="text-[12.5px] text-ink-3">{ti('foundBody')}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {state.candidates.map((c) => {
                const needsTick = c.confidence !== 'verified';
                const canUse = !needsTick || confirmed.has(c.url);
                return (
                    <li key={c.url} className="rounded-lg ring-1 ring-line overflow-hidden flex flex-col">
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="relative aspect-square bg-white flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={c.previewUrl} alt={ti('altFound', { barcode: state.barcode })} className="max-w-[90%] max-h-[90%] object-contain" referrerPolicy="no-referrer" loading="lazy" />
                            <span className="absolute top-1.5 start-1.5"><Badge>{c.kind === 'front' ? ti('kindFront') : c.kind === 'packaging' ? ti('kindPackaging') : ti('kindPhoto')}{c.language ? <> · <bdi dir="ltr">{String(c.language).toUpperCase()}</bdi></> : null}</Badge></span>
                        </a>
                        <div className="p-3 border-t border-line text-[12.5px] space-y-1.5 flex-1">
                            {c.confidence === 'verified' ? <Badge tone="success"><CheckCircle2 size={12} />{ti('verified')}</Badge> : <Badge tone="warning">{ti('check')}</Badge>}
                            <ul className="space-y-0.5">
                                {c.reasons.map((r) => { const txt = reason(r); return txt ? <li key={r} className={GOOD.has(r) ? 'text-emerald-700' : 'text-amber-800'}>{txt}</li> : null; })}
                            </ul>
                            <p className="text-ink-2"><span className="text-ink-3">{ti('inDatabase')}</span> <bdi>{[c.brand, c.productName || ti('noName'), c.quantity].filter(Boolean).join(' · ')}</bdi></p>
                            {c.width && c.height ? <p className="text-ink-3 tabular-nums">{ti('size', { width: fmt.number(c.width), height: fmt.number(c.height) })}</p> : null}
                            <p className="text-ink-3"><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline inline-flex items-center gap-0.5">{c.source} <ExternalLink size={11} /></a> · <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.license}</a></p>
                            {needsTick && (
                                <label className="flex items-start gap-2 pt-1 text-ink-2 cursor-pointer">
                                    <input type="checkbox" className="mt-0.5 accent-[#0E7C74]" checked={confirmed.has(c.url)} onChange={(e) => setConfirmed((s) => { const n = new Set(s); if (e.target.checked) n.add(c.url); else n.delete(c.url); return n; })} />
                                    <span>{ti('confirmCheck')}</span>
                                </label>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 p-3 pt-0">
                            <Button size="sm" variant="primary" icon={<Check size={13} />} loading={busy === c.url} disabled={!!busy || !canUse} onClick={() => accept(c)}>{ti('useThisPhoto')}</Button>
                            <Button size="sm" variant="secondary" icon={<X size={13} />} loading={busy === `x${c.url}`} disabled={!!busy} onClick={() => dismiss(c)}>{ti('notMyProduct')}</Button>
                        </div>
                    </li>
                );
            })}
        </ul>
        <p className={cn('text-[12px] text-ink-3')}>{ti('licenseNote', { license: state.candidates[0].license })}{checked ? ` · ${checked}` : ''}</p>
        <div className="flex flex-wrap gap-2">{retryBtn}{uploadBtn}</div>
    </>);
}
