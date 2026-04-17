import { NextResponse } from 'next/server';

// Returns the platform currency — reads from env (set by admin) or defaults to EUR
export async function GET() {
  const currency = process.env.DEFAULT_CURRENCY || process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'eur';
  return NextResponse.json({ currency: currency.toLowerCase() });
}
