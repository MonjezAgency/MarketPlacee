'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { orderStages, type BuyerOrder, type StageKey } from '@/lib/buyer-orders';
import { MOTION } from '@/components/ds';
import { cn } from '@/lib/utils';

/** Shared pieces of the buyer order views (list cards and the order page). */

export const STAGE_LABEL: Record<StageKey, string> = {
    placed: 'stagePlaced', supplier: 'stageSupplier', approved: 'stageApproved', confirmed: 'stageConfirmed',
    inspection: 'stageInspection', shipped: 'stageShipped', delivered: 'stageDelivered',
};

/** Put a node (e.g. an LTR order ref) where a translation placed SLOT, keeping the language's word order. */
export const SLOT = '\u0000';
export function withNode(text: string, node: React.ReactNode) {
    const [before, after = ''] = text.split(SLOT);
    return <>{before}{node}{after}</>;
}
export const Ltr = ({ children, className }: { children: React.ReactNode; className?: string }) => <bdi dir="ltr" className={cn('tabular-nums', className)}>{children}</bdi>;

export function useMoney() {
    const { meta } = useLanguage();
    useCurrency(); // re-render when the display currency changes
    return React.useCallback((n: number) => formatPrice(n, undefined, meta.intl), [meta.intl]);
}


export function OrderProgress({ o }: { o: BuyerOrder }) {
    const { t } = useLanguage();
    const reduce = useReducedMotion();
    const stages = orderStages(o);
    const cancelled = o.status === 'CANCELLED';
    const currentIdx = stages.findIndex((s) => s.state === 'current');
    const at = currentIdx === -1 ? (cancelled ? -1 : stages.length - 1) : currentIdx;
    return (
        <div>
            <ol aria-label={t('orders', 'progressAria')} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
                {stages.map((s, i) => (
                    <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined} className="min-w-0">
                        <span className="block h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden>
                            {(s.state === 'done' || s.state === 'current') && (
                                <motion.span
                                    className={cn('block h-full rounded-full origin-[left] rtl:origin-[right]', s.state === 'done' ? 'bg-[#0E7C74]' : 'bg-[#2EC4B6]')}
                                    initial={reduce ? false : { scaleX: 0 }}
                                    animate={{ scaleX: s.state === 'done' ? 1 : 0.5 }}
                                    transition={{ duration: 0.5, ease: MOTION.ease, delay: reduce ? 0 : i * 0.08 }}
                                />
                            )}
                        </span>
                        <span className={cn('mt-2 hidden sm:flex items-start gap-1 text-[12px] leading-tight',
                            s.state === 'done' ? 'text-ink-2' : s.state === 'current' ? 'text-heading font-semibold' : 'text-ink-4')}>
                            {s.state === 'done' && <Check size={12} strokeWidth={2.5} className="mt-px shrink-0 text-[#0E7C74]" aria-hidden />}
                            <span className="min-w-0 break-words">{t('orders', STAGE_LABEL[s.key])}</span>
                            <span className="sr-only">{s.state === 'done' ? ' ✓' : ''}</span>
                        </span>
                    </li>
                ))}
            </ol>
            {/* Phones: the stage labels don't fit under five segments — name the current one instead. */}
            {!cancelled && at >= 0 && (
                <p className="sm:hidden mt-2 text-[12.5px] text-ink-3">
                    {t('orders', 'stepOf', { current: at + 1, total: stages.length })} · <span className="font-semibold text-heading">{t('orders', STAGE_LABEL[stages[at].key])}</span>
                </p>
            )}
        </div>
    );
}

