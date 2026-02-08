'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Paperclip, Plus, Zap, Brain, X, Hammer, Map, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { TodoPanel } from './todo-panel';
import type { TodoItem } from '@/hooks/use-chat-stream';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
  alphaMode: boolean;
  onAlphaModeChange: (enabled: boolean) => void;
  agentMode: 'build' | 'plan';
  onAgentModeChange: (mode: 'build' | 'plan') => void;
  reasoningEffort: 'low' | 'medium' | 'high';
  onReasoningEffortChange: (effort: 'low' | 'medium' | 'high') => void;
  todos?: TodoItem[];
  error?: string | null;
  onDismissError?: () => void;
}

export function ChatInput({
  onSend,
  isLoading,
  placeholder,
  alphaMode,
  onAlphaModeChange,
  agentMode,
  onAgentModeChange,
  reasoningEffort,
  onReasoningEffortChange,
  todos = [],
  error,
  onDismissError,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;
    onSend(message.trim());
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const effortSegments: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

  return (
    <form onSubmit={handleSubmit} className="py-3 sm:py-4 pt-8 sm:pt-10 bg-gradient-to-t from-background via-background to-transparent">
      <div className="max-w-3xl mx-auto px-3 sm:px-4">
        <div
          className={clsx(
            'dark-input-area transition-[box-shadow,ring-color] duration-300 !transform-none',
            agentMode === 'plan' && 'ring-1 ring-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.08),0_0_40px_rgba(59,130,246,0.04)]'
          )}
        >
          {/* Plan mode top bar */}
          <AnimatePresence>
            {agentMode === 'plan' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-blue-500/10">
                  <Map className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[11px] font-medium text-blue-400/80">Planning Mode</span>
                  <button
                    type="button"
                    onClick={() => onAgentModeChange('build')}
                    className="ml-auto text-[10px] text-white/30 hover:text-white/50 transition-colors"
                  >
                    Switch to build →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-2 mb-3 pb-3 border-b border-red-500/10">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-[11px] text-red-400/90 leading-relaxed flex-1 break-words">{error}</span>
                  {onDismissError && (
                    <button
                      type="button"
                      onClick={onDismissError}
                      className="text-white/30 hover:text-white/50 transition-colors shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline todo/plan panel */}
          {todos.length > 0 && (
            <div className="mb-2 border-b border-white/10 pb-2">
              <TodoPanel todos={todos} />
            </div>
          )}

          <div className="flex items-start gap-2 sm:gap-3">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={agentMode === 'plan' ? 'Describe what you want to plan...' : (placeholder || 'Describe what you want to build...')}
              disabled={isLoading}
              rows={1}
              className={clsx(
                'flex-1 bg-transparent border-0 resize-none focus:outline-none focus:ring-0 text-sm sm:text-base disabled:opacity-50 max-h-[200px] leading-relaxed',
                agentMode === 'plan' ? 'text-white/90 placeholder:text-blue-400/30' : 'text-white/90 placeholder:text-white/40'
              )}
            />
          </div>
          <div className="flex items-center justify-between mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10">
            <div className="flex items-center gap-2 relative" ref={menuRef}>
              {/* Options button - expands into pill when alpha mode is on */}
              <div
                className={clsx(
                  'h-8 rounded-full flex items-center transition-all duration-150',
                  alphaMode && !menuOpen
                    ? 'bg-white/10 border border-dashed border-amber-500/50 pl-1 pr-1 gap-0.5'
                    : ''
                )}
              >
                <button
                  type="button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={clsx(
                    'rounded-full flex items-center justify-center transition-colors',
                    menuOpen
                      ? 'w-8 h-8 bg-white/20'
                      : alphaMode
                        ? 'w-6 h-6 hover:bg-white/10'
                        : 'w-8 h-8 bg-white/10 hover:bg-white/20'
                  )}
                >
                  <motion.div
                    animate={{ rotate: menuOpen ? 45 : 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <Plus className="w-4 h-4 text-white/60" />
                  </motion.div>
                </button>
                {alphaMode && !menuOpen && (
                  <>
                    <span className="text-[11px] font-medium text-amber-400/80 px-1">
                      Alpha
                    </span>
                    <button
                      type="button"
                      onClick={() => onAlphaModeChange(false)}
                      className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                    >
                      <X className="w-3 h-3 text-white/40" />
                    </button>
                  </>
                )}
              </div>

              {/* Dropdown menu */}
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl bg-[#1a1a19] border border-white/[0.06] shadow-2xl overflow-hidden"
                  >
                    {/* Attachments */}
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Paperclip className="w-4 h-4 text-white/50" />
                      <div>
                        <div className="text-sm text-white/80">Attachments</div>
                        <div className="text-[10px] text-white/40">Coming soon</div>
                      </div>
                    </button>

                    <div className="border-t border-white/10" />

                    {/* Agent Mode */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3 mb-2.5">
                        {agentMode === 'build' ? (
                          <Hammer className="w-4 h-4 text-white/50" />
                        ) : (
                          <Map className="w-4 h-4 text-blue-400" />
                        )}
                        <div className="text-sm text-white/80">Agent Mode</div>
                      </div>
                      <div className="flex rounded-lg overflow-hidden border border-white/10">
                        {(['plan', 'build'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => onAgentModeChange(mode)}
                            className={clsx(
                              'flex-1 py-1.5 text-xs font-medium transition-colors capitalize',
                              agentMode === mode
                                ? mode === 'plan' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/15 text-white'
                                : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                            )}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-white/10" />

                    {/* Alpha Mode */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Zap className={clsx('w-4 h-4', alphaMode ? 'text-amber-400' : 'text-white/50')} />
                        <div>
                          <div className="text-sm text-white/80">Alpha Mode</div>
                          <div className="text-[10px] text-white/40">Auto-approve all tools</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAlphaModeChange(!alphaMode)}
                        className={clsx(
                          'relative w-9 h-5 rounded-full transition-colors',
                          alphaMode ? 'bg-amber-400' : 'bg-white/20'
                        )}
                      >
                        <motion.div
                          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                          animate={{ left: alphaMode ? 18 : 2 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      </button>
                    </div>

                    <div className="border-t border-white/10" />

                    {/* Reasoning Effort */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3 mb-2.5">
                        <Brain className="w-4 h-4 text-white/50" />
                        <div className="text-sm text-white/80">Reasoning Effort</div>
                      </div>
                      <div className="flex rounded-lg overflow-hidden border border-white/10">
                        {effortSegments.map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => onReasoningEffortChange(level)}
                            className={clsx(
                              'flex-1 py-1.5 text-xs font-medium transition-colors capitalize',
                              reasoningEffort === level
                                ? 'bg-white/15 text-white'
                                : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                            )}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              disabled={!message.trim() || isLoading}
              className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-black animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4 text-black" />
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
