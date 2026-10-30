'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, ExternalLink, Images, Loader2, RefreshCw, ScanBarcode, Upload } from 'lucide-react';
import { supplierApi, type DiscoveryCandidate, type ImageDiscovery, type SupplierProduct } from '@/lib/supplier-api';
import { Button, Notice } from '@/components/supplier/ui';
import PhotoCandidateCard from '@/components/supplier/PhotoCandidateCard';
import { digitsOnly, gtinProblem, isRealImage } from '@/lib/catalog-rules';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

/** Reason codes the server sends (backend import-enrichment / image-discovery); each has a `reason_<code>` text. */
const REASONS = new Set(['not_in_database', 'no_photo', 'source_unavailable', 'invalid_barcode', 'internal_code', 'variable_measure', 'dismissed',
    'name_matches', 'brand_matches', 'size_matches', 'barcode_differs', 'name_differs', 'brand_differs', 'size_differs', 'nothing_to_compare',
    'kind_unknown', 'second_source_needed', 'case_code', 'low_resolution']);
/** Codes added with photo ranking (texts in the productPhotos section). */
const RANKING_REASONS = new Set(['record_mismatch', 'variant_differs', 'no_clean_background', 'identity_unconfirmed', 'already_in_gallery']);

/** Translated reason text, or null for a code this version doesn't know. */
export function useDiscoveryReason() {
    const { t } = useLanguage();
    return React.useCallback((code: string) => (REASONS.has(code) ? t('imageDiscovery', `reason_${code}`) : RANKING_REASONS.has(code) ? t('productPhotos', `reason_${code}`) : null), [t]);
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
 * barcode. Shows "Finding image…", the photos found — ranked, the suggested
 * main photo first (exact product on a white background), each with why —
 * or why nothing reliable was found, with Search again and Upload. Each photo
 * needs the supplier's "Use this photo" (an uncertain match needs a tick
 * first); "Use with the gallery photos" adds the other confirmed photos after
 * the main one. A product that has photos can look for more: they are only
 * ever added after the supplier's own. Accepting saves on the server right
 * away (copied, credited); nothing else on the product changes.
 */
