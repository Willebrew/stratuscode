/**
 * Config Loader
 *
 * Loads configuration from files and environment.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { StratusCodeConfig } from '@stratuscode/shared';
import { deepMerge } from '@stratuscode/shared';

// ============================================
// Types
// ============================================

export interface LoadedConfig {
  config: StratusCodeConfig;
  sources: string[];
}

// ============================================
// Config Loading
// ============================================

/**
 * Load configuration from all sources
 */
export function loadConfig(projectDir: string): LoadedConfig {
  const sources: string[] = [];
  let config: Partial<StratusCodeConfig> = {};

  // 1. Global config (~/.stratuscode/config.json)
  const globalConfigPath = path.join(os.homedir(), '.stratuscode', 'config.json');
  if (fs.existsSync(globalConfigPath)) {
    try {
      const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
      config = deepMerge(config as Record<string, unknown>, globalConfig) as Partial<StratusCodeConfig>;
      sources.push(globalConfigPath);
    } catch (e) {
      console.warn(`Failed to load global config: ${e}`);
    }
  }

  // 2. Project config (stratuscode.json or stratuscode.jsonc)
  for (const filename of ['stratuscode.json', 'stratuscode.jsonc']) {
    const projectConfigPath = path.join(projectDir, filename);
    if (fs.existsSync(projectConfigPath)) {
      try {
        const content = fs.readFileSync(projectConfigPath, 'utf-8');
        // Simple JSONC handling: remove comments
        const jsonContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const projectConfig = JSON.parse(jsonContent);
        config = deepMerge(config as Record<string, unknown>, projectConfig) as Partial<StratusCodeConfig>;
        sources.push(projectConfigPath);
        break;
      } catch (e) {
        console.warn(`Failed to load project config: ${e}`);
      }
    }
  }

  // 3. Environment variables
  if (process.env.OPENAI_API_KEY) {
    if (!config.provider) {
      config.provider = { baseUrl: 'https://api.openai.com/v1' };
    }
    config.provider.apiKey = process.env.OPENAI_API_KEY;
    // If OPENAI_API_KEY is set but no explicit base URL, use OpenAI's URL
    if (!config.provider.baseUrl || config.provider.baseUrl === 'https://chatgpt.com/backend-api/codex') {
      config.provider.baseUrl = 'https://api.openai.com/v1';
    }
    sources.push('OPENAI_API_KEY');
  }

  if (process.env.STRATUSCODE_API_KEY) {
    if (!config.provider) {
      config.provider = { baseUrl: 'https://api.openai.com/v1' };
    }
    config.provider.apiKey = process.env.STRATUSCODE_API_KEY;
    sources.push('STRATUSCODE_API_KEY');
  }

  if (process.env.STRATUSCODE_BASE_URL) {
    if (!config.provider) {
      config.provider = { baseUrl: 'https://api.openai.com/v1' };
    }
    config.provider.baseUrl = process.env.STRATUSCODE_BASE_URL;
    sources.push('STRATUSCODE_BASE_URL');
  }

  // OpenCode Zen provider
  if (process.env.OPENCODE_ZEN_API_KEY || process.env.OPENCODE_API_KEY) {
    if (!config.providers) config.providers = {};
    config.providers['opencode-zen'] = {
      apiKey: process.env.OPENCODE_ZEN_API_KEY || process.env.OPENCODE_API_KEY,
      baseUrl: 'https://opencode.ai/zen/v1',
      type: 'chat-completions',
      headers: {
        'x-opencode-client': 'cli',
      },
    };
    sources.push(process.env.OPENCODE_ZEN_API_KEY ? 'OPENCODE_ZEN_API_KEY' : 'OPENCODE_API_KEY');
  }

  // OpenRouter provider
  if (process.env.OPENROUTER_API_KEY) {
    if (!config.providers) config.providers = {};
    config.providers['openrouter'] = {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
      type: 'chat-completions',
      headers: {
        'HTTP-Referer': 'https://stratuscode.dev/',
        'X-Title': 'StratusCode',
      },
    };
    sources.push('OPENROUTER_API_KEY');
  }

  // OpenAI Codex provider (ChatGPT Pro/Plus OAuth tokens)
  if (process.env.CODEX_REFRESH_TOKEN || process.env.CODEX_ACCESS_TOKEN) {
    if (!config.providers) config.providers = {};
    config.providers['openai-codex'] = {
      apiKey: process.env.CODEX_ACCESS_TOKEN,
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      type: 'responses-api',
      headers: {
        ...(process.env.CODEX_ACCOUNT_ID ? { 'ChatGPT-Account-Id': process.env.CODEX_ACCOUNT_ID } : {}),
      },
      auth: {
        type: 'oauth',
        refresh: process.env.CODEX_REFRESH_TOKEN || '',
        access: process.env.CODEX_ACCESS_TOKEN || '',
        expires: Date.now() + 55 * 60 * 1000, // assume ~1h default if not provided
        ...(process.env.CODEX_ACCOUNT_ID ? { accountId: process.env.CODEX_ACCOUNT_ID } : {}),
      },
    };
    sources.push(process.env.CODEX_REFRESH_TOKEN ? 'CODEX_REFRESH_TOKEN' : 'CODEX_ACCESS_TOKEN');
  }

  // Apply defaults — base URL depends on whether a Codex provider is configured
  const defaultModel = config.model || 'gpt-5.2-codex';
  const hasCodexProvider = !!config.providers?.['openai-codex'];
  const defaultBaseUrl = (defaultModel.toLowerCase().includes('codex') && hasCodexProvider)
    ? 'https://chatgpt.com/backend-api/codex'
    : config.provider?.baseUrl || 'https://api.openai.com/v1';

  const finalConfig: StratusCodeConfig = {
    model: defaultModel,
    provider: {
      apiKey: config.provider?.apiKey,
      auth: config.provider?.auth,
      baseUrl: config.provider?.baseUrl || defaultBaseUrl,
      type: config.provider?.type,
      headers: config.provider?.headers,
    },
    providers: config.providers,
    agent: {
      name: config.agent?.name || 'stratuscode',
      maxDepth: config.agent?.maxDepth || 300,
      toolTimeout: config.agent?.toolTimeout || 60000,
      maxToolResultSize: config.agent?.maxToolResultSize || 100000,
    },
    storage: {
      path: config.storage?.path,
    },
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    parallelToolCalls: config.parallelToolCalls ?? true,
    reasoningEffort: config.reasoningEffort ?? 'high',
    hooks: config.hooks,
  };

  return { config: finalConfig, sources };
}

/**
 * Save config to project directory
 */
export function saveProjectConfig(projectDir: string, config: Partial<StratusCodeConfig>): void {
  const configPath = path.join(projectDir, 'stratuscode.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Save config to global directory
 */
export function saveGlobalConfig(config: Partial<StratusCodeConfig>): void {
  const configDir = path.join(os.homedir(), '.stratuscode');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const configPath = path.join(configDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Check if API key is configured (default provider or any named provider)
 */
export function hasApiKey(config: StratusCodeConfig): boolean {
  if (config.provider?.apiKey || (config.provider as any)?.auth?.access) return true;
  // Check named providers (e.g. openrouter, opencode-zen, openai-codex)
  if (config.providers) {
    for (const p of Object.values(config.providers)) {
      if (p.apiKey || (p as any).auth?.access) return true;
    }
  }
  return false;
}
