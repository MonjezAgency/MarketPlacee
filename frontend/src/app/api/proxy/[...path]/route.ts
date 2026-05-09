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
  'auth/emergency-reset',
  'newsletter/subscribe',
  'products/price-ticker',
  // Health endpoints — no auth so the operator can hit them from
  // the browser to verify Railway connectivity even when locked out.
  'health',
  'health/database',
  'health/payments',
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
        return NextResponse.json(
          { message: `Backend request to ${getBackendUrl()} timed out after 60s. The Railway service may be cold-starting or down.` },
          { status: 504 },
        );
      }
      // "fetch failed" by itself is unhelpful — surface the actual
      // upstream URL + error cause so the operator (and us) can
      // tell at a glance whether it's a wrong env var, a Railway
      // outage, a DNS issue, or a CORS/firewall block.
      const causeMsg =
        err?.cause?.message ||
        err?.cause?.code ||
        err?.code ||
        err?.message ||
        'unknown error';
      console.error('[PROXY] upstream fetch failed', {
        backend: getBackendUrl(),
        path: `/${backendPath}`,
        method: req.method,
        err: causeMsg,
      });
      return NextResponse.json(
        {
          message: `Cannot reach the backend at ${getBackendUrl()} (${causeMsg}). Check that Railway is running and BACKEND_URL is set on Vercel.`,
          backend: getBackendUrl(),
          cause: causeMsg,
        },
        { status: 502 },
      );
    }
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
