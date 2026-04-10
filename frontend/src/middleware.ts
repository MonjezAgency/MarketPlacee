import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // NextAuth specific routes that must be handled by Next.js
    const nextAuthRoutes = [
        '/api/auth/callback',
        '/api/auth/signin',
        '/api/auth/signout',
        '/api/auth/session',
        '/api/auth/providers',
        '/api/auth/csrf',
        '/api/auth/error',
        '/api/auth/_log'
    ];

    if (nextAuthRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.next();
    }

    // Proxy all other /api/* routes to the backend
    const apiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl && pathname.startsWith('/api/') && !pathname.startsWith('/api/reviews')) {
        const backendPath = pathname.replace(/^\/api/, '');
        const backendBase = apiUrl.replace(/\/$/, '');
        const url = new URL(`${backendBase}${backendPath}${request.nextUrl.search}`);
        return NextResponse.rewrite(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: '/api/:path*',
};
