/**
 * Agent & Config Tests
 *
 * Tests for getPromptVariant, listAgents, getAgentByName, getAgentPrompt,
 * getSubagentDefinitions, buildSystemPrompt, findModelEntry, modelSupportsReasoning,
 * and defineConfig.
 */

import { describe, test, expect } from 'bun:test';
import {
  getPromptVariant,
  listAgents,
  getAgentByName,
  getAgentPrompt,
  getSubagentDefinitions,
  buildSystemPrompt,
  BUILT_IN_AGENTS,
  AGENT_PROMPTS,
} from './agents';
import {
  findModelEntry,
  modelSupportsReasoning,
  defineConfig,
  DEFAULT_CONFIG,
  PROVIDER_MODELS,
} from './config';

// ============================================
// getPromptVariant
// ============================================

describe('getPromptVariant', () => {
  test('gpt models return openai', () => {
    expect(getPromptVariant('gpt-5-mini')).toBe('openai');
    expect(getPromptVariant('gpt-5.2-codex')).toBe('openai');
    expect(getPromptVariant('gpt-5-mini')).toBe('openai');
  });

  test('o-series models return openai', () => {
    expect(getPromptVariant('o1-preview')).toBe('openai');
    expect(getPromptVariant('o3-mini')).toBe('openai');
    expect(getPromptVariant('o4-mini')).toBe('openai');
  });

  test('gemini models return gemini', () => {
    expect(getPromptVariant('gemini-2.0-flash')).toBe('gemini');
    expect(getPromptVariant('Gemini-Pro')).toBe('gemini');
  });

  test('zen provider models return zen', () => {
    expect(getPromptVariant('kimi-k2.5-free')).toBe('zen');
    expect(getPromptVariant('glm-4.7-free')).toBe('zen');
    expect(getPromptVariant('qwen-max')).toBe('zen');
    expect(getPromptVariant('minimax-m2.1-free')).toBe('zen');
  });

  test('-free suffix models return zen', () => {
    expect(getPromptVariant('some-model-free')).toBe('zen');
  });

  test('unknown models return default', () => {
    expect(getPromptVariant('claude-3.5-sonnet')).toBe('default');
    expect(getPromptVariant('llama-3')).toBe('default');
  });

  test('OpenRouter vendor-prefixed models resolve correctly', () => {
    expect(getPromptVariant('openai/gpt-4o')).toBe('openai');
    expect(getPromptVariant('openai/o3-mini')).toBe('openai');
    expect(getPromptVariant('google/gemini-2.5-pro-preview')).toBe('gemini');
    expect(getPromptVariant('google/gemini-2.5-flash-preview')).toBe('gemini');
    expect(getPromptVariant('moonshotai/kimi-k2')).toBe('zen');
    expect(getPromptVariant('anthropic/claude-sonnet-4')).toBe('default');
    expect(getPromptVariant('deepseek/deepseek-r1')).toBe('default');
    expect(getPromptVariant('meta-llama/llama-4-maverick')).toBe('default');
  });
});

// ============================================
// listAgents
// ============================================

describe('listAgents', () => {
  test('returns all built-in agents', () => {
    const agents = listAgents();
    expect(agents.length).toBeGreaterThanOrEqual(4);
    expect(agents.map(a => a.name)).toContain('build');
    expect(agents.map(a => a.name)).toContain('plan');
    expect(agents.map(a => a.name)).toContain('explore');
    expect(agents.map(a => a.name)).toContain('general');
  });
});

// ============================================
// getAgentByName
// ============================================

describe('getAgentByName', () => {
  test('returns agent for valid name', () => {
    const agent = getAgentByName('build');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('build');
    expect(agent!.mode).toBe('primary');
  });

  test('returns undefined for unknown name', () => {
    expect(getAgentByName('nonexistent')).toBeUndefined();
  });

  test('explore agent is a subagent', () => {
    const agent = getAgentByName('explore');
    expect(agent!.mode).toBe('subagent');
  });
});

// ============================================
// getAgentPrompt
// ============================================

describe('getAgentPrompt', () => {
  test('returns prompt for valid agent', () => {
    const prompt = getAgentPrompt('build');
    expect(prompt).toBeDefined();
    expect(prompt!).toContain('BUILD mode');
  });

  test('returns undefined for unknown agent', () => {
    expect(getAgentPrompt('nonexistent')).toBeUndefined();
  });

  test('plan prompt contains PLAN mode', () => {
    expect(getAgentPrompt('plan')).toContain('PLAN mode');
  });
});

// ============================================
// getSubagentDefinitions
// ============================================

