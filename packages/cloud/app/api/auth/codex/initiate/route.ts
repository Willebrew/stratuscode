import { NextResponse } from 'next/server';
import { initiateCodexDeviceAuth } from '@/lib/codex-auth';

export async function POST() {
  try {
    const deviceAuth = await initiateCodexDeviceAuth();
    return NextResponse.json(deviceAuth);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to initiate device auth' },
      { status: 500 }
    );
  }
}
