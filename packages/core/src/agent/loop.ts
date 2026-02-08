/**
 * Agentic Loop
 *
 * The core recursive loop that processes messages, handles tool calls,
 * and streams responses using SAGE's provider abstraction.
 *
 * Supports both OpenAI Responses API and Chat Completions API seamlessly.
 * Provider selection is automatic based on base URL or explicit config.
 *
 * PARALLEL TOOL EXECUTION:
 * When the LLM returns multiple tool calls in a single response, they are
 * executed in parallel using Promise.all(). This enables faster execution
 * of independent tools and allows the LLM to control parallelism.
 */

import type {
  Message,
  ToolCall,
  AgentResult,
  HookContext,
  StratusCodeConfig,
  StratusCodeHooks,
  Tool,
  ToolContext,
} from '@stratuscode/shared';
import { MaxDepthError, AbortError, generateId, patchGlobalFetch, modelSupportsReasoning } from '@stratuscode/shared';
import { createProviderFromConfig } from '@willebrew/sage-core/providers';
import type { Provider, NormalizedStreamEvent, ProviderRequest, ProviderConfig } from '@willebrew/sage-core/providers';
import { handleNormalizedEvent, createAccumulator, type StreamAccumulator } from '../streaming/handler';
import { executeTool, parseToolArguments } from '../tools/executor';
import type { ToolRegistry } from '../tools/registry';
import { executeSubagent, getSubagentDefinition, BUILTIN_SUBAGENTS } from './subagent';
import { manageContext } from '@willebrew/sage-core/context';
import type { ContextConfig, SummaryState } from '@willebrew/sage-core/context';
import { verifyEdit, formatVerification, detectProjectLinters } from '@willebrew/sage-core/verification';
import type { LinterConfig } from '@willebrew/sage-core/verification';

// Ensure Codex fetch patch is applied once in this process
patchGlobalFetch();

// ============================================
// Types
// ============================================

export interface AgentContext {
  sessionId: string;
  projectDir: string;
  systemPrompt: string;
  messages: Message[];
  tools: ToolRegistry;
  config: StratusCodeConfig;
  abort?: AbortSignal;
  callbacks?: AgentLoopCallbacks;
  /** SAGE context engine config */
  contextConfig?: ContextConfig;
  /** Existing summary from previous turns */
  existingSummary?: SummaryState;
  /** Cached SAGE provider instance (reused across recursive calls) */
  _provider?: Provider;
  /** Responses API: previous response ID for recursive tool loops */
  _previousResponseId?: string;
}

export interface AgentLoopCallbacks {
  onToken?: (token: string) => void;
  onReasoning?: (text: string) => void;
  onToolCallStart?: (toolCall: { id: string; name: string }) => void;
  onToolCallComplete?: (toolCall: ToolCall, result: string) => void;
  onStatusChange?: (status: string) => void;
  onStepComplete?: (step: number, accumulator: StreamAccumulator) => void;
  onLoopIteration?: (depth: number, messages: Message[]) => void;
  onError?: (error: Error) => void;
  onSubagentStart?: (agentId: string, task: string) => void;
  onSubagentEnd?: (agentId: string, result: string) => void;
  onSubagentToken?: (agentId: string, token: string) => void;
}

// ============================================
// Helpers
// ============================================

/**
 * Detect whether the provider uses the Responses API (vs Chat Completions)
 */
function isResponsesAPIProvider(config: StratusCodeConfig): boolean {
  // Explicit type wins
  if (config.provider.type === 'chat-completions') return false;
  if (config.provider.type === 'responses-api') return true;

  // Auto-detect from base URL
  const url = config.provider.baseUrl || '';
  if (url.includes('opencode') || url.includes('/zen/')) return false;
  if (url.includes('openrouter')) return false;
  if (url.includes('together')) return false;
  if (url.includes('groq')) return false;
  if (url.includes('ollama') || url.includes('11434')) return false;
  if (url.includes('lm-studio') || url.includes('1234')) return false;

  // Codex uses the Responses endpoint but requires custom handling elsewhere
  if (url.includes('chatgpt.com/backend-api/codex')) return true;
  return true;
}

/**
 * Some Responses API-compatible gateways (e.g. ChatGPT Codex, OpenClaw)
 * ignore `previous_response_id`, which breaks tool continuations. In those
 * cases we fall back to replaying the full tool call + output history instead
 * of relying on server-side state.
 */
