import { describe, expect, test } from 'bun:test';
import { todoWriteTool } from './todo-write';

const ctx = (sessionId: string) => ({ sessionId, metadata: { projectDir: '/tmp' } });

describe('todowrite tool', () => {
  test('returns error when no session id', async () => {
    const result = await todoWriteTool.execute(
      { todos: [{ content: 'test' }] },
      { sessionId: '', metadata: {} } as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('No active session');
  });

  test('creates todos for a session', async () => {
    const result = await todoWriteTool.execute(
      {
        todos: [
          { content: 'Task A', status: 'in_progress', priority: 'high' },
          { content: 'Task B', status: 'pending', priority: 'medium' },
        ],
      },
      ctx('todowrite-1') as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.todos).toHaveLength(2);
    expect(parsed.counts.total).toBe(2);
    expect(parsed.counts.inProgress).toBe(1);
  });

  test('rejects multiple in_progress tasks', async () => {
    const result = await todoWriteTool.execute(
      {
        todos: [
          { content: 'Task A', status: 'in_progress' },
          { content: 'Task B', status: 'in_progress' },
        ],
      },
      ctx('todowrite-2') as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('Only one task');
    expect(parsed.inProgressCount).toBe(2);
  });

  test('replaces all todos on subsequent calls', async () => {
    const sid = 'todowrite-replace';
    // First call
    await todoWriteTool.execute(
      { todos: [{ content: 'Old task' }] },
      ctx(sid) as any
    );
    // Second call replaces
    const result = await todoWriteTool.execute(
      { todos: [{ content: 'New task A' }, { content: 'New task B' }] },
      ctx(sid) as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.todos).toHaveLength(2);
    expect(parsed.todos[0].content).toBe('New task A');
  });
});
