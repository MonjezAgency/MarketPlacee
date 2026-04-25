import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const cookieStore = cookies();
  const host = request.headers.get('host') || '';
  const isCustomDomain = host.includes('atlantisfmcg.com');
  
  const cookieOptions: any = {
    path: '/',
  };

  if (isCustomDomain) {
    cookieOptions.domain = '.atlantisfmcg.com';
  }

  cookieStore.delete({ name: 'token', ...cookieOptions });
  cookieStore.delete({ name: 'refreshToken', ...cookieOptions });
  
  return NextResponse.json({ success: true });
}
