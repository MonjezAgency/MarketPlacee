import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: { productId: string } }) {
    try {
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Only ACTIVE users can post reviews
        if (session.status !== 'ACTIVE') {
            return NextResponse.json({ message: 'Account must be approved to post reviews' }, { status: 403 });
        }

        const formData = await req.formData();
        const cookieStore = await import('next/headers').then(m => m.cookies());
        const token = cookieStore().get('token')?.value;
        
        // Sanitize API URL
        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        const apiUrl = rawApiUrl.replace(/\/$/, '');
        const backendUrl = `${apiUrl}/products/${params.productId}/reviews`;

        const headers = new Headers();
        if (token) headers.set('Cookie', `token=${token}`);
        
        const res = await fetch(backendUrl, {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!res.ok) {
            const status = res.status;
            let errorText = '';
            try {
                errorText = await res.text();
            } catch (e) {
                errorText = 'Could not read error body';
            }
            
            console.error(`[Proxy] Backend error ${status}: ${errorText}`);
            return NextResponse.json(
                { message: 'Error from backend', details: errorText, status: status }, 
                { status: status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Proxy] Internal Error in /api/reviews:', error);
        return NextResponse.json(
            { message: 'Internal Server Error', error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }, 
            { status: 500 }
        );
    }
}
