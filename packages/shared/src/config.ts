import { z } from 'zod';
import type { StratusCodeHooks, PermissionRuleset } from './types';

// ============================================
// Configuration Schema
// ============================================

export const StratusCodeConfigSchema = z.object({
  // Model - any string (unlocked for multi-provider support)
  model: z.string().default('gpt-5.2-codex'),

  // Provider configuration
  provider: z.object({
    apiKey: z.string().optional(),
    auth: z.object({
      type: z.literal('oauth'),
      refresh: z.string(),
      access: z.string(),
      expires: z.number(),
      accountId: z.string().optional(),
    }).optional(),
    baseUrl: z.string().default('https://chatgpt.com/backend-api/codex'),
    type: z.enum(['responses-api', 'chat-completions']).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }).default({}),

  // Named provider presets (multiple API keys / endpoints)
  providers: z.record(z.string(), z.object({
    apiKey: z.string().optional(),
    auth: z.object({
      type: z.literal('oauth'),
      refresh: z.string(),
      access: z.string(),
      expires: z.number(),
      accountId: z.string().optional(),
    }).optional(),
    baseUrl: z.string(),
    type: z.enum(['responses-api', 'chat-completions']).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })).optional(),

  // Agent configuration
  agent: z.object({
    name: z.string().default('stratuscode'),
    maxDepth: z.number().default(300),
    toolTimeout: z.number().default(60000),
    maxToolResultSize: z.number().default(100000),
  }).default({}),

  // Storage configuration
  storage: z.object({
    path: z.string().optional(), // Default: ~/.stratuscode
  }).default({}),

  // Temperature (optional - some models don't support it)
  temperature: z.number().min(0).max(2).optional(),

  // Max tokens for response (optional - some models don't support it)
  maxTokens: z.number().optional(),

  // Enable parallel tool calls
  parallelToolCalls: z.boolean().default(true),

  // Reasoning/thinking configuration
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
});

export type StratusCodeConfigInput = z.input<typeof StratusCodeConfigSchema>;
export type StratusCodeConfig = z.output<typeof StratusCodeConfigSchema> & {
  hooks?: StratusCodeHooks;
};

// ============================================
// Agent Configuration
// ============================================

export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(['primary', 'subagent']).default('primary'),
  prompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  permissions: z.record(z.string(), z.enum(['allow', 'deny', 'ask'])).optional(),
  disable: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================
// MCP Configuration
// ============================================

export const McpLocalConfigSchema = z.object({
  type: z.literal('local'),
  command: z.array(z.string()),
  environment: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().default(30000),
});

