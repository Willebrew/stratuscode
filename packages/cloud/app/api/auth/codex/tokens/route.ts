import { NextResponse } from 'next/server';
import { getCodexTokens } from '@/lib/codex-auth';

/**
 * GET /api/auth/codex/tokens
 *
 * Returns the current Codex OAuth credentials (auto-refreshed if expired).
 * Called by the frontend before invoking the Convex send action so that
 * fresh tokens can be forwarded to the server-side agent.
 */
export async function GET() {
  const tokens = await getCodexTokens();
  if (!tokens) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  return NextResponse.json({
    authenticated: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accountId: tokens.accountId,
  });
}
