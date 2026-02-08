import { describe, expect, test } from 'bun:test';
import { planEnterTool, planExitTool } from './plan-mode';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

describe('plan-mode: planEnterTool', () => {
  test('returns plan mode entry confirmation', async () => {
    const result = await planEnterTool.execute({ reason: 'complex task' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.mode).toBe('plan');
    expect(parsed.entered).toBe(true);
    expect(parsed.reason).toBe('complex task');
    expect(parsed.instructions).toBeArray();
  });

  test('works without reason', async () => {
    const result = await planEnterTool.execute({}, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.entered).toBe(true);
  });
});

describe('plan-mode: planExitTool', () => {
  test('proposes exit when ready is true', async () => {
    const result = await planExitTool.execute(
      { summary: 'Plan complete', ready: true },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.proposingExit).toBe(true);
    expect(parsed.summary).toBe('Plan complete');
  });

  test('defaults ready to true', async () => {
    const result = await planExitTool.execute({ summary: 'Done' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.proposingExit).toBe(true);
  });

  test('does not exit when ready is false', async () => {
    const result = await planExitTool.execute({ ready: false }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.exited).toBe(false);
    expect(parsed.proposingExit).toBeUndefined();
  });
});
