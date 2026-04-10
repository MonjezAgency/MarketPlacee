import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: { productId: string } }) {
    try {
        const formData = await req.formData();
        
        // Sanitize API URL to avoid double slashes
        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-dfc2.up.railway.app';
        const apiUrl = rawApiUrl.replace(/\/$/, '');
        
        const backendUrl = `${apiUrl}/products/${params.productId}/reviews`;
        console.log(`[Proxy] Forwarding review for product ${params.productId} to: ${backendUrl}`);

        const headers = new Headers();
        const authHeader = req.headers.get('authorization');
        if (authHeader) headers.set('authorization', authHeader);

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
