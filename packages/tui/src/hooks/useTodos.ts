/**
 * useTodos Hook
 *
 * Polls for todos and auto-updates when the agent creates them.
 */

import { useState, useEffect, useCallback } from 'react';
import { Todo } from '@stratuscode/tools';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

export interface UseTodosOptions {
  sessionId?: string;
  pollInterval?: number;
}

export interface UseTodosResult {
  todos: TodoItem[];
  counts: { pending: number; inProgress: number; completed: number; total: number };
  refresh: () => void;
}

export function useTodos(options: UseTodosOptions): UseTodosResult {
  const { sessionId, pollInterval = 3000 } = options;
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [counts, setCounts] = useState({ pending: 0, inProgress: 0, completed: 0, total: 0 });

  const refresh = useCallback(() => {
    if (!sessionId) return;
    
    try {
      const todoList = Todo.list(sessionId);
      const todoCounts = Todo.counts(sessionId);
      
      setTodos(todoList.map(t => ({
        id: t.id,
        content: t.content,
        status: t.status || 'pending',
        priority: t.priority || 'medium',
      })));
      
      setCounts({
        pending: todoCounts.pending || 0,
        inProgress: todoCounts.inProgress || 0,
        completed: todoCounts.completed || 0,
        total: todoCounts.total || 0,
      });
    } catch (err) {
      // Ignore errors during polling
    }
  }, [sessionId]);

  // Poll for todos
  useEffect(() => {
    if (!sessionId) return;

    // Check immediately
    refresh();

    // Then poll
    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [sessionId, pollInterval, refresh]);

  return {
    todos,
    counts,
    refresh,
  };
}
