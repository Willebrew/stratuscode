import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { getUserId } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const origin = request.nextUrl.origin;

  console.log('[github-callback] Starting callback, origin:', origin);

  if (!code || !state) {
    console.log('[github-callback] Missing code or state');
    return NextResponse.redirect(
      new URL('/chat?github_error=missing_params', origin)
    );
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get('github_oauth_state')?.value;
  cookieStore.delete('github_oauth_state');

  console.log('[github-callback] State match:', storedState === state, 'stored:', !!storedState);

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL('/chat?github_error=invalid_state', origin)
    );
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/github/callback`,
    }),
  });

  if (!tokenRes.ok) {
    console.log('[github-callback] Token exchange HTTP failed:', tokenRes.status);
    return NextResponse.redirect(
      new URL('/chat?github_error=token_exchange_failed', origin)
    );
  }

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    console.error('[github-callback] Token exchange error:', tokenData.error, tokenData.error_description);
    return NextResponse.redirect(
      new URL('/chat?github_error=token_exchange_failed', origin)
    );
  }

  const accessToken: string = tokenData.access_token;
  console.log('[github-callback] Got access token, length:', accessToken?.length);

  // Fetch GitHub user profile
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!userRes.ok) {
    console.log('[github-callback] Profile fetch failed:', userRes.status);
    return NextResponse.redirect(
      new URL('/chat?github_error=profile_fetch_failed', origin)
    );
  }

  const githubUser = await userRes.json();
  console.log('[github-callback] GitHub user:', githubUser.login, 'id:', githubUser.id);

  // Get authenticated StratusCode user
  const userId = await getUserId();
  console.log('[github-callback] StratusCode userId:', userId);

  if (!userId) {
    // Log all cookies for debugging
    const allCookies = cookieStore.getAll().map(c => c.name);
    console.log('[github-callback] No userId! Available cookies:', allCookies);
    return NextResponse.redirect(
      new URL('/chat?github_error=not_authenticated', origin)
    );
  }

  // Store in Convex
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  console.log('[github-callback] Convex URL:', convexUrl);

  if (!convexUrl) {
    return NextResponse.redirect(
      new URL('/chat?github_error=convex_not_configured', origin)
    );
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
    console.log('[github-callback] Saved to Convex successfully');
  } catch (e) {
    console.error('[github-callback] Failed to save to Convex:', e);
    return NextResponse.redirect(
      new URL('/chat?github_error=save_failed', origin)
    );
  }

  return NextResponse.redirect(new URL('/chat', origin));
}
