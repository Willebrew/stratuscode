import { describe, expect, test, beforeEach } from 'bun:test';
import { resolveAnswer, registerSandboxTools } from './sandbox-tools';
import { createToolRegistry } from '@willebrew/sage-core';

beforeEach(() => {
  const gs = globalThis as any;
  gs.__stratusPendingAnswers?.clear();
});

describe('sandbox-tools: resolveAnswer', () => {
  test('returns false when no pending answer exists', () => {
    expect(resolveAnswer('nonexistent', 'answer')).toBe(false);
  });

  test('resolves a pending answer and returns true', () => {
    const gs = globalThis as any;
    const pending: Map<string, { resolve: (a: string) => void }> = gs.__stratusPendingAnswers;
    let resolved = '';
    pending.set('sb-1', { resolve: (a: string) => { resolved = a; } });

    expect(resolveAnswer('sb-1', 'yes')).toBe(true);
    expect(resolved).toBe('yes');
    // Should be deleted after resolving
    expect(resolveAnswer('sb-1', 'again')).toBe(false);
  });
});

describe('sandbox-tools: registerSandboxTools', () => {
  test('registers all expected tools into a registry', () => {
    const registry = createToolRegistry();
    const mockSandbox = {
      sandboxId: 'sb-mock',
      sandbox: {} as any,
      owner: 'test',
      repo: 'repo',
      branch: 'main',
      sessionBranch: 'stratuscode/test',
      workDir: '/vercel/sandbox',
    };

    registerSandboxTools(registry, mockSandbox, 'sess-1');
    const tools = registry.toAPIFormat();
    expect(tools.length).toBeGreaterThanOrEqual(15);

    const toolNames = tools.map((t: any) => t.name || t.function?.name);
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('read');
    expect(toolNames).toContain('write_to_file');
    expect(toolNames).toContain('edit');
    expect(toolNames).toContain('multi_edit');
    expect(toolNames).toContain('grep');
    expect(toolNames).toContain('glob');
    expect(toolNames).toContain('ls');
    expect(toolNames).toContain('websearch');
    expect(toolNames).toContain('webfetch');
    expect(toolNames).toContain('git_commit');
    expect(toolNames).toContain('git_push');
    expect(toolNames).toContain('pr_create');
    expect(toolNames).toContain('todoread');
    expect(toolNames).toContain('todowrite');
    expect(toolNames).toContain('question');
    expect(toolNames).toContain('plan_enter');
    expect(toolNames).toContain('plan_exit');
  });
});
