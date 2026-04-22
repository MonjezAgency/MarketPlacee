export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from '@/lib/auth-server';

const getBackendUrl = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-539c.up.railway.app').replace(/\/$/, '');

/** List team members */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['ADMIN', 'OWNER'].includes(session.role.toUpperCase())) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const token = cookies().get('token')?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const res = await fetch(`${getBackendUrl()}/admin/team`, {
      headers: { Cookie: `token=${token}` },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

/** Invite a new team member */
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['ADMIN', 'OWNER'].includes(session.role.toUpperCase())) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const token = cookies().get('token')?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const res = await fetch(`${getBackendUrl()}/admin/team/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `token=${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
