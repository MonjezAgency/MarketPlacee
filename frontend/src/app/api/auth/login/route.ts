import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-dfc2.up.railway.app';
    
    // 1. Forward login request to backend
    const res = await fetch(`${backendUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    // 2. Extract tokens from backend response
    const { access_token, refresh_token, user, requiresTwoFactor, partialToken } = data;

    // Handle 2FA case
    if (requiresTwoFactor) {
        return NextResponse.json({ requiresTwoFactor, partialToken });
    }

    // 3. Set cookies on the FRONTEND domain (not HttpOnly for now to allow middleware visibility if needed, 
    // but HttpOnly is safer. Middleware CAN read HttpOnly cookies from same-domain).
    const isProd = process.env.NODE_ENV === 'production';
    const cookieStore = cookies();
    
    if (access_token) {
      cookieStore.set('token', access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax', // Use lax for same-domain
        path: '/',
        maxAge: 15 * 60, // 15 mins
      });
    }

    if (refresh_token) {
      cookieStore.set('refreshToken', refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });
    }

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error('[PROXY_LOGIN_ERROR]', error);
    return NextResponse.json({ 
      message: `Proxy Error: ${error.message}. URL: ${process.env.BACKEND_URL || 'fallbacked'}. Hint: Check Vercel Env Vars.`,
      details: error.message
    }, { status: 500 });
  }
}
