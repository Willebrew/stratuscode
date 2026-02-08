import { describe, expect, test } from 'bun:test';

import { getAvailableProviders, getProvider, PROVIDER_CONFIGS } from './providers';

describe('cloud/providers', () => {
  test('getAvailableProviders returns env-configured providers (no codex oauth)', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      delete process.env.CODEX_ACCESS_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CUSTOM_API_KEY;
      delete process.env.CUSTOM_BASE_URL;

      const providers = await getAvailableProviders();

      const openai = providers.find((p) => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai!.apiKey).toBe('test-openai-key');

      // Free provider should always be present (apiKey defaults to empty string)
      const zen = providers.find((p) => p.id === 'opencode-zen');
      expect(zen).toBeDefined();
      expect(zen!.apiKey).toBe('');
    } finally {
      process.env = originalEnv;
    }
  });

  test('getProvider returns null for unknown provider', async () => {
    const provider = await getProvider('does-not-exist');
    expect(provider).toBeNull();
  });

  test('custom provider uses CUSTOM_BASE_URL when set', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.CUSTOM_API_KEY = 'custom-key';
      process.env.CUSTOM_BASE_URL = 'http://localhost:9999/v1';

      const provider = await getProvider('custom');
      expect(provider).toBeDefined();
      expect(provider!.apiKey).toBe('custom-key');
      expect(provider!.baseUrl).toBe('http://localhost:9999/v1');
    } finally {
      process.env = originalEnv;
    }
  });

  test('PROVIDER_CONFIGS includes expected built-in providers', () => {
    expect(PROVIDER_CONFIGS.openai!.id).toBe('openai');
    expect(PROVIDER_CONFIGS['openai-codex']!.id).toBe('openai-codex');
    expect(PROVIDER_CONFIGS['opencode-zen']!.id).toBe('opencode-zen');
    expect(PROVIDER_CONFIGS.anthropic!.id).toBe('anthropic');
  });
});
