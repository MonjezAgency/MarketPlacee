export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from '@/lib/auth-server';

const getBackendUrl = () =>
  (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005').replace(/\/$/, '');

/** Delete a team member */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['ADMIN', 'OWNER'].includes(session.role.toUpperCase())) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const token = cookies().get('token')?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const res = await fetch(`${getBackendUrl()}/admin/team/${params.id}`, {
      method: 'DELETE',
      headers: { Cookie: `token=${token}` },
    });
    const data = await res.json().catch(() => ({ success: true }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
