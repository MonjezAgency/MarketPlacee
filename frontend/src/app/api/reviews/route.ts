import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const productId = searchParams.get('productId');
        
        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        const apiUrl = rawApiUrl.replace(/\/$/, '');
        
        // If specific productId is provided, we fetch for that, else generic list
        const backendUrl = productId 
            ? `${apiUrl}/products/${productId}/reviews`
            : `${apiUrl}/reviews`;

        const res = await fetch(backendUrl, {
            method: 'GET',
            cache: 'no-store'
        });

        if (!res.ok) {
            return NextResponse.json({ message: 'Error fetching reviews' }, { status: res.status });
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

        if (session.status !== 'ACTIVE') {
            return NextResponse.json({ message: 'Account must be approved to post reviews' }, { status: 403 });
        }

        const body = await req.json();
        const cookieStore = cookies();
        const token = cookieStore.get('token')?.value;

        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        const apiUrl = rawApiUrl.replace(/\/$/, '');
        
        // This expects the body to contain productId if posting to base route
        const productId = body.productId;
        if (!productId) {
            return NextResponse.json({ message: 'Missing productId in request body' }, { status: 400 });
        }

        const backendUrl = `${apiUrl}/products/${productId}/reviews`;

        const res = await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${token}`,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            return NextResponse.json({ message: 'Error from backend' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
