/**
 * RFC 8058 one-click unsubscribe target (the List-Unsubscribe header of every
 * marketing email). Mail clients POST here; the token is forwarded to the
 * backend, which records the unsubscribe. A GET (a person or a link scanner)
 * never unsubscribes: it opens the confirmation page instead.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const backend = () => (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');

export async function POST(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token') || '';
    if (token.length < 20 || token.length > 200) return new NextResponse('Invalid unsubscribe link', { status: 400 });
    try {
        const res = await fetch(`${backend()}/newsletter/unsubscribe`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, method: 'ONE_CLICK' }), signal: AbortSignal.timeout(15000),
        });
        return new NextResponse(res.ok ? 'Unsubscribed' : 'Unsubscribe failed', { status: res.ok ? 200 : res.status });
    } catch {
        return new NextResponse('Unsubscribe service unavailable', { status: 503 });
    }
}

export function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token') || '';
    const url = new URL('/unsubscribe', req.nextUrl.origin);
    if (token) url.searchParams.set('token', token);
    return NextResponse.redirect(url, 303);
}
