import { describe, expect, test } from 'bun:test';
import { batchTool } from './batch';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

describe('batch tool', () => {
  test('rejects empty calls array', async () => {
    const result = await batchTool.execute({ calls: [] }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('No tool calls provided');
  });

  test('rejects batch exceeding max size', async () => {
    const calls = Array.from({ length: 26 }, (_, i) => ({ tool: `t${i}`, args: {} }));
    const result = await batchTool.execute({ calls }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('exceeds maximum');
    expect(parsed.requested).toBe(26);
  });

  test('filters out disallowed tools', async () => {
    const result = await batchTool.execute({
      calls: [
        { tool: 'batch', args: {} },
        { tool: 'question', args: {} },
        { tool: 'plan_enter', args: {} },
        { tool: 'plan_exit', args: {} },
      ],
    }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('No valid tool calls after filtering');
    expect(parsed.rejected).toHaveLength(4);
  });

  test('passes valid calls through and rejects disallowed', async () => {
    const result = await batchTool.execute({
      calls: [
        { tool: 'grep', args: { query: 'foo', search_path: '.' } },
        { tool: 'batch', args: {} },
        { tool: 'bash', args: { command: 'echo hi' } },
      ],
    }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe('batch_request');
    expect(parsed.calls).toHaveLength(2);
    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.rejected[0].tool).toBe('batch');
  });

  test('returns all valid calls when none are disallowed', async () => {
    const result = await batchTool.execute({
      calls: [
        { tool: 'grep', args: { query: 'x' } },
        { tool: 'bash', args: { command: 'ls' } },
      ],
    }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe('batch_request');
    expect(parsed.calls).toHaveLength(2);
    expect(parsed.rejected).toBeUndefined();
  });
});
