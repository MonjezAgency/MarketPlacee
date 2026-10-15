'use client';

import * as React from 'react';
import { ScanBarcode, Check, X, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, HelpCircle, Upload } from 'lucide-react';
import { supplierApi } from '@/lib/supplier-api';
import { Badge, Button, Notice } from '@/components/supplier/ui';
import { gtinProblem } from '@/lib/catalog-rules';
import { cn } from '@/lib/utils';

/**
 * "Find product images using the saved barcode". Shows every genuine photo
 * the open product databases hold for that barcode (front packshots first,
 * then packaging) with how well each record matches the listing — barcode,
 * name, brand and pack size. Nothing is used until the supplier chooses a
 * photo; an uncertain match needs an explicit confirmation first. Accepting
 * only adds the photo — no other field of the product changes.
 */
export default function BarcodeImageFinder({ productId, savedEan, ean, name, brand, weight, current, onAccept, onSkip }: {
    productId?: string; savedEan?: string | null; ean: string; name?: string; brand?: string; weight?: string;
    current: string[]; onAccept: (url: string) => void; onSkip?: () => void;
}) {
    const [state, setState] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [result, setResult] = React.useState<any | null>(null);
    const [rejected, setRejected] = React.useState<Set<string>>(new Set());
    const [added, setAdded] = React.useState<Set<string>>(new Set());
    const [confirmed, setConfirmed] = React.useState<Set<string>>(new Set());
    const [accepting, setAccepting] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const saved = String(savedEan || '').replace(/\D/g, '');
    const typed = String(ean || '').replace(/\D/g, '');
    React.useEffect(() => { setState('idle'); setResult(null); setRejected(new Set()); setAdded(new Set()); setConfirmed(new Set()); }, [saved]);

    // The lookup uses the barcode saved on the product, so a photo always matches what buyers see.
    const blocked = !productId || !saved
        ? 'To find images using a barcode, enter the product’s EAN/barcode above and save the product first.'
        : typed && typed !== saved ? 'You changed the barcode. Save the product first, then search with the new barcode.'
        : gtinProblem(saved);

    const run = async () => {
        setState('loading'); setError(null); setRejected(new Set());
        try { setResult(await supplierApi.imageLookup({ productId, ean: saved, name, brand, weight })); setState('done'); }
        catch (e: any) { setError(e.message); setState('error'); }
    };
    const accept = async (url: string) => {
        setAccepting(url); setError(null);
        try { const r = await supplierApi.acceptImage(url); onAccept(r.url); setAdded((s) => new Set(s).add(url)); }
        catch (e: any) { setError(e.message); }
        finally { setAccepting(null); }
    };

    const visible = (result?.candidates ?? []).filter((c: any) => !rejected.has(c.url));
    const noPhotosYet = current.length === 0 && added.size === 0;

    return (
        <div className="rounded-xl ring-1 ring-line p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <ScanBarcode size={16} className="text-teal" />
                <span className="text-[13.5px] font-medium text-heading flex-1 min-w-[12rem]">Find product images using the barcode</span>
                <Button size="sm" variant={state === 'idle' ? 'brand' : 'secondary'} loading={state === 'loading'} disabled={!!blocked} icon={state === 'done' || state === 'error' ? <RefreshCw size={13} /> : undefined} onClick={run}>
                    {state === 'idle' ? 'Search' : 'Search again'}
                </Button>
            </div>
            {blocked && <p className="text-[12.5px] text-ink-3">{blocked}</p>}
            {error && <Notice tone="danger">{error}</Notice>}
            {state === 'done' && result && (
                <>
                    <p className="text-[12.5px] text-ink-2">{visible.length || !result.candidates.length ? result.message : 'You set aside every suggestion. Upload your own photo instead.'}</p>
                    {visible.length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {visible.map((c: any) => {
                                const isAdded = added.has(c.url);
                                const needsConfirm = c.confidence !== 'verified';
                                const canUse = !needsConfirm || confirmed.has(c.url);
                                return (
                                    <div key={c.url} className={cn('rounded-lg ring-1 overflow-hidden flex flex-col', isAdded ? 'ring-2 ring-teal' : 'ring-line')}>
                                        <div className="relative aspect-square bg-white flex items-center justify-center">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={c.previewUrl} alt={`${c.kind === 'packaging' ? 'Packaging' : 'Front'} photo for barcode ${result.barcode}`} className="max-w-[90%] max-h-[90%] object-contain" />
                                            <span className="absolute top-1.5 start-1.5"><Badge>{c.kind === 'front' ? 'Front' : c.kind === 'packaging' ? 'Packaging' : 'Photo'}{c.language ? ` · ${String(c.language).toUpperCase()}` : ''}</Badge></span>
                                            {isAdded && <span className="absolute top-1.5 end-1.5"><Badge tone="brand">Selected</Badge></span>}
                                        </div>
                                        <div className="p-3 border-t border-line text-[12.5px] space-y-1.5 flex-1">
                                            {c.confidence === 'verified' ? <Badge tone="success">Matches your product</Badge> : <Badge tone="warning">Check before using</Badge>}
                                            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                                <Check1 label="Barcode" v={c.barcodeMatch} />
                                                <Check1 label="Name" v={c.nameMatch} />
                                                <Check1 label="Brand" v={c.brandMatch} />
                                                <Check1 label="Pack size" v={c.packMatch} />
                                            </ul>
                                            <p className="text-ink"><span className="text-ink-3">Record:</span> {c.productName || 'no name'}{c.sourceQuantity ? ` · ${c.sourceQuantity}` : ''}{c.brand ? ` · ${c.brand}` : ''}</p>
                                            {c.warnings?.length > 0 && <p className="text-amber-800">{c.warnings.join(' ')}</p>}
                                            <p className="text-ink-4">{c.license}. <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline inline-flex items-center gap-0.5">View source <ExternalLink size={11} /></a></p>
                                            {needsConfirm && !isAdded && (
                                                <label className="flex items-start gap-2 pt-1 text-ink-2">
                                                    <input type="checkbox" className="mt-0.5" checked={confirmed.has(c.url)} onChange={(e) => setConfirmed((s) => { const n = new Set(s); e.target.checked ? n.add(c.url) : n.delete(c.url); return n; })} />
                                                    <span>I’ve checked: this photo shows exactly my product — same variant, size and pack.</span>
                                                </label>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2 p-3 pt-0">
                                            {isAdded ? <span className="text-[12.5px] text-teal font-medium inline-flex items-center gap-1"><CheckCircle2 size={14} /> Added — save to keep it</span> : (
                                                <>
                                                    <Button size="sm" variant="primary" icon={<Check size={13} />} loading={accepting === c.url} disabled={!!accepting || !canUse} onClick={() => accept(c.url)}>
                                                        {noPhotosYet ? 'Use this image' : 'Add this image'}
                                                    </Button>
                                                    <Button size="sm" variant="secondary" icon={<X size={13} />} disabled={!!accepting} onClick={() => setRejected((s) => new Set(s).add(c.url))}>Not my product</Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                        {added.size > 0 && <span>{added.size} photo{added.size === 1 ? '' : 's'} added. You can add another, or reorder them above (the first is the main photo).</span>}
                        {onSkip && <Button size="sm" variant="ghost" icon={<Upload size={13} />} onClick={onSkip}>Skip and upload my own photo</Button>}
                    </div>
                </>
            )}
        </div>
    );
}

function Check1({ label, v }: { label: string; v: boolean | null }) {
    return (
        <li className={cn('inline-flex items-center gap-1', v === true ? 'text-emerald-700' : v === false ? 'text-red-700' : 'text-ink-4')}>
            {v === true ? <CheckCircle2 size={12} /> : v === false ? <AlertCircle size={12} /> : <HelpCircle size={12} />}
            {label}{v === null ? ' (n/a)' : ''}
        </li>
    );
}
