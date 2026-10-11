import { NextResponse } from 'next/server';

/**
 * GET /api/fx — live exchange rates with EUR as base (the platform's
 * pricing/settlement currency). Cached server-side for 6h.
 *
 * Primary: open.er-api.com (ExchangeRate-API open access, daily updates,
 * covers GCC/EGP). Fallback: Frankfurter (ECB reference rates — fewer
 * currencies). If both fail we return 503; callers must NOT invent rates.
 */
export const revalidate = 21600;

const WANTED = ['EUR', 'USD', 'GBP', 'AED', 'SAR', 'EGP', 'KWD', 'QAR', 'TRY', 'INR', 'CNY', 'JPY', 'RUB'];

type FxPayload = { base: 'EUR'; rates: Record<string, number>; updatedAt: string; source: string };

function pick(rates: Record<string, number>) {
    const out: Record<string, number> = { EUR: 1 };
    for (const c of WANTED) if (typeof rates[c] === 'number' && rates[c] > 0) out[c] = rates[c];
    return out;
}

async function fromErApi(): Promise<FxPayload> {
    const r = await fetch('https://open.er-api.com/v6/latest/EUR', { next: { revalidate } });
    if (!r.ok) throw new Error(`er-api ${r.status}`);
    const j = await r.json();
    if (j.result !== 'success' || j.base_code !== 'EUR') throw new Error('er-api bad payload');
    return {
        base: 'EUR',
        rates: pick(j.rates || {}),
        updatedAt: new Date((j.time_last_update_unix || 0) * 1000).toISOString(),
        source: 'ExchangeRate-API (open.er-api.com)',
    };
}

async function fromEcb(): Promise<FxPayload> {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR', { next: { revalidate } });
    if (!r.ok) throw new Error(`frankfurter ${r.status}`);
    const j = await r.json();
    return {
        base: 'EUR',
        rates: pick(j.rates || {}),
        updatedAt: new Date(`${j.date}T16:00:00Z`).toISOString(),
        source: 'European Central Bank (via Frankfurter)',
    };
}

export async function GET() {
    for (const load of [fromErApi, fromEcb]) {
        try {
            const data = await load();
            return NextResponse.json(data, {
                headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' },
            });
        } catch { /* try next source */ }
    }
    return NextResponse.json({ error: 'Exchange rates unavailable' }, { status: 503 });
}
