'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatInput } from '@/components/chat-input';
import { MessageList } from '@/components/message-list';
import { useConvexChat } from '@/hooks/use-convex-chat';
import { useSendFn } from '@/components/send-fn-context';
import type { Id } from '@/convex/_generated/dataModel';

interface ChatInterfaceProps {
  sessionId: string;
}

export function ChatInterface({ sessionId: sessionIdStr }: ChatInterfaceProps) {
  const convexSessionId = sessionIdStr as Id<'sessions'>;
  const { registerSendFn } = useSendFn();
  const {
    messages,
    messagesLoading,
    isLoading,
    error,
    session,
    sandboxStatus,
    todos,
    sendMessage,
    answerQuestion,
    requestCancel,
  } = useConvexChat(convexSessionId);

  const [alphaMode, setAlphaMode] = useState(false);
  const [agentMode, setAgentMode] = useState<'build' | 'plan'>('build');
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');

  // Sync local agentMode with backend session.agent (updated by plan_enter/plan_exit tools)
  useEffect(() => {
    if (session?.agent === 'plan' || session?.agent === 'build') {
      setAgentMode(session.agent);
    }
  }, [session?.agent]);

  const handleSend = useCallback(
    async (message: string, attachmentIds?: string[]) => {
      await sendMessage(message, {
        alphaMode,
        reasoningEffort,
        attachmentIds,
        agentMode,
      });
    },
    [sendMessage, alphaMode, reasoningEffort, agentMode]
  );

  // Register send function with layout so AppHeader's Ship It button can use it
  useEffect(() => {
    registerSendFn(handleSend);
    return () => registerSendFn(null);
  }, [handleSend, registerSendFn]);

  // Measure input container height so the message list bottom padding stays in sync
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState(208); // default ~pb-52

  useEffect(() => {
    const el = inputContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setInputHeight(entry.contentRect.height + 48); // +48 for fade overlap
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-full relative overflow-hidden">
      <MessageList
        messages={messages}
        messagesLoading={messagesLoading}
        sandboxStatus={sandboxStatus}
        todos={todos}
        sessionId={sessionIdStr}
        onSend={handleSend}
        onAnswer={answerQuestion}
        bottomPadding={inputHeight}
      />

      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        {/* Bottom fade — content fades out behind the input */}
        <div
          className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: 'linear-gradient(to top, var(--background) 30%, transparent)' }}
        />
        <div ref={inputContainerRef} className="relative pointer-events-auto">
          <ChatInput
            onSend={handleSend}
            isLoading={isLoading}
            alphaMode={alphaMode}
            onAlphaModeChange={setAlphaMode}
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={setReasoningEffort}
            todos={todos}
            error={error}
            onCancel={requestCancel}
            sessionId={convexSessionId}
          />
        </div>
      </div>
    </div>
  );
}

