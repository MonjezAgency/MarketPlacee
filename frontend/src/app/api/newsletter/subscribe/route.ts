/**
 * Newsletter sign-up → backend (double opt-in). Passes the backend's answer
 * through as-is: if the backend can't be reached the user is told so —
 * nothing is "accepted" that wasn't actually stored.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getBackendUrl = () => (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');

export async function POST(req: NextRequest) {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ message: 'Invalid request body' }, { status: 400 }); }
    const email = (body?.email || '').toString().trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
    if (body?.consent !== true) return NextResponse.json({ message: 'Tick the box to agree to receive the newsletter.' }, { status: 400 });
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = req.cookies.get('token')?.value;
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${getBackendUrl()}/newsletter/subscribe`, {
            method: 'POST', headers,
            body: JSON.stringify({ email, source: String(body?.source || 'footer').slice(0, 60), consent: true, policyVersion: String(body?.policyVersion || '').slice(0, 20) }),
            signal: AbortSignal.timeout(15000),
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ message: 'We couldn’t reach our server. Please try again in a minute.' }, { status: 503 });
    }
}
