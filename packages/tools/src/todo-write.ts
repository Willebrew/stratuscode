/**
 * Todo Write Tool
 *
 * Creates or updates the todo list for planning.
 */

import { defineTool } from './sage-adapter';
import { Todo } from './lib/todo';

export interface TodoItem {
  content: string;
  status?: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

export interface TodoWriteArgs extends Record<string, unknown> {
  todos: TodoItem[];
}

export const todoWriteTool = defineTool<TodoWriteArgs>({
  name: 'todowrite',
  description: `Create or update the todo list for this session. This tool REPLACES the entire list — you must include ALL tasks (with their current statuses) every time you call it.

WHEN TO USE THIS TOOL:
- At the START of any multi-step task — break it down into an ordered todo list before writing any code.
- AFTER completing a step — update the list to mark it completed and set the next step to in_progress.
- When the plan CHANGES — add, remove, or reorder tasks to reflect new understanding.
- When breaking down a LARGE task — decompose vague requests into specific, actionable steps.
- When the user explicitly asks you to plan, outline, or organize work.
- When you discover unexpected complexity — add new tasks for the additional work.

WHEN NOT TO USE THIS TOOL:
- For single, simple tasks that need no breakdown (e.g., "fix this typo").
- When the user explicitly says not to plan or just wants a quick answer.
- To ask the user a question — use the question tool instead.
- To read the current plan — use todoread instead.

HOW IT WORKS:
This tool REPLACES the entire todo list every time it is called. You must include ALL tasks with their current statuses. If you omit a task, it will be deleted. If you want to add a task, include it along with all existing tasks.

TASK STATES:
- pending: Not yet started. Default state for new tasks.
- in_progress: Currently being worked on. Only ONE task should be in_progress at a time.
- completed: Finished. Keep completed tasks in the list so progress is visible.

State transitions: pending → in_progress → completed. Do not skip states.

TASK FIELDS:
- content (required): A clear, specific description of what to do. Include file paths when known.
  Good: "Add JWT verification middleware in src/middleware/auth.ts"
  Bad: "Fix auth stuff"
- status: pending | in_progress | completed (default: pending)
- priority: low | medium | high (default: medium). Use high for blockers and critical path items.

BEST PRACTICES:
- 3–10 tasks is typical. Fewer than 3 may be too vague; more than 10 may need grouping.
- Order tasks by implementation sequence — put dependencies first.
- Include file paths in task content when you know which files will be modified.
- Update the list AFTER every meaningful action — don't let it go stale.
- Mark a task in_progress BEFORE you start working on it, not after.`,
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Task description',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Task status (default: pending)',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Task priority (default: medium)',
            },
          },
          required: ['content'],
        },
        description: 'List of todos to set',
      },
    },
    required: ['todos'],
  },

  async execute(args, context) {
    const sessionId = context.sessionId;
    if (!sessionId) {
      return JSON.stringify({ error: 'No active session' });
    }

    const { todos: todoItems } = args;

    // Validate: only one in_progress
    const inProgressCount = todoItems.filter(t => t.status === 'in_progress').length;
    if (inProgressCount > 1) {
      return JSON.stringify({
        error: 'Only one task can be in_progress at a time',
        inProgressCount,
      });
    }

    // Replace all todos
    const result = Todo.replaceAll(sessionId, todoItems.map(t => ({
      content: t.content,
      status: t.status,
      priority: t.priority,
    })));

    const counts = Todo.counts(sessionId);

    return JSON.stringify({
      success: true,
      todos: result,
      counts,
      message: `Updated ${result.length} todos`,
    });
  },
});
