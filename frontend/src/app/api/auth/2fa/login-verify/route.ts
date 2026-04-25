import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const BACKEND_BASE = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-539c.up.railway.app')
    .trim()
    .replace(/\/+$/, '');

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const res = await fetch(`${BACKEND_BASE()}/auth/2fa/login-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual',
    });

    if (res.status >= 300 && res.status < 400) {
      return NextResponse.json(
        { message: 'Backend service is temporarily unavailable. Please try again in a moment.' },
        { status: 503 }
      );
    }

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const { access_token, refresh_token, user } = data;
    const cookieStore = cookies();
    const host = request.headers.get('host') || '';
    const isCustomDomain = host.includes('atlantisfmcg.com');
    const cookieOptions: any = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
    };

    if (isCustomDomain) {
        cookieOptions.domain = '.atlantisfmcg.com';
    }

    if (access_token) {
      cookieStore.set('token', access_token, cookieOptions);
    }

    if (refresh_token) {
      cookieStore.set('refreshToken', refresh_token, cookieOptions);
    }

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error('[PROXY_2FA_ERROR]', error);
    const isNetworkError = error.cause?.code === 'ECONNREFUSED' || error.message?.includes('fetch failed');
    return NextResponse.json(
      {
        message: isNetworkError
          ? 'Cannot connect to backend service. Please try again in a moment.'
          : `2FA verification failed: ${error.message}`,
      },
      { status: 503 }
    );
  }
}
