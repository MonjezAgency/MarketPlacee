import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: { productId: string } }) {
    try {
        const formData = await req.formData();
        // Use BACKEND_URL (server-side variable) or NEXT_PUBLIC_API_URL (client-side fallback)
        const apiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-dfc2.up.railway.app';
        
        const backendUrl = `${apiUrl}/products/${params.productId}/reviews`;
        const headers = new Headers();
        
        const authHeader = req.headers.get('authorization');
        if (authHeader) headers.set('authorization', authHeader);

        const res = await fetch(backendUrl, {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ message: 'Error from backend', details: err }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
    }
}
