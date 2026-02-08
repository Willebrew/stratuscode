/**
 * LLM Provider Configuration
 * 
 * Supports the same providers as the CLI:
 * - OpenAI (standard API)
 * - OpenAI Codex (ChatGPT Pro/Plus) — via env var OR browser OAuth
 * - OpenCode Zen (free models)
 * - Anthropic
 * - Custom OpenAI-compatible endpoints
 */

async function getCodexTokensSafe(): Promise<import('./codex-auth').CodexTokens | null> {
  try {
    const mod = await import('./codex-auth');
    return await mod.getCodexTokens();
  } catch {
    return null;
  }
}

export interface ProviderConfig {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  type: 'responses-api' | 'chat-completions';
  headers?: Record<string, string>;
  models: ModelConfig[];
}

export interface ModelConfig {
  id: string;
  name: string;
  reasoning?: boolean;
  reasoningEfforts?: ('minimal' | 'low' | 'medium' | 'high')[];
  contextWindow?: number;
  free?: boolean;
}

export const PROVIDER_CONFIGS: Record<string, Omit<ProviderConfig, 'apiKey'> & { apiKey?: string; envKey: string }> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    type: 'chat-completions',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128_000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128_000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128_000 },
      { id: 'o3-mini', name: 'o3-mini', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 128_000 },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', reasoning: true, reasoningEfforts: ['minimal', 'low', 'medium', 'high'], contextWindow: 128_000 },
    ],
  },
  'openai-codex': {
    id: 'openai-codex',
    label: 'OpenAI Codex (ChatGPT Pro)',
    envKey: 'CODEX_ACCESS_TOKEN',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    type: 'responses-api',
    models: [
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 272_000 },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 272_000 },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 128_000 },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 400_000 },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 128_000 },
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 400_000 },
      { id: 'codex-mini', name: 'Codex Mini', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 200_000 },
    ],
  },
  'opencode-zen': {
    id: 'opencode-zen',
    label: 'OpenCode Zen (Free)',
    envKey: 'OPENCODE_ZEN_API_KEY',
    apiKey: '', // OpenCode Zen free models don't require an API key
    baseUrl: 'https://opencode.ai/zen/v1',
    type: 'chat-completions',
    headers: {
      'x-opencode-client': 'cli',
    },
    models: [
      { id: 'minimax-m2.1-free', name: 'MiniMax M2.1 Free', free: true, contextWindow: 128_000 },
      { id: 'trinity-large-preview-free', name: 'Trinity Large Preview', free: true, contextWindow: 128_000 },
      { id: 'kimi-k2.5-free', name: 'Kimi K2.5 Free', free: true, contextWindow: 128_000 },
      { id: 'glm-4.7-free', name: 'GLM-4.7 Free', free: true, contextWindow: 128_000 },
      { id: 'big-pickle', name: 'Big Pickle', free: true, contextWindow: 128_000 },
    ],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    type: 'chat-completions',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200_000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200_000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200_000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200_000 },
    ],
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    envKey: 'CUSTOM_API_KEY',
    baseUrl: process.env.CUSTOM_BASE_URL || 'http://localhost:8080/v1',
    type: 'chat-completions',
    models: [],
  },
};

/**
 * Get available providers based on configured environment variables and OAuth tokens.
 */
export async function getAvailableProviders(): Promise<ProviderConfig[]> {
  const available: ProviderConfig[] = [];

  // Check Codex OAuth tokens from cookie
  let codexOAuthKey: string | null = null;
  let codexOAuthHeaders: Record<string, string> | undefined;
  const tokens = await getCodexTokensSafe();
  if (tokens) {
    codexOAuthKey = tokens.accessToken;
    if (tokens.accountId) {
      codexOAuthHeaders = { 'ChatGPT-Account-Id': tokens.accountId };
    }
  }

  // Add Codex if OAuth tokens are available
  if (codexOAuthKey) {
    const codexConfig = PROVIDER_CONFIGS['openai-codex'];
    if (codexConfig) {
      available.push({
        id: 'openai-codex',
        label: codexConfig.label,
        apiKey: codexOAuthKey,
        baseUrl: codexConfig.baseUrl,
        type: codexConfig.type,
        headers: { ...codexConfig.headers, ...codexOAuthHeaders },
        models: codexConfig.models,
      });
    }
  }

  // Add other providers from environment variables
  for (const [id, config] of Object.entries(PROVIDER_CONFIGS)) {
    // Skip openai-codex - already handled above
    if (id === 'openai-codex') continue;
    
    // OpenCode Zen has a default API key for free models (empty string is valid)
    const apiKey = process.env[config.envKey] || config.apiKey;
    if (apiKey !== undefined) {
      available.push({
        id,
        label: config.label,
        apiKey,
        baseUrl: id === 'custom' ? (process.env.CUSTOM_BASE_URL || config.baseUrl) : config.baseUrl,
        type: config.type,
        headers: config.headers,
        models: config.models,
      });
    }
  }

  return available;
}

/**
 * Get provider config by ID
 */
export async function getProvider(providerId: string): Promise<ProviderConfig | null> {
  const config = PROVIDER_CONFIGS[providerId];
  if (!config) return null;

  // For openai-codex, check OAuth tokens first
  if (providerId === 'openai-codex') {
    const tokens = await getCodexTokensSafe();
    if (tokens) {
      return {
        id: providerId,
        label: config.label,
        apiKey: tokens.accessToken,
        baseUrl: config.baseUrl,
        type: config.type,
        headers: {
          ...config.headers,
          ...(tokens.accountId ? { 'ChatGPT-Account-Id': tokens.accountId } : {}),
        },
        models: config.models,
      };
    }
  }

  // OpenCode Zen and other providers may have default API keys (empty string is valid)
  const apiKey = process.env[config.envKey] || config.apiKey;
  if (apiKey === undefined) return null;

  return {
    id: providerId,
    label: config.label,
    apiKey,
    baseUrl: providerId === 'custom' ? (process.env.CUSTOM_BASE_URL || config.baseUrl) : config.baseUrl,
    type: config.type,
    headers: config.headers,
    models: config.models,
  };
}

/**
 * Get the default provider (first available)
 */
export async function getDefaultProvider(): Promise<ProviderConfig | null> {
  const available = await getAvailableProviders();
  return available[0] || null;
}

/**
 * Find model config by ID across all providers
 */
export async function findModelConfig(modelId: string): Promise<{ provider: ProviderConfig; model: ModelConfig } | null> {
  for (const [providerId, config] of Object.entries(PROVIDER_CONFIGS)) {
    const model = config.models.find(m => m.id === modelId);
    if (model) {
      const provider = await getProvider(providerId);
      if (provider) {
        return { provider, model };
      }
    }
  }
  return null;
}

/**
 * Get all available models from configured providers
 */
export async function getAvailableModels(): Promise<Array<{ providerId: string; providerLabel: string; model: ModelConfig }>> {
  const models: Array<{ providerId: string; providerLabel: string; model: ModelConfig }> = [];

  for (const provider of await getAvailableProviders()) {
    for (const model of provider.models) {
      models.push({
        providerId: provider.id,
        providerLabel: provider.label,
        model,
      });
    }
  }

  return models;
}

/**
 * Build provider config for SAGE from our provider config
 */
export function buildSageProviderConfig(provider: ProviderConfig, modelId: string) {
  const model = provider.models.find(m => m.id === modelId);
  
  return {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    type: provider.type,
    headers: provider.headers,
    contextWindow: model?.contextWindow || 128_000,
    supportsReasoning: model?.reasoning || false,
    reasoningEfforts: model?.reasoningEfforts,
  };
}
