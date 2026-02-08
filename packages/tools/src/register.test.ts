import { describe, expect, test } from 'bun:test';
import { registerBuiltInTools, getBuiltInToolNames } from './register';
import { createToolRegistry } from '@willebrew/sage-core';

describe('register: getBuiltInToolNames', () => {
  test('returns expected tool names', () => {
    const names = getBuiltInToolNames();
    expect(names).toContain('read');
    expect(names).toContain('write');
    expect(names).toContain('edit');
    expect(names).toContain('bash');
    expect(names).toContain('grep');
    expect(names).toContain('glob');
    expect(names).toContain('ls');
    expect(names).toContain('multi_edit');
    expect(names).toContain('batch');
    expect(names).toContain('question');
    expect(names).toContain('plan_enter');
    expect(names).toContain('plan_exit');
    expect(names.length).toBeGreaterThanOrEqual(18);
  });
});

describe('register: registerBuiltInTools', () => {
  test('registers all tools into a registry', () => {
    const registry = createToolRegistry();
    registerBuiltInTools(registry);
    const tools = registry.toAPIFormat();
    expect(tools.length).toBeGreaterThanOrEqual(18);
    const toolNames = tools.map((t: any) => t.name || t.function?.name);
    expect(toolNames).toContain('read');
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('edit');
  });
});
