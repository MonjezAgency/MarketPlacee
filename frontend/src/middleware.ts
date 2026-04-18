import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';


const PROTECTED_PATHS = [
  '/dashboard', '/admin', '/profile', '/orders',
  '/settings', '/checkout', '/supplier', '/saved'
];
const AUTH_PATHS = ['/auth/login', '/auth/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedRoute = PROTECTED_PATHS.some(path => pathname.startsWith(path));
  const isAuthRoute = AUTH_PATHS.some(path => pathname.startsWith(path));
  const token = request.cookies.get(process.env.JWT_COOKIE_NAME || 'token')?.value;

  // ✅ Not logged in + protected route → redirect to login
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // ✅ Logged in + validate token
  if (isProtectedRoute && token) {
    try {
      let payload: any;
      try {
        let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        
        // Use Buffer (native in Next.js Edge) or safely fallback to atob
        if (typeof Buffer !== 'undefined') {
          payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
        } else {
          payload = JSON.parse(atob(base64));
        }
      } catch (decodeError) {
        throw new Error('Failed to decode the JWT correctly');
      }

      const onboardingCompleted = payload?.onboardingCompleted as boolean;
      const role = payload?.role as string;

      if (onboardingCompleted === false && role !== 'ADMIN' && pathname !== '/auth/onboarding') {
        return NextResponse.redirect(new URL('/auth/onboarding', request.url));
      }
    } catch (e) {
      console.error('Terminal Token Decode Error:', e);
      const response = NextResponse.redirect(new URL('/auth/login', request.url));
      response.cookies.delete(process.env.JWT_COOKIE_NAME || 'token');
      return response;
    }
  }

  // ✅ Already logged in + trying to visit login/register → redirect to dashboard
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // ✅ REMOVED the API proxy — it was bypassing route handlers and breaking auth
  // All /api/* routes must pass through Next.js route handlers (wishlist, payment, reviews)

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ico)$).*)',
  ],
};
