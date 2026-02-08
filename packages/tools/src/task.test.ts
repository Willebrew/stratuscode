import { describe, expect, test } from 'bun:test';
import { taskTool } from './task';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

describe('task tool', () => {
  test('returns delegated status with explore agent by default', async () => {
    const result = await taskTool.execute(
      { description: 'Find all auth files' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe('delegated');
    expect(parsed.agent).toBe('explore');
    expect(parsed.description).toBe('Find all auth files');
  });

  test('respects agent parameter', async () => {
    const result = await taskTool.execute(
      { description: 'Refactor auth module', agent: 'general' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.agent).toBe('general');
  });

  test('passes context through', async () => {
    const result = await taskTool.execute(
      { description: 'Search for bugs', context: 'Focus on auth flow' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.context).toBe('Focus on auth flow');
  });
});
