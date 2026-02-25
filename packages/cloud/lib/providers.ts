/**
 * LLM Provider Configuration
 *
 * Supports the same providers as the CLI:
 * - OpenAI (standard API)
 * - OpenAI Codex (ChatGPT Pro/Plus) — tokens stored server-side in Convex DB
 * - OpenCode Zen (free models)
 * - Anthropic
 * - Custom OpenAI-compatible endpoints
 */

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
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', reasoning: true, reasoningEfforts: ['minimal', 'low', 'medium', 'high'], contextWindow: 128_000 },
      { id: 'o3-mini', name: 'o3-mini', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 128_000 },
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
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    type: 'chat-completions',
    headers: {
      'HTTP-Referer': 'https://stratuscode.dev/',
      'X-Title': 'StratusCode',
    },
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextWindow: 200_000 },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200_000 },
      { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', contextWindow: 1_000_000 },
      { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', contextWindow: 1_000_000 },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 128_000 },
      { id: 'deepseek/deepseek-chat-v3', name: 'DeepSeek V3', contextWindow: 128_000 },
      { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128_000 },
      { id: 'openai/o3-mini', name: 'o3-mini', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'], contextWindow: 128_000 },
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', contextWindow: 128_000 },
      { id: 'moonshotai/kimi-k2', name: 'Kimi K2', contextWindow: 128_000 },
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
 * Get available providers based on configured environment variables.
 * Codex is always included — auth is handled server-side in the Convex agent
 * via tokens stored in the Convex DB.
 */
export function getAvailableProviders(): ProviderConfig[] {
  const available: ProviderConfig[] = [];

  for (const [id, config] of Object.entries(PROVIDER_CONFIGS)) {
    // Codex: always available (tokens resolved server-side by the agent)
    if (id === 'openai-codex') {
      available.push({
        id,
        label: config.label,
        apiKey: process.env.CODEX_ACCESS_TOKEN || 'server-managed',
        baseUrl: config.baseUrl,
        type: config.type,
        headers: config.headers,
        models: config.models,
      });
      continue;
    }

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
export function getProvider(providerId: string): ProviderConfig | null {
  const config = PROVIDER_CONFIGS[providerId];
  if (!config) return null;

  // Codex: always return config (tokens resolved server-side by the agent)
  if (providerId === 'openai-codex') {
    return {
      id: providerId,
      label: config.label,
      apiKey: process.env.CODEX_ACCESS_TOKEN || 'server-managed',
      baseUrl: config.baseUrl,
      type: config.type,
      headers: config.headers,
      models: config.models,
    };
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
export function getDefaultProvider(): ProviderConfig | null {
  const available = getAvailableProviders();
  return available[0] || null;
}

/**
 * Find model config by ID across all providers
 */
export function findModelConfig(modelId: string): { provider: ProviderConfig; model: ModelConfig } | null {
  for (const [providerId, config] of Object.entries(PROVIDER_CONFIGS)) {
    const model = config.models.find(m => m.id === modelId);
    if (model) {
      const provider = getProvider(providerId);
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
export function getAvailableModels(): Array<{ providerId: string; providerLabel: string; model: ModelConfig }> {
  const models: Array<{ providerId: string; providerLabel: string; model: ModelConfig }> = [];

  for (const provider of getAvailableProviders()) {
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
