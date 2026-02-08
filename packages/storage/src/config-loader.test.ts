import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { loadConfig, saveProjectConfig, saveGlobalConfig, hasApiKey } from './config-loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-loader-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('config-loader: loadConfig', () => {
  test('returns defaults when no config files exist', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;

    try {
      const { config, sources } = loadConfig(tmpDir);
      expect(config.model).toBe('gpt-5.2-codex');
      expect(config.agent!.name).toBe('stratuscode');
      expect(config.agent!.maxDepth).toBe(300);
      expect(config.parallelToolCalls).toBe(true);
      expect(config.reasoningEffort).toBe('high');
      // May pick up global ~/.stratuscode/config.json if it exists
      // Just verify defaults are applied correctly
    } finally {
      process.env = originalEnv;
    }
  });

  test('loads project config from stratuscode.json', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;

    try {
      fs.writeFileSync(
        path.join(tmpDir, 'stratuscode.json'),
        JSON.stringify({ model: 'gpt-4o', temperature: 0.5 })
      );

      const { config, sources } = loadConfig(tmpDir);
      expect(config.model).toBe('gpt-4o');
      expect(config.temperature).toBe(0.5);
      expect(sources.some(s => s.includes('stratuscode.json'))).toBe(true);
    } finally {
      process.env = originalEnv;
    }
  });

  test('loads project config from stratuscode.jsonc (with comments)', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;

    try {
      fs.writeFileSync(
        path.join(tmpDir, 'stratuscode.jsonc'),
        '// This is a comment\n{"model": "o3-mini"}\n'
      );

      const { config } = loadConfig(tmpDir);
      expect(config.model).toBe('o3-mini');
    } finally {
      process.env = originalEnv;
    }
  });

  test('picks up OPENAI_API_KEY from env', () => {
    const originalEnv = { ...process.env };
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;
    process.env.OPENAI_API_KEY = 'sk-test-123';

    try {
      const { config, sources } = loadConfig(tmpDir);
      expect(config.provider!.apiKey).toBe('sk-test-123');
      expect(sources).toContain('OPENAI_API_KEY');
    } finally {
      process.env = originalEnv;
    }
  });

  test('STRATUSCODE_API_KEY overrides OPENAI_API_KEY', () => {
    const originalEnv = { ...process.env };
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.STRATUSCODE_API_KEY = 'sk-stratus';

    try {
      const { config } = loadConfig(tmpDir);
      expect(config.provider!.apiKey).toBe('sk-stratus');
    } finally {
      process.env = originalEnv;
    }
  });

  test('picks up STRATUSCODE_BASE_URL from env', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;
    process.env.STRATUSCODE_BASE_URL = 'http://localhost:8080/v1';

    try {
      const { config, sources } = loadConfig(tmpDir);
      expect(config.provider!.baseUrl).toBe('http://localhost:8080/v1');
      expect(sources).toContain('STRATUSCODE_BASE_URL');
    } finally {
      process.env = originalEnv;
    }
  });

  test('picks up OpenCode Zen provider from env', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;
    process.env.OPENCODE_ZEN_API_KEY = 'zen-key';

    try {
      const { config, sources } = loadConfig(tmpDir);
      expect(config.providers!['opencode-zen']).toBeDefined();
      expect(config.providers!['opencode-zen']!.apiKey).toBe('zen-key');
      expect(sources).toContain('OPENCODE_ZEN_API_KEY');
    } finally {
      process.env = originalEnv;
    }
  });

  test('picks up Codex provider from env', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    process.env.CODEX_ACCESS_TOKEN = 'codex-at';
    delete process.env.CODEX_REFRESH_TOKEN;

    try {
      const { config, sources } = loadConfig(tmpDir);
      expect(config.providers!['openai-codex']).toBeDefined();
      expect(config.providers!['openai-codex']!.apiKey).toBe('codex-at');
      expect(sources).toContain('CODEX_ACCESS_TOKEN');
    } finally {
      process.env = originalEnv;
    }
  });
});

describe('config-loader: saveProjectConfig', () => {
  test('writes stratuscode.json to project dir', () => {
    saveProjectConfig(tmpDir, { model: 'gpt-4o' });
    const configPath = path.join(tmpDir, 'stratuscode.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(loaded.model).toBe('gpt-4o');
  });
});

describe('config-loader: hasApiKey', () => {
  test('returns true when apiKey is set', () => {
    expect(hasApiKey({ provider: { apiKey: 'sk-123' } } as any)).toBe(true);
  });

  test('returns true when auth.access is set', () => {
    expect(hasApiKey({ provider: { auth: { access: 'at-123' } } } as any)).toBe(true);
  });

  test('returns false when no key or auth', () => {
    expect(hasApiKey({ provider: {} } as any)).toBe(false);
  });

  test('returns false when provider is undefined', () => {
    expect(hasApiKey({} as any)).toBe(false);
  });
});


describe('config-loader: error handling', () => {
  test('continues on invalid JSON in project config', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;
    try {
      fs.writeFileSync(path.join(tmpDir, 'stratuscode.json'), 'not valid json {{{');
      const { config, sources } = loadConfig(tmpDir);
      // Invalid JSON is caught and warned, not added to sources
      expect(sources.every((s: string) => !s.includes(tmpDir))).toBe(true);
      expect(config.agent!.name).toBe('stratuscode');
    } finally {
      process.env = originalEnv;
    }
  });
});

describe('config-loader: env var provider creation', () => {
  test('OPENAI_API_KEY creates provider when no global config exists', () => {
    const originalEnv = { ...process.env };
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;
    process.env.OPENAI_API_KEY = 'sk-no-global';
    try {
      const { config } = loadConfig(tmpDir);
      expect(config.provider!.apiKey).toBe('sk-no-global');
    } finally {
      process.env = originalEnv;
    }
  });

  test('STRATUSCODE_API_KEY creates provider when set alone', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_BASE_URL;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;
    process.env.STRATUSCODE_API_KEY = 'sk-stratus-only';
    try {
      const { config } = loadConfig(tmpDir);
      expect(config.provider!.apiKey).toBe('sk-stratus-only');
    } finally {
      process.env = originalEnv;
    }
  });

  test('STRATUSCODE_BASE_URL creates provider when set alone', () => {
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRATUSCODE_API_KEY;
    delete process.env.OPENCODE_ZEN_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.CODEX_REFRESH_TOKEN;
    delete process.env.CODEX_ACCESS_TOKEN;
    process.env.STRATUSCODE_BASE_URL = 'http://custom:8080/v1';
    try {
      const { config } = loadConfig(tmpDir);
      expect(config.provider!.baseUrl).toBe('http://custom:8080/v1');
    } finally {
      process.env = originalEnv;
    }
  });
});
