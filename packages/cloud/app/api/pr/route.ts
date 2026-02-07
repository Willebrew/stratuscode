import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/simple-auth';
import { getActiveSession } from '@/lib/session-manager';
import { pushAndCreatePR, getChangesSummary } from '@/lib/github-pr';

export async function POST(request: Request) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { sessionId, title, body: prBody } = body as {
    sessionId: string;
    title?: string;
    body?: string;
  };

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 }
    );
  }

  const activeSession = getActiveSession(sessionId);

  if (!activeSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  try {
    const result = await pushAndCreatePR({
      sessionId,
      owner: activeSession.owner,
      repo: activeSession.repo,
      baseBranch: activeSession.branch,
      sessionBranch: activeSession.sandboxInfo.sessionBranch,
      githubToken,
      title: title || `StratusCode changes - ${new Date().toLocaleDateString()}`,
      body: prBody,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to create PR:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create PR',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 }
    );
  }

  const activeSession = getActiveSession(sessionId);

  if (!activeSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  try {
    const summary = await getChangesSummary(sessionId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Failed to get changes summary:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to get changes',
      },
      { status: 500 }
    );
  }
}
