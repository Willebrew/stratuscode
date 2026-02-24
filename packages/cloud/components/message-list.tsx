'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Loader2, FileCode, Terminal, GitPullRequest } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { MessageBubble } from './message-bubble';
import { AgentThinkingIndicator } from './agent-thinking-indicator';
import type { ChatMessage, TodoItem } from '@/hooks/use-convex-chat';

type SandboxStatus = 'idle' | 'initializing' | 'ready';

interface MessageListProps {
  messages: ChatMessage[];
  messagesLoading?: boolean;
  sandboxStatus?: SandboxStatus;
  todos?: TodoItem[];
  sessionId?: string;
  onSend?: (message: string) => void;
  onAnswer?: (answer: string) => void;
  bottomPadding?: number;
}

const SANDBOX_LABELS: Record<SandboxStatus, string> = {
  idle: '',
  initializing: 'Booting up the VM',
  ready: '',
};

export function MessageList({ messages, messagesLoading, sandboxStatus = 'idle', todos, sessionId, onSend, onAnswer, bottomPadding }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Single subscription for ALL session attachments — avoids N subscriptions per message
  const allAttachments = useQuery(
    api.attachments.listForSession,
    sessionId ? { sessionId: sessionId as Id<'sessions'> } : 'skip'
  );
  // Group by messageId for O(1) lookup per message
  const attachmentsByMessage = useMemo(() => {
    const map = new Map<string, typeof allAttachments>();
    if (!allAttachments) return map;
    for (const a of allAttachments) {
      if (!a.messageId) continue;
      const key = a.messageId as string;
      const existing = map.get(key);
      if (existing) existing.push(a);
      else map.set(key, [a]);
    }
    return map;
  }, [allAttachments]);

  const isStreaming = useMemo(() => messages.some(m => m.streaming), [messages]);

  // Handle auto-scrolling when messages length changes or sandbox status updates
  useEffect(() => {
    if (!bottomRef.current || !scrollAreaRef.current) return;
    scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    hasScrolledRef.current = true;
  }, [messages.length, sandboxStatus]); // Only trigger on length change to avoid interrupting manual scrolls

  // Robustly lock scroll to bottom while text is physically streaming/expanding
  useEffect(() => {
    if (!isStreaming || !scrollAreaRef.current || !contentRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      }
    });

    resizeObserver.observe(contentRef.current);

    return () => resizeObserver.disconnect();
  }, [isStreaming]);

  // When bottomPadding changes (todos/plan mode expanding the input), scroll to
  // bottom if the user was already near the bottom so content isn't hidden.
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, [bottomPadding]);

  // Show loading spinner while Convex query is still fetching (prevents "Ready to build" flash)
  if (messagesLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <AgentThinkingIndicator messageId="__loading__" label="Loading messages" />
      </div>
    );
  }

  if (messages.length === 0 && sandboxStatus !== 'initializing') {
    return (
      <div className="h-full flex items-center justify-center p-4 sm:p-8 relative">
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <div className="text-center max-w-lg relative z-10 animate-fade-in-up">
          <h2 className="font-serif text-2xl sm:text-3xl font-normal mb-3">Ready to build</h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8">
            Describe what you want to create or modify. StratusCode will edit files,
            run commands, and make changes in your repository.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <div className="feature-pill">
              <FileCode className="w-3.5 h-3.5" />
              <span>Edit files</span>
            </div>
            <div className="feature-pill">
              <Terminal className="w-3.5 h-3.5" />
              <span>Run commands</span>
            </div>
            <div className="feature-pill">
              <GitPullRequest className="w-3.5 h-3.5" />
              <span>Create PRs</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showBootStatus = sandboxStatus === 'initializing';

  return (
    <div ref={scrollAreaRef} className="h-full overflow-y-auto chat-scroll-area">
      <div ref={contentRef} className="max-w-3xl mx-auto px-3 sm:px-4 space-y-4 sm:space-y-6 pt-2 sm:pt-4" style={{ paddingBottom: bottomPadding ?? 208 }}>
        {messages.map((message, index) => (
          <MessageBubble
            key={index}
            index={index}
            isLast={index === messages.length - 1}
            message={message}
            todos={todos}
            sessionId={sessionId}
            attachments={attachmentsByMessage.get(message.id)}
            onSend={onSend}
            onAnswer={onAnswer}
          />
        ))}
        {showBootStatus && (
          <div className="flex justify-center my-4">
            <AgentThinkingIndicator messageId="__boot__" label={SANDBOX_LABELS[sandboxStatus]} />
          </div>
        )}
        {/* Anchor element — overflow-anchor keeps this pinned to the viewport bottom */}
        <div ref={bottomRef} style={{ overflowAnchor: 'auto', height: 1 }} />
      </div>
    </div>
  );
}
