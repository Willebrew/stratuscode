import { z } from 'zod';
import type { StratusCodeHooks, PermissionRuleset } from './types';

// ============================================
// Configuration Schema
// ============================================

export const StratusCodeConfigSchema = z.object({
  // Model - any string (unlocked for multi-provider support)
  model: z.string().default('gpt-5-mini'),

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
    baseUrl: z.string().default('https://api.openai.com/v1'),
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
    maxDepth: z.number().default(30),
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
  model: 'gpt-5-mini',
  provider: {
    baseUrl: 'https://api.openai.com/v1',
  },
  agent: {
    name: 'stratuscode',
    maxDepth: 30,
    toolTimeout: 60000,
    maxToolResultSize: 100000,
  },
  storage: {},
  parallelToolCalls: true,
};

/**
 * Known model lists for providers
 */
export const PROVIDER_MODELS: Record<string, { label: string; models: { id: string; name: string; free?: boolean }[] }> = {
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'o3-mini', name: 'o3-mini' },
    ],
  },
  'openai-codex': {
    label: 'OpenAI Codex',
    models: [
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', free: true },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', free: true },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', free: true },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', free: true },
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', free: true },
      { id: 'codex-mini', name: 'Codex Mini', free: true },
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
};
