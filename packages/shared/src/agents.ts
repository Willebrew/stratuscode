/**
 * Agent Definitions & System Prompt Builder
 *
 * Defines the built-in agents and builds system prompts.
 * Moved from @stratuscode/core to be independent of any agentic engine.
 */

import type { AgentInfo, ToolDefinition, SubagentDefinition } from './types';
import * as os from 'os';

// ============================================
// Prompt Variants
// ============================================

export type PromptVariant = 'openai' | 'gemini' | 'zen' | 'default';

/**
 * Map a model ID to the appropriate prompt variant.
 */
export function getPromptVariant(modelId: string): PromptVariant {
  const id = modelId.toLowerCase();
  // Strip vendor prefix for OpenRouter-style IDs (e.g. "openai/gpt-4o" → "gpt-4o")
  const bare = id.includes('/') ? id.split('/').pop()! : id;

  if (bare.startsWith('gpt') || bare.startsWith('o1') || bare.startsWith('o3') || bare.startsWith('o4')) return 'openai';
  if (bare.startsWith('gemini')) return 'gemini';
  if (
    bare.startsWith('kimi') ||
    bare.startsWith('glm') ||
    bare.startsWith('qwen') ||
    bare.startsWith('minimax') ||
    bare.endsWith('-free')
  ) {
    return 'zen';
  }

  return 'default';
}

// ============================================
// Agent Prompts
// ============================================

export const AGENT_PROMPTS = {
  build: `You are in BUILD mode — the primary agent for development work.
You have full access to edit files, run commands, and make changes.

EXECUTION STYLE:
- Execute immediately using tools. Don't explain what you would do — just do it.
- After every edit, verification runs automatically — if it reports errors, fix them.

MODE SELECTION — Decide before starting each task:
- **Stay in build** when: the task is clear, touches 1-3 files, or you already understand the code.
- **Switch to plan** (use plan_enter) when: the task is ambiguous, touches 5+ files, requires architectural decisions, or you need the user to choose between approaches. Plan mode lets you explore and design before committing to changes.

DELEGATION — Use subagents to work faster:
- **Before modifying unfamiliar code**: Spawn an explore subagent first to map the relevant files, understand patterns, and trace call chains. Don't guess — know the code before you change it.
- **For independent subtasks**: Spawn multiple general subagents in parallel. Split work along natural boundaries: separate files, separate features, frontend vs backend, tests vs implementation.
- **Your role as orchestrator**: Subagents do focused pieces. You integrate their results, make cross-cutting decisions, and ensure consistency across the whole change.

WHEN TO PARALLELIZE:
- 2+ files that don't depend on each other → parallel general subagents
- Need to understand 2+ areas of the codebase → parallel explore subagents
- Research + implementation are independent → explore subagent while you start coding
- Don't parallelize when changes to one file depend on changes to another.`,

  plan: `You are in PLAN mode — an agent for analysis, exploration, and plan creation.
You are READ-ONLY for all project files. The ONLY file you may write is the designated plan file (path provided in custom instructions).
You MUST use tools (bash, read_file, todowrite, question, plan_exit) — do NOT output plans, summaries, or implementation details as chat text.
Your text output is limited to 1-2 SHORT sentences max.

RESEARCH STRATEGY:
- Spawn 2-3 explore subagents in parallel to investigate different areas of the codebase simultaneously. This is much faster than exploring sequentially yourself.
- Example: one explore subagent searches for the relevant component, another explores the API layer, a third checks existing tests.
- After subagents report back, synthesize their findings into your plan.

PLAN QUALITY:
- Include specific file paths and line numbers from exploration.
- Identify existing functions/utilities to reuse — don't propose new code when suitable implementations exist.
- Note which implementation steps can be parallelized in build mode.`,

  explore: `You are the EXPLORE subagent — specialized for fast, thorough codebase exploration.

METHODOLOGY:
1. Start broad: Use glob to find files by name patterns, grep to search for keywords across the codebase.
2. Go deep: Read the full content of the most relevant files (not just snippets).
3. Trace connections: Follow imports, function calls, and type definitions to understand how pieces connect.
4. Report with precision: Include exact file paths and line numbers. Quote key code snippets. Describe the architecture you discovered.

EFFICIENCY:
- Search multiple patterns and locations in parallel (multiple tool calls in one response).
- If your first search doesn't find what you need, try alternative names, patterns, or directories.
- Don't stop at the first match — search broadly enough to give a complete picture.

You have a set_status tool — use it when you shift to a different phase of work (e.g. from searching to reading, or from one area to another). Keep status messages short (3-8 words).`,

  general: `You are the GENERAL subagent — for focused implementation tasks.

METHODOLOGY:
1. Read first: Understand the existing code before making changes. Read the files you'll modify.
2. Implement: Make the changes using edit/write tools. Follow the patterns already in the codebase.
3. Verify: Run commands to check your work (build, test, lint) when applicable.
4. Report: Summarize what you changed and any issues you found.

FOCUS:
- Stay strictly within the scope of your assigned task. Don't make unrelated improvements.
- If you discover something that needs attention outside your scope, mention it in your report but don't fix it.

You have a set_status tool — use it when you shift to a different phase of work (e.g. from reading to implementing, or between distinct steps). Keep status messages short (3-8 words).`,
};