describe('getSubagentDefinitions', () => {
  test('returns only subagent-mode agents', () => {
    const defs = getSubagentDefinitions();
    // build and plan are 'primary' mode, should not be included
    expect(defs.every(d => d.name !== 'build')).toBe(true);
    expect(defs.every(d => d.name !== 'plan')).toBe(true);
    // explore and general should be included
    expect(defs.some(d => d.name === 'explore')).toBe(true);
    expect(defs.some(d => d.name === 'general')).toBe(true);
  });

  test('explore subagent has restricted toolNames', () => {
    const defs = getSubagentDefinitions();
    const explore = defs.find(d => d.name === 'explore');
    expect(explore).toBeDefined();
    expect(explore!.toolNames).toBeDefined();
    expect(explore!.toolNames).toContain('read');
    expect(explore!.toolNames).toContain('grep');
    expect(explore!.toolNames).toContain('glob');
  });

  test('general subagent has undefined toolNames (all tools)', () => {
    const defs = getSubagentDefinitions();
    const general = defs.find(d => d.name === 'general');
    expect(general).toBeDefined();
    expect(general!.toolNames).toBeUndefined();
  });

  test('all subagent definitions have required fields', () => {
    const defs = getSubagentDefinitions();
    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(typeof def.systemPrompt).toBe('string');
    }
  });
});

// ============================================
// buildSystemPrompt
// ============================================

describe('buildSystemPrompt', () => {
  test('includes agent instructions', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test/project',
    });
    expect(prompt).toContain('BUILD mode');
    expect(prompt).toContain('<agent_instructions>');
  });

  test('includes environment info', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test/project',
    });
    expect(prompt).toContain('<environment>');
    expect(prompt).toContain('/test/project');
  });

  test('environment info contains OS, hostname, user, shell, memory, and node version', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test/env-check',
    });

    // Verify all fields from buildEnvironmentInfo (lines 246-264)
    const os = require('os');
    expect(prompt).toContain(`Operating System: ${os.platform()} (${os.arch()})`);
    expect(prompt).toContain(`Hostname: ${os.hostname()}`);
    expect(prompt).toContain(`User: ${os.userInfo().username}`);
    expect(prompt).toContain(`Working Directory: /test/env-check`);
    expect(prompt).toContain(`Home Directory: ${os.homedir()}`);
    expect(prompt).toContain(`Total Memory:`);
    expect(prompt).toContain('GB');
    expect(prompt).toContain(`Node: ${process.version}`);
    // Shell should be present (from SHELL env or fallback)
    expect(prompt).toContain('Shell:');
  });

  test('environment info includes osRelease, exact memory value, and shell path', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test/env-detail',
    });

    const os = require('os');
    const osRelease = os.release();
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'cmd' : 'bash');

    // Verify osRelease is included on the Operating System line (line 256)
    expect(prompt).toContain(`Operating System: ${os.platform()} (${os.arch()}) \u2014 ${osRelease}`);
    // Verify exact total memory value (line 253/262)
    expect(prompt).toContain(`Total Memory: ${totalMemGB} GB`);
    // Verify exact shell value (line 249/259)
    expect(prompt).toContain(`Shell: ${shell}`);
  });

  test('includes tool descriptions when tools provided', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [{
        name: 'bash',
        description: 'Run a shell command',
        parameters: {
          type: 'object' as const,
          properties: { command: { type: 'string', description: 'Command to run' } },
          required: ['command'],
        },
      }],
      projectDir: '/test',
    });
    expect(prompt).toContain('<available_tools>');
    expect(prompt).toContain('bash');
    expect(prompt).toContain('Run a shell command');
  });

  test('includes custom instructions', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      customInstructions: ['Always use TypeScript', 'Prefer functional style'],
    });
    expect(prompt).toContain('<custom_instructions>');
    expect(prompt).toContain('Always use TypeScript');
  });

  test('includes delegation guidance for subagents', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      subagents: [
        { name: 'explore', description: 'Explore code', systemPrompt: 'Explore.' },
      ],
    });
    expect(prompt).toContain('<delegation>');
    expect(prompt).toContain('delegate_to_explore');
  });

  test('uses zen variant for zen models', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      modelId: 'kimi-k2.5-free',
    });
    // Zen variant is more concise
    expect(prompt).toContain('StratusCode');
  });

  test('uses gemini variant for gemini models', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      modelId: 'gemini-2.0-flash',
    });
    // Gemini variant has CORE RULES
    expect(prompt).toContain('CORE RULES');
    expect(prompt).toContain('StratusCode');
  });

  test('omits agent_instructions when agent has no prompt', () => {
    const agent = { ...BUILT_IN_AGENTS.build!, prompt: undefined } as any;
    const prompt = buildSystemPrompt({
      agent,
      tools: [],
      projectDir: '/test',
    });
    expect(prompt).not.toContain('<agent_instructions>');
  });

  test('omits tools section when no tools provided', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
    });
    expect(prompt).not.toContain('<available_tools>');
  });

  test('omits delegation section when no subagents provided', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
    });
    expect(prompt).not.toContain('<delegation>');
  });

  test('omits custom instructions when none provided', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
    });
    expect(prompt).not.toContain('<custom_instructions>');
  });

  test('delegation includes tool names for subagents with restricted tools', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      subagents: [
        { name: 'explore', description: 'Explore code', systemPrompt: 'Explore.', toolNames: ['read', 'grep', 'glob'] },
      ],
    });
    expect(prompt).toContain('Tools: read, grep, glob');
  });

  test('delegation shows "all available tools" when subagent has no toolNames', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
      subagents: [
        { name: 'general', description: 'General agent', systemPrompt: 'General.' },
      ],
    });
    expect(prompt).toContain('Tools: all available tools');
  });

  test('tool descriptions include required parameter markers', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [{
        name: 'edit',
        description: 'Edit a file',
        parameters: {
          type: 'object' as const,
          properties: {
            file_path: { type: 'string', description: 'Path to file' },
            old_string: { type: 'string', description: 'Text to replace' },
          },
          required: ['file_path', 'old_string'],
        },
      }],
      projectDir: '/test',
    });
    expect(prompt).toContain('file_path: string (required)');
    expect(prompt).toContain('old_string: string (required)');
  });

  test('includes guidelines section', () => {
    const prompt = buildSystemPrompt({
      agent: BUILT_IN_AGENTS.build!,
      tools: [],
      projectDir: '/test',
    });
    expect(prompt).toContain('<guidelines>');
  });
});

