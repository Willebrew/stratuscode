import { NextRequest, NextResponse } from 'next/server';
import { pollCodexDeviceAuth, saveCodexTokens } from '@/lib/codex-auth';

export async function POST(request: NextRequest) {
  try {
    const { deviceAuthId, userCode } = await request.json();

    if (!deviceAuthId || !userCode) {
      return NextResponse.json(
        { error: 'Missing deviceAuthId or userCode' },
        { status: 400 }
      );
    }

    const tokens = await pollCodexDeviceAuth(deviceAuthId, userCode);

    if (!tokens) {
      // Still pending
      return NextResponse.json({ status: 'pending' });
    }

    // Success — save tokens to cookies and return them so frontend can
    // also persist to Convex DB (Convex actions can't read cookies).
    await saveCodexTokens(tokens);
    return NextResponse.json({
      status: 'success',
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accountId: tokens.accountId,
        expiresAt: tokens.expiresAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Polling failed' },
      { status: 500 }
    );
  }
}
