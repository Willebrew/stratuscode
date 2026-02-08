/**
 * ChatSession Tests - toSageConfig translation
 *
 * Tests for provider switching, special headers, model/reasoning overrides,
 * context window lookup, and agent config passthrough.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from '@stratuscode/storage';
import { toSageConfig } from './chat-session';

const testDir = `/tmp/stratuscode-chat-session-test-${Date.now()}`;

beforeAll(() => {
  initDatabase({ dataDir: testDir });
});

afterAll(() => {
  closeDatabase();
});

function createBaseConfig() {
  return {
    model: 'gpt-5-mini',
    provider: {
      apiKey: 'sk-test-key',
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
// toSageConfig
// ============================================

describe('toSageConfig', () => {
  test('passes through default provider config', () => {
    const config = createBaseConfig();
    const result = toSageConfig(config as any);

    expect(result.provider.apiKey).toBe('sk-test-key');
    expect(result.provider.baseUrl).toBe('https://api.openai.com/v1');
    expect(result.model).toBe('gpt-5-mini');
  });

  test('selects provider override from config.providers', () => {
    const config = {
      ...createBaseConfig(),
      providers: {
        'ollama-local': {
          apiKey: 'ollama-key',
          baseUrl: 'http://localhost:11434/v1',
          type: 'chat-completions' as const,
        },
      },
    };

    const result = toSageConfig(config as any, undefined, 'ollama-local');

    expect(result.provider.apiKey).toBe('ollama-key');
    expect(result.provider.baseUrl).toBe('http://localhost:11434/v1');
    expect(result.provider.type).toBe('chat-completions');
  });

  test('auto-assigns "ollama" apiKey for localhost without key', () => {
    const config = {
      ...createBaseConfig(),
      provider: {
        baseUrl: 'http://localhost:11434/v1',
      },
    };

    const result = toSageConfig(config as any);
    expect(result.provider.apiKey).toBe('ollama');
  });

  test('auto-assigns "ollama" apiKey for 127.0.0.1', () => {
    const config = {
      ...createBaseConfig(),
      provider: {
        baseUrl: 'http://127.0.0.1:11434/v1',
      },
    };

    const result = toSageConfig(config as any);
    expect(result.provider.apiKey).toBe('ollama');
  });

  test('injects Codex headers for chatgpt.com URLs', () => {
    const config = {
      ...createBaseConfig(),
      provider: {
        apiKey: 'codex-key',
        baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
      },
    };

    const result = toSageConfig(config as any, undefined, undefined, 'sess-123');

    expect(result.provider.headers?.originator).toBe('opencode');
    expect(result.provider.headers?.['User-Agent']).toContain('stratuscode');
    expect(result.provider.headers?.session_id).toBe('sess-123');
    // Should strip /responses from URL
    expect(result.provider.baseUrl).not.toContain('/responses');
  });

  test('injects Zen headers for opencode.ai URLs', () => {
    const config = {
      ...createBaseConfig(),
      provider: {
        apiKey: 'zen-key',
        baseUrl: 'https://opencode.ai/zen/v1',
      },
    };

    const result = toSageConfig(config as any, undefined, undefined, 'zen-sess');

    expect(result.provider.headers?.['x-opencode-session']).toBe('zen-sess');
    expect(result.provider.headers?.['x-opencode-project']).toBe('stratuscode');
    expect(result.provider.headers?.['x-opencode-request']).toMatch(/^req-/);
  });

  test('model override takes precedence over config.model', () => {
    const config = createBaseConfig();
    const result = toSageConfig(config as any, 'gpt-5-mini');

    expect(result.model).toBe('gpt-5-mini');
  });

  test('reasoning effort override is applied', () => {
    const config = createBaseConfig();
    const result = toSageConfig(config as any, undefined, undefined, undefined, 'high');

    expect(result.enableReasoningEffort).toBe(true);
    expect(result.reasoningEffort).toBe('high');
  });

  test('reasoning effort "off" disables it', () => {
    const config = {
      ...createBaseConfig(),
      reasoningEffort: 'medium' as const,
    };

    const result = toSageConfig(config as any, undefined, undefined, undefined, 'off');

    expect(result.enableReasoningEffort).toBe(false);
    expect(result.reasoningEffort).toBeUndefined();
  });

  test('looks up known model context window', () => {
    const config = {
      ...createBaseConfig(),
      model: 'gpt-5.2-codex',
    };

    const result = toSageConfig(config as any);
    expect(result.context.contextWindow).toBe(272_000);
  });

  test('defaults to 128K context window for unknown models', () => {
    const config = {
      ...createBaseConfig(),
      model: 'unknown-model-xyz',
    };

    const result = toSageConfig(config as any);
    expect(result.context.contextWindow).toBe(128_000);
  });

  test('passes through agent config', () => {
    const config = createBaseConfig();
    const result = toSageConfig(config as any);

    expect(result.agent.name).toBe('default');
    expect(result.agent.maxDepth).toBe(100);
    expect(result.agent.toolTimeout).toBe(30000);
    expect(result.agent.maxToolResultSize).toBe(50000);
  });

  test('includes context, summary, and error memory config', () => {
    const config = createBaseConfig();
    const result = toSageConfig(config as any);

    expect(result.context.enabled).toBe(true);
    expect(result.context.summary.enabled).toBe(true);
    expect(result.context.summary.targetTokens).toBe(500);
    expect(result.context.errorMemory.enabled).toBe(true);
    expect(result.errorMemoryStore).toBeDefined();
  });

  test('injects OpenRouter headers for openrouter.ai URLs', () => {
    const config = {
      ...createBaseConfig(),
      provider: {
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      },
    };

    const result = toSageConfig(config as any);

    expect(result.provider.headers?.['HTTP-Referer']).toBe('https://stratuscode.dev/');
    expect(result.provider.headers?.['X-Title']).toBe('StratusCode');
  });

  test('OpenRouter headers merge with existing provider headers', () => {
    const config = {
      ...createBaseConfig(),
      providers: {
        'my-openrouter': {
          apiKey: 'sk-or-test',
          baseUrl: 'https://openrouter.ai/api/v1',
          headers: { 'X-Custom': 'custom-value' },
        },
      },
    };

    const result = toSageConfig(config as any, undefined, 'my-openrouter');

    expect(result.provider.headers?.['HTTP-Referer']).toBe('https://stratuscode.dev/');
    expect(result.provider.headers?.['X-Title']).toBe('StratusCode');
    expect(result.provider.headers?.['X-Custom']).toBe('custom-value');
  });

  test('looks up OpenRouter model context window', () => {
    const config = {
      ...createBaseConfig(),
      model: 'anthropic/claude-sonnet-4',
      provider: {
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      },
    };

    const result = toSageConfig(config as any);
    expect(result.context.contextWindow).toBe(200_000);
  });

  test('looks up Gemini via OpenRouter context window (1M)', () => {
    const config = {
      ...createBaseConfig(),
      model: 'google/gemini-2.5-pro-preview',
      provider: {
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      },
    };

    const result = toSageConfig(config as any);
    expect(result.context.contextWindow).toBe(1_000_000);
  });
});
