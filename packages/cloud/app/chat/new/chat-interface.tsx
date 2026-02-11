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
    <div className="h-full relative overflow-hidden">
      <MessageList
        messages={messages}
        sandboxStatus={sandboxStatus}
        todos={todos}
        onSend={handleSend}
        onAnswer={answerQuestion}
      />

      {/* Bottom fade — content fades out behind the input */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none z-[5]" />

      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="pointer-events-auto">
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
    </div>
  );
}
