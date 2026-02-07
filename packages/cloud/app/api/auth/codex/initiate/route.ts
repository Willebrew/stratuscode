import { NextRequest, NextResponse } from 'next/server';
import { initiateCodexAuth } from '@/lib/codex-auth';

export async function POST(request: NextRequest) {
  // Don't require auth here - user will authenticate after OAuth
  // Build the callback URL from the request origin
  const origin = request.headers.get('origin') || request.nextUrl.origin;
  const callbackUrl = `${origin}/api/auth/codex/callback`;

  const { authorizeUrl } = initiateCodexAuth(callbackUrl);

  return NextResponse.json({ authorizeUrl });
}

export async function GET(request: NextRequest) {
  // Also support GET for direct browser navigation
  const origin = request.headers.get('origin') || request.nextUrl.origin;
  const callbackUrl = `${origin}/api/auth/codex/callback`;

  const { authorizeUrl } = initiateCodexAuth(callbackUrl);

  // Redirect directly to OpenAI auth
  return NextResponse.redirect(authorizeUrl);
}
