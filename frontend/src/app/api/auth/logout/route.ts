import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const cookieStore = cookies();
  const host = request.headers.get('host') || '';
  const isCustomDomain = host.includes('atlantisfmcg.com');
  
  const cookieOptions: any = {
    path: '/',
  };

  /* Domain logic removed to match login route - browser defaults to current host */

  cookieStore.delete({ name: 'token', ...cookieOptions });
  cookieStore.delete({ name: 'refreshToken', ...cookieOptions });
  // Google sign-ins also hold a NextAuth session (the proxy falls back to it),
  // so it must be cleared too or the user stays signed in.
  for (const name of ['next-auth.session-token', '__Secure-next-auth.session-token', 'next-auth.callback-url', '__Secure-next-auth.callback-url']) {
    cookieStore.set({ name, value: '', path: '/', maxAge: 0, secure: name.startsWith('__Secure-'), httpOnly: true, sameSite: 'lax' });
  }
  
  return NextResponse.json({ success: true });
}
