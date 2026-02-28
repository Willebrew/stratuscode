import { NextResponse } from 'next/server';
import { getSessionToken } from '@/lib/auth-helpers';

export async function GET() {
  const token = await getSessionToken();

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({ authenticated: true });
}