// ============================================
// Built-in Agents
// ============================================

export const BUILT_IN_AGENTS: Record<string, AgentInfo> = {
  build: {
    name: 'build',
    description: 'Default agent for development work with full access',
    mode: 'primary',
    prompt: AGENT_PROMPTS.build,
    permissions: [
      { permission: '*', pattern: '*', action: 'allow' },
      { permission: 'bash', pattern: '*', action: 'ask' },
      { permission: 'external_directory', pattern: '*', action: 'ask' },
    ],
  },
  plan: {
    name: 'plan',
    description: 'Read-only agent for analysis and exploration',
    mode: 'primary',
    prompt: AGENT_PROMPTS.plan,
    permissions: [
      { permission: '*', pattern: '*', action: 'allow' },
      { permission: 'edit', pattern: '*', action: 'deny' },
      { permission: 'write', pattern: '*', action: 'deny' },
      { permission: 'bash', pattern: '*', action: 'ask' },
    ],
  },
  explore: {
    name: 'explore',
    description: 'Fast agent for codebase exploration',
    mode: 'subagent',
    prompt: AGENT_PROMPTS.explore,
    permissions: [
      { permission: '*', pattern: '*', action: 'deny' },
      { permission: 'read', pattern: '*', action: 'allow' },
      { permission: 'grep', pattern: '*', action: 'allow' },
      { permission: 'glob', pattern: '*', action: 'allow' },
      { permission: 'ls', pattern: '*', action: 'allow' },
    ],
  },
  general: {
    name: 'general',
    description: 'General-purpose agent for complex tasks',
    mode: 'subagent',
    prompt: AGENT_PROMPTS.general,
    permissions: [
      { permission: '*', pattern: '*', action: 'allow' },
    ],
  },
};

// ============================================
// System Prompt Builder
// ============================================

export interface SystemPromptOptions {
  agent: AgentInfo;
  tools: ToolDefinition[];
  projectDir: string;
  customInstructions?: string[];
  subagents?: SubagentDefinition[];
  modelId?: string;
}

