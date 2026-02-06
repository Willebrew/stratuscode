/**
 * Todo Storage Tests
 *
 * Covers: createTodo, getTodo, listTodos, updateTodo, deleteTodo,
 * replaceTodos, getTodosCount — including edge cases and option variants.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from './database';
import {
  createTodo,
  getTodo,
  listTodos,
  updateTodo,
  deleteTodo,
  replaceTodos,
  getTodosCount,
} from './todos';

const testDir = `/tmp/stratuscode-todos-test-${Date.now()}`;

describe('Todo Storage', () => {
  const testSessionId = 'test-session-123';

  beforeAll(() => {
    initDatabase({ dataDir: testDir });
  });

  afterAll(() => {
    closeDatabase();
  });

  // ============================================
  // createTodo
  // ============================================

  describe('createTodo', () => {
    test('creates a todo with default status and priority', () => {
      const todo = createTodo(testSessionId, 'Test task 1');

      expect(todo).toBeDefined();
      expect(todo.id).toMatch(/^todo_/);
      expect(todo.sessionId).toBe(testSessionId);
      expect(todo.content).toBe('Test task 1');
      expect(todo.status).toBe('pending');
      expect(todo.priority).toBe('medium');
      expect(todo.createdAt).toBeGreaterThan(0);
      expect(todo.updatedAt).toBeGreaterThan(0);
    });

    test('creates a todo with explicit status option', () => {
      const todo = createTodo(testSessionId, 'Already started', { status: 'in_progress' });

      expect(todo.status).toBe('in_progress');
      expect(todo.priority).toBe('medium'); // default
    });

    test('creates a todo with explicit priority option', () => {
      const todo = createTodo(testSessionId, 'Urgent task', { priority: 'high' });

      expect(todo.priority).toBe('high');
      expect(todo.status).toBe('pending'); // default
    });

    test('creates a todo with both status and priority options', () => {
      const todo = createTodo(testSessionId, 'Done and low', {
        status: 'completed',
        priority: 'low',
      });

      expect(todo.status).toBe('completed');
      expect(todo.priority).toBe('low');
    });

    test('persists to database and can be retrieved', () => {
      const todo = createTodo(testSessionId, 'Persisted task');
      const retrieved = getTodo(todo.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(todo.id);
      expect(retrieved!.content).toBe('Persisted task');
      expect(retrieved!.sessionId).toBe(testSessionId);
    });
  });

  // ============================================
  // getTodo
  // ============================================

  describe('getTodo', () => {
    test('returns todo by ID', () => {
      const created = createTodo(testSessionId, 'Get me');
      const result = getTodo(created.id);

      expect(result).toBeDefined();
      expect(result!.id).toBe(created.id);
      expect(result!.content).toBe('Get me');
      expect(result!.sessionId).toBe(testSessionId);
      expect(result!.status).toBe('pending');
      expect(result!.priority).toBe('medium');
    });

    test('returns undefined for non-existent ID', () => {
      const result = getTodo('todo_nonexistent_999');
      expect(result).toBeUndefined();
    });
  });

  // ============================================
  // listTodos
  // ============================================

  describe('listTodos', () => {
    test('returns todos for session', () => {
      const sid = `list-session-${Date.now()}`;
      createTodo(sid, 'List item A');
      createTodo(sid, 'List item B');

      const todos = listTodos(sid);

      expect(Array.isArray(todos)).toBe(true);
      expect(todos.length).toBe(2);
      expect(todos[0]!.content).toBe('List item A');
      expect(todos[1]!.content).toBe('List item B');
    });

    test('returns empty array for session with no todos', () => {
      const todos = listTodos('session-with-no-todos');
      expect(todos).toEqual([]);
    });

    test('does not return todos from other sessions', () => {
      const sidA = `list-iso-a-${Date.now()}`;
      const sidB = `list-iso-b-${Date.now()}`;
      createTodo(sidA, 'Session A only');
      createTodo(sidB, 'Session B only');

      const todosA = listTodos(sidA);
      const todosB = listTodos(sidB);

      expect(todosA.length).toBe(1);
      expect(todosA[0]!.content).toBe('Session A only');
      expect(todosB.length).toBe(1);
      expect(todosB[0]!.content).toBe('Session B only');
    });
  });

  // ============================================
  // updateTodo
  // ============================================

  describe('updateTodo', () => {
    test('updates status', () => {
      const todo = createTodo(testSessionId, 'Task to update status');
      const updated = updateTodo(todo.id, { status: 'in_progress' });

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('in_progress');
      expect(updated!.content).toBe('Task to update status');
    });

    test('updates content', () => {
      const todo = createTodo(testSessionId, 'Original content');
      const updated = updateTodo(todo.id, { content: 'Modified content' });

      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Modified content');
      expect(updated!.status).toBe('pending'); // unchanged
    });

    test('updates priority', () => {
      const todo = createTodo(testSessionId, 'Priority task');
      const updated = updateTodo(todo.id, { priority: 'high' });

      expect(updated).toBeDefined();
      expect(updated!.priority).toBe('high');
      expect(updated!.content).toBe('Priority task'); // unchanged
    });

    test('updates multiple fields at once', () => {
      const todo = createTodo(testSessionId, 'Multi-update');
      const updated = updateTodo(todo.id, {
        content: 'Multi-updated',
        status: 'completed',
        priority: 'low',
      });

      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Multi-updated');
      expect(updated!.status).toBe('completed');
      expect(updated!.priority).toBe('low');
    });

    test('updates updatedAt timestamp', () => {
      const todo = createTodo(testSessionId, 'Timestamp update');
      // Small delay to ensure different timestamp
      const updated = updateTodo(todo.id, { status: 'completed' });

      expect(updated).toBeDefined();
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(todo.updatedAt);
    });

    test('persists update to database', () => {
      const todo = createTodo(testSessionId, 'Persist update');
      updateTodo(todo.id, { content: 'Persisted update', status: 'completed' });

      const retrieved = getTodo(todo.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.content).toBe('Persisted update');
      expect(retrieved!.status).toBe('completed');
    });

    test('returns undefined for non-existent ID', () => {
      const result = updateTodo('todo_nonexistent_999', { status: 'completed' });
      expect(result).toBeUndefined();
    });
  });

  // ============================================
  // deleteTodo
  // ============================================

  describe('deleteTodo', () => {
    test('removes todo from database', () => {
      const todo = createTodo(testSessionId, 'Task to delete');
      deleteTodo(todo.id);

      const result = getTodo(todo.id);
      expect(result).toBeUndefined();
    });

    test('does not affect other todos', () => {
      const sid = `delete-iso-${Date.now()}`;
      const keep = createTodo(sid, 'Keep me');
      const remove = createTodo(sid, 'Remove me');

      deleteTodo(remove.id);

      const todos = listTodos(sid);
      expect(todos.length).toBe(1);
      expect(todos[0]!.id).toBe(keep.id);
    });

    test('does not throw for non-existent ID', () => {
      // Should not throw
      expect(() => deleteTodo('todo_nonexistent_999')).not.toThrow();
    });
  });

  // ============================================
  // replaceTodos
  // ============================================

  describe('replaceTodos', () => {
    test('replaces all todos for a session', () => {
      const sid = `replace-${Date.now()}`;
      createTodo(sid, 'Old task 1');
      createTodo(sid, 'Old task 2');

      const result = replaceTodos(sid, [
        { content: 'New task 1' },
        { content: 'New task 2' },
        { content: 'New task 3' },
      ]);

      expect(result.length).toBe(3);
      const todos = listTodos(sid);
      expect(todos.length).toBe(3);
      expect(todos.every(t => t.content.startsWith('New task'))).toBe(true);
    });

    test('uses default status and priority when not specified', () => {
      const sid = `replace-defaults-${Date.now()}`;
      const result = replaceTodos(sid, [{ content: 'Default opts' }]);

      expect(result[0]!.status).toBe('pending');
      expect(result[0]!.priority).toBe('medium');
    });

    test('respects explicit status option', () => {
      const sid = `replace-status-${Date.now()}`;
      const result = replaceTodos(sid, [
        { content: 'Task A', status: 'in_progress' },
        { content: 'Task B', status: 'completed' },
      ]);

      expect(result[0]!.status).toBe('in_progress');
      expect(result[1]!.status).toBe('completed');
    });

    test('respects explicit priority option', () => {
      const sid = `replace-priority-${Date.now()}`;
      const result = replaceTodos(sid, [
        { content: 'Urgent', priority: 'high' },
        { content: 'Optional', priority: 'low' },
      ]);

      expect(result[0]!.priority).toBe('high');
      expect(result[1]!.priority).toBe('low');
    });

    test('replaces with empty array clears all todos', () => {
      const sid = `replace-empty-${Date.now()}`;
      createTodo(sid, 'To be cleared');

      const result = replaceTodos(sid, []);
      expect(result).toEqual([]);

      const todos = listTodos(sid);
      expect(todos.length).toBe(0);
    });

    test('does not affect todos in other sessions', () => {
      const sidA = `replace-iso-a-${Date.now()}`;
      const sidB = `replace-iso-b-${Date.now()}`;
      createTodo(sidA, 'Session A task');
      createTodo(sidB, 'Session B task');

      replaceTodos(sidA, [{ content: 'Replaced A' }]);

      const todosB = listTodos(sidB);
      expect(todosB.length).toBe(1);
      expect(todosB[0]!.content).toBe('Session B task');
    });

    test('generates unique IDs for each new todo', () => {
      const sid = `replace-ids-${Date.now()}`;
      const result = replaceTodos(sid, [
        { content: 'Task 1' },
        { content: 'Task 2' },
        { content: 'Task 3' },
      ]);

      const ids = result.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  // ============================================
  // getTodosCount
  // ============================================

  describe('getTodosCount', () => {
    test('returns correct counts by status', () => {
      const sid = `count-${Date.now()}`;
      replaceTodos(sid, [
        { content: 'Pending 1', status: 'pending' },
        { content: 'Pending 2', status: 'pending' },
        { content: 'In Progress', status: 'in_progress' },
        { content: 'Done', status: 'completed' },
      ]);

      const counts = getTodosCount(sid);

      expect(counts.total).toBe(4);
      expect(counts.pending).toBe(2);
      expect(counts.inProgress).toBe(1);
      expect(counts.completed).toBe(1);
    });

    test('returns zero counts for empty session', () => {
      const counts = getTodosCount('empty-session-no-todos');

      expect(counts.total).toBe(0);
      expect(counts.pending).toBe(0);
      expect(counts.inProgress).toBe(0);
      expect(counts.completed).toBe(0);
    });

    test('counts update after todo modifications', () => {
      const sid = `count-update-${Date.now()}`;
      const todo = createTodo(sid, 'Starts pending');

      let counts = getTodosCount(sid);
      expect(counts.pending).toBe(1);
      expect(counts.inProgress).toBe(0);

      updateTodo(todo.id, { status: 'in_progress' });
      counts = getTodosCount(sid);
      expect(counts.pending).toBe(0);
      expect(counts.inProgress).toBe(1);
    });
  });
});
