import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

/**
 * Server-side helper: read a user's GitHub OAuth token from Convex.
 * Used by Next.js API routes (repos, branches, etc.).
 */
export async function getGitHubTokenForUser(
  userId: string
): Promise<{ accessToken: string; login: string; githubId: number } | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;

  const client = new ConvexHttpClient(convexUrl);
  return await client.query(api.github_auth.getForApi, { userId });
}
