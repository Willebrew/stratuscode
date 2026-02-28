import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { isAuthenticated } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  const octokit = new Octokit({ auth: githubToken });

  let body: { name?: string; description?: string; private?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { name, description } = body;
  const isPrivate = body.private ?? true;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Repository name is required' }, { status: 400 });
  }

  // Validate repo name (GitHub rules: alphanumeric, hyphens, underscores, dots)
  const validName = /^[a-zA-Z0-9._-]+$/.test(name.trim());
  if (!validName) {
    return NextResponse.json(
      { error: 'Invalid repository name. Use only letters, numbers, hyphens, underscores, and dots.' },
      { status: 400 }
    );
  }

  try {
    const { data: repo } = await octokit.repos.createForAuthenticatedUser({
      name: name.trim(),
      description: description || '',
      private: isPrivate,
      auto_init: true,
    });

    return NextResponse.json({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      url: repo.html_url,
    });
  } catch (error: unknown) {
    console.error('Failed to create repo:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to create repository';

    // GitHub returns 422 for duplicate repo names
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status: number }).status
        : 500;

    return NextResponse.json(
      { error: status === 422 ? 'A repository with this name already exists' : message },
      { status }
    );
  }
}
