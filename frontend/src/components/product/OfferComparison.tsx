'use client';

import * as React from 'react';
import Link from 'next/link';
import { BadgeCheck, Scale } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

type Offer = {
    id: string; name: string; current: boolean;
    supplier: { label: string; country: string | null; verified: boolean };
    origin: string | null; shipsFrom: string | null;
    pack: { unitsPerCase: number | null; casesPerPallet: number | null; palletsPerShipment: number | null };
    casePrice: number | null; piecePrice: number | null; offerPercent: number | null; currency: string;
    minOrder: { quantity: number; unit: string; cases: number | null } | null;
    availability: 'IN_STOCK' | 'OUT_OF_STOCK'; stockCases: number | null; leadTimeDays: number | null; bestBefore: string | null;
};

const unitWord = (u: string, n: number) => ({ PIECE: 'piece', CASE: 'case', PALLET: 'pallet', TRUCK: 'truckload' } as Record<string, string>)[u] + (n === 1 ? '' : 's');

/**
 * Same barcode, different suppliers: compared on the same basis (price per
 * case and per piece, EUR, before delivery). Renders nothing when there's
 * only one offer — nothing is invented to fill the table.
 */
export default function OfferComparison({ productId }: { productId: string }) {
    const [data, setData] = React.useState<{ offers: Offer[]; note: string | null; pricesHidden?: boolean } | null>(null);
    React.useEffect(() => {
        apiFetch(`/products/${productId}/compare`).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
    }, [productId]);
    if (!data || !data.offers || data.offers.length < 2) return null;
    const best = Math.min(...data.offers.map((o) => (o.piecePrice ?? Infinity)));

    return (
        <section aria-labelledby="cmp-title" className="mt-2 pt-8 border-t border-line">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">Same product, {data.offers.length} offers</p>
                    <h2 id="cmp-title" className="mt-0.5 text-[19px] font-bold text-heading inline-flex items-center gap-2"><Scale size={18} className="text-ink-3" /> Compare offers</h2>
                </div>
                <p className="text-[12.5px] text-ink-3 max-w-md">Listings with the same barcode. Prices per case and per piece in EUR, before delivery and VAT.{data.note ? ` ${data.note}` : ''}</p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-line">
                <table className="w-full min-w-[760px] text-[13px]">
                    <thead className="bg-surface-2 text-ink-3">
                        <tr>{['Offer', 'Price / case', 'Price / piece', 'Pack', 'Minimum order', 'Availability', 'Origin · ships from', ''].map((h) => <th key={h} scope="col" className="text-start font-medium px-4 py-2.5">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {data.offers.map((o) => (
                            <tr key={o.id} className={cn('border-t border-line align-top', o.current && 'bg-teal-soft/40')}>
                                <td className="px-4 py-3">
                                    <p className="font-medium text-ink">{o.supplier.label}{o.current && <span className="ms-2 text-[11.5px] font-semibold text-teal">This listing</span>}</p>
                                    <p className="text-[12px] text-ink-3 inline-flex items-center gap-1">{o.supplier.verified && <><BadgeCheck size={12} className="text-[#047857]" /> Verified</>}{o.supplier.country ? `${o.supplier.verified ? ' · ' : ''}${o.supplier.country}` : ''}</p>
                                </td>
                                <td className="px-4 py-3 tabular-nums">
                                    {o.casePrice === null ? <span className="text-ink-4">Sign in</span> : <>{formatPrice(o.casePrice)}{o.offerPercent ? <span className="block text-[11.5px] text-[#B91C1C]">incl. −{o.offerPercent}% offer</span> : null}</>}
                                </td>
                                <td className={cn('px-4 py-3 tabular-nums', o.piecePrice !== null && o.piecePrice === best && 'font-semibold text-[#047857]')}>
                                    {o.piecePrice === null ? '—' : formatPrice(o.piecePrice)}{o.piecePrice !== null && o.piecePrice === best && <span className="block text-[11.5px] font-medium">lowest per piece</span>}
                                </td>
                                <td className="px-4 py-3 text-ink-2">{o.pack.unitsPerCase ? `${o.pack.unitsPerCase} pcs/case` : '—'}{o.pack.casesPerPallet ? <span className="block text-ink-3">{o.pack.casesPerPallet} cases/pallet</span> : null}</td>
                                <td className="px-4 py-3 text-ink-2">{o.minOrder ? `${o.minOrder.quantity.toLocaleString('en-GB')} ${unitWord(o.minOrder.unit, o.minOrder.quantity)}` : 'No minimum'}</td>
                                <td className="px-4 py-3">
                                    <span className={o.availability === 'IN_STOCK' ? 'text-[#047857]' : 'text-[#B91C1C]'}>{o.availability === 'IN_STOCK' ? 'In stock' : 'Out of stock'}</span>
                                    {o.stockCases !== null && o.availability === 'IN_STOCK' && <span className="block text-[12px] text-ink-3">{o.stockCases.toLocaleString('en-GB')} cases</span>}
                                    {o.leadTimeDays !== null && <span className="block text-[12px] text-ink-3">{o.leadTimeDays === 0 ? 'Ready to dispatch' : `Dispatch in ${o.leadTimeDays} days`}</span>}
                                </td>
                                <td className="px-4 py-3 text-ink-2">{o.origin || '—'}<span className="block text-[12px] text-ink-3">{o.shipsFrom ? `Ships from ${o.shipsFrom}` : 'Dispatch location not stated'}</span></td>
                                <td className="px-4 py-3 text-end">{!o.current && <Link href={`/products/${o.id}`} className="text-[13px] font-semibold text-teal hover:underline whitespace-nowrap">View offer</Link>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
