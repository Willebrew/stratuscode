'use client';

import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useCallback, useMemo } from 'react';

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
  isLoading: boolean;
  error: string | null;
  sessionId: Id<'sessions'> | null;
  session: any | null;
  sandboxStatus: 'idle' | 'initializing' | 'ready';
  todos: TodoItem[];
  pendingQuestion: { question: string; options?: string[] } | null;
  sendMessage: (message: string, options?: { alphaMode?: boolean; model?: string; reasoningEffort?: string }) => Promise<void>;
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
  const sendAction = useAction(api.agent.send);
  const cancelMutation = useMutation(api.sessions.requestCancel);
  const answerMutation = useMutation(api.streaming.answerQuestion);

  // ─── Derived state ───

  const isLoading = session?.status === 'running' || session?.status === 'booting';
  const error = session?.status === 'error' ? (session.errorMessage || 'An error occurred') : null;

  const sandboxStatus = useMemo(() => {
    if (session?.status === 'booting') return 'initializing' as const;
    return 'idle' as const;
  }, [session?.status]);

  // Merge completed messages with live streaming state + optimistic message
  const messages: ChatMessage[] = useMemo(() => {
    const completed: ChatMessage[] = (dbMessages || []).map((msg: any) => ({
      id: msg._id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      parts: msg.parts as MessagePart[],
      streaming: false,
    }));

    // If streaming, add a live assistant message
    if (streamingState?.isStreaming) {
      const parts: MessagePart[] = [];

      if (streamingState.reasoning) {
        parts.push({ type: 'reasoning', content: streamingState.reasoning });
      }

      const toolCalls = streamingState.toolCalls
        ? JSON.parse(streamingState.toolCalls)
        : [];
      for (const tc of toolCalls) {
        parts.push({
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

      if (streamingState.content) {
        parts.push({ type: 'text', content: streamingState.content });
      }

      completed.push({
        id: 'streaming',
        role: 'assistant',
        content: streamingState.content || '',
        parts,
        streaming: true,
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
      opts?: { alphaMode?: boolean; model?: string; reasoningEffort?: string }
    ) => {
      if (!sessionId || isLoading) return;
      // Persist user message via mutation — updates subscription instantly (no flicker).
      // This is durable: even if the action below fails, the message stays in the DB.
      await sendUserMessageMutation({ sessionId, content: message });
      try {
        // Fire the agent action (user message already in DB)
        await sendAction({
          sessionId,
          message,
          model: opts?.model,
          alphaMode: opts?.alphaMode,
          reasoningEffort: opts?.reasoningEffort,
        });
      } catch (e) {
        // If the action fails (expired sandbox, network error, etc.), reset session
        // so it doesn't get stuck in "running" with no agent.
        console.error('[sendMessage] Action failed, resetting session:', e);
        try {
          await cancelMutation({ id: sessionId });
        } catch { /* best effort */ }
      }
    },
    [sessionId, isLoading, sendUserMessageMutation, sendAction, cancelMutation]
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
