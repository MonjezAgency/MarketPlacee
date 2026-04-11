import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED_PATHS = ['/dashboard', '/admin', '/profile', '/orders', '/settings', '/checkout'];
const AUTH_PATH = '/auth/';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isProtectedRoute = PROTECTED_PATHS.some(path => pathname.startsWith(path));
    const token = request.cookies.get(process.env.JWT_COOKIE_NAME || 'token')?.value;

    if (isProtectedRoute && token) {
        try {
            const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-default-secret-change-me');
            const { payload } = await jwtVerify(token, secret);
            
            const onboardingCompleted = payload.onboardingCompleted as boolean;
            const onboardingPath = '/auth/onboarding';

            if (onboardingCompleted === false && pathname !== onboardingPath) {
                console.log(`[MIDDLEWARE] Guard: Redirecting to onboarding from ${pathname}`);
                return NextResponse.redirect(new URL(onboardingPath, request.url));
            }
        } catch (error: any) {
            console.warn(`[MIDDLEWARE] JWT Invalid: ${error.message}. Redirecting to login.`);
            const response = NextResponse.redirect(new URL('/auth/login', request.url));
            response.cookies.delete(process.env.JWT_COOKIE_NAME || 'token');
            return response;
        }
    }

    // Preserve existing API Proxy logic for specific routes
    const apiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl && pathname.startsWith('/api/') && !pathname.startsWith('/api/auth') && !pathname.includes('reviews') && !pathname.includes('shipping')) {
        const backendPath = pathname.replace(/^\/api/, '');
        const backendBase = apiUrl.replace(/\/$/, '');
        const url = new URL(`${backendBase}${backendPath}${request.nextUrl.search}`);
        return NextResponse.rewrite(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Run on all paths EXCLUDING:
         * 1. /api (Backend handle auth)
         * 2. /auth (Onboarding, Login, Register - prevents loops)
         * 3. /_next, /favicon.ico, and static assets (extensions)
         */
        '/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ico)$).*)',
    ],
};
