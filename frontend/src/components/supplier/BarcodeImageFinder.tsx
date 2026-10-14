'use client';

import * as React from 'react';
import { ScanBarcode, Check, X, ExternalLink, RefreshCw } from 'lucide-react';
import { supplierApi } from '@/lib/supplier-api';
import { Badge, Button, Notice } from '@/components/supplier/ui';
import { gtinProblem } from '@/lib/catalog-rules';

/**
 * "Find a product image using this barcode". Shows candidates from open
 * product databases with how well they match; nothing is used until the
 * supplier presses Accept. Accepting only adds the photo — no other field
 * of the product is changed.
 */
export default function BarcodeImageFinder({ ean, name, brand, onAccept, compact }: { ean: string; name?: string; brand?: string; onAccept: (url: string) => void; compact?: boolean }) {
    const [state, setState] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [result, setResult] = React.useState<any | null>(null);
    const [rejected, setRejected] = React.useState<Set<string>>(new Set());
    const [accepting, setAccepting] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const problem = gtinProblem(ean);

    React.useEffect(() => { setState('idle'); setResult(null); setRejected(new Set()); }, [ean]);

    const run = async () => {
        setState('loading'); setError(null); setRejected(new Set());
        try { setResult(await supplierApi.imageLookup(ean, name, brand)); setState('done'); }
        catch (e: any) { setError(e.message); setState('error'); }
    };
    const accept = async (url: string) => {
        setAccepting(url); setError(null);
        try { const r = await supplierApi.acceptImage(url); onAccept(r.url); setResult(null); setState('idle'); }
        catch (e: any) { setError(e.message); }
        finally { setAccepting(null); }
    };

    if (problem) return compact ? null : <p className="text-[12.5px] text-ink-3 flex items-center gap-1.5"><ScanBarcode size={14} /> Enter a valid barcode to look up a product photo.</p>;
    const visible = (result?.candidates ?? []).filter((c: any) => !rejected.has(c.url));

    return (
        <div className="rounded-xl ring-1 ring-line p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <ScanBarcode size={16} className="text-teal" />
                <span className="text-[13.5px] font-medium text-heading flex-1 min-w-[12rem]">Find a product image using this barcode</span>
                <Button size="sm" variant={state === 'idle' ? 'brand' : 'secondary'} loading={state === 'loading'} icon={state === 'done' || state === 'error' ? <RefreshCw size={13} /> : undefined} onClick={run}>
                    {state === 'idle' ? 'Search' : 'Search again'}
                </Button>
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
            {state === 'done' && result && (
                <>
                    <p className="text-[12.5px] text-ink-2">{visible.length || !result.candidates.length ? result.message : 'You rejected every suggestion. Upload your own photo, or keep the product as a draft until you have one.'}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {visible.map((c: any) => (
                            <div key={c.url} className="rounded-lg ring-1 ring-line overflow-hidden flex flex-col">
                                <div className="aspect-square bg-white flex items-center justify-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={c.previewUrl} alt={`Suggested photo for barcode ${result.barcode}`} className="max-w-[90%] max-h-[90%] object-contain" />
                                </div>
                                <div className="p-3 border-t border-line text-[12.5px] space-y-1.5 flex-1">
                                    <div className="flex flex-wrap gap-1">
                                        {c.confidence === 'verified' ? <Badge tone="success">Barcode + {c.nameMatch ? 'name' : 'brand'} match</Badge> : <Badge tone="warning">Check before using</Badge>}
                                    </div>
                                    <p className="text-ink"><span className="text-ink-3">Source record:</span> {c.productName || 'no name'}{c.brand ? ` · ${c.brand}` : ''}</p>
                                    <p className="text-ink-3">{c.reason}</p>
                                    <p className="text-ink-4">{c.license}. <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline inline-flex items-center gap-0.5">View source <ExternalLink size={11} /></a></p>
                                </div>
                                <div className="flex gap-2 p-3 pt-0">
                                    <Button size="sm" variant="primary" icon={<Check size={13} />} loading={accepting === c.url} disabled={!!accepting} onClick={() => accept(c.url)}>Use this photo</Button>
                                    <Button size="sm" variant="secondary" icon={<X size={13} />} disabled={!!accepting} onClick={() => setRejected((s) => new Set(s).add(c.url))}>Not my product</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
