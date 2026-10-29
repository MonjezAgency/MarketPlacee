'use client';

import * as React from 'react';
import { Truck, Warehouse, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeliveryQuote } from '@/lib/wholesale';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Buyer-facing wording per delivery method. The server's own labels are
 * written for suppliers ("You deliver to an Ali FMCG hub"), so the buyer view
 * names the method itself; figures and reasons still come only from the server.
 */
const METHOD: Record<string, { label: string; handover: string }> = {
    ATLANTIS_COLLECTION: { label: 'methodCollection', handover: 'handoverCollection' },
    SUPPLIER_TO_HUB: { label: 'methodHub', handover: 'handoverHub' },
    SUPPLIER_DIRECT: { label: 'methodDirect', handover: 'handoverDirect' },
};

/**
 * Delivery for an order or cart, exactly as the server calculated it. A group
 * without configured rates says "quoted after the order" and why — a price is
 * never guessed in the browser.
 */
export function DeliveryBreakdown({ quote, compact = false, className, setByAtlantis }: { quote: DeliveryQuote | null | undefined; compact?: boolean; className?: string; setByAtlantis?: { amount: number; carrier?: string | null } | null }) {
    const { t, meta } = useLanguage();
    if (!quote || !quote.groups?.length) return null;
    const eur = (n: number | null | undefined) => (n == null ? '—' : formatPrice(n, 'EUR', meta.intl));
    const many = quote.groups.length > 1;
    // Ali FMCG quoted the delivery after the order: that figure replaces the order-time calculation.
    const fixed = setByAtlantis && quote.status !== 'priced' ? setByAtlantis : null;
    return (
        <div className={cn('space-y-3', className)}>
            {quote.groups.map((g, i) => {
                const m = METHOD[g.method];
                const supplierNo = g.supplier?.match(/\d+/)?.[0];
                return (
                    <div key={i} className="rounded-xl ring-1 ring-line p-3.5">
                        <div className="flex items-start gap-2.5">
                            <span className="w-8 h-8 rounded-lg bg-teal-soft text-teal flex items-center justify-center shrink-0" aria-hidden>
                                {g.method === 'SUPPLIER_TO_HUB' ? <Warehouse size={15} /> : <Truck size={15} />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-[13.5px] font-semibold text-ink">{m ? t('delivery', m.label) : g.label}{many && supplierNo ? <span className="font-normal text-ink-3"> · {t('delivery', 'supplier', { n: supplierNo })}</span> : null}</p>
                                    <p className={cn('text-[13.5px] font-semibold tabular-nums shrink-0', g.status === 'priced' ? 'text-ink' : 'text-ink-3')}>
                                        {g.status === 'priced' ? eur(g.total) : fixed ? (many ? t('delivery', 'quotedByAtlantis') : eur(fixed.amount)) : g.status === 'unavailable' ? t('delivery', 'notAvailable') : t('delivery', 'quotedAfter')}
                                    </p>
                                </div>
                                {g.hub && <p className="text-[12.5px] text-ink-3">{t('delivery', 'via', { hub: g.hub.name, city: g.hub.city })}</p>}
                                {g.transitDays && <p className="text-[12.5px] text-ink-3">{t('delivery', 'transit', { min: g.transitDays.min, max: g.transitDays.max })}</p>}
                            </div>
                        </div>
                        {g.status === 'priced' && !compact && (
                            <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
                                {g.charges.map((c, j) => (
                                    <li key={j} className="flex justify-between gap-3 text-[12.5px]">
                                        {/* Charge labels and their basis are composed by the server (English). */}
                                        <span className="text-ink-2 min-w-0" lang="en">{c.label}<span className="text-ink-3"> — {c.basis}</span></span>
                                        <span className="tabular-nums text-ink shrink-0">{eur(c.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {fixed && <p className="mt-2 text-[12.5px] text-ink-3">{fixed.carrier ? t('delivery', 'quotedNoteCarrier', { carrier: fixed.carrier }) : t('delivery', 'quotedNote')}</p>}
                        {!fixed && g.status !== 'priced' && g.reasons.length > 0 && (
                            <p className="mt-2 text-[12.5px] text-ink-3 flex gap-1.5" lang="en"><Info size={13} className="shrink-0 mt-0.5" aria-hidden /> {g.reasons[0]}</p>
                        )}
                        {!compact && <p className="mt-2 text-[12px] text-ink-3">{m ? t('delivery', m.handover) : g.handover}</p>}
                    </div>
                );
            })}
            {fixed && many && <p className="flex justify-between text-[13.5px] font-semibold text-ink px-1"><span>{t('delivery', 'totalQuoted')}</span><span className="tabular-nums">{eur(fixed.amount)}</span></p>}
            {quote.status === 'priced' && quote.freightTotal != null && many && (
                <p className="flex justify-between text-[13.5px] font-semibold text-ink px-1"><span>{t('delivery', 'total')}</span><span className="tabular-nums">{eur(quote.freightTotal)}</span></p>
            )}
        </div>
    );
}
