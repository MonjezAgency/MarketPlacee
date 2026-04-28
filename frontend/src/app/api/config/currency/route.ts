import { NextResponse } from 'next/server';

// Returns the platform currency — reads from env (set by admin) or defaults to EGP
export async function GET() {
  const currency = process.env.DEFAULT_CURRENCY || process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'EGP';
  return NextResponse.json({ currency: currency.toUpperCase() });
}
