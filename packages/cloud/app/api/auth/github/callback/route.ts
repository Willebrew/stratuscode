import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { getUserId } from '@/lib/auth-helpers';

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

  // Debug: log cookie state
  const rawCookie =
    cookieStore.get('__Secure-better-auth.session_token')?.value ||
    cookieStore.get('better-auth.session_token')?.value ||
    null;
  const allCookieNames = cookieStore.getAll().map(c => c.name);
  console.log('[github-callback] Session cookie present:', !!rawCookie, 'All cookies:', allCookieNames);

  // Get authenticated StratusCode user
  const userId = await getUserId();
  console.log('[github-callback] userId:', userId);

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