export default function ImageDiscoveryPanel({ productId, product, ean, hasImages, onAccepted, onUpload }: {
    productId?: string; product: SupplierProduct | null; ean: string; hasImages: boolean;
    onAccepted: (saved: SupplierProduct) => void; onUpload: () => void;
}) {
    const { t, fmt } = useLanguage();
    const ti = (k: string, v?: Record<string, string | number>) => t('imageDiscovery', k, v);
    const tp = (k: string, v?: Record<string, string | number>) => t('productPhotos', k, v);
    const reason = useDiscoveryReason();
    const [state, setState] = useDiscoveryState(productId, product?.imageDiscovery);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const saved = digitsOnly(product?.ean || '');
    const typed = digitsOnly(ean);
    const typedValid = !!typed && !gtinProblem(typed);
    // With saved photos, only a "look for more" search is shown (found photos go after the supplier's own).
    // While the editor's photos differ from the saved ones (unsaved changes), nothing is offered.
    const savedHasImages = (product?.images || []).some(isRealImage);
    if (productId && hasImages !== savedHasImages) return null;
    const adding = hasImages;
    if (adding && (!productId || !saved || (typed && typed !== saved))) return null;

    const run = async (key: string, fn: () => Promise<void>) => { // i18n-ignore (type, not text)
        setBusy(key); setError(null);
        try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(null); }
    };
    const retry = () => run('retry', async () => { const r = await supplierApi.retryImageDiscovery(productId!); setState(r.state); toast.success(ti('toastRetry')); });
    const whiten = (c: DiscoveryCandidate) => run(`w${c.url}`, async () => { const r = await supplierApi.whitenDiscoveredImage(productId!, c.url); setState(r.state); });
    const accept = (c: DiscoveryCandidate, also: string[] = [], clean = false) => run(also.length ? 'all' : clean ? `c${c.url}` : c.url, async () => {
        const p = await supplierApi.acceptDiscoveredImage(productId!, c.url, also, clean);
        onAccepted(p);
        setState(p.imageDiscovery ?? null);
        toast.success(ti('toastAccepted'));
    });
    const dismiss = (c: DiscoveryCandidate) => run(`x${c.url}`, async () => { const r = await supplierApi.dismissDiscoveredImage(productId!, c.url); setState(r.state); });

    const frame = (body: React.ReactNode) => (
        <div className="rounded-xl ring-1 ring-line p-3 space-y-3" aria-live="polite">
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-heading"><ScanBarcode size={16} className="text-teal" />{adding ? tp('moreTitle') : ti('panelTitle')}</p>
            {body}
            {error && <Notice tone="danger">{error}</Notice>}
        </div>
    );

    // Not saved yet, or no barcode: say what will happen.
    if (!productId || !saved) return frame(<p className="text-[12.5px] text-ink-3">{typedValid ? ti('notSavedYet') : ti('noBarcode')}</p>);
    if (typed && typed !== saved) return frame(<p className="text-[12.5px] text-ink-3">{ti('barcodeChanged')}</p>);

    const checked = state?.checkedAt ? ti('checkedOn', { date: fmt.date(state.checkedAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }) : null;
    const retryBtn = <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={busy === 'retry'} disabled={!!busy} onClick={retry}>{ti('retry')}</Button>;
    const uploadBtn = adding ? null : <Button size="sm" variant="ghost" icon={<Upload size={13} />} onClick={onUpload}>{ti('upload')}</Button>;
    // A "fill" suggestion left over from before the supplier added photos is not shown.
    const st = adding && state?.mode !== 'add' ? null : state;

    if (!st) {
        if (adding) return frame(<><p className="text-[12.5px] text-ink-3">{tp('moreBody')}</p><div><Button size="sm" variant="secondary" icon={<Images size={13} />} loading={busy === 'retry'} disabled={!!busy} onClick={retry}>{tp('moreSearch')}</Button></div></>);
        return frame(<div className="flex flex-wrap gap-2"><Button size="sm" variant="brand" icon={<ScanBarcode size={13} />} loading={busy === 'retry'} disabled={!!busy} onClick={retry}>{ti('searchNow')}</Button>{uploadBtn}</div>);
    }
    if (st.status === 'searching') {
        return frame(
            <div className="flex items-start gap-2 text-[13px] text-ink-2">
                <Loader2 size={15} className="mt-0.5 animate-spin text-teal shrink-0" aria-hidden />
                <div><p className="font-medium text-ink">{ti('searching')}</p><p className="text-[12.5px] text-ink-3">{ti('searchingBody', { barcode: st.barcode })}</p></div>
            </div>,
        );
    }
    if (st.status !== 'found_review' || !st.candidates.length) {
        const title = st.status === 'invalid_barcode' ? ti('invalidTitle') : st.status === 'unavailable' ? ti('unavailableTitle') : ti('notFoundTitle');
        const why = (st.reasons?.length ? st.reasons : st.reason ? [st.reason] : []).filter((r, i, a) => a.indexOf(r) === i).map(reason).filter(Boolean) as string[];
        return frame(<>
            <div className="flex items-start gap-2 text-[13px]">
                <AlertCircle size={15} className="mt-0.5 text-amber-700 shrink-0" aria-hidden />
                <div className="space-y-0.5">
                    <p className="font-medium text-ink">{title}</p>
                    {why.map((w) => <p key={w} className="text-[12.5px] text-ink-2">{w}</p>)}
                    {st.record && (
                        <p className="text-[12.5px] text-ink-3">{tp('recordSays')} <bdi>{[st.record.brand, st.record.productName, st.record.quantity].filter(Boolean).join(' · ') || ti('noName')}</bdi>{' '}
                            <a href={st.record.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline inline-flex items-center gap-0.5">{ti('viewSource')} <ExternalLink size={11} /></a></p>
                    )}
                    {!adding && <p className="text-[12.5px] text-ink-3">{ti('uploadInstead')}{checked ? ` · ${checked}` : ''}</p>}
                </div>
            </div>
            <div className="flex flex-wrap gap-2">{st.status !== 'invalid_barcode' && retryBtn}{uploadBtn}</div>
        </>);
    }

    const primary = st.candidates.find((c) => c.role === 'primary');
    const gallery = st.candidates.filter((c) => c.role === 'gallery' && c.confidence === 'verified').map((c) => c.url);
    const why = (st.reasons || []).map(reason).filter(Boolean) as string[];
    return frame(<>
        <div>
            <p className="text-[13px] font-medium text-ink">{ti('foundTitle')}</p>
            <p className="text-[12.5px] text-ink-3">{adding ? tp('moreFoundBody') : ti('foundBody')}</p>
            {why.map((w) => <p key={w} className="text-[12.5px] text-amber-800">{w}</p>)}
        </div>
        {!adding && primary && primary.confidence === 'verified' && gallery.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2.5">
                <p className="text-[12.5px] text-ink-2 flex-1 min-w-[12rem]">{tp('galleryHint')}</p>
                <Button size="sm" variant="primary" icon={<Images size={13} />} loading={busy === 'all'} disabled={!!busy} onClick={() => accept(primary, gallery)}>{tp('useWithGallery')}</Button>
            </div>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {st.candidates.map((c) => <PhotoCandidateCard key={c.url} c={c} barcode={st.barcode} busy={busy} canApply onUse={(x, clean) => accept(x, [], clean)} onDismiss={dismiss} onWhiten={whiten} dismissLabel={ti('notMyProduct')} />)}
        </ul>
        <p className={cn('text-[12px] text-ink-3')}>{ti('licenseNote', { license: st.candidates[0].license })}{checked ? ` · ${checked}` : ''}</p>
        <div className="flex flex-wrap gap-2">{retryBtn}{uploadBtn}</div>
    </>);
}
