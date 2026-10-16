import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = [
  '/dashboard', '/admin', '/profile', '/orders',
  '/settings', '/checkout', '/supplier', '/saved'
];
const AUTH_PATHS = ['/auth/login', '/auth/register'];

// The supplier area moved from /dashboard/supplier to /supplier. Old bookmarks,
// sent emails and stored notification links keep working through a permanent
// redirect; the query string is kept. This runs before the sign-in check, so a
// signed-out visitor is then sent to /auth/login?redirect=/supplier… as usual.
const LEGACY_SUPPLIER = '/dashboard/supplier';

export function legacySupplierTarget(pathname: string): string | null {
  if (pathname !== LEGACY_SUPPLIER && !pathname.startsWith(LEGACY_SUPPLIER + '/')) return null;
  const rest = pathname.slice(LEGACY_SUPPLIER.length).replace(/\/+$/, '');
  return '/supplier' + rest;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const legacyTarget = legacySupplierTarget(pathname);
  if (legacyTarget) {
    return NextResponse.redirect(new URL(legacyTarget + request.nextUrl.search, request.url), 308);
  }

  const isProtectedRoute = PROTECTED_PATHS.some(path => pathname.startsWith(path));
  const isAuthRoute = AUTH_PATHS.some(path => pathname.startsWith(path));
  const token = request.cookies.get('token')?.value;

  // Not logged in + protected route → redirect to login
  if (isProtectedRoute && !token) {
    // Keep where the visitor was going, so signing in lands on that page
    // (the login page only accepts same-site paths; see safeRedirect there).
    const login = new URL('/auth/login', request.url);
    login.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  // Logged in + trying to visit login/register → redirect to dashboard
  // Safeguard: Allow auth routes if ?session= is present (prevents infinite loops with bad tokens)
  if (isAuthRoute && token && !request.nextUrl.searchParams.has('session')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ico)$).*)',
  ],
};
