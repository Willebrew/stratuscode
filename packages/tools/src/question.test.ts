import { describe, expect, test } from 'bun:test';
import { questionTool } from './question';

describe('question tool', () => {
  test('returns error when no session id', async () => {
    const result = await questionTool.execute(
      { questions: [{ question: 'Pick one', options: [{ label: 'A' }] }] },
      { sessionId: '', metadata: { projectDir: '/tmp' } } as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('No active session');
  });
});
