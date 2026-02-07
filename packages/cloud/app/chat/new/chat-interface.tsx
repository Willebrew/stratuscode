'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatHeader } from '@/components/chat-header';
import { ChatInput } from '@/components/chat-input';
import { MessageList } from '@/components/message-list';
import { useChatStream } from '@/hooks/use-chat-stream';

interface ChatInterfaceProps {
  owner: string;
  repo: string;
  branch: string;
}

export function ChatInterface({ owner, repo, branch }: ChatInterfaceProps) {
  const {
    messages,
    isLoading,
    error,
    sessionId,
    sandboxStatus,
    todos,
    sendMessage,
    answerQuestion,
  } = useChatStream({
    onModeSwitch: (newMode) => {
      if (newMode === 'build' || newMode === 'plan') {
        setAgentMode(newMode);
      }
    },
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [alphaMode, setAlphaMode] = useState(false);
  const [agentMode, setAgentMode] = useState<'build' | 'plan'>('build');
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');

  // Keep a ref to sessionId so async callbacks always see the latest value
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const checkForChanges = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const res = await fetch(`/api/pr?sessionId=${sid}`);
      if (!res.ok) return; // Session may not exist yet or was cleared by hot reload
      const data = await res.json();
      setHasChanges(data.hasChanges);
    } catch {
      // Ignore network errors
    }
  }, []);

  // Re-check for changes whenever the agent finishes a response
  const prevLoadingRef = useRef(isLoading);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      checkForChanges();
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, checkForChanges]);

  const handleSend = useCallback(
    async (message: string) => {
      await sendMessage(message, {
        repoOwner: owner,
        repoName: repo,
        branch,
        alphaMode,
        agent: agentMode,
        reasoningEffort,
      });
    },
    [sendMessage, owner, repo, branch, alphaMode, agentMode, reasoningEffort]
  );

  return (
    <div className="h-screen flex flex-col">
      <ChatHeader
        owner={owner}
        repo={repo}
        branch={branch}
        sessionId={sessionId}
        hasChanges={hasChanges}
        onSend={handleSend}
      />

      <MessageList messages={messages} sandboxStatus={sandboxStatus} todos={todos} onSend={handleSend} onAnswer={answerQuestion} />

      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm shadow-lg">
          {error}
        </div>
      )}

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
      />
    </div>
  );
}
