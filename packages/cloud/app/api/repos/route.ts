import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { isAuthenticated } from '@/lib/simple-auth';

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
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const octokit = new Octokit({ auth: githubToken });
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
