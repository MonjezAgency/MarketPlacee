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

const getBackendUrl = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005').replace(/\/$/, '');

async function handler(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const token = cookies().get('token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const backendPath = params.path.join('/');
  const search = req.nextUrl.search; // includes the '?' and query string
  const backendUrl = `${getBackendUrl()}/${backendPath}${search}`;

  // Build forwarded headers
  const forwardHeaders: Record<string, string> = {
    Cookie: `token=${token}`,
  };

  // Forward Content-Type if present (needed for JSON/FormData bodies)
  const contentType = req.headers.get('content-type');
  if (contentType) {
    forwardHeaders['Content-Type'] = contentType;
  }

  try {
    const body =
      req.method !== 'GET' && req.method !== 'HEAD'
        ? await req.arrayBuffer()
        : undefined;

    const res = await fetch(backendUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: body ? Buffer.from(body) : undefined,
    });

    const responseData = await res.arrayBuffer();
    return new NextResponse(responseData, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Proxy error' }, { status: 500 });
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