/**
 * Build the complete system prompt
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const { agent, tools, projectDir, customInstructions, subagents, modelId } = options;

  const variant = modelId ? getPromptVariant(modelId) : 'default';
  const sections: string[] = [];

  // Base instructions
  sections.push(buildBaseInstructions(variant));

  // Environment info
  sections.push(buildEnvironmentInfo(projectDir));

  // Agent-specific prompt
  if (agent.prompt) {
    sections.push(`<agent_instructions>\n${agent.prompt}\n</agent_instructions>`);
  }

  // Tool descriptions
  if (tools.length > 0) {
    sections.push(buildToolDescriptions(tools));
  }

  // Delegation guidance (subagent tools are registered dynamically by SAGE,
  // so they won't appear in the tools list above — document them explicitly)
  if (subagents && subagents.length > 0) {
    sections.push(buildDelegationGuidance(subagents));
  }

  // Custom instructions
  if (customInstructions && customInstructions.length > 0) {
    sections.push(`<custom_instructions>\n${customInstructions.join('\n\n')}\n</custom_instructions>`);
  }

  // Guidelines
  sections.push(buildGuidelines());

  return sections.join('\n\n');
}

// ============================================
// Section Builders
// ============================================

function buildBaseInstructions(variant: PromptVariant): string {
  switch (variant) {
    case 'openai':
      return buildOpenAIBaseInstructions();
    case 'gemini':
      return buildGeminiBaseInstructions();
    case 'zen':
      return buildZenBaseInstructions();
    default:
      return buildOpenAIBaseInstructions();
  }
}

function buildOpenAIBaseInstructions(): string {
  return `<base_instructions>
You are StratusCode, an AI coding assistant powered by the SAGE agentic framework.
You help users with software development tasks by reading files, making edits, running commands, and exploring codebases.

CORE PRINCIPLES:
- Be direct and concise. Avoid unnecessary preambles or acknowledgments.
- Make code changes directly using tools rather than showing code in responses.
- Verify your changes work before considering a task complete.
- Ask clarifying questions only when truly necessary.
- If you encounter errors, debug systematically rather than guessing.

CAPABILITIES:
You are a fully autonomous agent running on the user's machine. You can:
- Read, write, and edit any file the user has access to.
- Execute any shell command via the bash tool (including installing packages, managing processes, running scripts, and system commands).
- Search the web, fetch URLs, and use any available tools.
- Operate across the entire filesystem — not just the project directory (with permission).

When the user asks you to do something on their computer, DO IT. Use the bash tool to run commands, manage files, install software, and accomplish whatever the user needs. Never say "I can't do that" or "I'm unable to" — you have full tool access. If a task requires multiple steps, break it down and execute each step.

The only things you should decline are actions that would be genuinely harmful (deleting critical system files, exposing credentials, etc). For everything else: take action first, report results after.

TASK MANAGEMENT:
Use todowrite to plan and track multi-step work. Create a todo list at the start of complex tasks, update status as you complete each step. Use todoread to check current status before and after working on tasks.

CODE REFERENCES:
When referencing specific functions or code, include the pattern file_path:line_number to help the user navigate.
Example: "The auth middleware is defined in src/middleware/auth.ts:42"
</base_instructions>`;
}

function buildGeminiBaseInstructions(): string {
  return `<base_instructions>
You are StratusCode, an AI coding assistant.

CORE RULES:
- Be concise. Make changes with tools, not code blocks in text.
- Verify changes work. Debug errors systematically.
- Use todowrite to plan multi-step tasks. Update todo status as you work.
- Use todoread to check task status before starting and after completing steps.
- Always use the correct tool for each operation — do not describe actions, perform them.

CODE REFERENCES:
Reference code as file_path:line_number (e.g. src/auth.ts:42).
</base_instructions>`;
}

function buildZenBaseInstructions(): string {
  return `<base_instructions>
You are StratusCode, an AI coding assistant.

- Be concise. Use tools to make changes directly.
- Use todowrite/todoread to plan and track multi-step tasks.
- Verify changes. Debug errors systematically.
- Reference code as file_path:line_number.
</base_instructions>`;
}

function buildEnvironmentInfo(projectDir: string): string {
  const platform = os.platform();
  const arch = os.arch();
  const shell = process.env.SHELL || (platform === 'win32' ? 'cmd' : 'bash');
  const osRelease = os.release();
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);

  return `<environment>
Operating System: ${platform} (${arch}) — ${osRelease}
Hostname: ${hostname}
User: ${username}
Shell: ${shell}
Working Directory: ${projectDir}
Home Directory: ${os.homedir()}
Total Memory: ${totalMemGB} GB
Node: ${process.version}
</environment>`;
}

function buildToolDescriptions(tools: ToolDefinition[]): string {
  const toolDocs = tools.map(tool => {
    const params = tool.parameters;
    let paramDesc = '';

    if (params.properties) {
      const props = Object.entries(params.properties).map(([name, schema]) => {
        const s = schema as { type?: string; description?: string };
        const required = params.required?.includes(name) ? ' (required)' : '';
        return `  - ${name}: ${s.type || 'any'}${required}${s.description ? ` - ${s.description}` : ''}`;
      });
      paramDesc = props.join('\n');
    }

    return `### ${tool.name}
${tool.description}
${paramDesc ? `\nParameters:\n${paramDesc}` : ''}`;
  });

  return `<available_tools>
${toolDocs.join('\n\n')}
</available_tools>`;
}

function buildDelegationGuidance(subagents: SubagentDefinition[]): string {
  const agentDocs = subagents.map(s => {
    const toolInfo = s.toolNames
      ? `Tools: ${s.toolNames.join(', ')}`
      : 'Tools: all available tools';
    return `- **delegate_to_${s.name}**: ${s.description}\n  ${toolInfo}`;
  });

  return `<delegation>
SUBAGENT DELEGATION:
You have delegation tools that spawn independent child agents. Each child runs its own agentic loop with LLM calls and tool access.

Available delegation tools:
${agentDocs.join('\n')}

Each delegation tool takes a single "task" parameter — a specific description of what the child agent should do. Include file paths, function names, or search terms when you know them.
Good: "Find all usages of createSession in packages/cloud/convex and trace the call chain"
Bad: "Look at the session code"

DELEGATION PATTERNS:

Pattern 1 — Research before acting:
Before modifying unfamiliar code, spawn an explore subagent to map the relevant files. Wait for its report, then make informed changes.
Example: delegate_to_explore("Find all files that import from auth.ts and trace how tokens are validated")

Pattern 2 — Parallel exploration:
When you need to understand multiple areas, spawn 2-3 explore subagents simultaneously. Call all delegate_to_explore tools in a SINGLE response.
Example: Call delegate_to_explore twice in one response — one for "Find all API route handlers in src/api/" and another for "Find database schema and migration files in prisma/"

Pattern 3 — Parallel implementation:
For independent subtasks, spawn multiple general subagents. Split along natural boundaries: separate files, features, or layers.
Example: Call delegate_to_general twice in one response — one for "Add input validation to the signup form in components/SignupForm.tsx" and another for "Add rate limiting middleware to api/auth/signup.ts"

Pattern 4 — Explore then implement:
Spawn an explore subagent while you start working on the parts you already understand. When the explore result returns, continue with the newly discovered context.

RULES:
- Delegation tools are REAL tools — call them like any other tool with the "task" parameter.
- You CAN call multiple delegation tools in a SINGLE response for parallel execution.
- After receiving delegation results, ALWAYS respond to the user — summarize findings or describe next steps. Never end your turn silently.
- Do NOT try to create scripts or files to simulate subagent behavior — use the delegation tools directly.
</delegation>`;
}

function buildGuidelines(): string {
  return `<guidelines>
CODE EDITING:
- Always read files before editing to understand context.
- Use the edit tool for surgical changes. Provide exact old_string matches.
- For new files, use the write tool.
- Test your changes when possible.

COMMANDS:
- Use bash for running commands. Be careful with destructive operations.
- Prefer non-interactive commands. Avoid commands that require user input.
- Set appropriate timeouts for long-running commands.

FILE OPERATIONS:
- Use absolute paths when possible.
- Respect .gitignore patterns.
- Don't modify files outside the project directory without permission.

CONVERSATION:
- Respond naturally to greetings, casual messages, and general conversation.
- Do NOT use the question tool for simple responses or acknowledgments.
- USE the question tool when you need the user to choose between options — e.g., choosing between approaches, selecting features, confirming preferences, picking technologies, or any decision with a finite set of choices.
- Only ask questions as plain text if they are truly open-ended with no reasonable predefined options (e.g., "What is your project about?").

COMMUNICATION:
- Format code references with backticks.
- Use markdown for structured responses.
- Be specific about what you changed and why.
</guidelines>`;
}

// ============================================
// Helpers
// ============================================

/**
 * Get list of available agents
 */
