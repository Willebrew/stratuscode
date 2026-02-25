import { describe, expect, test } from 'bun:test';

import { getAvailableProviders, getProvider, PROVIDER_CONFIGS, buildSageProviderConfig, getDefaultProvider, getAvailableModels, findModelConfig } from './providers';

describe('cloud/providers', () => {
  test('getAvailableProviders returns env-configured providers', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      delete process.env.CODEX_ACCESS_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CUSTOM_API_KEY;
      delete process.env.CUSTOM_BASE_URL;

      const providers = getAvailableProviders();

      const openai = providers.find((p) => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai!.apiKey).toBe('test-openai-key');

      // Codex is always present (server-managed tokens)
      const codex = providers.find((p) => p.id === 'openai-codex');
      expect(codex).toBeDefined();

      // Free provider should always be present (apiKey defaults to empty string)
      const zen = providers.find((p) => p.id === 'opencode-zen');
      expect(zen).toBeDefined();
      expect(zen!.apiKey).toBe('');
    } finally {
      process.env = originalEnv;
    }
  });

  test('getProvider returns null for unknown provider', () => {
    const provider = getProvider('does-not-exist');
    expect(provider).toBeNull();
  });

  test('custom provider uses CUSTOM_BASE_URL when set', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.CUSTOM_API_KEY = 'custom-key';
      process.env.CUSTOM_BASE_URL = 'http://localhost:9999/v1';

      const provider = getProvider('custom');
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
    expect(PROVIDER_CONFIGS.openrouter!.id).toBe('openrouter');
  });

  test('getDefaultProvider returns the first available provider', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.OPENAI_API_KEY = 'test-key';
      const provider = getDefaultProvider();
      expect(provider).toBeDefined();
    } finally {
      process.env = originalEnv;
    }
  });

  test('getAvailableModels lists models from all configured providers', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.OPENAI_API_KEY = 'test-key';
      const models = getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      // Should include OpenAI models
      const gpt5mini = models.find(m => m.model.id === 'gpt-5-mini');
      expect(gpt5mini).toBeDefined();
      expect(gpt5mini!.providerId).toBe('openai');
    } finally {
      process.env = originalEnv;
    }
  });

  test('findModelConfig finds a known model', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.OPENAI_API_KEY = 'test-key';
      const result = findModelConfig('gpt-5-mini');
      expect(result).toBeDefined();
      expect(result!.model.id).toBe('gpt-5-mini');
      expect(result!.provider.id).toBe('openai');
    } finally {
      process.env = originalEnv;
    }
  });

  test('findModelConfig returns null for unknown model', () => {
    const result = findModelConfig('does-not-exist-model');
    expect(result).toBeNull();
  });

  test('buildSageProviderConfig maps provider to SAGE config', () => {
    const provider: import('./providers').ProviderConfig = {
      id: 'openai',
      label: 'OpenAI',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      type: 'chat-completions',
      models: [
        { id: 'gpt-5-mini', name: 'gpt-5-mini', contextWindow: 128_000, reasoning: false },
      ],
    };
    const config = buildSageProviderConfig(provider, 'gpt-5-mini');
    expect(config.apiKey).toBe('sk-test');
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.contextWindow).toBe(128_000);
    expect(config.supportsReasoning).toBe(false);
  });

  test('buildSageProviderConfig defaults contextWindow when model not found', () => {
    const provider: import('./providers').ProviderConfig = {
      id: 'test',
      label: 'Test',
      apiKey: 'key',
      baseUrl: 'http://localhost',
      type: 'chat-completions',
      models: [],
    };
    const config = buildSageProviderConfig(provider, 'unknown-model');
    expect(config.contextWindow).toBe(128_000);
    expect(config.supportsReasoning).toBe(false);
  });
});

