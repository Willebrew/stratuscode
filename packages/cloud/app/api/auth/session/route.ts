import { NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';

export async function GET() {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  
  return NextResponse.json(session);
}
