import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { getUserId } from '@/lib/auth-helpers';
import { getGitHubTokenForUser } from '@/lib/github-token';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const userId = await getUserId();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const github = await getGitHubTokenForUser(userId);
  if (!github) {
    return NextResponse.json({ error: 'github_not_connected' }, { status: 403 });
  }

  const { owner, repo } = await params;
  const octokit = new Octokit({ auth: github.accessToken });

  try {
    const { data } = await octokit.repos.listBranches({
      owner,
      repo,
      per_page: 100,
    });

    const branches = data.map((branch) => ({
      name: branch.name,
      protected: branch.protected,
    }));

    return NextResponse.json({ branches });
  } catch (error) {
    console.error('Failed to fetch branches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch branches' },
      { status: 500 }
    );
  }
}