function supportsPreviousResponseContinuation(config: StratusCodeConfig): boolean {
  const url = config.provider.baseUrl || '';

  // Codex models currently return 400s when continuing with previous_response_id
  if (config.model.toLowerCase().includes('codex')) return false;

  // ChatGPT Codex backend currently drops previous_response_id
  if (url.includes('chatgpt.com') || url.includes('/codex')) return false;

  // OpenClaw proxy does the same
  if (url.includes('openclaw')) return false;

  return true;
}

/**
 * Build SAGE ProviderConfig from StratusCode config
 */
function buildProviderConfig(config: StratusCodeConfig): ProviderConfig {
  const supportsReasoning = modelSupportsReasoning(config.model);
  const reasoningEffort = config.reasoningEffort ?? (supportsReasoning ? 'medium' : undefined);

  return {
    apiKey: config.provider.apiKey || (config as any).provider?.auth?.access || '',
    baseUrl: config.provider.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    parallelToolCalls: config.parallelToolCalls,
    type: config.provider.type as ProviderConfig['type'],
    headers: config.provider.headers,
    enableReasoningEffort: !!reasoningEffort,
    reasoningEffort,
  };
}

/**
 * Convert StratusCode ToolDefinitions to SAGE APITool format
 */
function toolsToAPIFormat(registry: ToolRegistry): Array<{ type: 'function'; name: string; description: string; parameters: Record<string, unknown> }> {
  return registry.toAPIFormat().map(t => ({
    type: 'function' as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters as Record<string, unknown>,
  }));
}

// ============================================
// Agent Loop
// ============================================

// Linter configs cached per session to avoid re-detection on every edit
let cachedLinters: LinterConfig[] | null = null;

