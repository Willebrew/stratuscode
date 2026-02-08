import { describe, expect, test } from 'bun:test';
import { todoReadTool } from './todo-read';

const ctx = (sessionId: string) => ({ sessionId, metadata: { projectDir: '/tmp' } });

describe('todoread tool', () => {
  test('returns error when no session id', async () => {
    const result = await todoReadTool.execute({}, { sessionId: '', metadata: {} } as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('No active session');
  });

  test('returns empty list message for fresh session', async () => {
    const result = await todoReadTool.execute({}, ctx('todoread-fresh') as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.todos).toEqual([]);
    expect(parsed.message).toContain('No todos');
  });
});
