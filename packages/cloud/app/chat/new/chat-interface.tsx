'use client';

import { useState, useCallback, useEffect } from 'react';
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

  const handleSend = useCallback(
    async (message: string) => {
      await sendMessage(message, {
        alphaMode,
        reasoningEffort,
      });
    },
    [sendMessage, alphaMode, reasoningEffort]
  );

  // Register send function with layout so AppHeader's Ship It button can use it
  useEffect(() => {
    registerSendFn(handleSend);
    return () => registerSendFn(null);
  }, [handleSend, registerSendFn]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <MessageList
        messages={messages}
        sandboxStatus={sandboxStatus}
        todos={todos}
        onSend={handleSend}
        onAnswer={answerQuestion}
      />

      <div className="flex-shrink-0">
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
        />
      </div>
    </div>
  );
}
