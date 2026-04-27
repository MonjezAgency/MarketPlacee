export const dynamic = 'force-dynamic';

/**
 * Catch-all authenticated proxy for admin/dashboard API calls.
 *
 * Usage from client components:
 *   fetch('/api/proxy/users?status=PENDING_APPROVAL')
 *   fetch('/api/proxy/products/123/approve', { method: 'PATCH' })
 *
 * This proxy reads the `token` cookie (set on the Vercel domain by the login
 * proxy) and forwards it to the Railway backend as a Cookie header, solving
 * the cross-domain cookie problem.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";

const getBackendUrl = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-539c.up.railway.app').trim().replace(/\/+$/, '');

const PUBLIC_PATHS = [
  'auth/login',
  'auth/register',
  'auth/forgot-password',
  'auth/reset-password',
  'auth/verify-email',
  'auth/google-login',
  'auth/refresh',
  'newsletter/subscribe',
];

async function handler(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const backendPath = params.path.join('/');
  const isPublic = PUBLIC_PATHS.some(p => backendPath === p || backendPath.startsWith(p + '?'));

  // Get token from either cookie (standard login) or session (Google login)
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken || cookies().get('token')?.value;

  if (!token && !isPublic) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const search = req.nextUrl.search; // includes the '?' and query string
  const backendUrl = `${getBackendUrl()}/${backendPath}${search}`;

  // Build forwarded headers
  const forwardHeaders: Record<string, string> = {};
  if (token) {
    forwardHeaders['Cookie'] = `token=${token}`;
    forwardHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Forward Content-Type if present (needed for JSON/FormData bodies)
  const contentType = req.headers.get('content-type');
  if (contentType) {
    forwardHeaders['Content-Type'] = contentType;
  }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for bulk uploads and complex tasks

      const fetchOptions: RequestInit = {
        method: req.method,
        headers: forwardHeaders,
        signal: controller.signal,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOptions.body = req.body;
        // Node.js 18+ fetch requires duplex: 'half' when streaming a Request body
        (fetchOptions as any).duplex = 'half';
      }

      const res = await fetch(backendUrl, fetchOptions);
      clearTimeout(timeoutId);

      const responseData = await res.arrayBuffer();
      return new NextResponse(responseData, {
        status: res.status,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'application/json',
        },
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return NextResponse.json({ message: 'Backend request timed out' }, { status: 504 });
      }
      return NextResponse.json({ message: err.message || 'Proxy error' }, { status: 500 });
    }
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
