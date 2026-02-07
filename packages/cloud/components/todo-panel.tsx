'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, ListTodo, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TodoItem } from '@/hooks/use-chat-stream';

interface TodoPanelProps {
  todos: TodoItem[];
}

/**
 * Inline todo/plan panel designed to sit inside the input area.
 * Collapsed: shows a compact progress pill.
 * Expanded: reveals the full task list with progress bar.
 */
export function TodoPanel({ todos }: TodoPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (todos.length === 0) return null;

  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.find(t => t.status === 'in_progress');
  const total = todos.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="w-full">
      {/* Collapsed: compact pill showing progress + current step */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-left group"
      >
        <ListTodo className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />

        {/* Mini progress ring */}
        <div className="relative w-4 h-4 flex-shrink-0">
          <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
            <circle
              cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2"
              className="text-green-500"
              strokeDasharray={`${progress * 0.377} 100`}
              strokeLinecap="round"
            />
          </svg>
        </div>

        <span className="text-[11px] text-white/50 font-medium">
          {completed}/{total}
        </span>

        {inProgress && (
          <span className="text-[11px] text-white/70 truncate flex-1">
            {inProgress.content}
          </span>
        )}

        {expanded ? (
          <ChevronDown className="w-3 h-3 text-white/30 flex-shrink-0" />
        ) : (
          <ChevronUp className="w-3 h-3 text-white/30 flex-shrink-0" />
        )}
      </button>

      {/* Expanded: full task list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="pt-1 pb-2">
              {/* Progress bar */}
              <div className="h-0.5 bg-white/10 rounded-full overflow-hidden mb-2">
                <motion.div
                  className="h-full bg-green-500/60 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>

              {/* Task list */}
              <div className="space-y-0.5 max-h-48 overflow-y-auto scrollbar-hide">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={`flex items-start gap-2 py-0.5 px-1 rounded ${
                      todo.status === 'in_progress' ? 'bg-white/5' : ''
                    } ${todo.status === 'completed' ? 'opacity-40' : ''}`}
                  >
                    {todo.status === 'completed' && (
                      <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                    )}
                    {todo.status === 'in_progress' && (
                      <Loader2 className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0 mt-0.5" />
                    )}
                    {todo.status === 'pending' && (
                      <Circle className="w-3 h-3 text-white/20 flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={`text-[11px] leading-snug ${
                        todo.status === 'completed'
                          ? 'line-through text-white/30'
                          : todo.status === 'in_progress'
                            ? 'text-white/90 font-medium'
                            : todo.priority === 'high'
                              ? 'text-red-400/80'
                              : 'text-white/50'
                      }`}
                    >
                      {todo.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
