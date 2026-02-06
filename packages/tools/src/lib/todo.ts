/**
 * Todo System
 *
 * Business logic for todos with file sync to .plan.md
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  replaceTodos,
  getTodosCount,
  type Todo as StorageTodo,
} from '@stratuscode/storage';

// ============================================
// Types
// ============================================

export interface TodoInfo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

export interface TodoUpdateInput {
  content: string;
  status?: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

// ============================================
// Todo Operations
// ============================================

export namespace Todo {
  /**
   * Get all todos for a session
   */
  export function list(sessionId: string): TodoInfo[] {
    return listTodos(sessionId).map((t: StorageTodo) => ({
      id: t.id,
      content: t.content,
      status: t.status,
      priority: t.priority,
    }));
  }

  /**
   * Create a new todo
   */
  export function create(
    sessionId: string,
    content: string,
    options?: { status?: TodoInfo['status']; priority?: TodoInfo['priority'] }
  ): TodoInfo {
    const todo = createTodo(sessionId, content, options);
    return {
      id: todo.id,
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
    };
  }

  /**
   * Update a todo
   */
  export function update(
    id: string,
    updates: Partial<Pick<TodoInfo, 'content' | 'status' | 'priority'>>
  ): TodoInfo | undefined {
    const todo = updateTodo(id, updates);
    if (!todo) return undefined;
    return {
      id: todo.id,
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
    };
  }

  /**
   * Delete a todo
   */
  export function remove(id: string): void {
    deleteTodo(id);
  }

  /**
   * Replace all todos for a session (used by todowrite tool)
   */
  export function replaceAll(sessionId: string, todos: TodoUpdateInput[]): TodoInfo[] {
    const result = replaceTodos(sessionId, todos);
    return result.map((t: StorageTodo) => ({
      id: t.id,
      content: t.content,
      status: t.status,
      priority: t.priority,
    }));
  }

  /**
   * Get counts
   */
  export function counts(sessionId: string) {
    return getTodosCount(sessionId);
  }

  /**
   * Sync todos to a .plan.md file
   */
  export function syncToFile(sessionId: string, filePath: string): void {
    const todos = list(sessionId);
    const content = formatTodosAsMarkdown(todos);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * Get the default plan file path for a session
   */
  export function getPlanFilePath(projectDir: string, sessionSlug: string): string {
    return path.join(projectDir, '.stratuscode', 'plans', `${sessionSlug}.plan.md`);
  }
}

// ============================================
// Markdown Formatting
// ============================================

export function formatTodosAsMarkdown(todos: TodoInfo[]): string {
  const lines: string[] = [
    '# Plan',
    '',
    '## Tasks',
    '',
  ];

  if (todos.length === 0) {
    lines.push('_No tasks defined yet._');
  } else {
    for (const todo of todos) {
      const checkbox = todo.status === 'completed' ? '[x]' : '[ ]';
      const statusBadge = todo.status === 'in_progress' ? ' [IN PROGRESS]' : '';
      const priorityBadge = todo.priority === 'high' ? ' [HIGH]' : todo.priority === 'low' ? ' [LOW]' : '';
      lines.push(`- ${checkbox} ${todo.content}${statusBadge}${priorityBadge}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Parse todos from a markdown file
 */
export function parseTodosFromMarkdown(content: string): TodoUpdateInput[] {
  const todos: TodoUpdateInput[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (match) {
      const isCompleted = match[1]!.toLowerCase() === 'x';
      let content = match[2]!.trim();
      
      // Extract status badge
      let status: TodoInfo['status'] = isCompleted ? 'completed' : 'pending';
      if (content.includes('[IN PROGRESS]')) {
        status = 'in_progress';
        content = content.replace('[IN PROGRESS]', '').trim();
      }

      // Extract priority badge
      let priority: TodoInfo['priority'] = 'medium';
      if (content.includes('[HIGH]')) {
        priority = 'high';
        content = content.replace('[HIGH]', '').trim();
      } else if (content.includes('[LOW]')) {
        priority = 'low';
        content = content.replace('[LOW]', '').trim();
      }

      todos.push({ content, status, priority });
    }
  }

  return todos;
}
