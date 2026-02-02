/**
 * Todos Storage
 *
 * Database operations for todo items.
 */

import { getDatabase, insert, update, findAll, deleteById } from './database';
import { generateId } from '@stratuscode/shared';

// ============================================
// Types
// ============================================

export interface TodoRow {
  id: string;
  session_id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  created_at: number;
  updated_at: number;
}

export interface Todo {
  id: string;
  sessionId: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  updatedAt: number;
}

// ============================================
// Conversions
// ============================================

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    sessionId: row.session_id,
    content: row.content,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function todoToRow(todo: Partial<Todo> & { id: string; sessionId: string }): Partial<TodoRow> {
  const row: Partial<TodoRow> = {
    id: todo.id,
    session_id: todo.sessionId,
  };
  if (todo.content !== undefined) row.content = todo.content;
  if (todo.status !== undefined) row.status = todo.status;
  if (todo.priority !== undefined) row.priority = todo.priority;
  if (todo.createdAt !== undefined) row.created_at = todo.createdAt;
  if (todo.updatedAt !== undefined) row.updated_at = todo.updatedAt;
  return row;
}

// ============================================
// Operations
// ============================================

/**
 * Get all todos for a session
 */
export function listTodos(sessionId: string): Todo[] {
  const rows = findAll<TodoRow>('todos', { session_id: sessionId }, 'created_at ASC');
  return rows.map(rowToTodo);
}

/**
 * Get a single todo by ID
 */
export function getTodo(id: string): Todo | undefined {
  const db = getDatabase();
  const stmt = db.query('SELECT * FROM todos WHERE id = ?');
  const row = stmt.get(id) as TodoRow | undefined;
  return row ? rowToTodo(row) : undefined;
}

/**
 * Create a new todo
 */
export function createTodo(
  sessionId: string,
  content: string,
  options?: { status?: Todo['status']; priority?: Todo['priority'] }
): Todo {
  const now = Date.now();
  const todo: Todo = {
    id: generateId('todo'),
    sessionId,
    content,
    status: options?.status || 'pending',
    priority: options?.priority || 'medium',
    createdAt: now,
    updatedAt: now,
  };

  insert('todos', {
    id: todo.id,
    session_id: todo.sessionId,
    content: todo.content,
    status: todo.status,
    priority: todo.priority,
    created_at: todo.createdAt,
    updated_at: todo.updatedAt,
  });

  return todo;
}

/**
 * Update a todo
 */
export function updateTodo(id: string, updates: Partial<Pick<Todo, 'content' | 'status' | 'priority'>>): Todo | undefined {
  const existing = getTodo(id);
  if (!existing) return undefined;

  const now = Date.now();
  const data: Record<string, unknown> = { updated_at: now };
  
  if (updates.content !== undefined) data.content = updates.content;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.priority !== undefined) data.priority = updates.priority;

  update('todos', id, data);

  return {
    ...existing,
    ...updates,
    updatedAt: now,
  };
}

/**
 * Delete a todo
 */
export function deleteTodo(id: string): void {
  deleteById('todos', id);
}

/**
 * Replace all todos for a session (used by todowrite tool)
 */
export function replaceTodos(sessionId: string, todos: Array<{ content: string; status?: Todo['status']; priority?: Todo['priority'] }>): Todo[] {
  const db = getDatabase();
  
  // Delete existing todos for this session
  db.query('DELETE FROM todos WHERE session_id = ?').run(sessionId);

  // Insert new todos
  const now = Date.now();
  const result: Todo[] = [];

  for (const item of todos) {
    const todo: Todo = {
      id: generateId('todo'),
      sessionId,
      content: item.content,
      status: item.status || 'pending',
      priority: item.priority || 'medium',
      createdAt: now,
      updatedAt: now,
    };

    insert('todos', {
      id: todo.id,
      session_id: todo.sessionId,
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
      created_at: todo.createdAt,
      updated_at: todo.updatedAt,
    });

    result.push(todo);
  }

  return result;
}

/**
 * Get todos count by status
 */
export function getTodosCount(sessionId: string): { total: number; pending: number; inProgress: number; completed: number } {
  const todos = listTodos(sessionId);
  return {
    total: todos.length,
    pending: todos.filter(t => t.status === 'pending').length,
    inProgress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed').length,
  };
}