export async function processWithToolLoop(
  context: AgentContext,
  depth: number = 0,
  accumulatedTokens: { input: number; output: number } = { input: 0, output: 0 }
): Promise<AgentResult> {
  const maxDepth = context.config.agent.maxDepth;
  const hooks = context.config.hooks;

  // Safety check: prevent infinite loops
  if (depth >= maxDepth) {
    throw new MaxDepthError(depth, maxDepth);
  }

  // Check abort signal
  if (context.abort?.aborted) {
    throw new AbortError();
  }

  const hookContext = createHookContext(context);

  // Notify status change
  context.callbacks?.onStatusChange?.('running');

  // Apply SAGE context management (sliding window + summarization)
  let managedMessages = context.messages;
  let managedSystemPrompt = context.systemPrompt;

  if (context.contextConfig) {
    try {
      context.callbacks?.onStatusChange?.('context_managing');
      const contextResult = await manageContext({
        messages: context.messages as unknown as Parameters<typeof manageContext>[0]['messages'],
        systemPrompt: context.systemPrompt,
        userId: context.sessionId,
        config: context.contextConfig,
        existingSummary: context.existingSummary,
      });
      managedMessages = contextResult.messages as unknown as Message[];
      managedSystemPrompt = contextResult.systemPrompt;

      if (contextResult.newSummary) {
        context.existingSummary = contextResult.newSummary;
      }
    } catch (err) {
      console.warn('[StratusCode] Context management failed, using raw messages:', err);
    }
  }

  // Build SAGE provider config
  const providerConfig = buildProviderConfig(context.config);

  // Create or reuse SAGE provider (persists across recursive calls)
  const provider = context._provider ?? createProviderFromConfig({
    provider: {
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      type: providerConfig.type,
      headers: providerConfig.headers,
    },
    model: providerConfig.model,
    temperature: providerConfig.temperature,
    maxTokens: providerConfig.maxTokens,
    parallelToolCalls: providerConfig.parallelToolCalls,
  });

  // Cache provider for recursive calls
  if (!context._provider) {
    context._provider = provider;
  }

  // Call beforeLLMCall hook
  await hooks?.beforeLLMCall?.(hookContext);

  // Build SAGE ProviderRequest
  const request: ProviderRequest = {
    systemPrompt: managedSystemPrompt,
    messages: managedMessages as unknown as ProviderRequest['messages'],
    tools: toolsToAPIFormat(context.tools) as unknown as ProviderRequest['tools'],
    config: providerConfig,
    previousResponseId: context._previousResponseId,
    promptCacheKey: context.sessionId,
  };

  // Stream response using SAGE's provider
  const accumulator = createAccumulator();
  let streamError: string | undefined;

  try {
    const eventStream = provider.stream(request);

    for await (const event of eventStream) {
      if (context.abort?.aborted) {
        throw new AbortError();
      }

      // Track stream errors
      if (event.type === 'error') {
        streamError = event.message;
      }

      handleNormalizedEvent(event, accumulator, {
        onToken: context.callbacks?.onToken,
        onReasoning: context.callbacks?.onReasoning,
        onToolCallStart: context.callbacks?.onToolCallStart,
      });
    }
  } catch (fetchError) {
    const error = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
    console.error(`[StratusCode] API request failed (depth=${depth}):`, error.message);
    context.callbacks?.onError?.(error);
    throw error;
  }

  // If the stream had an error event, throw it
  if (streamError) {
    const error = new Error(`LLM stream error: ${streamError}`);
    context.callbacks?.onError?.(error);
    throw error;
  }

  // Call afterLLMCall hook
  await hooks?.afterLLMCall?.(hookContext, {
    content: accumulator.content,
    reasoning: accumulator.reasoning || undefined,
    toolCalls: accumulator.toolCalls,
    inputTokens: accumulator.inputTokens,
    outputTokens: accumulator.outputTokens,
  });

  // Notify step complete
  context.callbacks?.onStepComplete?.(depth, accumulator);

  // Check if we have tool calls to process
  const validToolCalls = accumulator.toolCalls.filter(
    tc => tc.function?.name && tc.function.name.trim() !== ''
  );

  if (validToolCalls.length > 0) {
    // Notify status change
    context.callbacks?.onStatusChange?.('tool_loop');

    // Execute ALL tools in PARALLEL
    const toolResults: Message[] = await Promise.all(
      validToolCalls.map(async (toolCall): Promise<Message> => {
        const toolName = toolCall.function.name;
        const tool = context.tools.get(toolName);

        if (!tool) {
          const errorResult = JSON.stringify({
            error: true,
            message: `Tool not found: ${toolName}`,
          });
          context.callbacks?.onToolCallComplete?.(toolCall, errorResult);
          return {
            role: 'tool',
            content: errorResult,
            toolCallId: toolCall.id,
          };
        }

        // Parse arguments
        let args: Record<string, unknown>;
        try {
          args = parseToolArguments(toolCall.function.arguments);
        } catch (error) {
          const errorResult = JSON.stringify({
            error: true,
            message: `Failed to parse arguments: ${error}`,
          });
          context.callbacks?.onToolCallComplete?.(toolCall, errorResult);
          return {
            role: 'tool',
            content: errorResult,
            toolCallId: toolCall.id,
          };
        }

        const toolInfo = { name: toolName, description: tool.description };

        // Call beforeToolExecution hook
        try {
          const modifiedArgs = await hooks?.beforeToolExecution?.(
            toolInfo,
            args,
            hookContext
          );
          if (modifiedArgs !== undefined) {
            args = modifiedArgs;
          }
        } catch (hookError) {
          const errorResult = JSON.stringify({
            error: true,
            message: `Tool blocked: ${hookError}`,
          });
          context.callbacks?.onToolCallComplete?.(toolCall, errorResult);
          return {
            role: 'tool',
            content: errorResult,
            toolCallId: toolCall.id,
          };
        }

        // Execute tool
        const toolContext: ToolContext = {
          sessionId: context.sessionId,
          projectDir: context.projectDir,
          abort: context.abort,
        };

        // Special handling for task tool - execute subagent
        if (toolName === 'task') {
          const agentName = (args.agent as string) || 'explore';
          const description = args.description as string;
          const additionalContext = args.context as string | undefined;

          const definition = getSubagentDefinition(agentName);
          if (!definition) {
            const errorResult = JSON.stringify({
              error: true,
              message: `Unknown subagent: ${agentName}. Available: ${BUILTIN_SUBAGENTS.map(s => s.name).join(', ')}`,
            });
            context.callbacks?.onToolCallComplete?.(toolCall, errorResult);
            return {
              role: 'tool',
              content: errorResult,
              toolCallId: toolCall.id,
            };
          }

          const task = additionalContext
            ? `${description}\n\nAdditional context:\n${additionalContext}`
            : description;

          context.callbacks?.onSubagentStart?.(definition.name, task);

          const subagentResult = await executeSubagent(definition, task, {
            parentContext: context,
            allTools: context.tools.list(),
            subagentCallbacks: {
              onSubagentStart: context.callbacks?.onSubagentStart,
              onSubagentEnd: context.callbacks?.onSubagentEnd,
              onSubagentToken: context.callbacks?.onSubagentToken,
            },
          });

          context.callbacks?.onSubagentEnd?.(definition.name, subagentResult.content);

          const result = subagentResult.error
            ? JSON.stringify({
                error: true,
                agent: agentName,
                message: subagentResult.error,
                content: subagentResult.content,
              })
            : JSON.stringify({
                agent: agentName,
                task: description,
                result: subagentResult.content,
                tokens: {
                  input: subagentResult.inputTokens,
                  output: subagentResult.outputTokens,
                },
              });

          context.callbacks?.onToolCallComplete?.(toolCall, result);
          return {
            role: 'tool',
            content: result,
            toolCallId: toolCall.id,
          };
        }

        const { success, result } = await executeTool(tool, args, toolContext);

        // Verify edits by re-reading and running linters
        let finalResult = result;
        if (success && (toolName === 'edit' || toolName === 'multi_edit' || toolName === 'write')) {
          const filePath = args.file_path as string | undefined;
          const newString = args.new_string as string | undefined;
          if (filePath) {
            try {
              if (!cachedLinters) {
                cachedLinters = await detectProjectLinters(context.projectDir);
              }
              const verification = await verifyEdit(filePath, newString, {
                projectDir: context.projectDir,
                enableLinting: cachedLinters.length > 0,
                linters: cachedLinters,
                lintTimeout: 10_000,
              });
              if (!verification.success || verification.lintErrors.length > 0) {
                finalResult = `${result}\n\n[Verification]\n${formatVerification(verification)}`;
              }
            } catch {
              // Verification failure is non-fatal
            }
          }
        }

        // Call afterToolExecution hook
        await hooks?.afterToolExecution?.(
          toolInfo,
          args,
          success ? finalResult : null,
          success ? null : new Error(finalResult),
          hookContext
        );

        context.callbacks?.onToolCallComplete?.(toolCall, finalResult);

        return {
          role: 'tool',
          content: finalResult,
          toolCallId: toolCall.id,
        };
      })
    );

    // Determine recursion strategy based on API format
    const useResponsesAPI = isResponsesAPIProvider(context.config);
    const supportsPrevResponse = supportsPreviousResponseContinuation(context.config);
    let recursiveMessages: Message[];
    let recursivePreviousResponseId: string | undefined;

    if (useResponsesAPI && accumulator.responseId && supportsPrevResponse) {
      // Responses API: send only tool results + previousResponseId
      recursiveMessages = toolResults;
      recursivePreviousResponseId = accumulator.responseId;
    } else {
      // Chat Completions (or Responses API without responseId): send full history
      recursiveMessages = [
        ...context.messages,
        {
          role: 'assistant',
          content: accumulator.content,
          toolCalls: validToolCalls,
          reasoning: accumulator.reasoning || undefined,
        },
        ...toolResults,
      ];
      recursivePreviousResponseId = undefined;
    }

    // Notify about loop iteration
    context.callbacks?.onLoopIteration?.(depth + 1, recursiveMessages);

    // Accumulate tokens from this iteration
    const newAccumulatedTokens = {
      input: accumulatedTokens.input + accumulator.inputTokens,
      output: accumulatedTokens.output + accumulator.outputTokens,
    };

    // Recurse with tool results
    return processWithToolLoop(
      {
        ...context,
        messages: recursiveMessages,
        _previousResponseId: recursivePreviousResponseId,
        _provider: provider,
      },
      depth + 1,
      newAccumulatedTokens
    );
  }

  // No tool calls - complete
  const totalTokens = {
    input: accumulatedTokens.input + accumulator.inputTokens,
    output: accumulatedTokens.output + accumulator.outputTokens,
  };

  const summary = context.existingSummary;
  const result: AgentResult = {
    content: accumulator.content,
    reasoning: accumulator.reasoning || undefined,
    toolCalls: [],
    inputTokens: totalTokens.input,
    outputTokens: totalTokens.output,
    lastInputTokens: accumulator.inputTokens,
    newSummary: summary ? {
      text: summary.text,
      upToMessageId: summary.upToMessageId ?? '',
      tokenCount: summary.tokenCount,
    } : undefined,
  };

  // Call onComplete hook
  await hooks?.onComplete?.(result, hookContext);

  // Notify completion
  context.callbacks?.onStatusChange?.('completed');

  return result;
}

// ============================================
// Helpers
// ============================================

function createHookContext(context: AgentContext): HookContext {
  return {
    sessionId: context.sessionId,
    projectDir: context.projectDir,
    agentId: 'root',
    agentDepth: 0,
    messages: context.messages,
  };
}
