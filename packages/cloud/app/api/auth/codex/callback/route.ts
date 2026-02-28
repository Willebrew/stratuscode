import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodexCode, getPkceVerifier } from '@/lib/codex-auth';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { getUserId } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/login?codex_error=missing_params', request.nextUrl.origin)
    );
  }

  const codeVerifier = await getPkceVerifier();
  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL('/login?codex_error=missing_pkce', request.nextUrl.origin)
    );
  }

  const callbackUrl = `${request.nextUrl.origin}/api/auth/codex/callback`;
  const tokens = await exchangeCodexCode(code, state, callbackUrl, codeVerifier);

  if (!tokens) {
    return NextResponse.redirect(
      new URL('/login?codex_error=exchange_failed', request.nextUrl.origin)
    );
  }

  // Save tokens to Convex DB (server-side only, no cookies)
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const userId = await getUserId();
  if (convexUrl && userId) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      await client.mutation(api.codex_auth.save, {
        userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accountId: tokens.accountId,
        expiresAt: tokens.expiresAt,
      });
    } catch (e) {
      console.error('Failed to save codex tokens to Convex:', e);
    }
  }

  return NextResponse.redirect(
    new URL('/chat?codex_success=true', request.nextUrl.origin)
  );
}
