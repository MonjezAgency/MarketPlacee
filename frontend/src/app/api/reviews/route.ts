export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import { cookies } from 'next/headers';

const getBackendUrl = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-539c.up.railway.app').replace(/\/$/, '');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');

  const backendUrl = productId
    ? `${getBackendUrl()}/products/${productId}/reviews`
    : `${getBackendUrl()}/reviews`;

  try {
    const res = await fetch(backendUrl, { method: 'GET', cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (session.status !== 'ACTIVE') {
    return NextResponse.json(
      { message: 'Account must be approved to post reviews' },
      { status: 403 }
    );
  }

  const token = cookies().get('token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json({ message: 'Missing productId' }, { status: 400 });
    }

    const res = await fetch(`${getBackendUrl()}/products/${productId}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `token=${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
