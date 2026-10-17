'use client';

/**
 * Special-offer (Promotion) price pieces for the storefront: the badge, the
 * "ends" line and the cart note. The server decides which promotion applies
 * (it is attached to the product as `promotion` only while it runs) and the
 * checkout prices come from the server quote; this file only displays them.
 * Same rule as the server (backend/src/promotions/promotion-rules.ts): the
 * percentage comes off the price once, rounded once to the cent.
 */
import * as React from 'react';
import { Tag } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export interface PublicPromotion { id: string; discountPercent: number; startsAt: string; endsAt: string }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The running promotion on a product, or null. Also hides one whose end has passed while the page was open. */
export function runningPromotion(product: { promotion?: PublicPromotion | null } | null | undefined, now = Date.now()): PublicPromotion | null {
    const p = product?.promotion;
    if (!p || !(p.discountPercent > 0 && p.discountPercent <= 90)) return null;
    if (new Date(p.startsAt).getTime() > now || new Date(p.endsAt).getTime() <= now) return null;
    return p;
}

/** Promotional price of an unrounded price (same rounding as the server). */
export const promoPriceOf = (raw: number, pct: number) => round2(raw * (1 - pct / 100));

/** "% off" worked out from the two prices actually shown (one decimal at most). */
export const percentOff = (original: number, promotional: number) => (original > 0 ? Math.round((1 - promotional / original) * 1000) / 10 : 0);

/** "24 Oct 2026, 18:00 UTC" in the interface language. */
export function useUtcTime() {
    const { t, fmt } = useLanguage();
    return React.useCallback((iso: string, withYear = true) => t('promotions', 'timeUtc', {
        time: fmt.date(iso, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }),
    }), [t, fmt]);
}

export function PromoBadge({ pct, className }: { pct: number; className?: string }) {
    const { t, fmt } = useLanguage();
    return (
        <span data-no-translate className={cn('inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-[#FEF2F2] text-[#B91C1C] ring-1 ring-inset ring-[#FECACA] text-[11.5px] font-semibold tabular-nums whitespace-nowrap', className)}>
            <Tag size={11} aria-hidden />
            {t('promotions', 'pctOff', { pct: fmt.number(pct, { maximumFractionDigits: 1 }) })}
        </span>
    );
}

/** "Special offer · Ends 24 Oct, 18:00 UTC" */
export function PromoEnds({ endsAt, className }: { endsAt: string; className?: string }) {
    const { t } = useLanguage();
    const utc = useUtcTime();
    return (
        <span data-no-translate className={cn('text-[12px] text-ink-3', className)}>
            {t('promotions', 'specialOffer')} · {t('promotions', 'endsAt', { date: utc(endsAt, false) })}
        </span>
    );
}

/** Struck-through original price with an accessible label. */
export function WasPrice({ children, className }: { children: React.ReactNode; className?: string }) {
    const { t } = useLanguage();
    return (
        <span data-no-translate className={cn('text-ink-4 line-through tabular-nums', className)}>
            <span className="sr-only">{t('promotions', 'originalPrice')}: </span>{children}
        </span>
    );
}

/** Cart line note from the server quote: the running special offer, or that it just ended. */
export function CartPromoNote({ promotion, ended, listLineTotal, formatPrice }: {
    promotion?: { discountPercent: number; endsAt: string } | null;
    ended?: { discountPercent: number; endedAt: string } | null;
    listLineTotal?: number | null;
    formatPrice: (n: number) => string;
}) {
    const { t, fmt } = useLanguage();
    const utc = useUtcTime();
    if (promotion) {
        return (
            <p data-no-translate className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[#B91C1C]">
                <Tag size={13} aria-hidden />
                <span>{t('promotions', 'cartPromo', { pct: fmt.number(promotion.discountPercent, { maximumFractionDigits: 2 }), date: utc(promotion.endsAt, false) })}</span>
                {typeof listLineTotal === 'number' && listLineTotal > 0 && <WasPrice className="text-[12.5px]">{t('promotions', 'cartWas', { price: formatPrice(listLineTotal) })}</WasPrice>}
            </p>
        );
    }
    if (ended) {
        return <p data-no-translate role="status" className="mt-1.5 text-[13px] text-[#B45309]">{t('promotions', 'cartEnded', { date: utc(ended.endedAt, false) })}</p>;
    }
    return null;
}
