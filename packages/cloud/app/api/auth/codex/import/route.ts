import { NextRequest, NextResponse } from 'next/server';
import { saveCodexTokens } from '@/lib/codex-auth';
import type { CodexTokens } from '@/lib/codex-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessToken, refreshToken, accountId } = body;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'accessToken and refreshToken are required' },
        { status: 400 }
      );
    }

    // Create CodexTokens object
    const tokens: CodexTokens = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
      accountId,
    };

    // Save to cookie
    await saveCodexTokens(tokens);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Import Codex tokens error:', error);
    return NextResponse.json(
      { error: 'Failed to import tokens' },
      { status: 500 }
    );
  }
}
