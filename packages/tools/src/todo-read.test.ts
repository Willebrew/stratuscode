import { describe, expect, test } from 'bun:test';
import { todoReadTool } from './todo-read';
import { Todo } from './lib/todo';

const ctx = (sessionId: string) => ({ sessionId, metadata: { projectDir: '/tmp' } });

describe('todoread tool', () => {
  test('returns error when no session id', async () => {
    const result = await todoReadTool.execute({}, { sessionId: '', metadata: {} } as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('No active session');
  });

  test('returns empty list message for fresh session', async () => {
    const result = await todoReadTool.execute({}, ctx('todoread-fresh-' + Date.now()) as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.todos).toEqual([]);
    expect(parsed.message).toContain('No todos');
  });

  test('returns todos when they exist', async () => {
    const sid = 'todoread-with-items-' + Date.now();
    Todo.create(sid, 'Write unit tests');
    Todo.create(sid, 'Fix bug');
    const result = await todoReadTool.execute({}, ctx(sid) as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.todos.length).toBe(2);
    expect(parsed.todos[0].content).toBe('Write unit tests');
    expect(parsed.todos[1].content).toBe('Fix bug');
    expect(parsed.todos[0].status).toBe('pending');
    expect(parsed.todos[0].id).toBeTruthy();
    expect(parsed.counts.total).toBe(2);
    expect(parsed.counts.pending).toBe(2);
  });

  test('includes priority in todo output', async () => {
    const sid = 'todoread-priority-' + Date.now();
    Todo.create(sid, 'Important task', { priority: 'high' });
    const result = await todoReadTool.execute({}, ctx(sid) as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.todos[0].priority).toBe('high');
    expect(parsed.todos[0].content).toBe('Important task');
  });

  test('returns updated counts after status change', async () => {
    const sid = 'todoread-counts-' + Date.now();
    Todo.create(sid, 'Task A');
    Todo.create(sid, 'Task B');
    const todos = Todo.list(sid);
    Todo.update(todos[0].id, { status: 'completed' });
    const result = await todoReadTool.execute({}, ctx(sid) as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.counts.completed).toBe(1);
    expect(parsed.counts.pending).toBe(1);
    expect(parsed.counts.total).toBe(2);
  });
});
