import { cookies } from 'next/headers';

export interface ServerUser {
  id: string;
  email: string;
  role: string;
  name: string;
  companyName?: string;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'BLOCKED';
  onboardingCompleted: boolean;
}

/**
 * Server-side session helper for Next.js 14 App Router.
 * Reads the httpOnly 'token' cookie and verifies via /auth/me backend call.
 */
export async function getServerSession(): Promise<ServerUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  // ✅ No token = not logged in. Return null immediately.
  if (!token) return null;

  const apiUrl = (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://marketplace-backend-production-539c.up.railway.app'
  ).replace(/\/$/, '');

  try {
    const response = await fetch(`${apiUrl}/auth/me`, {
      method: 'GET',
      headers: {
        'Cookie': `token=${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const userData = await response.json();
    return userData as ServerUser;
  } catch {
    return null;
  }
}
