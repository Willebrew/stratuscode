import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();

  // Clear both possible Better Auth cookie names
  cookieStore.delete('__Secure-better-auth.session_token');
  cookieStore.delete('better-auth.session_token');

  return NextResponse.json({ success: true });
}
