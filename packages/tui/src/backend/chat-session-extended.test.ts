/**
 * ChatSession Extended Tests
 *
 * Tests for ChatSession class lifecycle (constructor, getState, clear, abort,
 * setters) and the expandMentions utility.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase, closeDatabase } from '@stratuscode/storage';
import { ChatSession, expandMentions, toSageConfig } from './chat-session';

const testDir = `/tmp/stratuscode-chat-session-ext-test-${Date.now()}`;
const projectDir = path.join(testDir, 'project');

beforeAll(() => {
  fs.mkdirSync(projectDir, { recursive: true });
  initDatabase({ dataDir: testDir });
});

afterAll(() => {
  closeDatabase();
});

function createBaseConfig() {
  return {
    model: 'gpt-4o',
    provider: {
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
    },
    agent: {
      name: 'default',
      maxDepth: 100,
      toolTimeout: 30000,
      maxToolResultSize: 50000,
    },
  };
}

// ============================================
// expandMentions
// ============================================

describe('expandMentions', () => {
  test('returns content unchanged when no mentions', () => {
    const result = expandMentions('Hello world', projectDir);
    expect(result).toBe('Hello world');
  });

  test('expands file mention when file exists', () => {
    const filePath = path.join(projectDir, 'test-file.ts');
    fs.writeFileSync(filePath, 'const x = 1;', 'utf-8');

    const result = expandMentions('Look at @test-file.ts for the code', projectDir);
    expect(result).toContain('<file path="test-file.ts">');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('</file>');
    expect(result).toContain('Look at @test-file.ts for the code');

    fs.unlinkSync(filePath);
  });

  test('ignores mentions for non-existent files', () => {
    const result = expandMentions('Check @nonexistent.ts', projectDir);
    expect(result).toBe('Check @nonexistent.ts');
  });

  test('handles multiple mentions', () => {
    const file1 = path.join(projectDir, 'a.ts');
    const file2 = path.join(projectDir, 'b.ts');
    fs.writeFileSync(file1, 'file a', 'utf-8');
    fs.writeFileSync(file2, 'file b', 'utf-8');

    const result = expandMentions('Compare @a.ts and @b.ts', projectDir);
    expect(result).toContain('<file path="a.ts">');
    expect(result).toContain('<file path="b.ts">');
    expect(result).toContain('file a');
    expect(result).toContain('file b');

    fs.unlinkSync(file1);
    fs.unlinkSync(file2);
  });

  test('truncates large files at 10000 chars', () => {
    const filePath = path.join(projectDir, 'big-file.ts');
    fs.writeFileSync(filePath, 'x'.repeat(15000), 'utf-8');

    const result = expandMentions('See @big-file.ts', projectDir);
    expect(result).toContain('... (truncated)');
    // Should not contain full 15000 chars
    expect(result.length).toBeLessThan(15000 + 200);

    fs.unlinkSync(filePath);
  });

  test('handles mention with directory path', () => {
    const dir = path.join(projectDir, 'src');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'util.ts');
    fs.writeFileSync(filePath, 'export const util = true;', 'utf-8');

    const result = expandMentions('Check @src/util.ts', projectDir);
    expect(result).toContain('<file path="src/util.ts">');
    expect(result).toContain('export const util = true;');

    fs.unlinkSync(filePath);
    fs.rmdirSync(dir);
  });
});

// ============================================
// ChatSession constructor & getState
// ============================================

describe('ChatSession constructor', () => {
  test('initializes with default state', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    const state = session.getState();
    expect(state.messages).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.timelineEvents).toEqual([]);
    expect(state.sessionId).toBeUndefined();
    expect(state.planExitProposed).toBe(false);
    expect(state.agent).toBe('build');
  });

  test('accepts model and provider overrides', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
      modelOverride: 'gpt-5-mini',
      providerOverride: 'zen',
    });

    const state = session.getState();
    expect(state.modelOverride).toBe('gpt-5-mini');
    expect(state.providerOverride).toBe('zen');
  });

  test('accepts reasoning effort override', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
      reasoningEffortOverride: 'high',
    });

    expect(session.getState().reasoningEffortOverride).toBe('high');
  });
});

// ============================================
// ChatSession getState (immutability)
// ============================================

describe('ChatSession getState immutability', () => {
  test('returns a copy (mutations do not affect internal state)', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    const state1 = session.getState();
    state1.messages.push({ role: 'user', content: 'injected' });

    const state2 = session.getState();
    expect(state2.messages).toEqual([]);
  });
});

// ============================================
// ChatSession setters
// ============================================

describe('ChatSession setters', () => {
  test('setAgent updates state', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    session.setAgent('plan');
    expect(session.getState().agent).toBe('plan');
  });

  test('setModelOverride updates state', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    session.setModelOverride('o3-mini');
    expect(session.getState().modelOverride).toBe('o3-mini');
  });

  test('setModelOverride to undefined clears override', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
      modelOverride: 'gpt-5-mini',
    });

    session.setModelOverride(undefined);
    expect(session.getState().modelOverride).toBeUndefined();
  });

  test('setProviderOverride updates state', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    session.setProviderOverride('zen');
    expect(session.getState().providerOverride).toBe('zen');
  });

  test('setReasoningEffortOverride updates state', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    session.setReasoningEffortOverride('low');
    expect(session.getState().reasoningEffortOverride).toBe('low');
  });
});

// ============================================
// ChatSession clear
// ============================================

describe('ChatSession clear', () => {
  test('resets all state', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    // Trigger session creation
    session.ensureSessionId();
    expect(session.getState().sessionId).toBeDefined();

    session.clear();
    const state = session.getState();
    expect(state.messages).toEqual([]);
    expect(state.timelineEvents).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.sessionId).toBeUndefined();
    expect(state.tokens.input).toBe(0);
    expect(state.tokens.output).toBe(0);
    expect(state.sessionTokens).toBeUndefined();
    expect(state.planExitProposed).toBe(false);
  });
});

// ============================================
// ChatSession abort
// ============================================

describe('ChatSession abort', () => {
  test('sets isLoading to false', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    session.abort();
    expect(session.getState().isLoading).toBe(false);
  });
});

// ============================================
// ChatSession resetPlanExit
// ============================================

describe('ChatSession resetPlanExit', () => {
  test('resets planExitProposed', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    session.resetPlanExit();
    expect(session.getState().planExitProposed).toBe(false);
  });
});

// ============================================
// ChatSession event emission
// ============================================

describe('ChatSession events', () => {
  test('emits state event on setter change', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    let received = false;
    session.on('state', () => { received = true; });
    session.setAgent('plan');
    expect(received).toBe(true);
  });

  test('emits session_changed on ensureSessionId', () => {
    const session = new ChatSession({
      projectDir,
      config: createBaseConfig() as any,
      agent: 'build',
    });

    let sessionId: string | undefined;
    session.on('session_changed', (id: string) => { sessionId = id; });
    session.ensureSessionId();
    expect(sessionId).toBeDefined();
  });
});

// ============================================
// toSageConfig additional tests
// ============================================

describe('toSageConfig additional', () => {
  test('passes maxTokens through', () => {
    const config = {
      ...createBaseConfig(),
      maxTokens: 8192,
    };
    const result = toSageConfig(config as any);
    expect(result.maxTokens).toBe(8192);
  });

  test('reasoning for known reasoning model defaults to medium', () => {
    const config = {
      ...createBaseConfig(),
      model: 'gpt-5.2-codex',
    };
    const result = toSageConfig(config as any);
    expect(result.enableReasoningEffort).toBe(true);
    expect(result.reasoningEffort).toBe('medium');
  });

  test('non-reasoning model has no reasoning effort', () => {
    const config = {
      ...createBaseConfig(),
      model: 'gpt-4o',
    };
    const result = toSageConfig(config as any);
    expect(result.enableReasoningEffort).toBe(false);
    expect(result.reasoningEffort).toBeUndefined();
  });

  test('parallelToolCalls passes through', () => {
    const config = {
      ...createBaseConfig(),
      parallelToolCalls: false,
    };
    const result = toSageConfig(config as any);
    expect(result.parallelToolCalls).toBe(false);
  });

  test('temperature passes through', () => {
    const config = {
      ...createBaseConfig(),
      temperature: 0.3,
    };
    const result = toSageConfig(config as any);
    expect(result.temperature).toBe(0.3);
  });
});
