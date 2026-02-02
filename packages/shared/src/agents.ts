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

export type PromptVariant = 'anthropic' | 'openai' | 'gemini' | 'zen' | 'default';

/**
 * Map a model ID to the appropriate prompt variant.
 */
export function getPromptVariant(modelId: string): PromptVariant {
  const id = modelId.toLowerCase();

  if (id.startsWith('claude')) return 'anthropic';
  if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) return 'openai';
  if (id.startsWith('gemini')) return 'gemini';
  if (
    id.startsWith('kimi') ||
    id.startsWith('glm') ||
    id.startsWith('qwen') ||
    id.startsWith('minimax') ||
    id.endsWith('-free')
  ) {
    return 'zen';
  }

  return 'default';
}

// ============================================
// Agent Prompts
// ============================================

export const AGENT_PROMPTS = {
  build: `You are in BUILD mode - the default agent for development work.
You have full access to edit files, run commands, and make changes.
Focus on implementing features, fixing bugs, and completing tasks efficiently.`,

  plan: `You are in PLAN mode — a read-only agent for analysis and exploration.
You CANNOT edit files or run destructive commands. You may ONLY observe, analyze, and plan.`,

  explore: `You are the EXPLORE subagent - specialized for fast codebase exploration.
Use grep, glob, and read tools to quickly find relevant files and code.
Be thorough but efficient. Search multiple patterns and locations.
Return a concise summary of what you found.`,

  general: `You are the GENERAL subagent - for complex multi-step tasks.
Break down the task into steps and execute them methodically.
Use appropriate tools for each step.
Report your findings and results clearly.`,
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
    case 'anthropic':
      return buildAnthropicBaseInstructions();
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

function buildAnthropicBaseInstructions(): string {
  return `<base_instructions>
You are StratusCode, an AI coding assistant powered by the SAGE agentic framework.
You help users with software development tasks by reading files, making edits, running commands, and exploring codebases.

CORE PRINCIPLES:
- Be direct and concise. Avoid unnecessary preambles or acknowledgments.
- Make code changes directly using tools rather than showing code in responses.
- Verify your changes work before considering a task complete.
- Ask clarifying questions only when truly necessary.
- If you encounter errors, debug systematically rather than guessing.

TASK MANAGEMENT:
Use todowrite and todoread VERY frequently to plan and track your work.
- At the START of every multi-step task, create a todo list with todowrite.
- BEFORE starting any task step, call todoread to check current status.
- AFTER completing a step, update the todo list to mark it completed and set the next task to in_progress.
- When the plan changes or you discover new work, update the todo list immediately.

Use todowrite to break down complex tasks into clear, actionable steps. Each todo should be specific enough to execute without ambiguity.

<example>
User asks: "Add a dark mode toggle to the settings page"

You should FIRST call todowrite with:
[
  {"content": "Read current settings page component and theme system", "status": "in_progress", "priority": "high"},
  {"content": "Add dark mode toggle switch to SettingsPage component", "status": "pending", "priority": "high"},
  {"content": "Implement theme context/state to track dark mode preference", "status": "pending", "priority": "high"},
  {"content": "Add CSS variables or Tailwind classes for dark mode styling", "status": "pending", "priority": "medium"},
  {"content": "Persist dark mode preference to localStorage", "status": "pending", "priority": "medium"}
]

Then explore the codebase, and as you complete each step, update the list:
[
  {"content": "Read current settings page component and theme system", "status": "completed", "priority": "high"},
  {"content": "Add dark mode toggle switch to SettingsPage component", "status": "in_progress", "priority": "high"},
  {"content": "Implement theme context/state to track dark mode preference", "status": "pending", "priority": "high"},
  {"content": "Add CSS variables or Tailwind classes for dark mode styling", "status": "pending", "priority": "medium"},
  {"content": "Persist dark mode preference to localStorage", "status": "pending", "priority": "medium"}
]
</example>

<example>
User asks: "Refactor auth to use JWT instead of sessions"

You should FIRST call todowrite with:
[
  {"content": "Audit current session-based auth: middleware, login route, session store", "status": "in_progress", "priority": "high"},
  {"content": "Install jsonwebtoken and @types/jsonwebtoken packages", "status": "pending", "priority": "high"},
  {"content": "Create JWT utility module: generateToken, verifyToken, refreshToken", "status": "pending", "priority": "high"},
  {"content": "Update login route to issue JWT instead of creating session", "status": "pending", "priority": "high"},
  {"content": "Replace session middleware with JWT verification middleware", "status": "pending", "priority": "high"},
  {"content": "Update protected routes to use new JWT middleware", "status": "pending", "priority": "high"},
  {"content": "Add token refresh endpoint", "status": "pending", "priority": "medium"},
  {"content": "Remove session store dependencies and config", "status": "pending", "priority": "medium"},
  {"content": "Update tests for JWT-based auth flow", "status": "pending", "priority": "medium"}
]

Then work through each step systematically, updating status as you go.
</example>

CODE REFERENCES:
When referencing specific functions or code, include the pattern file_path:line_number to help the user navigate.
Example: "The auth middleware is defined in src/middleware/auth.ts:42"
</base_instructions>`;
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
  const shell = process.env.SHELL || (platform === 'win32' ? 'cmd' : 'bash');

  return `<environment>
Operating System: ${platform}
Shell: ${shell}
Working Directory: ${projectDir}
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
You have delegation tools that spawn independent child agents to handle tasks.
Each child agent runs its own agentic loop with its own LLM calls and tool access.

Available delegation tools:
${agentDocs.join('\n')}

Each delegation tool takes a single "task" parameter — a clear description of what the child agent should do.

WHEN TO DELEGATE:
- Use delegate_to_explore for codebase exploration, searching files, reading code, understanding structure.
- Use delegate_to_general for complex multi-step tasks that benefit from an independent agent.
- When the user explicitly asks you to "spawn a subagent", "delegate", or "use an agent", ALWAYS use a delegation tool.
- Prefer delegation over doing exploration work yourself when the task is self-contained.

IMPORTANT:
- Delegation tools are REAL tools — call them like any other tool with the "task" parameter.
- The child agent will execute independently and return its complete result to you.
- You MUST wait for the delegation result before responding to the user.
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
