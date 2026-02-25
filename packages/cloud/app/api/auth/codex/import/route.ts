import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';

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

    // Save tokens to Convex DB (server-side only, no cookies)
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: 'Convex not configured' },
        { status: 500 }
      );
    }

    const client = new ConvexHttpClient(convexUrl);
    await client.mutation(api.codex_auth.save, {
      userId: 'owner',
      accessToken,
      refreshToken,
      accountId,
      expiresAt: Date.now() + 3600 * 1000,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Import Codex tokens error:', error);
    return NextResponse.json(
      { error: 'Failed to import tokens' },
      { status: 500 }
    );
  }
}
