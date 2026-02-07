import { NextResponse } from 'next/server';
import { logout } from '@/lib/simple-auth';

export async function POST() {
  await logout();
  return NextResponse.json({ success: true });
}
