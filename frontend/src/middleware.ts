import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = [
  '/dashboard', '/admin', '/profile', '/orders',
  '/settings', '/checkout', '/supplier', '/saved'
];
const AUTH_PATHS = ['/auth/login', '/auth/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedRoute = PROTECTED_PATHS.some(path => pathname.startsWith(path));
  const isAuthRoute = AUTH_PATHS.some(path => pathname.startsWith(path));
  const token = request.cookies.get('token')?.value;

  // Not logged in + protected route → redirect to login
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Logged in + trying to visit login/register → redirect to dashboard
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ico)$).*)',
  ],
};
