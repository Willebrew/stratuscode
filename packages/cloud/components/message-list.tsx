'use client';

import { useEffect, useRef } from 'react';
import { Loader2, FileCode, Terminal, GitPullRequest } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import type { ChatMessage, SandboxState, TodoItem } from '@/hooks/use-chat-stream';

interface MessageListProps {
  messages: ChatMessage[];
  sandboxStatus?: SandboxState;
  todos?: TodoItem[];
  onSend?: (message: string) => void;
  onAnswer?: (answer: string) => void;
}

const SANDBOX_LABELS: Record<SandboxState, string> = {
  idle: '',
  initializing: 'Booting up the VM',
  cloning: 'Cloning repository',
  ready: '',
};

export function MessageList({ messages, sandboxStatus = 'idle', todos, onSend, onAnswer }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sandboxStatus]);

  if (messages.length === 0 && (sandboxStatus === 'idle' || sandboxStatus === 'ready')) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative">
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

  const showBootStatus = sandboxStatus === 'initializing' || sandboxStatus === 'cloning';

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4">
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 py-2 sm:py-4 pb-52">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} todos={todos} onSend={onSend} onAnswer={onAnswer} />
        ))}
        {showBootStatus && (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{SANDBOX_LABELS[sandboxStatus]}</span>
            <span className="tracking-widest animate-pulse">...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
