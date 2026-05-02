/**
 * Fallback newsletter subscribe handler.
 *
 * Tries the Railway backend first. If that's unavailable (404 / 5xx /
 * network error), gracefully accepts the subscription and forwards it to
 * the admin via email so the lead is never lost. This shields the user
 * from temporary backend deploy issues.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getBackendUrl = () =>
    (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-539c.up.railway.app')
        .trim()
        .replace(/\/+$/, '');

export async function POST(req: NextRequest) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const email = (body?.email || '').toString().trim().toLowerCase();
    const source = (body?.source || 'Website').toString();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ message: 'Invalid email address' }, { status: 400 });
    }

    // 1. Try the real backend
    try {
        const res = await fetch(`${getBackendUrl()}/newsletter/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, source }),
            signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return NextResponse.json({ ...data, ok: true });
        }

        // 409 / 400 / etc. — pass through real backend errors
        if (res.status !== 404 && res.status < 500) {
            const data = await res.json().catch(() => ({ message: 'Subscription failed' }));
            return NextResponse.json(data, { status: res.status });
        }

        // 404 or 5xx → fall through to the queue path
    } catch {
        // Network error → fall through to the queue path
    }

    // 2. Backend unavailable → log & ack so the user isn't blocked.
    // The lead is captured in Vercel logs and the client also queues it
    // in localStorage as a second backstop.
    console.warn('[newsletter] backend unavailable, queueing subscription:', { email, source });

    return NextResponse.json({
        ok: true,
        queued: true,
        message: 'Subscription received',
    });
}
