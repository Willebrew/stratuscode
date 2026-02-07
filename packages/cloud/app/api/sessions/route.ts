import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/simple-auth';
import {
  getUserSessions,
  destroyCloudSession,
  getActiveSession,
} from '@/lib/session-manager';
import { getChangesSummary } from '@/lib/github-pr';

export async function GET() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userSessions = getUserSessions('owner');

  const sessionsWithInfo = await Promise.all(
    userSessions.map(async (s) => {
      let changesSummary = null;
      try {
        changesSummary = await getChangesSummary(s.cloudSession.getSessionId());
      } catch {
        // Ignore errors getting changes
      }

      return {
        sessionId: s.cloudSession.getSessionId(),
        owner: s.owner,
        repo: s.repo,
        branch: s.branch,
        createdAt: s.createdAt,
        hasChanges: changesSummary?.hasChanges ?? false,
        filesChanged: changesSummary?.filesChanged ?? 0,
      };
    })
  );

  return NextResponse.json({ sessions: sessionsWithInfo });
}

export async function DELETE(request: Request) {
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

  await destroyCloudSession(sessionId);

  return NextResponse.json({ success: true });
}
