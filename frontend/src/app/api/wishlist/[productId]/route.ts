export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from '@/lib/auth-server';

const getBackendUrl = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005').replace(/\/$/, '');

/** Add product to wishlist */
export async function POST(
  _req: NextRequest,
  { params }: { params: { productId: string } }
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const token = cookies().get('token')?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const res = await fetch(`${getBackendUrl()}/wishlist/${params.productId}`, {
      method: 'POST',
      headers: { Cookie: `token=${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

/** Remove product from wishlist */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { productId: string } }
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const token = cookies().get('token')?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const res = await fetch(`${getBackendUrl()}/wishlist/${params.productId}`, {
      method: 'DELETE',
      headers: { Cookie: `token=${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