describe('cloud/providers: codex', () => {
  test('getAvailableProviders always includes codex', () => {
    const providers = getAvailableProviders();
    const codex = providers.find(p => p.id === 'openai-codex');
    expect(codex).toBeDefined();
    expect(codex!.type).toBe('responses-api');
    expect(codex!.baseUrl).toBe('https://chatgpt.com/backend-api/codex');
  });

  test('getProvider returns codex config', () => {
    const provider = getProvider('openai-codex');
    expect(provider).toBeDefined();
    expect(provider!.type).toBe('responses-api');
    expect(provider!.models.length).toBeGreaterThan(0);
  });

  test('codex uses env var token when available', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.CODEX_ACCESS_TOKEN = 'env-codex-token';
      const provider = getProvider('openai-codex');
      expect(provider).toBeDefined();
      expect(provider!.apiKey).toBe('env-codex-token');
    } finally {
      process.env = originalEnv;
    }
  });

  test('codex uses server-managed placeholder when no env var', () => {
    const originalEnv = { ...process.env };
    try {
      delete process.env.CODEX_ACCESS_TOKEN;
      const provider = getProvider('openai-codex');
      expect(provider).toBeDefined();
      expect(provider!.apiKey).toBe('server-managed');
    } finally {
      process.env = originalEnv;
    }
  });
});

describe('cloud/providers: OpenRouter', () => {
  test('PROVIDER_CONFIGS openrouter has correct settings', () => {
    const config = PROVIDER_CONFIGS.openrouter;
    expect(config).toBeDefined();
    expect(config!.envKey).toBe('OPENROUTER_API_KEY');
    expect(config!.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(config!.type).toBe('chat-completions');
    expect(config!.headers!['HTTP-Referer']).toBe('https://stratuscode.dev/');
    expect(config!.headers!['X-Title']).toBe('StratusCode');
  });

  test('openrouter models include expected entries', () => {
    const models = PROVIDER_CONFIGS.openrouter!.models;
    expect(models.length).toBeGreaterThan(0);

    const claude = models.find(m => m.id === 'anthropic/claude-sonnet-4');
    expect(claude).toBeDefined();
    expect(claude!.contextWindow).toBe(200_000);

    const deepseekR1 = models.find(m => m.id === 'deepseek/deepseek-r1');
    expect(deepseekR1).toBeDefined();
    expect(deepseekR1!.reasoning).toBe(true);
  });

  test('getAvailableProviders includes openrouter when env key set', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.OPENROUTER_API_KEY = 'sk-or-test-key';

      const providers = getAvailableProviders();
      const openrouter = providers.find(p => p.id === 'openrouter');
      expect(openrouter).toBeDefined();
      expect(openrouter!.apiKey).toBe('sk-or-test-key');
      expect(openrouter!.baseUrl).toBe('https://openrouter.ai/api/v1');
      expect(openrouter!.headers!['HTTP-Referer']).toBe('https://stratuscode.dev/');
      expect(openrouter!.headers!['X-Title']).toBe('StratusCode');
    } finally {
      process.env = originalEnv;
    }
  });

  test('getProvider returns openrouter config', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.OPENROUTER_API_KEY = 'sk-or-provider-test';

      const provider = getProvider('openrouter');
      expect(provider).toBeDefined();
      expect(provider!.apiKey).toBe('sk-or-provider-test');
      expect(provider!.type).toBe('chat-completions');
    } finally {
      process.env = originalEnv;
    }
  });

  test('getProvider returns null for openrouter when no env key', () => {
    const originalEnv = { ...process.env };
    try {
      delete process.env.OPENROUTER_API_KEY;

      const provider = getProvider('openrouter');
      expect(provider).toBeNull();
    } finally {
      process.env = originalEnv;
    }
  });

  test('buildSageProviderConfig includes openrouter headers', () => {
    const provider: import('./providers').ProviderConfig = {
      id: 'openrouter',
      label: 'OpenRouter',
      apiKey: 'sk-or-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      type: 'chat-completions',
      headers: {
        'HTTP-Referer': 'https://stratuscode.dev/',
        'X-Title': 'StratusCode',
      },
      models: [
        { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextWindow: 200_000 },
      ],
    };
    const config = buildSageProviderConfig(provider, 'anthropic/claude-sonnet-4');
    expect(config.apiKey).toBe('sk-or-test');
    expect(config.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(config.headers!['HTTP-Referer']).toBe('https://stratuscode.dev/');
    expect(config.headers!['X-Title']).toBe('StratusCode');
    expect(config.contextWindow).toBe(200_000);
  });

  test('findModelConfig finds openrouter model', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.OPENROUTER_API_KEY = 'sk-or-find-test';
      const result = findModelConfig('anthropic/claude-sonnet-4');
      expect(result).toBeDefined();
      expect(result!.model.id).toBe('anthropic/claude-sonnet-4');
      expect(result!.provider.id).toBe('openrouter');
    } finally {
      process.env = originalEnv;
    }
  });
});
