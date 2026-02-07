import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/simple-auth';
import {
  createCloudSession,
  getActiveSession,
  getUserSessionCount,
} from '@/lib/session-manager';
import { findModelConfig, getDefaultProvider } from '@/lib/providers';
import { resolveAnswer } from '@/lib/sandbox-tools';

const MAX_SESSIONS_PER_USER = 5;

/**
 * PUT /api/chat — Answer a pending question (resolves the blocking question tool)
 */
export async function PUT(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return new Response(JSON.stringify({ error: 'GitHub token not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const {
    repoOwner,
    repoName,
    branch,
    message,
    model: requestedModel,
    sessionId: existingSessionId,
    alphaMode,
    agent,
    reasoningEffort,
  } = body as {
    repoOwner?: string;
    repoName?: string;
    branch?: string;
    message: string;
    model?: string;
    sessionId?: string;
    alphaMode?: boolean;
    agent?: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
  };

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Determine model and provider
  const modelId = requestedModel || process.env.STRATUSCODE_MODEL || 'gpt-4o';
  const modelConfig = await findModelConfig(modelId);
  
  // Get provider - either from model config or default
  const provider = modelConfig?.provider || await getDefaultProvider();
  if (!provider) {
    return new Response(JSON.stringify({ error: 'No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or another provider API key.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Pre-flight validation for new sessions (before we start streaming)
  let activeSession = existingSessionId
    ? getActiveSession(existingSessionId)
    : undefined;

  const needsNewSession = !activeSession;

  if (needsNewSession) {
    if (!repoOwner || !repoName || !branch) {
      return new Response(
        JSON.stringify({
          error: 'repoOwner, repoName, and branch are required for new sessions',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const sessionCount = getUserSessionCount('owner');
    if (sessionCount >= MAX_SESSIONS_PER_USER) {
      return new Response(
        JSON.stringify({
          error: `Maximum ${MAX_SESSIONS_PER_USER} concurrent sessions allowed`,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Create SSE stream — session creation happens inside so boot status is visible
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: any) => {
        const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
        controller.enqueue(encoder.encode(event));
      };

      try {
        // Create sandbox with live status updates if new session
        if (needsNewSession) {
          sendEvent('sandbox_status', { status: 'initializing' });

          activeSession = await createCloudSession({
            userId: 'owner',
            owner: repoOwner!,
            repo: repoName!,
            branch: branch!,
            githubToken,
            model: modelId,
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl,
            providerType: provider.type,
            providerHeaders: provider.headers,
            agent: agent || 'build',
          });

          sendEvent('sandbox_status', { status: 'ready' });
        }

        // Store alpha mode on sandboxInfo so tools can check it
        if (activeSession!.sandboxInfo) {
          activeSession!.sandboxInfo.alphaMode = !!alphaMode;
        }

        sendEvent('session', {
          sessionId: activeSession!.cloudSession.getSessionId(),
          owner: activeSession!.owner,
          repo: activeSession!.repo,
          branch: activeSession!.branch,
        });

        await activeSession!.cloudSession.sendMessage(message, {
          onToken: (token) => {
            sendEvent('token', { content: token });
          },
          onReasoning: (text) => {
            sendEvent('reasoning', { content: text });
          },
          onToolCall: (toolCall) => {
            sendEvent('tool_call', {
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              args: toolCall.function.arguments,
            });
          },
          onToolResult: (toolCall, result) => {
            sendEvent('tool_result', {
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              args: toolCall.function.arguments,
              content: result.slice(0, 5000),
            });

            // Send todo updates as a dedicated SSE event
            if (toolCall.function.name === 'todowrite') {
              try {
                const parsed = JSON.parse(result);
                if (parsed.todos) {
                  sendEvent('todos', { todos: parsed.todos, counts: parsed.counts });
                }
              } catch { /* ignore parse errors */ }
            }

            // Detect plan_exit approval → switch mode and notify frontend
            if (toolCall.function.name === 'plan_exit') {
              try {
                const parsed = JSON.parse(result);
                if (parsed.approved && parsed.modeSwitch === 'build') {
                  activeSession!.cloudSession.switchMode('build');
                  sendEvent('mode_switch', { mode: 'build' });
                }
              } catch { /* ignore parse errors */ }
            }
          },
          onTimelineEvent: (event) => {
            sendEvent('timeline', {
              eventId: event.id,
              kind: event.kind,
              content: event.content.slice(0, 2000),
              streaming: event.streaming,
            });
          },
          onComplete: (content) => {
            sendEvent('done', {
              sessionId: activeSession!.cloudSession.getSessionId(),
              content,
            });
          },
          onError: (error) => {
            sendEvent('error', { content: error.message });
          },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        sendEvent('error', { content: errorMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