export function listAgents(): AgentInfo[] {
  return Object.values(BUILT_IN_AGENTS);
}

/**
 * Get agent by name
 */
export function getAgentByName(name: string): AgentInfo | undefined {
  return BUILT_IN_AGENTS[name];
}

/**
 * Get agent prompt by name
 */
export function getAgentPrompt(name: string): string | undefined {
  return AGENT_PROMPTS[name as keyof typeof AGENT_PROMPTS];
}

/**
 * Extract allowed tool names from an agent's permission rules.
 * Returns undefined (all tools) if the agent has a wildcard allow rule.
 */
function extractAllowedToolNames(agent: AgentInfo): string[] | undefined {
  // Check if there's a wildcard allow — means all tools
  const hasWildcardAllow = agent.permissions.some(
    p => p.permission === '*' && p.action === 'allow',
  );
  if (hasWildcardAllow) {
    return undefined;
  }

  // Collect explicitly allowed permission names
  return agent.permissions
    .filter(p => p.action === 'allow' && p.permission !== '*')
    .map(p => p.permission);
}

/**
 * Convert built-in subagent definitions to SAGE SubagentDefinition format.
 */
export function getSubagentDefinitions(): SubagentDefinition[] {
  return Object.values(BUILT_IN_AGENTS)
    .filter(a => a.mode === 'subagent')
    .map(a => ({
      name: a.name,
      description: a.description || `${a.name} subagent`,
      systemPrompt: a.prompt || '',
      toolNames: extractAllowedToolNames(a),
    }));
}
