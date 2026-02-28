import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();

  // Clear all auth cookies
  cookieStore.delete('__Secure-better-auth.session_token');
  cookieStore.delete('better-auth.session_token');
  cookieStore.delete('__Secure-stratuscode.user');
  cookieStore.delete('stratuscode.user');

  return NextResponse.json({ success: true });
}
