/**
 * Todo Read Tool
 *
 * Reads the current todo list for planning.
 */

import { defineTool } from './sage-adapter';
import { Todo } from './lib/todo';

export interface TodoReadArgs extends Record<string, unknown> {
  sessionId?: string;
}

export const todoReadTool = defineTool<TodoReadArgs>({
  name: 'todoread',
  description: `Read the current todo list for this session.

Returns the list of todos with their id, content, status (pending, in_progress, completed), and priority.

Use this BEFORE starting work to understand what tasks are planned and what to do next.
Use this AFTER completing a task to verify the update was saved and decide the next step.
If no todos exist yet, use todowrite to create a plan.

Do NOT use this tool to create or update todos — use todowrite for that.`,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_args, context) {
    const sessionId = context.sessionId;
    if (!sessionId) {
      return JSON.stringify({ error: 'No active session' });
    }

    const todos = Todo.list(sessionId);
    const counts = Todo.counts(sessionId);

    if (todos.length === 0) {
      return JSON.stringify({
        todos: [],
        counts,
        message: 'No todos defined yet. Use todowrite to create a plan.',
      });
    }

    return JSON.stringify({
      todos: todos.map(t => ({
        id: t.id,
        content: t.content,
        status: t.status,
        priority: t.priority,
      })),
      counts,
    });
  },
});
