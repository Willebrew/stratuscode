'use client';

import { useState, useCallback } from 'react';
import { ChatHeader } from '@/components/chat-header';
import { ChatInput } from '@/components/chat-input';
import { MessageList } from '@/components/message-list';
import { useConvexChat } from '@/hooks/use-convex-chat';
import type { Id } from '@/convex/_generated/dataModel';

interface ChatInterfaceProps {
  sessionId: string;
}

export function ChatInterface({ sessionId: sessionIdStr }: ChatInterfaceProps) {
  const convexSessionId = sessionIdStr as Id<'sessions'>;

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

  const owner = session?.owner ?? '';
  const repo = session?.repo ?? '';
  const branch = session?.branch ?? '';

  const handleSend = useCallback(
    async (message: string) => {
      await sendMessage(message, {
        alphaMode,
        reasoningEffort,
      });
    },
    [sendMessage, alphaMode, reasoningEffort]
  );

  return (
    <div className="h-dvh flex flex-col">
      <ChatHeader
        owner={owner}
        repo={repo}
        branch={branch}
        sessionId={convexSessionId}
        hasChanges
        onSend={handleSend}
      />

      <MessageList
        messages={messages}
        sandboxStatus={sandboxStatus}
        todos={todos}
        onSend={handleSend}
        onAnswer={answerQuestion}
      />

      <div className="fixed bottom-0 left-0 right-0 z-20 md:left-72">
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
