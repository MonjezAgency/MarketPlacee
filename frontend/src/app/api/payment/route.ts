import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Hardening: Payments require ACTIVE status
        if (session.status !== 'ACTIVE') {
            return NextResponse.json({ message: 'Account approval required for payments' }, { status: 403 });
        }

        const body = await req.json();
        const cookieStore = cookies();
        const token = cookieStore.get('token')?.value;

        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        const apiUrl = rawApiUrl.replace(/\/$/, '');
        const backendUrl = `${apiUrl}/payments/create-intent`;

        const res = await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${token}`,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const status = res.status;
            let errorMessage = 'Failed to create payment intent';
            try {
                const errorData = await res.json();
                errorMessage = errorData.message || errorMessage;
            } catch (e) {}
            
            return NextResponse.json({ message: errorMessage }, { status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Payment API Proxy Error]:', error);
        return NextResponse.json({ message: 'Internal server error during payment initialization' }, { status: 500 });
    }
}
