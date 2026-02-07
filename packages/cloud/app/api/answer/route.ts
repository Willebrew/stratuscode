import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/simple-auth';
import { getActiveSession } from '@/lib/session-manager';
import { resolveAnswer } from '@/lib/sandbox-tools';

export async function POST(request: NextRequest) {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const { sessionId, answer } = body as { sessionId?: string; answer?: string };

  if (!sessionId || !answer) {
    return new Response(JSON.stringify({ error: 'sessionId and answer are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = getActiveSession(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resolved = resolveAnswer(session.sandboxInfo.sandboxId, answer);
  if (!resolved) {
    return new Response(JSON.stringify({ error: 'No pending question for this session' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
