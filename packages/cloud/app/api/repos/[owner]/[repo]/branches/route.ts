import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { isAuthenticated } from '@/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  const { owner, repo } = await params;
  const octokit = new Octokit({ auth: githubToken });

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
