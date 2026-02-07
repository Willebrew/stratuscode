'use client';

import { useState, useCallback, useRef } from 'react';

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

export type SandboxState = 'idle' | 'initializing' | 'cloning' | 'ready';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

export interface UseChatStreamOptions {
  onError?: (error: string) => void;
  onModeSwitch?: (newMode: string) => void;
}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sessionId: string | null;
  sessionInfo: { owner: string; repo: string; branch: string } | null;
  sandboxStatus: SandboxState;
  todos: TodoItem[];
  sendMessage: (
    message: string,
    options?: {
      repoOwner?: string;
      repoName?: string;
      branch?: string;
      alphaMode?: boolean;
      agent?: string;
      reasoningEffort?: 'low' | 'medium' | 'high';
    }
  ) => Promise<void>;
  answerQuestion: (answer: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChatStream(options: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{
    owner: string;
    repo: string;
    branch: string;
  } | null>(null);
  const [sandboxStatus, setSandboxStatus] = useState<SandboxState>('idle');
  const [todos, setTodos] = useState<TodoItem[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessageRef = useRef<ChatMessage | null>(null);
  const currentReasoningRef = useRef<string>('');
  const toolCallsRef = useRef<Map<string, ToolCallInfo>>(new Map());
  const hasBootedRef = useRef(false);

  const sendMessage = useCallback(
    async (
      message: string,
      opts?: {
        repoOwner?: string;
        repoName?: string;
        branch?: string;
        alphaMode?: boolean;
        agent?: string;
        reasoningEffort?: 'low' | 'medium' | 'high';
      }
    ) => {
      if (isLoading) return;

      setIsLoading(true);
      setError(null);

      // Add user message
      const userMessageId = `user-${Date.now()}`;
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: message,
        parts: [{ type: 'text', content: message }],
      };
      setMessages((prev) => [...prev, userMessage]);

      // Prepare assistant message
      const assistantMessageId = `assistant-${Date.now()}`;
      currentMessageRef.current = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        parts: [],
        streaming: true,
      };
      currentReasoningRef.current = '';
      toolCallsRef.current = new Map();

      setMessages((prev) => [...prev, currentMessageRef.current!]);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            sessionId,
            repoOwner: opts?.repoOwner,
            repoName: opts?.repoName,
            branch: opts?.branch,
            alphaMode: opts?.alphaMode,
            agent: opts?.agent,
            reasoningEffort: opts?.reasoningEffort,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send message');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6);
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              handleStreamEvent(event);
            } catch {
              // Ignore parse errors
            }
          }
        }

        // Finalize message
        if (currentMessageRef.current) {
          currentMessageRef.current.streaming = false;
          // Update any tool call parts with latest status
          currentMessageRef.current.parts = currentMessageRef.current.parts.map((p) => {
            if (p.type === 'tool_call') {
              const latest = toolCallsRef.current.get(p.toolCall.id);
              return latest ? { ...p, toolCall: { ...latest } } : p;
            }
            return p;
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentMessageRef.current!.id ? { ...currentMessageRef.current! } : m
            )
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Cancelled
        } else {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          options.onError?.(errorMessage);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [isLoading, sessionId, options]
  );

  const handleStreamEvent = useCallback((event: any) => {
    switch (event.type) {
      case 'session':
        setSessionId(event.sessionId);
        setSessionInfo({
          owner: event.owner,
          repo: event.repo,
          branch: event.branch,
        });
        break;

      case 'token':
        if (currentMessageRef.current) {
          currentMessageRef.current.content += event.content;
          // Append to last text part, or create new one
          const parts = currentMessageRef.current.parts;
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart.type === 'text') {
            lastPart.content += event.content;
          } else {
            parts.push({ type: 'text', content: event.content });
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentMessageRef.current!.id
                ? { ...currentMessageRef.current!, parts: [...parts] }
                : m
            )
          );
        }
        break;

      case 'reasoning':
        currentReasoningRef.current += event.content;
        if (currentMessageRef.current) {
          const rParts = currentMessageRef.current.parts;
          const lastR = rParts[rParts.length - 1];
          if (lastR && lastR.type === 'reasoning') {
            lastR.content += event.content;
          } else {
            rParts.push({ type: 'reasoning', content: event.content });
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentMessageRef.current!.id
                ? { ...currentMessageRef.current!, parts: [...rParts] }
                : m
            )
          );
        }
        break;

      case 'tool_call': {
        const toolCall: ToolCallInfo = {
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
          status: 'running',
        };
        toolCallsRef.current.set(event.toolCallId, toolCall);
        if (currentMessageRef.current) {
          // Deduplicate: only add if no part with this toolCallId exists yet
          const alreadyExists = currentMessageRef.current.parts.some(
            (p) => p.type === 'tool_call' && p.toolCall.id === event.toolCallId
          );
          if (!alreadyExists) {
            currentMessageRef.current.parts.push({ type: 'tool_call', toolCall });
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentMessageRef.current!.id
                ? { ...currentMessageRef.current!, parts: [...currentMessageRef.current!.parts] }
                : m
            )
          );
        }
        break;
      }

      case 'tool_result': {
        const existing = toolCallsRef.current.get(event.toolCallId);
        if (existing) {
          if (event.args) existing.args = event.args;
          existing.result = event.content;
          existing.status = 'completed';
          if (currentMessageRef.current) {
            // Update the matching tool_call part in-place
            currentMessageRef.current.parts = currentMessageRef.current.parts.map((p) =>
              p.type === 'tool_call' && p.toolCall.id === event.toolCallId
                ? { ...p, toolCall: { ...existing } }
                : p
            );
            setMessages((prev) =>
              prev.map((m) =>
                m.id === currentMessageRef.current!.id
                  ? { ...currentMessageRef.current!, parts: [...currentMessageRef.current!.parts] }
                  : m
              )
            );
          }
        }
        break;
      }

      case 'sandbox_status':
        if (event.status === 'ready') {
          hasBootedRef.current = true;
          setSandboxStatus('idle');
        } else if (!hasBootedRef.current) {
          setSandboxStatus(event.status as SandboxState);
        }
        break;

      case 'error':
        setError(event.content);
        break;

      case 'todos':
        if (event.todos) {
          setTodos(event.todos);
        }
        break;

      case 'mode_switch':
        if (event.mode) {
          options.onModeSwitch?.(event.mode);
        }
        break;

      case 'done':
        // Handled in finally
        break;
    }
  }, []);

  const answerQuestion = useCallback(async (answer: string) => {
    if (!sessionId) return;
    try {
      await fetch('/api/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, answer }),
      });
    } catch (err) {
      console.error('Failed to answer question:', err);
    }
  }, [sessionId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setSessionInfo(null);
    setError(null);
    setSandboxStatus('idle');
    setTodos([]);
    hasBootedRef.current = false;
  }, []);

  return {
    messages,
    isLoading,
    error,
    sessionId,
    sessionInfo,
    sandboxStatus,
    todos,
    sendMessage,
    answerQuestion,
    clearMessages,
  };
}
