'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { AlertCircle, Check, ImageOff, Loader2, ScanBarcode } from 'lucide-react';
import { supplierApi, type SupplierProduct } from '@/lib/supplier-api';
import { Button } from '@/components/supplier/ui';
import { isRealImage } from '@/lib/catalog-rules';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscoveryState } from '@/components/supplier/ImageDiscoveryPanel';

/**
 * Product list: for a product without a photo, the state of its background
 * photo search, with a one-click "Use photo" when the best photo found is a
 * verified match (anything uncertain opens the editor to be checked there).
 */
export default function ImageDiscoveryBadge({ product, onAccepted }: { product: SupplierProduct; onAccepted: () => void }) {
    const { t } = useLanguage();
    const ti = (k: string, v?: Record<string, string | number>) => t('imageDiscovery', k, v);
    const [state, setState] = useDiscoveryState(product.id, product.imageDiscovery);
    const [busy, setBusy] = React.useState(false);
    if ((product.images || []).some(isRealImage)) return null;

    const line = (icon: React.ReactNode, text: string, tone = 'text-ink-3') => <span className={`inline-flex items-center gap-1 text-[12px] ${tone}`}>{icon}{text}</span>;
    const find = async () => {
        setBusy(true);
        try { const r = await supplierApi.retryImageDiscovery(product.id); setState(r.state); }
        catch (e: any) { toast.error(e?.message || String(e)); }
        finally { setBusy(false); }
    };
    if (!state) {
        return (
            <span className="inline-flex flex-wrap items-center gap-1.5">
                {line(<ImageOff size={12} aria-hidden />, ti('badgeNoPhoto'))}
                {product.ean && <Button size="sm" variant="secondary" className="h-7 px-2" icon={<ScanBarcode size={12} />} loading={busy} onClick={find} aria-label={ti('badgeFindAria', { name: product.name })}>{ti('badgeFind')}</Button>}
            </span>
        );
    }
    if (state.status === 'searching') return line(<Loader2 size={12} className="animate-spin" aria-hidden />, ti('badgeSearching'));
    if (state.status !== 'found_review' || !state.candidates.length) {
        const text = state.status === 'invalid_barcode' ? ti('badgeInvalid') : state.status === 'unavailable' ? ti('badgeUnavailable') : ti('badgeNone');
        return line(<AlertCircle size={12} aria-hidden />, text, 'text-amber-800');
    }
    const best = state.candidates[0];
    const use = async () => {
        setBusy(true);
        try { await supplierApi.acceptDiscoveredImage(product.id, best.url); toast.success(ti('toastAccepted')); onAccepted(); }
        catch (e: any) { toast.error(e?.message || String(e)); }
        finally { setBusy(false); }
    };
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            {line(<ScanBarcode size={12} aria-hidden />, ti('badgeReview'), 'text-teal')}
            <a href={best.url} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded bg-white ring-1 ring-line flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={best.previewUrl} alt={ti('altFound', { barcode: state.barcode })} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" loading="lazy" />
            </a>
            {best.confidence === 'verified' ? (
                <Button size="sm" variant="secondary" className="h-7 px-2" icon={<Check size={12} />} loading={busy} onClick={use} aria-label={ti('quickUseAria', { name: product.name })}>{ti('quickUse')}</Button>
            ) : (
                <Link href={`/supplier/products/${product.id}/edit#media`} className="text-[12px] text-teal font-medium hover:underline">{ti('reviewPhoto')}</Link>
            )}
        </span>
    );
}
