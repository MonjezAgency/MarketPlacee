'use client';

/**
 * PriceTicker — live horizontal marquee of products that recently
 * changed price. Each item shows brand logo, EAN, current price, and
 * delta — all converted from the EGP-base price into the user's
 * selected display currency.
 */

import * as React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatPrice, convertFromBase, getActiveCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface TickerItem {
    id: string;
    name: string;
    ean: string | null;
    brand: string | null;
    image: string | null;
    price: number;          // current price in EGP base
    previousPrice: number;  // last price before change in EGP base
    delta: number;          // price - previousPrice in EGP base
    changedAt: string;
}

export default function PriceTicker() {
    const [items, setItems] = React.useState<TickerItem[]>([]);
    const [currency, setCurrency] = React.useState(() => {
        if (typeof window !== 'undefined') return getActiveCurrency();
        return 'EGP';
    });

    // Fetch ticker data + refresh every 60s
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await apiFetch('/products/price-ticker?limit=30');
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data)) setItems(data);
            } catch { /* silent — ticker is optional */ }
        };
        load();
        const interval = setInterval(load, 60_000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    // React to currency changes
    React.useEffect(() => {
        const sync = () => setCurrency(getActiveCurrency());
        window.addEventListener('currency-changed', sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener('currency-changed', sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    if (items.length === 0) return null;

    // Duplicate the list so the marquee loops seamlessly
    const looped = [...items, ...items];

    const formatDelta = (deltaEGP: number): { text: string; positive: boolean } => {
        const converted = convertFromBase(deltaEGP, currency);
        const positive = deltaEGP > 0;
        const sign = positive ? '+' : '';
        // Use 2 decimals for delta — matches the pattern in the screenshot
        return {
            text: `${sign}${converted.toFixed(2)}`,
            positive,
        };
    };

    return (
        <div className="w-full bg-white border-b border-slate-100 overflow-hidden relative group">
            <div className="flex items-center">
                {/* Sticky label */}
                <div className="shrink-0 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 z-10 shadow-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live Prices
                </div>

                {/* Scrolling track */}
                <div className="flex-1 overflow-hidden">
                    <div
                        className="flex items-center gap-6 py-1.5 px-4 whitespace-nowrap animate-ticker group-hover:[animation-play-state:paused]"
                        style={{ animation: 'ticker 80s linear infinite' }}
                    >
                        {looped.map((item, i) => {
                            const delta = formatDelta(item.delta);
                            return (
                                <Link
                                    key={`${item.id}-${i}`}
                                    href={`/products/${item.id}`}
                                    className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                                    title={item.name}
                                >
                                    {/* Brand logo / placeholder */}
                                    <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                        {item.image ? (
                                            <img
                                                src={item.image}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-[9px] font-black text-slate-400">
                                                {(item.brand || item.name)[0]?.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    {/* EAN / SKU */}
                                    <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                                        {item.ean || item.name.slice(0, 18)}
                                    </span>
                                    {/* Current price */}
                                    <span className="text-[11px] font-black text-slate-900 tabular-nums">
                                        {formatPrice(item.price, currency)}
                                    </span>
                                    {/* Delta */}
                                    <span className={cn(
                                        "text-[11px] font-black tabular-nums flex items-center gap-0.5",
                                        delta.positive ? "text-emerald-600" : "text-red-500"
                                    )}>
                                        {delta.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                        {delta.text}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes ticker {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
            `}</style>
        </div>
    );
}
