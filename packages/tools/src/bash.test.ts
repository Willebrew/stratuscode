import { describe, expect, test } from 'bun:test';
import { bashTool } from './bash';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

describe('bash tool', () => {
  test('executes a simple echo command', async () => {
    const result = await bashTool.execute(
      { command: 'echo hello' },
      ctx as any
    );
    expect(result).toBe('hello\n');
  });

  test('returns (no output) for empty output', async () => {
    const result = await bashTool.execute(
      { command: 'true' },
      ctx as any
    );
    expect(result).toBe('(no output)');
  });

  test('returns error JSON for failed command', async () => {
    const result = await bashTool.execute(
      { command: 'exit 1' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.exitCode).toBe(1);
  });

  test('returns stderr on non-zero exit', async () => {
    const result = await bashTool.execute(
      { command: 'echo err >&2; exit 2' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.stderr).toContain('err');
  });

  test('returns stdout for successful command with stderr', async () => {
    const result = await bashTool.execute(
      { command: 'echo out; echo warn >&2' },
      ctx as any
    );
    // exit code 0 → returns stdout
    expect(result).toContain('out');
  });

  test('handles timeout with short duration', async () => {
    const result = await bashTool.execute(
      { command: 'sleep 10', timeout: 200 },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.killed).toBe(true);
    expect(parsed.message).toContain('timed out');
  });

  test('pipes work correctly', async () => {
    const result = await bashTool.execute(
      { command: 'echo -e "a\\nb\\nc" | head -1' },
      ctx as any
    );
    expect((result as string).trim()).toBe('a');
  });

  test('uses projectDir as default cwd', async () => {
    const result = await bashTool.execute(
      { command: 'pwd' },
      ctx as any
    );
    // macOS resolves /tmp to /private/tmp
    expect((result as string).trim()).toMatch(/\/(private\/)?tmp$/);
  });
});
