/**
 * Todo CRUD Tests
 *
 * Tests for Todo namespace operations (list, create, update, remove, replaceAll,
 * counts, syncToFile, getPlanFilePath) using real SQLite storage.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { initDatabase, closeDatabase } from '@stratuscode/storage';
import { createSession } from '@stratuscode/storage';
import { Todo, type TodoInfo } from './todo';

const testDir = `/tmp/stratuscode-todo-crud-test-${Date.now()}`;
let sessionId: string;

beforeAll(() => {
  initDatabase({ dataDir: testDir });
  const session = createSession('/test/todos');
  sessionId = session.id;
});

afterAll(() => {
  closeDatabase();
  // Clean up temp files
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}
});

// ============================================
// Todo.list
// ============================================

describe('Todo.list', () => {
  test('returns empty array for session with no todos', () => {
    const sid = createSession('/test/empty-list').id;
    const todos = Todo.list(sid);
    expect(todos).toEqual([]);
  });

  test('returns all todos for a session', () => {
    Todo.create(sessionId, 'Task A');
    Todo.create(sessionId, 'Task B');
    const todos = Todo.list(sessionId);
    expect(todos.length).toBeGreaterThanOrEqual(2);
    expect(todos.some(t => t.content === 'Task A')).toBe(true);
    expect(todos.some(t => t.content === 'Task B')).toBe(true);
  });

  test('maps storage fields to TodoInfo', () => {
    const sid = createSession('/test/list-map').id;
    Todo.create(sid, 'Mapped task', { status: 'in_progress', priority: 'high' });
    const todos = Todo.list(sid);
    const todo = todos.find(t => t.content === 'Mapped task');
    expect(todo).toBeDefined();
    expect(todo!.id).toBeDefined();
    expect(todo!.status).toBe('in_progress');
    expect(todo!.priority).toBe('high');
  });
});

// ============================================
// Todo.create
// ============================================

describe('Todo.create', () => {
  test('creates a todo with default status', () => {
    const sid = createSession('/test/create-default').id;
    const todo = Todo.create(sid, 'New task');
    expect(todo.id).toBeDefined();
    expect(todo.content).toBe('New task');
    expect(todo.status).toBe('pending');
  });

  test('creates a todo with custom status and priority', () => {
    const sid = createSession('/test/create-custom').id;
    const todo = Todo.create(sid, 'Important', { status: 'in_progress', priority: 'high' });
    expect(todo.status).toBe('in_progress');
    expect(todo.priority).toBe('high');
  });

  test('persists to storage', () => {
    const sid = createSession('/test/create-persist').id;
    Todo.create(sid, 'Persisted');
    const todos = Todo.list(sid);
    expect(todos.some(t => t.content === 'Persisted')).toBe(true);
  });
});

// ============================================
// Todo.update
// ============================================

describe('Todo.update', () => {
  test('updates content', () => {
    const sid = createSession('/test/update-content').id;
    const todo = Todo.create(sid, 'Original');
    const updated = Todo.update(todo.id, { content: 'Modified' });
    expect(updated).toBeDefined();
    expect(updated!.content).toBe('Modified');
  });

  test('updates status', () => {
    const sid = createSession('/test/update-status').id;
    const todo = Todo.create(sid, 'To complete');
    const updated = Todo.update(todo.id, { status: 'completed' });
    expect(updated!.status).toBe('completed');
  });

  test('updates priority', () => {
    const sid = createSession('/test/update-priority').id;
    const todo = Todo.create(sid, 'Priority change');
    const updated = Todo.update(todo.id, { priority: 'low' });
    expect(updated!.priority).toBe('low');
  });

  test('returns undefined for nonexistent id', () => {
    const result = Todo.update('nonexistent-id-xyz', { content: 'x' });
    expect(result).toBeUndefined();
  });
});

// ============================================
// Todo.remove
// ============================================

describe('Todo.remove', () => {
  test('deletes a todo', () => {
    const sid = createSession('/test/remove').id;
    const todo = Todo.create(sid, 'To delete');
    Todo.remove(todo.id);
    const todos = Todo.list(sid);
    expect(todos.some(t => t.id === todo.id)).toBe(false);
  });

  test('does not throw for nonexistent id', () => {
    expect(() => Todo.remove('nonexistent-xyz')).not.toThrow();
  });
});

// ============================================
// Todo.replaceAll
// ============================================

describe('Todo.replaceAll', () => {
  test('replaces all todos for a session', () => {
    const sid = createSession('/test/replace').id;
    Todo.create(sid, 'Old A');
    Todo.create(sid, 'Old B');

    const replaced = Todo.replaceAll(sid, [
      { content: 'New 1', status: 'pending' },
      { content: 'New 2', status: 'completed', priority: 'high' },
    ]);

    expect(replaced.length).toBe(2);
    expect(replaced[0]!.content).toBe('New 1');
    expect(replaced[1]!.content).toBe('New 2');
    expect(replaced[1]!.status).toBe('completed');
    expect(replaced[1]!.priority).toBe('high');

    // Old todos should be gone
    const todos = Todo.list(sid);
    expect(todos.every(t => t.content !== 'Old A')).toBe(true);
  });

  test('replaces with empty list clears all', () => {
    const sid = createSession('/test/replace-empty').id;
    Todo.create(sid, 'Will be removed');
    Todo.replaceAll(sid, []);
    expect(Todo.list(sid).length).toBe(0);
  });
});

// ============================================
// Todo.counts
// ============================================

describe('Todo.counts', () => {
  test('returns correct counts', () => {
    const sid = createSession('/test/counts').id;
    Todo.create(sid, 'Pending 1');
    Todo.create(sid, 'Pending 2');
    Todo.create(sid, 'Done', { status: 'completed' });
    Todo.create(sid, 'Working', { status: 'in_progress' });

    const c = Todo.counts(sid);
    expect(c.total).toBe(4);
    expect(c.pending).toBe(2);
    expect(c.completed).toBe(1);
    expect(c.inProgress).toBe(1);
  });

  test('returns zeros for empty session', () => {
    const sid = createSession('/test/counts-empty').id;
    const c = Todo.counts(sid);
    expect(c.total).toBe(0);
    expect(c.pending).toBe(0);
    expect(c.completed).toBe(0);
    expect(c.inProgress).toBe(0);
  });
});

// ============================================
// Todo.syncToFile
// ============================================

describe('Todo.syncToFile', () => {
  test('writes todos to markdown file', () => {
    const sid = createSession('/test/sync').id;
    Todo.create(sid, 'Sync task 1');
    Todo.create(sid, 'Sync task 2', { status: 'completed' });

    const filePath = path.join(testDir, 'plans', 'test.plan.md');
    Todo.syncToFile(sid, filePath);

    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('Sync task 1');
    expect(content).toContain('[x] Sync task 2');
  });

  test('creates directories recursively', () => {
    const sid = createSession('/test/sync-dir').id;
    Todo.create(sid, 'Deep task');

    const filePath = path.join(testDir, 'deep', 'nested', 'dir', 'plan.md');
    Todo.syncToFile(sid, filePath);

    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('writes empty markdown for no todos', () => {
    const sid = createSession('/test/sync-empty').id;
    const filePath = path.join(testDir, 'plans', 'empty.plan.md');
    Todo.syncToFile(sid, filePath);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('No tasks defined yet');
  });
});

// ============================================
// Todo.getPlanFilePath
// ============================================

describe('Todo.getPlanFilePath', () => {
  test('returns correct path', () => {
    const result = Todo.getPlanFilePath('/my/project', 'session-123');
    expect(result).toBe('/my/project/.stratuscode/plans/session-123.plan.md');
  });

  test('handles different project dirs', () => {
    const result = Todo.getPlanFilePath('/home/user/code', 'abc');
    expect(result).toBe('/home/user/code/.stratuscode/plans/abc.plan.md');
  });
});
