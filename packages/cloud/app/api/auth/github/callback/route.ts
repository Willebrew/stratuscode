import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHmac } from 'crypto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const origin = request.nextUrl.origin;

  if (!code || !state) {
    return NextResponse.redirect(new URL('/chat?github_error=missing_params', origin));
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get('github_oauth_state')?.value;
  cookieStore.delete('github_oauth_state');

  if (!storedState || storedState !== state) {
    console.log('[github-callback] State mismatch. stored:', !!storedState);
    return NextResponse.redirect(new URL('/chat?github_error=invalid_state', origin));
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/github/callback`,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/chat?github_error=token_exchange_failed', origin));
  }

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    console.error('[github-callback] Token error:', tokenData.error, tokenData.error_description);
    return NextResponse.redirect(new URL('/chat?github_error=token_exchange_failed', origin));
  }

  const accessToken: string = tokenData.access_token;

  // Fetch GitHub user profile
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
  });

  if (!userRes.ok) {
    return NextResponse.redirect(new URL('/chat?github_error=profile_fetch_failed', origin));
  }

  const githubUser = await userRes.json();
  console.log('[github-callback] GitHub user:', githubUser.login);

  // ── Inline getUserId with full error logging ──
  let userId: string | null = null;
  try {
    // 1. Read cookie
    const raw =
      cookieStore.get('__Secure-better-auth.session_token')?.value ||
      cookieStore.get('better-auth.session_token')?.value ||
      null;
    console.log('[github-callback] Session cookie raw present:', !!raw, 'length:', raw?.length);

    if (!raw) {
      const allNames = cookieStore.getAll().map(c => c.name);
      console.log('[github-callback] All cookies:', allNames);
    }

    // 2. Verify HMAC
    if (raw) {
      const secret = process.env.BETTER_AUTH_SECRET;
      console.log('[github-callback] BETTER_AUTH_SECRET present:', !!secret);

      if (secret) {
        const lastDot = raw.lastIndexOf('.');
        if (lastDot !== -1) {
          const token = raw.substring(0, lastDot);
          const sig = raw.substring(lastDot + 1);
          const expected = createHmac('sha256', secret).update(token).digest('base64');
          const sigMatch = sig === expected;
          console.log('[github-callback] HMAC match:', sigMatch);

          if (sigMatch) {
            // 3. Query database
            console.log('[github-callback] Querying prisma for token...');
            const session = await prisma.session.findUnique({
              where: { token },
              select: { userId: true, expiresAt: true },
            });
            console.log('[github-callback] Session found:', !!session, 'expired:', session ? session.expiresAt < new Date() : 'N/A');

            if (session && session.expiresAt >= new Date()) {
              userId = session.userId;
            }
          }
        } else {
          console.log('[github-callback] No dot in cookie value');
        }
      }
    }
  } catch (e) {
    console.error('[github-callback] Auth error:', e);
  }

  console.log('[github-callback] Final userId:', userId);

  if (!userId) {
    return NextResponse.redirect(new URL('/chat?github_error=not_authenticated', origin));
  }

  // Store in Convex
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.redirect(new URL('/chat?github_error=convex_not_configured', origin));
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    await client.mutation(api.github_auth.save, {
      userId,
      accessToken,
      login: githubUser.login,
      githubId: githubUser.id,
      name: githubUser.name || undefined,
    });
    console.log('[github-callback] Saved to Convex');
  } catch (e) {
    console.error('[github-callback] Convex save failed:', e);
    return NextResponse.redirect(new URL('/chat?github_error=save_failed', origin));
  }

  return NextResponse.redirect(new URL('/chat', origin));
}
