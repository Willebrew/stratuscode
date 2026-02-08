import { describe, expect, test } from 'bun:test';
import { invalidTool } from './invalid';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

describe('invalid tool', () => {
  test('returns error message with tool name and error', async () => {
    const result = await invalidTool.execute(
      { tool: 'bash', error: 'missing required field "command"' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.title).toBe('Invalid Tool Call');
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('bash');
    expect(parsed.message).toContain('missing required field "command"');
    expect(parsed.suggestion).toBeTruthy();
  });
});
