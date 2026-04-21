import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Extend Vercel function timeout to 60s (works on Pro; Hobby is capped at 10s but doesn't error the config)
export const maxDuration = 60;

const BACKEND_BASE = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-539c.up.railway.app')
    .trim()
    .replace(/\/+$/, '');

async function callBackend(backendUrl: string, body: any, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const backendUrl = `${BACKEND_BASE()}/auth/login`;

    let res: Response;
    try {
      // First attempt — 15s timeout
      res = await callBackend(backendUrl, body, 15000);
    } catch (firstError: any) {
      const isTimeout =
        firstError.name === 'AbortError' ||
        firstError.message?.includes('aborted') ||
        firstError.message?.includes('fetch failed');

      if (!isTimeout) throw firstError;

      // Railway was cold-starting — wait 2s then retry once
      console.warn('[PROXY_LOGIN] First attempt timed out (cold start likely) — retrying in 2s...');
      await new Promise((r) => setTimeout(r, 2000));
      res = await callBackend(backendUrl, body, 15000);
    }

    // A redirect means the backend is returning an error page (down / misconfigured)
    if (res.status >= 300 && res.status < 400) {
      return NextResponse.json(
        { message: 'Backend service is temporarily unavailable. Please try again in a moment.' },
        { status: 503 }
      );
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      // Backend returned non-JSON (HTML error page from Railway/proxy)
      console.error('[PROXY_LOGIN] Backend returned non-JSON response, status:', res.status);
      return NextResponse.json(
        { message: 'Backend service is temporarily unavailable. Please try again in a moment.' },
        { status: 503 }
      );
    }

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
    const isNetworkError =
      error.cause?.code === 'ECONNREFUSED' ||
      error.message?.includes('fetch failed') ||
      error.message?.includes('aborted') ||
      error.name === 'AbortError';
    return NextResponse.json(
      {
        message: isNetworkError
          ? 'The service is starting up — please try again in a few seconds.'
          : `Login failed: ${error.message}`,
      },
      { status: 503 }
    );
  }
}