export const McpRemoteConfigSchema = z.object({
  type: z.literal('remote'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().default(30000),
});

export const McpConfigSchema = z.discriminatedUnion('type', [
  McpLocalConfigSchema,
  McpRemoteConfigSchema,
]);

export type McpConfig = z.infer<typeof McpConfigSchema>;

// ============================================
// Full Project Configuration
// ============================================

export const ProjectConfigSchema = z.object({
  $schema: z.string().optional(),

  // Extend base config
  ...StratusCodeConfigSchema.shape,

  // Agents
  agents: z.record(z.string(), AgentConfigSchema).optional(),

  // MCP servers
  mcp: z.record(z.string(), McpConfigSchema).optional(),

  // Default agent
  defaultAgent: z.string().default('build'),

  // Instructions to prepend to system prompt
  instructions: z.array(z.string()).optional(),

  // Keybinds (TUI)
  keybinds: z.record(z.string(), z.string()).optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// ============================================
// Config Helper
// ============================================

export function defineConfig(config: Partial<StratusCodeConfigInput> & { hooks?: StratusCodeHooks }): StratusCodeConfig {
  const parsed = StratusCodeConfigSchema.parse(config);
  return {
    ...parsed,
    hooks: config.hooks,
  };
}

// ============================================
// Default Values
// ============================================

export const DEFAULT_CONFIG: StratusCodeConfig = {
  model: 'gpt-5.2-codex',
  provider: {
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    type: 'responses-api',
  },
  agent: {
    name: 'stratuscode',
    maxDepth: 300,
    toolTimeout: 60000,
    maxToolResultSize: 100000,
  },
  storage: {},
  parallelToolCalls: true,
  reasoningEffort: 'high',
};

/**
 * Known model lists for providers
 */
export interface ProviderModelEntry {
  id: string;
  name: string;
  free?: boolean;
  /** Model supports reasoning/thinking — enables reasoning effort parameter */
  reasoning?: boolean;
  /** Supported reasoning effort levels (defaults to ['low','medium','high'] if reasoning=true) */
  reasoningEfforts?: Array<'minimal' | 'low' | 'medium' | 'high'>;
  /** Context window size in tokens (used for Ollama/local models) */
  contextWindow?: number;
}

export const PROVIDER_MODELS: Record<string, { label: string; models: ProviderModelEntry[] }> = {
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', reasoning: true, reasoningEfforts: ['minimal', 'low', 'medium', 'high'] },
      { id: 'o3-mini', name: 'o3-mini', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'] },
    ],
  },
  'openai-codex': {
    label: 'OpenAI Codex',
    models: [
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'] },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'] },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'] },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'] },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'] },
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'] },
      { id: 'codex-mini', name: 'Codex Mini', reasoning: true, reasoningEfforts: ['low', 'medium', 'high'] },
    ],
  },
  'opencode-zen': {
    label: 'OpenCode Zen',
    models: [
      { id: 'minimax-m2.1-free', name: 'MiniMax M2.1 Free', free: true },
      { id: 'trinity-large-preview-free', name: 'Trinity Large Preview', free: true },
      { id: 'kimi-k2.5-free', name: 'Kimi K2.5 Free', free: true },
      { id: 'glm-4.7-free', name: 'GLM-4.7 Free', free: true },
      { id: 'big-pickle', name: 'Big Pickle', free: true },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
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
  ollama: {
    label: 'Ollama (Local)',
    models: [], // Filled dynamically at runtime via discoverOllamaModels()
  },
};

/** Default context window for Ollama models when /api/show doesn't report one */
const OLLAMA_DEFAULT_CONTEXT_WINDOW = 2048;

/**
 * Discover locally installed Ollama models by querying the Ollama API.
 * Also fetches each model's context window size via /api/show.
 * Returns null if Ollama is not running or unreachable.
 */
export async function discoverOllamaModels(
  baseUrl = 'http://localhost:11434'
): Promise<ProviderModelEntry[] | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const modelList = data.models || [];

    // Fetch context window for each model in parallel
    const entries = await Promise.all(
      modelList.map(async (m: any): Promise<ProviderModelEntry> => {
        let contextWindow = OLLAMA_DEFAULT_CONTEXT_WINDOW;
        try {
          const showRes = await fetch(`${baseUrl}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: m.name }),
            signal: AbortSignal.timeout(2000),
          });
          if (showRes.ok) {
            const showData = (await showRes.json()) as {
              model_info?: Record<string, unknown>;
              parameters?: string;
            };
            // Check model_info for context length keys
            if (showData.model_info) {
              for (const [key, value] of Object.entries(showData.model_info)) {
                if (key.includes('context_length') && typeof value === 'number') {
                  contextWindow = value;
                  break;
                }
              }
            }
            // Also check parameters string for num_ctx override
            if (showData.parameters) {
              const match = showData.parameters.match(/num_ctx\s+(\d+)/);
              if (match) {
                contextWindow = parseInt(match[1]!, 10);
              }
            }
          }
        } catch {
          // Failed to get model info — use default
        }
        return {
          id: m.name,
          name: m.name.replace(/:latest$/, ''),
          contextWindow,
        };
      })
    );

    return entries;
  } catch {
    return null; // Ollama not running — silent fail
  }
}

/**
 * Look up model metadata by ID across all providers.
 */
export function findModelEntry(modelId: string): ProviderModelEntry | undefined {
  for (const provider of Object.values(PROVIDER_MODELS)) {
    const entry = provider.models.find(m => m.id === modelId);
    if (entry) return entry;
  }
  return undefined;
}

/**
 * Check if a model supports reasoning based on known model lists.
 * Falls back to heuristic for unknown models.
 */
export function modelSupportsReasoning(modelId: string): boolean {
  const entry = findModelEntry(modelId);
  if (entry) return !!entry.reasoning;
  // Heuristic for unknown models: Codex models, o-series, and deepseek-r* support reasoning
  const id = modelId.toLowerCase();
  // Strip vendor prefix for OpenRouter-style IDs (e.g. "openai/o3-mini" → "o3-mini")
  const bare = id.includes('/') ? id.split('/').pop()! : id;
  return bare.includes('codex') || bare.startsWith('o1') || bare.startsWith('o3') || bare.startsWith('o4') || bare.startsWith('deepseek-r');
}
