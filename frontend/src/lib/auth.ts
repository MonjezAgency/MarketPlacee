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
 * Uses the 'token' httpOnly cookie to verify identity via the backend.
 */
export async function getServerSession(): Promise<ServerUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    return null;
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
    const response = await fetch(`${apiUrl}/auth/me`, {
      method: 'GET',
      headers: {
        'Cookie': `token=${token}`,
        'Content-Type': 'application/json',
      },
      // Ensure we don't cache sensitive user data
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const userData = await response.json();
    return userData as ServerUser;
  } catch (error) {
    console.error('[getServerSession] Error fetching user session:', error);
    return null;
  }
}
