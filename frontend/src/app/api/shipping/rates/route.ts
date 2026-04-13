export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const cartTotal = searchParams.get('cartTotal') || '0';
        const destination = searchParams.get('destination') || 'Default';
        
        // Use BACKEND_URL (server-side variable) or NEXT_PUBLIC_API_URL (client-side fallback)
        const rawApiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-dfc2.up.railway.app';
        const apiUrl = rawApiUrl.replace(/\/$/, '');
        
        const backendUrl = `${apiUrl}/shipping/rates?cartTotal=${cartTotal}&destination=${destination}`;
        console.log(`[Proxy] Fetching shipping rates from: ${backendUrl}`);

        const res = await fetch(backendUrl);

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[Proxy] Shipping API error ${res.status}: ${errorText}`);
            return NextResponse.json({ message: 'Error from backend', details: errorText }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Proxy] Internal Error in /api/shipping/rates:', error);
        return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
    }
}
