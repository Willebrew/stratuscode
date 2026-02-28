import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({ authenticated: true });
}
