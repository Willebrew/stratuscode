import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodexCode, saveCodexTokens } from '@/lib/codex-auth';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/login?codex_error=missing_params', request.nextUrl.origin)
    );
  }

  const callbackUrl = `${request.nextUrl.origin}/api/auth/codex/callback`;
  const tokens = await exchangeCodexCode(code, state, callbackUrl);

  if (!tokens) {
    return NextResponse.redirect(
      new URL('/login?codex_error=exchange_failed', request.nextUrl.origin)
    );
  }

  await saveCodexTokens(tokens);

  return NextResponse.redirect(
    new URL('/chat?codex_success=true', request.nextUrl.origin)
  );
}
