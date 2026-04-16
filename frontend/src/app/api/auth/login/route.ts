import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const BACKEND_BASE = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-dfc2.up.railway.app')
    .trim()
    .replace(/\/+$/, '');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const backendUrl = `${BACKEND_BASE()}/auth/login`;

    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual', // never follow redirects — Railway error pages redirect and break URL parsing
    });

    // A redirect here means the backend is down / returning an error page
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

    const { access_token, refresh_token, user, requiresTwoFactor, partialToken } = data;

    if (requiresTwoFactor) {
      return NextResponse.json({ requiresTwoFactor, partialToken });
    }

    const cookieStore = cookies();

    if (access_token) {
      cookieStore.set('token', access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
      });
    }

    if (refresh_token) {
      cookieStore.set('refreshToken', refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error('[PROXY_LOGIN_ERROR]', error);
    const isNetworkError = error.cause?.code === 'ECONNREFUSED' || error.message?.includes('fetch failed');
    return NextResponse.json(
      {
        message: isNetworkError
          ? 'Cannot connect to backend service. Please try again in a moment.'
          : `Login failed: ${error.message}`,
      },
      { status: 503 }
    );
  }
}
