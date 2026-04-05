import { NextRequest, NextResponse } from 'next/server';



// This route bypasses Next.js body parser limits for large file uploads
export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('authorization') || '';
        const backendUrl = process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/products/bulk-upload` : 'http://localhost:3001/products/bulk-upload';

        // Parse formData properly and forward it instead of raw request_body
        const formData = await request.formData();

        const response = await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'authorization': token,
                // Node fetch automatically calculates boundary when passing FormData
            },
            body: formData,
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        console.error('[API Route] Bulk upload proxy error:', error);
        return NextResponse.json(
            { message: error.message || 'Upload proxy failed', totalRows: 0, successCount: 0, errorCount: 0, results: [] },
            { status: 500 }
        );
    }
}
