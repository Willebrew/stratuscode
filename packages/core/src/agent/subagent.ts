/**
 * Subagent Module
 *
 * Enables parent agents to delegate tasks to child agents.
 * Each subagent runs its own processWithToolLoop with isolated
 * tools, system prompt, and message history.
 */

import type {
  SubagentDefinition,
  SubagentResult,
  SubagentCallbacks,
  Tool,
  ToolContext,
  Message,
  StratusCodeConfig,
} from '@stratuscode/shared';
import { processWithToolLoop, type AgentContext, type AgentLoopCallbacks } from './loop';
import type { ToolRegistry } from '../tools/registry';
import { createToolRegistry } from '../tools/registry';

// ============================================
// Constants
// ============================================

const MAX_AGENT_DEPTH = 3;

// ============================================
// Built-in Subagent Definitions
// ============================================

export const BUILTIN_SUBAGENTS: SubagentDefinition[] = [
  {
    name: 'explore',
    description: 'Fast codebase exploration agent. Read-only access for finding files, searching code, and understanding project structure.',
    systemPrompt: `You are an exploration agent focused on quickly understanding codebases.

Your capabilities:
- Read files and directories using the read and ls tools
- Search code with grep
- Use glob patterns to find files

Your constraints:
- You CANNOT modify files
- You CANNOT run shell commands
- Focus on gathering information quickly
- Summarize your findings concisely

When given a task:
1. Understand what information is needed
2. Use the most efficient tools to find it
3. Return a clear, structured summary`,
    toolNames: ['read', 'ls', 'grep', 'glob'],
    maxDepth: 5,
    temperature: 0.3,
  },
  {
    name: 'general',
    description: 'General-purpose subagent for complex tasks. Can read, write, and execute commands.',
    systemPrompt: `You are a general-purpose coding agent that can perform complex tasks.

Your capabilities:
- Read and write files
- Run shell commands
- Search and navigate code
- Make targeted edits

Your constraints:
- Be careful with destructive operations
- Ask for confirmation on risky actions
- Keep your work focused on the assigned task

When given a task:
1. Understand the requirements
2. Plan your approach
3. Execute efficiently
4. Report your results`,
    toolNames: ['read', 'write', 'edit', 'multi-edit', 'ls', 'grep', 'glob', 'bash', 'lsp'],
    maxDepth: 8,
    temperature: 0.5,
  },
  {
    name: 'research',
    description: 'Research agent for gathering information from the web and documentation.',
    systemPrompt: `You are a research agent focused on gathering external information.

Your capabilities:
- Search the web
- Fetch web pages
- Read documentation
- Synthesize findings

Your constraints:
- Focus on reliable sources
- Cite your sources
- Summarize concisely

When given a task:
1. Identify what information is needed
2. Search for relevant sources
3. Extract key information
4. Return a well-organized summary with sources`,
    toolNames: ['websearch', 'webfetch', 'read'],
    maxDepth: 3,
    temperature: 0.4,
  },
];

// ============================================
// Subagent Execution
// ============================================

export interface SubagentExecutionContext {
  parentContext: AgentContext;
  allTools: Tool[];
  subagentCallbacks?: SubagentCallbacks;
}

/**
 * Execute a task using a subagent
 */
