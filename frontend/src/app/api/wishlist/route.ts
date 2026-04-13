import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const cookieStore = await import('next/headers').then(m => m.cookies());
        const token = cookieStore().get('token')?.value;

        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        const apiUrl = rawApiUrl.replace(/\/$/, '');
        const backendUrl = `${apiUrl}/wishlist`;

        const res = await fetch(backendUrl, {
            method: 'GET',
            headers: {
                'Cookie': `token=${token}`,
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            const status = res.status;
            return NextResponse.json({ message: 'Backend error' }, { status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const cookieStore = await import('next/headers').then(m => m.cookies());
        const token = cookieStore().get('token')?.value;

        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        const apiUrl = rawApiUrl.replace(/\/$/, '');
        const backendUrl = `${apiUrl}/wishlist`;

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
            return NextResponse.json({ message: 'Backend error' }, { status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
