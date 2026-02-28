import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { getUserId } from '@/lib/auth-helpers';

export async function POST() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: 'Convex not configured' }, { status: 500 });
  }

  try {
    // Optionally revoke the token on GitHub
    const client = new ConvexHttpClient(convexUrl);
    const record = await client.query(api.github_auth.getForApi, { userId });

    if (record?.accessToken && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      // Best-effort revocation — don't fail if this doesn't work
      await fetch(
        `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`).toString('base64')}`,
            Accept: 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({ access_token: record.accessToken }),
        }
      ).catch(() => {});
    }

    await client.mutation(api.github_auth.remove, { userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect GitHub:', error);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