export async function executeSubagent(
  definition: SubagentDefinition,
  task: string,
  executionContext: SubagentExecutionContext
): Promise<SubagentResult> {
  const { parentContext, allTools, subagentCallbacks } = executionContext;
  
  // Calculate child depth
  const parentDepth = getAgentDepth(parentContext);
  const childDepth = parentDepth + 1;
  
  // Check depth limit
  if (childDepth >= MAX_AGENT_DEPTH) {
    return {
      agentId: definition.name,
      content: `Cannot spawn subagent: maximum agent depth (${MAX_AGENT_DEPTH}) reached.`,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      error: 'max_depth_exceeded',
    };
  }
  
  // Notify subagent start
  subagentCallbacks?.onSubagentStart?.(definition.name, task);
  
  try {
    // Build child tool registry with only allowed tools
    const childRegistry = createToolRegistry();
    
    if (definition.toolNames && definition.toolNames.length > 0) {
      for (const toolName of definition.toolNames) {
        const tool = allTools.find(t => t.name === toolName);
        if (tool) {
          childRegistry.register(tool);
        }
      }
    }
    
    // Build child config (model is locked to parent's model)
    const childConfig: StratusCodeConfig = {
      ...parentContext.config,
      // Note: model is locked to 'gpt-5-mini', so we don't override it
      temperature: definition.temperature ?? parentContext.config.temperature,
      maxTokens: definition.maxTokens ?? parentContext.config.maxTokens,
      agent: {
        ...parentContext.config.agent,
        maxDepth: definition.maxDepth ?? 5,
      },
    };
    
    // Build child callbacks with subagent attribution
    const childCallbacks: AgentLoopCallbacks = {
      onToken: (token) => {
        subagentCallbacks?.onSubagentToken?.(definition.name, token);
        // Also forward to parent's onToken if needed
      },
      onReasoning: parentContext.callbacks?.onReasoning,
      onToolCallStart: parentContext.callbacks?.onToolCallStart,
      onToolCallComplete: parentContext.callbacks?.onToolCallComplete,
      onStatusChange: parentContext.callbacks?.onStatusChange,
      onError: parentContext.callbacks?.onError,
    };
    
    // Build child context
    const childContext: AgentContext = {
      sessionId: `${parentContext.sessionId}:${definition.name}:${Date.now()}`,
      projectDir: parentContext.projectDir,
      systemPrompt: definition.systemPrompt,
      messages: [{ role: 'user', content: task }],
      tools: childRegistry,
      config: childConfig,
      abort: parentContext.abort,
      callbacks: childCallbacks,
    };
    
    // Run the child agent loop
    const result = await processWithToolLoop(childContext);
    
    // Notify subagent end
    subagentCallbacks?.onSubagentEnd?.(definition.name, result.content);
    
    return {
      agentId: definition.name,
      content: result.content,
      toolCalls: result.toolCalls,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Notify subagent end with error
    subagentCallbacks?.onSubagentEnd?.(
      definition.name,
      JSON.stringify({ error: true, message: errorMsg })
    );
    
    return {
      agentId: definition.name,
      content: `Subagent error: ${errorMsg}`,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      error: errorMsg,
    };
  }
}

/**
 * Get the current agent depth from context
 */
function getAgentDepth(context: AgentContext): number {
  // Extract depth from sessionId if it contains subagent markers
  const parts = context.sessionId.split(':');
  // Count how many subagent markers are in the session ID
  return Math.max(0, parts.length - 1);
}

/**
 * Get a subagent definition by name
 */
export function getSubagentDefinition(name: string): SubagentDefinition | undefined {
  return BUILTIN_SUBAGENTS.find(s => s.name === name);
}

/**
 * Get all available subagent definitions
 */
export function getAllSubagentDefinitions(): SubagentDefinition[] {
  return [...BUILTIN_SUBAGENTS];
}

/**
 * Create a task tool that delegates to subagents
 */
export function createTaskTool(
  executionContext: SubagentExecutionContext
): Tool {
  return {
    name: 'task',
    description: `Delegate a task to a subagent for parallel or specialized work.

Available subagents:
${BUILTIN_SUBAGENTS.map(s => `- ${s.name}: ${s.description}`).join('\n')}

Use this when:
- You need to explore the codebase without cluttering the main conversation
- You want to run parallel investigations
- A task requires specialized focus

The subagent will execute independently and return a summary.`,
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'What the subagent should do. Be specific and clear.',
        },
        agent: {
          type: 'string',
          enum: BUILTIN_SUBAGENTS.map(s => s.name),
          description: 'Which subagent to use. Default: explore.',
        },
        context: {
          type: 'string',
          description: 'Optional additional context to pass to the subagent.',
        },
      },
      required: ['description'],
    },
    timeout: 120000,
    
    async execute(args, _toolContext) {
      const description = args.description as string;
      const agentName = (args.agent as string) || 'explore';
      const additionalContext = args.context as string | undefined;
      
      const definition = getSubagentDefinition(agentName);
      if (!definition) {
        return JSON.stringify({
          error: true,
          message: `Unknown subagent: ${agentName}. Available: ${BUILTIN_SUBAGENTS.map(s => s.name).join(', ')}`,
        });
      }
      
      // Build the task with optional context
      const task = additionalContext
        ? `${description}\n\nAdditional context:\n${additionalContext}`
        : description;
      
      const result = await executeSubagent(definition, task, executionContext);
      
      if (result.error) {
        return JSON.stringify({
          error: true,
          agent: agentName,
          message: result.error,
          content: result.content,
        });
      }
      
      return JSON.stringify({
        agent: agentName,
        task: description,
        result: result.content,
        tokens: {
          input: result.inputTokens,
          output: result.outputTokens,
        },
      });
    },
  };
}
