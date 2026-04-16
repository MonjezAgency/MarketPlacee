import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_BASE = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-dfc2.up.railway.app')
    .trim()
    .replace(/\/+$/, '');

/**
 * Keep-warm endpoint — called by Vercel Cron every 5 minutes to prevent Railway cold starts.
 * Pings the backend health endpoint. If it's sleeping, this wakes it up.
 */
export async function GET(request: Request) {
  // Verify this is a legitimate cron call (Vercel sets this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const backendUrl = `${BACKEND_BASE()}/health`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(backendUrl, {
      method: 'GET',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const ms = Date.now() - start;
    console.log(`[KEEP_WARM] Backend ping: ${res.status} in ${ms}ms`);

    return NextResponse.json({ ok: true, status: res.status, ms });
  } catch (err: any) {
    const ms = Date.now() - start;
    console.error(`[KEEP_WARM] Backend ping failed after ${ms}ms:`, err.message);
    return NextResponse.json({ ok: false, error: err.message, ms });
  }
}
