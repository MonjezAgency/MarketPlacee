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
  // Email tracking endpoints — recipients' mail clients fetch
  // these (the 1×1 open pixel + click-through redirect) and they
  // never carry auth cookies. Must stay public.
  'email/track',
];

async function handler(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const backendPath = params.path.join('/');
  const isPublic = PUBLIC_PATHS.some(p =>
    backendPath === p ||
    backendPath.startsWith(p + '?') ||
    backendPath.startsWith(p + '/'),
  );

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

      // Read the request body fully BEFORE handing it to upstream fetch.
      //
      // Why: Node 18+ undici fetch + req.body (a ReadableStream) needs
      // duplex:'half' AND the stream must still be unread. In Next.js
      // 14 the stream is sometimes consumed during routing, leaving
      // `req.body` null even on POST requests — which surfaces as the
      // generic "expected non-null body source" undici error and
      // breaks every register / login / mutation request.
      //
      // Reading via req.arrayBuffer() materialises the body into a
      // buffer we own, then we forward it as a plain Buffer body.
      // No streaming → no duplex flag → no surprises.
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const contentLength = req.headers.get('content-length');
        if (contentLength && contentLength !== '0') {
          try {
            const buf = await req.arrayBuffer();
            if (buf.byteLength > 0) {
              fetchOptions.body = Buffer.from(buf) as any;
            }
          } catch (bodyErr) {
            console.error('[PROXY] failed to read request body', bodyErr);
          }
        }
      }

      const res = await fetch(backendUrl, fetchOptions);
      clearTimeout(timeoutId);

      const responseData = await res.arrayBuffer();
      // Catch Railway's service-level 404 ("Application not found") and
      // rewrite it into an actionable message so every page the user
      // touches doesn't surface the same confusing string.
      if (res.status === 404) {
        try {
          const peek = new TextDecoder().decode(responseData.slice(0, 500));
          if (/application not found/i.test(peek) && /"code"\s*:\s*404/.test(peek)) {
            return NextResponse.json(
              {
                message:
                  `Backend service is unreachable at ${getBackendUrl()}. ` +
                  `The URL is mis-configured — find the live Railway URL ` +
                  `(Railway dashboard → service → Settings → Networking → ` +
                  `Public URL) and set BACKEND_URL on Vercel.`,
                backend: getBackendUrl(),
              },
              { status: 503 },
            );
          }
        } catch { /* fall through to raw passthrough below */ }
      }
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