// ============================================
// findModelEntry
// ============================================

describe('findModelEntry', () => {
  test('finds known OpenAI model', () => {
    const entry = findModelEntry('gpt-5-mini');
    expect(entry).toBeDefined();
    expect(entry!.name).toBe('GPT-5 Mini');
  });

  test('finds known Codex model', () => {
    const entry = findModelEntry('gpt-5.2-codex');
    expect(entry).toBeDefined();
    expect(entry!.reasoning).toBe(true);
  });

  test('returns undefined for unknown model', () => {
    expect(findModelEntry('totally-unknown-model')).toBeUndefined();
  });

  test('finds Zen provider models', () => {
    const entry = findModelEntry('kimi-k2.5-free');
    expect(entry).toBeDefined();
    expect(entry!.free).toBe(true);
  });

  test('finds OpenRouter models', () => {
    const entry = findModelEntry('anthropic/claude-sonnet-4');
    expect(entry).toBeDefined();
    expect(entry!.name).toBe('Claude Sonnet 4');
    expect(entry!.contextWindow).toBe(200_000);
  });

  test('finds OpenRouter reasoning model', () => {
    const entry = findModelEntry('deepseek/deepseek-r1');
    expect(entry).toBeDefined();
    expect(entry!.reasoning).toBe(true);
  });
});

// ============================================
// modelSupportsReasoning
// ============================================

describe('modelSupportsReasoning', () => {
  test('known reasoning model returns true', () => {
    expect(modelSupportsReasoning('gpt-5.2-codex')).toBe(true);
    expect(modelSupportsReasoning('o3-mini')).toBe(true);
  });

  test('known non-reasoning model returns false', () => {
    expect(modelSupportsReasoning('minimax-m2.1-free')).toBe(false);
  });

  test('unknown codex model uses heuristic', () => {
    expect(modelSupportsReasoning('custom-codex-v2')).toBe(true);
  });

  test('unknown o-series model uses heuristic', () => {
    expect(modelSupportsReasoning('o1-custom')).toBe(true);
    expect(modelSupportsReasoning('o3-turbo')).toBe(true);
  });

  test('unknown plain model returns false', () => {
    expect(modelSupportsReasoning('llama-3-70b')).toBe(false);
  });

  test('OpenRouter vendor-prefixed reasoning heuristic', () => {
    expect(modelSupportsReasoning('openai/o3-mini')).toBe(true);
    expect(modelSupportsReasoning('deepseek/deepseek-r1-unknown')).toBe(true);
    expect(modelSupportsReasoning('meta-llama/llama-4-maverick')).toBe(false);
  });

  test('known OpenRouter reasoning model returns true', () => {
    expect(modelSupportsReasoning('deepseek/deepseek-r1')).toBe(true);
  });
});

// ============================================
// defineConfig
// ============================================

describe('defineConfig', () => {
  test('returns default config for empty input', () => {
    const config = defineConfig({});
    expect(config.model).toBe('gpt-5.3-codex');
    expect(config.provider.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.agent.maxDepth).toBe(300);
  });

  test('overrides provided fields', () => {
    const config = defineConfig({ model: 'gpt-5-mini', temperature: 0.7 });
    expect(config.model).toBe('gpt-5-mini');
    expect(config.temperature).toBe(0.7);
  });

  test('preserves hooks in output', () => {
    const hooks = { onToolCall: () => {} } as any;
    const config = defineConfig({ hooks });
    expect(config.hooks).toBe(hooks);
  });
});

// ============================================
// DEFAULT_CONFIG
// ============================================

describe('DEFAULT_CONFIG', () => {
  test('has expected shape', () => {
    expect(DEFAULT_CONFIG.model).toBe('gpt-5.3-codex');
    expect(DEFAULT_CONFIG.provider.baseUrl).toBe('https://api.openai.com/v1');
    expect(DEFAULT_CONFIG.parallelToolCalls).toBe(true);
  });
});

