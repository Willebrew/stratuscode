import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { getUserId } from '@/lib/auth-helpers';
import { getGitHubTokenForUser } from '@/lib/github-token';

export interface RepoInfo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  language: string | null;
  updatedAt: string;
}

export async function GET(request: NextRequest) {
  const userId = await getUserId();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const github = await getGitHubTokenForUser(userId);
  if (!github) {
    return NextResponse.json({ error: 'github_not_connected' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const octokit = new Octokit({ auth: github.accessToken });
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = parseInt(searchParams.get('per_page') || '30', 10);
  const search = searchParams.get('search') || '';

  try {

    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      direction: 'desc',
      per_page: perPage,
      page,
      affiliation: 'owner,collaborator,organization_member',
    });

    let repos: RepoInfo[] = data.map((repo) => ({
      id: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      private: repo.private,
      description: repo.description,
      updatedAt: repo.updated_at ?? '',
      language: repo.language,
    }));

    if (search) {
      const searchLower = search.toLowerCase();
      repos = repos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(searchLower) ||
          repo.fullName.toLowerCase().includes(searchLower) ||
          repo.description?.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({ repos, page, perPage });
  } catch (error) {
    console.error('Failed to fetch repos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
