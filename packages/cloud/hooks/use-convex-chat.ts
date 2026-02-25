'use client';

import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export type MessagePart =
  | { type: 'reasoning'; content: string }
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCall: ToolCallInfo };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: MessagePart[];
  streaming?: boolean;
  thinkingSeconds?: number;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: string;
  result?: string;
  status: 'running' | 'completed' | 'failed';
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: string;
}

export interface UseConvexChatOptions {
  onModeSwitch?: (newMode: string) => void;
}

export interface UseConvexChatReturn {
  messages: ChatMessage[];
  messagesLoading: boolean;
  isLoading: boolean;
  error: string | null;
  sessionId: Id<'sessions'> | null;
  session: any | null;
  sandboxStatus: 'idle' | 'initializing' | 'ready';
  todos: TodoItem[];
  pendingQuestion: { question: string; options?: string[] } | null;
  sendMessage: (message: string, options?: { alphaMode?: boolean; model?: string; reasoningEffort?: string; attachmentIds?: string[]; agentMode?: string }) => Promise<void>;
  answerQuestion: (answer: string) => Promise<void>;
  requestCancel: () => Promise<void>;
}

export function useConvexChat(
  sessionId: Id<'sessions'> | null,
  options: UseConvexChatOptions = {}
): UseConvexChatReturn {
  // ─── Reactive queries ───

  const session = useQuery(
    api.sessions.get,
    sessionId ? { id: sessionId } : 'skip'
  );

  const dbMessages = useQuery(
    api.messages.list,
    sessionId ? { sessionId } : 'skip'
  );

  const streamingState = useQuery(
    api.streaming.get,
    sessionId ? { sessionId } : 'skip'
  );

  const dbTodos = useQuery(
    api.todos.list,
    sessionId ? { sessionId } : 'skip'
  );

  // ─── Actions and mutations ───

  const sendUserMessageMutation = useMutation(api.messages.sendUserMessage);
  const linkAttachmentsMutation = useMutation(api.attachments.linkToMessage);
  const prepareSendMutation = useMutation(api.sessions.prepareSend);
  const sendAction = useAction(api.agent.send);
  const cancelMutation = useMutation(api.sessions.requestCancel);
  const forceResetMutation = useMutation(api.sessions.forceReset);
  const answerMutation = useMutation(api.streaming.answerQuestion);
  const recoverStaleMutation = useMutation(api.sessions.recoverStaleSession);

  // ─── Stale session recovery ───
  // When a Convex action crashes (transient error / OOM / timeout), the
  // try/catch cleanup in agent.ts never runs, leaving the session stuck in
  // "running" with isStreaming=true forever.  Detect this by checking the
  // streaming_state heartbeat and auto-recover.

  const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
  const recoveryAttempted = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || session?.status !== 'running') {
      recoveryAttempted.current = null;
      return;
    }
    // Don't attempt recovery more than once per session run
    if (recoveryAttempted.current === sessionId) return;

    const lastActivity = streamingState?.updatedAt ?? session?.updatedAt;
    if (!lastActivity) return;

    const elapsed = Date.now() - lastActivity;
    if (elapsed >= STALE_THRESHOLD_MS) {
      // Already stale — recover immediately
      console.warn(`[useConvexChat] Recovering stale session ${sessionId} (no activity for ${Math.round(elapsed / 1000)}s)`);
      recoveryAttempted.current = sessionId;
      recoverStaleMutation({ id: sessionId }).catch(() => { /* best effort */ });
      return;
    }

    // Not stale yet — schedule recovery for when it would become stale.
    // During normal operation, streamingState.updatedAt changes frequently
    // (every token flush), which resets this timer via effect cleanup.
    const checkAfter = STALE_THRESHOLD_MS - elapsed + 5000; // +5s buffer
    const sid = sessionId; // capture for closure
    const timer = setTimeout(() => {
      console.warn(`[useConvexChat] Recovering stale session ${sid} (timer fired after ${Math.round(checkAfter / 1000)}s)`);
      recoveryAttempted.current = sid;
      // The mutation is idempotent — it re-checks staleness server-side
      recoverStaleMutation({ id: sid }).catch(() => { /* best effort */ });
    }, checkAfter);
    return () => clearTimeout(timer);
  }, [sessionId, session?.status, session?.updatedAt, streamingState?.updatedAt, recoverStaleMutation]);

  // ─── Derived state ───

  const messagesLoading = dbMessages === undefined;
  const isLoading = session?.status === 'running' || session?.status === 'booting';
  const error = session?.status === 'error' ? (session.errorMessage || 'An error occurred') : null;

  const sandboxStatus = useMemo(() => {
    if (session?.status === 'booting') return 'initializing' as const;
    return 'idle' as const;
  }, [session?.status]);

  // Track the count of DB messages when streaming was active so we can detect
  // when the persisted assistant message arrives after streaming ends.
  const streamingDbCountRef = useRef<number>(0);

  // Merge completed messages with live streaming state + optimistic message
  const messages: ChatMessage[] = useMemo(() => {
    const completed: ChatMessage[] = (dbMessages || []).map((msg: any) => ({
      id: msg._id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      parts: msg.parts as MessagePart[],
      streaming: false,
      thinkingSeconds: msg.thinkingSeconds,
    }));

    // Build streaming parts helper — uses ordered parts array for correct interleaving
    const buildStreamingParts = (): MessagePart[] => {
      const result: MessagePart[] = [];
      if (streamingState?.reasoning) {
        result.push({ type: 'reasoning', content: streamingState.reasoning });
      }

      // Use ordered parts if available (new format), fall back to legacy grouping
      const orderedParts = streamingState?.parts ? JSON.parse(streamingState.parts) : null;
      if (orderedParts && orderedParts.length > 0) {
        for (const part of orderedParts) {
          if (part.type === 'text' && part.content) {
            result.push({ type: 'text', content: part.content });
          } else if (part.type === 'tool_call' && part.toolCall) {
            result.push({
              type: 'tool_call',
              toolCall: {
                id: part.toolCall.id,
                name: part.toolCall.name,
                args: part.toolCall.args,
                result: part.toolCall.result,
                status: part.toolCall.status || 'running',
              },
            });
          } else if (part.type === 'subagent_start' || part.type === 'subagent_end') {
            // Pass through subagent markers so the UI grouping logic can
            // properly nest subagent content inside its dropdown during streaming
            result.push(part as any);
          }
        }
      } else {
        // Legacy fallback: text then tool calls
        if (streamingState?.content) {
          result.push({ type: 'text', content: streamingState.content });
        }
        const toolCalls = streamingState?.toolCalls
          ? JSON.parse(streamingState.toolCalls)
          : [];
        for (const tc of toolCalls) {
          result.push({
            type: 'tool_call',
            toolCall: {
              id: tc.id,
              name: tc.name,
              args: tc.args,
              result: tc.result,
              status: tc.status || 'running',
            },
          });
        }
      }
      return result;
    };

    const dbCount = (dbMessages || []).length;

    if (streamingState?.isStreaming) {
      // Currently streaming — show live message and track DB count
      streamingDbCountRef.current = dbCount;
      completed.push({
        id: 'streaming',
        role: 'assistant',
        content: streamingState.content || '',
        parts: buildStreamingParts(),
        streaming: true,
        thinkingSeconds: typeof streamingState.thinkingSeconds === 'number' ? streamingState.thinkingSeconds : undefined,
      });
    } else if (
      (streamingState?.content || streamingState?.reasoning)
      && dbCount <= streamingDbCountRef.current
    ) {
      // Streaming just ended but the persisted assistant message hasn't arrived
      // in dbMessages yet. Keep showing the last streamed content to prevent flicker.
      completed.push({
        id: 'streaming',
        role: 'assistant',
        content: streamingState.content || '',
        parts: buildStreamingParts(),
        streaming: false,
        thinkingSeconds: typeof streamingState.thinkingSeconds === 'number' ? streamingState.thinkingSeconds : undefined,
      });
    }

    return completed;
  }, [dbMessages, streamingState]);

  const todos: TodoItem[] = useMemo(() => {
    return (dbTodos || []).map((t: any) => ({
      id: t._id,
      content: t.content,
      status: t.status as 'pending' | 'in_progress' | 'completed',
      priority: t.priority,
    }));
  }, [dbTodos]);

  const pendingQuestion = useMemo(() => {
    if (!streamingState?.pendingQuestion) return null;
    try {
      return JSON.parse(streamingState.pendingQuestion);
    } catch {
      return null;
    }
  }, [streamingState?.pendingQuestion]);

  // ─── Callbacks ───

  const sendMessage = useCallback(
    async (
      message: string,
      opts?: { alphaMode?: boolean; model?: string; reasoningEffort?: string; attachmentIds?: string[]; agentMode?: string }
    ) => {
      if (!sessionId || isLoading) return;

      // 1. Persist user message — subscription updates instantly (user sees their message)
      const messageId = await sendUserMessageMutation({ sessionId, content: message });

      // 2. Link any attachments
      if (opts?.attachmentIds?.length) {
        try {
          await linkAttachmentsMutation({ ids: opts.attachmentIds as any, messageId });
        } catch { /* best effort */ }
      }

      // 3. Prepare session state via MUTATION (not action) — this is the key:
      //    mutations update Convex subscriptions instantly, so isLoading=true,
      //    isStreaming=true, and a truncated title all propagate immediately.
      //    The send action later replaces the truncated title with an AI-generated
      //    one (+ typing animation via titleGenerated flag).
      const title = message.slice(0, 80) + (message.length > 80 ? '...' : '');
      await prepareSendMutation({
        id: sessionId,
        title,
        lastMessage: message.slice(0, 200),
        agentMode: opts?.agentMode,
      });

      // 4. Fire the agent action (fire-and-forget). Session is already "running"
      //    from prepareSend, so the UI shows loading immediately.
      //    Codex tokens are resolved server-side from Convex DB by the agent.
      sendAction({
        sessionId,
        message,
        model: opts?.model,
        alphaMode: opts?.alphaMode,
        reasoningEffort: opts?.reasoningEffort,
        attachmentIds: opts?.attachmentIds as any,
        agentMode: opts?.agentMode,
      }).catch((e) => {
        // Action failed before scheduling the agent — force-reset the session
        // so it doesn't get stuck in "running" with no agent.
        console.error('[sendMessage] Action failed, resetting session:', e);
        forceResetMutation({ id: sessionId }).catch(() => { /* best effort */ });
      });
    },
    [sessionId, isLoading, sendUserMessageMutation, linkAttachmentsMutation, prepareSendMutation, sendAction, forceResetMutation]
  );

  const answerQuestion = useCallback(
    async (answer: string) => {
      if (!sessionId) return;
      await answerMutation({ sessionId, answer });
    },
    [sessionId, answerMutation]
  );

  const requestCancel = useCallback(async () => {
    if (!sessionId) return;
    await cancelMutation({ id: sessionId });
  }, [sessionId, cancelMutation]);

  return {
    messages,
    messagesLoading,
    isLoading,
    error,
    sessionId,
    session: session || null,
    sandboxStatus,
    todos,
    pendingQuestion,
    sendMessage,
    answerQuestion,
    requestCancel,
  };
}
