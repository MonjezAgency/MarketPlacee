import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'success',
    message: 'Vercel Deployment is working correctly!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
}
