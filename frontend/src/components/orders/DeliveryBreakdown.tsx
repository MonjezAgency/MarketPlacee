'use client';

import * as React from 'react';
import { Truck, Warehouse, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeliveryQuote } from '@/lib/wholesale';
import { eur } from '@/lib/fulfillment';

/**
 * Delivery for an order or cart, exactly as the server calculated it. A group
 * without configured rates says "quoted after the order" and why — a price is
 * never guessed in the browser.
 */
export function DeliveryBreakdown({ quote, compact = false, className, setByAtlantis }: { quote: DeliveryQuote | null | undefined; compact?: boolean; className?: string; setByAtlantis?: { amount: number; carrier?: string | null } | null }) {
    if (!quote || !quote.groups?.length) return null;
    const many = quote.groups.length > 1;
    // Atlantis quoted the delivery after the order: that figure replaces the order-time calculation.
    const fixed = setByAtlantis && quote.status !== 'priced' ? setByAtlantis : null;
    return (
        <div className={cn('space-y-3', className)}>
            {quote.groups.map((g, i) => (
                <div key={i} className="rounded-xl ring-1 ring-line p-3.5">
                    <div className="flex items-start gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-teal-soft text-teal flex items-center justify-center shrink-0">
                            {g.method === 'SUPPLIER_TO_HUB' ? <Warehouse size={15} /> : <Truck size={15} />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[13.5px] font-semibold text-ink">{g.label}{many && g.supplier ? <span className="font-normal text-ink-3"> · {g.supplier}</span> : null}</p>
                                <p className={cn('text-[13.5px] font-semibold tabular-nums shrink-0', g.status === 'priced' ? 'text-ink' : 'text-ink-3')}>
                                    {g.status === 'priced' ? eur(g.total) : fixed ? (many ? 'Quoted by Atlantis' : eur(fixed.amount)) : g.status === 'unavailable' ? 'Not available' : 'Quoted after order'}
                                </p>
                            </div>
                            {g.hub && <p className="text-[12.5px] text-ink-3">Via {g.hub.name}, {g.hub.city}</p>}
                            {g.transitDays && <p className="text-[12.5px] text-ink-3">Transit {g.transitDays.min}–{g.transitDays.max} days after dispatch</p>}
                        </div>
                    </div>
                    {g.status === 'priced' && !compact && (
                        <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
                            {g.charges.map((c, j) => (
                                <li key={j} className="flex justify-between gap-3 text-[12.5px]">
                                    <span className="text-ink-2 min-w-0">{c.label}<span className="text-ink-3"> — {c.basis}</span></span>
                                    <span className="tabular-nums text-ink shrink-0">{eur(c.amount)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {fixed && <p className="mt-2 text-[12.5px] text-ink-3">Delivery charge quoted by Atlantis{fixed.carrier ? ` · ${fixed.carrier}` : ''}.</p>}
                    {!fixed && g.status !== 'priced' && g.reasons.length > 0 && (
                        <p className="mt-2 text-[12.5px] text-ink-3 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" /> {g.reasons[0]}</p>
                    )}
                    {!compact && <p className="mt-2 text-[12px] text-ink-3"><span className="font-medium text-ink-2">Responsibility:</span> {g.handover}</p>}
                </div>
            ))}
            {fixed && many && <p className="flex justify-between text-[13.5px] font-semibold text-ink px-1"><span>Delivery total (quoted by Atlantis)</span><span className="tabular-nums">{eur(fixed.amount)}</span></p>}
            {quote.status === 'priced' && quote.freightTotal != null && many && (
                <p className="flex justify-between text-[13.5px] font-semibold text-ink px-1"><span>Delivery total</span><span className="tabular-nums">{eur(quote.freightTotal)}</span></p>
            )}
        </div>
    );
}
