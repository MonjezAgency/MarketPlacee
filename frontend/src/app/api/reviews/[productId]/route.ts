import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import { cookies } from 'next/headers';

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
        const cookieStore = cookies();
        const token = cookieStore.get('token')?.value;
        
        // Sanitize API URL
        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || '';
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
            // Pass the backend's own reason through ("You can’t review your own product.",
            // "This product can’t be reviewed.", …) so the form shows why, not a generic error.
            let message = '';
            try {
                const body = JSON.parse(errorText);
                message = Array.isArray(body?.message) ? body.message.join(' ') : (typeof body?.message === 'string' ? body.message : '');
            } catch { /* not JSON */ }
            return NextResponse.json({ message: message || undefined, status }, { status });
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
