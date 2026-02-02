/**
 * Session Management
 *
 * Handles session lifecycle, message management, and agent execution.
 */

import type {
  Session,
  Message,
  AgentResult,
  StratusCodeConfig,
  AgentInfo,
} from '@stratuscode/shared';
import { generateId, generateSlug } from '@stratuscode/shared';
import { createSession as persistSession, updateSession as persistSessionUpdate, createMessage } from '@stratuscode/storage';
import { processWithToolLoop, type AgentContext, type AgentLoopCallbacks } from './loop';
import { buildSystemPrompt, getAgentPrompt, AGENT_PROMPTS } from './system-prompt';
import type { ToolRegistry } from '../tools/registry';
import type { ContextConfig, SummaryState } from '@sage/core/context';

// ============================================
// Types
// ============================================

export interface SessionOptions {
  projectDir: string;
  config: StratusCodeConfig;
  tools: ToolRegistry;
  agent?: string;
}

export interface SessionManager {
  session: Session;
  messages: Message[];
  run(userMessage: string, callbacks?: AgentLoopCallbacks): Promise<AgentResult>;
  addMessage(message: Message): void;
  setAgent(agentName: string): void;
  abort(): void;
}

// ============================================
// Built-in Agents
// ============================================

const BUILT_IN_AGENTS: Record<string, AgentInfo> = {
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
// Session Manager
// ============================================

/**
 * Create a new session manager
 */
export function createSession(options: SessionOptions): SessionManager {
  const { projectDir, config, tools, agent = 'build' } = options;

  // Create and persist session to database
  const session = persistSession(projectDir);

  // Initialize state
  const messages: Message[] = [];
  let currentAgent = getAgent(agent);
  let abortController = new AbortController();

  // SAGE context engine state
  let existingSummary: SummaryState | undefined;
  const contextConfig: ContextConfig = {
    model: config.model,
    contextWindow: 128_000, // gpt-5-mini context window
    maxResponseTokens: config.maxTokens ?? 16_384,
    summary: {
      provider: {
        apiKey: config.provider.apiKey!,
        baseUrl: config.provider.baseUrl,
      },
      model: config.model,
      targetTokens: 500,
    },
  };

  function getAgent(name: string): AgentInfo {
    const agent = BUILT_IN_AGENTS[name];
    if (agent) return agent;
    return BUILT_IN_AGENTS.build!;
  }

  return {
    session,
    messages,

    /**
     * Run the agent with a user message
     */
    async run(userMessage: string, callbacks?: AgentLoopCallbacks): Promise<AgentResult> {
      // Reset abort controller
      abortController = new AbortController();

      // Add user message and persist to database
      const userMsg: Message = {
        role: 'user',
        content: userMessage,
      };
      messages.push(userMsg);
      createMessage(session.id, 'user', userMessage);

      // Update session
      session.status = 'running';
      session.updatedAt = Date.now();
      persistSessionUpdate(session.id, { status: 'running' });

      // Build system prompt
      const systemPrompt = buildSystemPrompt({
        agent: currentAgent,
        tools: tools.toAPIFormat(),
        projectDir,
        customInstructions: config.agent.name ? [`Agent: ${config.agent.name}`] : undefined,
        contextEngineEnabled: true,
      });

      // Create agent context
      const context: AgentContext = {
        sessionId: session.id,
        projectDir,
        systemPrompt,
        messages: [...messages],
        tools,
        config,
        abort: abortController.signal,
        callbacks,
        contextConfig,
        existingSummary,
      };

      try {
        // Run agent loop
        const result = await processWithToolLoop(context);

        // Capture SAGE context summary for next turn
        if (result.newSummary) {
          existingSummary = result.newSummary;
        }

        // Add assistant message and persist to database
        const assistantMsg: Message = {
          role: 'assistant',
          content: result.content,
          reasoning: result.reasoning,
          toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        };
        messages.push(assistantMsg);
        createMessage(session.id, 'assistant', result.content);

        // Update session in memory and database
        session.status = 'completed';
        session.updatedAt = Date.now();
        persistSessionUpdate(session.id, { status: 'completed' });

        return result;
      } catch (error) {
        session.status = 'failed';
        session.error = error instanceof Error ? error.message : String(error);
        session.updatedAt = Date.now();
        persistSessionUpdate(session.id, { status: 'failed', error: session.error });
        throw error;
      }
    },

    /**
     * Add a message to the conversation
     */
    addMessage(message: Message): void {
      messages.push(message);
      session.updatedAt = Date.now();
      persistSessionUpdate(session.id, {});
    },

    /**
     * Switch to a different agent
     */
    setAgent(agentName: string): void {
      currentAgent = getAgent(agentName);
    },

    /**
     * Abort the current operation
     */
    abort(): void {
      abortController.abort();
      session.status = 'cancelled';
      session.updatedAt = Date.now();
      persistSessionUpdate(session.id, { status: 'cancelled' });
    },
  };
}

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
