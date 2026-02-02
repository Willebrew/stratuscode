/**
 * Non-Interactive Mode
 *
 * Run a single prompt and exit.
 * Powered by SAGE's processDirectly() for all agentic operations.
 */

import type { StratusCodeConfig } from '@stratuscode/shared';
import { buildSystemPrompt, BUILT_IN_AGENTS } from '@stratuscode/shared';
import { registerBuiltInTools, createStratusCodeToolRegistry } from '@stratuscode/tools';
import { processDirectly, type ToolCall } from '@sage/core';

// ============================================
// Types
// ============================================

export interface NonInteractiveOptions {
  projectDir: string;
  config: StratusCodeConfig;
  agent: string;
  prompt: string;
}

// ============================================
// Display Helpers
// ============================================

const TOOL_ICONS: Record<string, string> = {
  read: '[R]',
  write: '[W]',
  edit: '[E]',
  multi_edit: '[E]',
  bash: '[$]',
  grep: '[?]',
  glob: '[G]',
  ls: '[L]',
  task: '[T]',
  websearch: '[S]',
  webfetch: '[F]',
  apply_patch: '[P]',
  question: '[Q]',
  todoread: '[>]',
  todowrite: '[>]',
  codesearch: '[C]',
};

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || '[*]';
}

function formatToolArgs(tc: ToolCall): string {
  try {
    const args = JSON.parse(tc.function.arguments);
    if (args.file_path) return args.file_path;
    if (args.command) return args.command.slice(0, 60) + (args.command.length > 60 ? '...' : '');
    if (args.query) return `"${args.query}"`;
    if (args.pattern) return args.pattern;
    if (args.directory_path) return args.directory_path;
    if (args.description) return args.description.slice(0, 60);
    if (args.url) return args.url;
    return '';
  } catch {
    return '';
  }
}

function formatToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result);
    if (parsed.error) return `[x] ${parsed.message || 'Error'}`;
    if (parsed.success === false) return `[x] ${parsed.message || 'Failed'}`;
    if (parsed.message) return `[ok] ${parsed.message}`;
    if (parsed.content) return `[ok] ${parsed.content.slice(0, 80)}...`;
    return '[ok] Done';
  } catch {
    const preview = result.slice(0, 100).replace(/\n/g, ' ');
    return `[ok] ${preview}${result.length > 100 ? '...' : ''}`;
  }
}

// ============================================
// Run
// ============================================

export async function runNonInteractive(options: NonInteractiveOptions): Promise<void> {
  const { projectDir, config, agent, prompt } = options;

  // Create tool registry with SAGE
  const registry = createStratusCodeToolRegistry();
  registerBuiltInTools(registry);

  // Get agent info
  const agentInfo = BUILT_IN_AGENTS[agent] || BUILT_IN_AGENTS.build!;

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    agent: agentInfo,
    tools: registry.toAPIFormat().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
    projectDir,
    modelId: config.model,
  });

  console.log(`\n> Running with agent: ${agent}`);
  console.log(`> Project: ${projectDir}`);
  console.log(`\n> You: ${prompt}\n`);

  let loopDepth = 0;
  let isStreaming = false;

  // Convert config to SAGE format
  const sageConfig = {
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    parallelToolCalls: config.parallelToolCalls,
    provider: {
      apiKey: config.provider.apiKey,
      baseUrl: config.provider.baseUrl,
    },
    agent: {
      name: config.agent.name,
      maxDepth: config.agent.maxDepth,
      toolTimeout: config.agent.toolTimeout,
      maxToolResultSize: config.agent.maxToolResultSize,
    },
  };

  try {
    // Run through SAGE's processDirectly - the only agentic engine
    const result = await processDirectly({
      systemPrompt,
      messages: [{ role: 'user' as const, content: prompt }],
      tools: registry,
      config: sageConfig,
      toolMetadata: { projectDir },
      callbacks: {
        onToken: (token) => {
          if (!isStreaming) {
            isStreaming = true;
          }
          process.stdout.write(token);
        },
        onReasoning: (text) => {
          process.stdout.write(`\x1b[2m${text}\x1b[0m`);
        },
        onToolCall: (tc) => {
          if (isStreaming) {
            console.log('');
            isStreaming = false;
          }
          const icon = getToolIcon(tc.function.name);
          console.log(`\n${icon} ${tc.function.name}`);
        },
        onToolResult: (tc, result) => {
          const formatted = formatToolResult(result);
          const args = formatToolArgs(tc);
          if (args) {
            console.log(`   ${args}`);
          }
          console.log(`   ${formatted}`);
        },
        onStatusChange: (status) => {
          if (status === 'tool_loop' && loopDepth === 0) {
            loopDepth++;
          }
        },
        onError: (error) => {
          console.error(`\n[error] ${error.message}`);
        },
      },
    });

    if (isStreaming) {
      console.log('');
    }

    console.log('\n');
    console.log(`Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
  } catch (error) {
    console.error('\n[error]', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
