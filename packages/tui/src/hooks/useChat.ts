/**
 * useChat Hook
 *
 * Manages chat state and agent execution.
 * Powered by SAGE's processDirectly() for all agentic operations.
 */

import { useState, useCallback, useRef } from 'react';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// @ Mention Expansion
// ============================================

/**
 * Expand @file mentions in the message.
 * Detects @path/to/file tokens, reads the files, and prepends their content.
 */
function expandMentions(content: string, projectDir: string): string {
  // Match @path tokens — a path is alphanumeric + / . - _ starting after @
  const mentionRegex = /@([\w./-]+\.\w+)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]!);
  }

  if (mentions.length === 0) return content;

  let context = '';
  for (const mention of mentions) {
    const fullPath = path.isAbsolute(mention)
      ? mention
      : path.join(projectDir, mention);

    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        // Limit file content to avoid blowing up context
        const truncated = fileContent.length > 10000
          ? fileContent.slice(0, 10000) + '\n... (truncated)'
          : fileContent;
        context += `<file path="${mention}">\n${truncated}\n</file>\n\n`;
      }
    } catch {
      // File not readable, skip
    }
  }

  if (context) {
    return context + content;
  }
  return content;
}
import type { StratusCodeConfig, AgentInfo } from '@stratuscode/shared';
import { buildSystemPrompt, BUILT_IN_AGENTS } from '@stratuscode/shared';
import { registerBuiltInTools, createStratusCodeToolRegistry } from '@stratuscode/tools';
import {
  getSession as getStoredSession,
  getMessages as getStoredMessages,
  createSession as persistSession,
  updateSession as persistSessionUpdate,
  createMessage,
  updateMessageTokens,
  createTimelineEvent,
  listTimelineEvents,
  createToolCall,
  updateToolCallResult,
  getSessionTokenTotals,
} from '@stratuscode/storage';
import { processDirectly, type AgentResult, type Message, type ToolCall, type ToolRegistry } from '@sage/core';
import type { TimelineEvent, TokenUsage } from '@stratuscode/shared';

// ============================================
// Plan File Helpers
// ============================================

function getPlanFilePath(projectDir: string, sessionId: string): string {
  return path.join(projectDir, '.stratuscode', 'plans', `${sessionId}.md`);
}

function ensurePlanFile(projectDir: string, sessionId: string): string {
  const filePath = getPlanFilePath(projectDir, sessionId);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# Plan\n\n_Session: ${sessionId}_\n\n<!-- Write your plan here -->\n`, 'utf-8');
  }

  return filePath;
}

// ============================================
// Dynamic Reminders
// ============================================

function PLAN_MODE_REMINDER(planFilePath: string): string {
  return `<system-reminder>
You are in PLAN mode. Follow this workflow:

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Understand the user's request by reading code and asking clarifying questions.

1. Explore the codebase to understand the relevant code and existing patterns.
2. Use the delegate_to_explore tool to search the codebase efficiently.
3. After exploring, use the **question** tool to clarify ambiguities in the user's request.

### Phase 2: Design
Goal: Design an implementation approach based on your exploration and the user's answers.

1. Synthesize what you learned from exploration and user answers.
2. Consider trade-offs between approaches.
3. Use the **question** tool to clarify any remaining decisions with the user.

### Phase 3: Create Plan
Goal: Write a structured plan using the todowrite tool AND the plan file.

1. Create a clear, ordered todo list capturing each implementation step using todowrite.
2. Write a detailed plan to the plan file at: ${planFilePath}
   This is the ONLY file you are allowed to edit in plan mode.
3. The plan file should contain: summary, approach, file list, and implementation order.
4. Keep the plan concise but detailed enough to execute.

### Phase 4: Call plan_exit
At the very end of your turn, once you have asked the user questions and are satisfied with your plan, call plan_exit to indicate you are done planning.

### Phase 5: Iteration
If the user asks follow-up questions or requests changes, update both the todo list and plan file accordingly, then call plan_exit again.

**Critical rule:** Your turn should ONLY end with either asking the user a question (via the question tool) or calling plan_exit. Do not stop for any other reason.

## Question Tool Usage

**You MUST use the question tool whenever you need the user to make a choice.** Do NOT write questions as plain text in your response — the question tool renders an interactive UI.

Use the question tool for:
- Choosing between approaches or technologies
- Selecting features, pages, or components
- Confirming preferences (styling, deployment, etc.)
- Any decision with a finite set of options

**Important:** Use the question tool to clarify requirements/approach. Use plan_exit to request plan approval. Do NOT use the question tool to ask "Is this plan okay?" — that is what plan_exit does.

NOTE: At any point in this workflow you should feel free to ask the user questions or clarifications via the question tool. Don't make large assumptions about user intent. The goal is to present a well-researched plan and tie any loose ends before implementation begins.
</system-reminder>`;
}

function BUILD_SWITCH_REMINDER(planFilePath: string): string {
  return `<system-reminder>
Your operational mode has changed from plan to build.
You are no longer in read-only mode.
You are permitted to make file changes, run shell commands, and utilize your full arsenal of tools.

A plan file exists at: ${planFilePath}
You should execute on the plan defined within it and in the todo list.
Read the plan file first, then work through each task, updating status as you go.
</system-reminder>`;
}

// ============================================
// Types
// ============================================

export interface UseChatOptions {
  projectDir: string;
  config: StratusCodeConfig;
  agent: string;
  /** Override the model (e.g. from model picker) */
  modelOverride?: string;
  /** Override the provider key (e.g. 'opencode-zen') — resolves from config.providers */
  providerOverride?: string;
}

export interface ActionPart {
  id: string;
  type: 'text' | 'reasoning' | 'tool';
  content: string;
  toolCall?: ToolCall;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export interface SendMessageOptions {
  buildSwitch?: boolean;
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  timelineEvents: TimelineEvent[];
  sessionTokens: TokenUsage;
  contextUsage: { used: number; limit: number; percent: number };
  tokens: TokenUsage;
  sessionId: string | undefined;
  planExitProposed: boolean;
  sendMessage: (content: string, agentOverride?: string, options?: SendMessageOptions) => Promise<void>;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  abort: () => void;
  clear: () => void;
  resetPlanExit: () => void;
}

// ============================================
// Config Conversion
// ============================================

/**
 * Convert StratusCode config to SAGE config format
 */
function toSageConfig(
  config: StratusCodeConfig,
  modelOverride?: string,
  providerOverride?: string
) {
  // Resolve effective provider config from named providers if override is set
  let effectiveProvider: {
    apiKey: string | undefined;
    baseUrl: string;
    type?: 'responses-api' | 'chat-completions';
    headers?: Record<string, string>;
  } = {
    apiKey: config.provider.apiKey,
    baseUrl: config.provider.baseUrl,
    type: (config.provider as any).type as 'responses-api' | 'chat-completions' | undefined,
    headers: (config.provider as any).headers as Record<string, string> | undefined,
  };

  if (providerOverride && (config as any).providers?.[providerOverride]) {
    const p = (config as any).providers[providerOverride];
    effectiveProvider = {
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      type: p.type as 'responses-api' | 'chat-completions' | undefined,
      headers: p.headers,
    };
  }

  return {
    model: modelOverride || config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    parallelToolCalls: config.parallelToolCalls,
    provider: effectiveProvider,
    agent: {
      name: config.agent.name,
      maxDepth: config.agent.maxDepth,
      toolTimeout: config.agent.toolTimeout,
      maxToolResultSize: config.agent.maxToolResultSize,
    },
  };
}

// ============================================
// Hook
// ============================================

export function useChat(options: UseChatOptions): UseChatReturn {
  const { projectDir, config, agent, modelOverride, providerOverride } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [tokens, setTokens] = useState<TokenUsage>({ input: 0, output: 0 });
  const [sessionTokens, setSessionTokens] = useState<TokenUsage>({ input: 0, output: 0 });
  const [contextUsage, setContextUsage] = useState({ used: 0, limit: 128000, percent: 0 });
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [planExitProposed, setPlanExitProposed] = useState(false);

  const registryRef = useRef<ToolRegistry | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const actionIdRef = useRef(0);
  const timelineEventsRef = useRef<TimelineEvent[]>([]);
  const previousAgentRef = useRef<string>(agent);

  // Streaming throttle: accumulate in refs, flush to state at intervals
  const streamingContentRef = useRef('');
  const streamingReasoningRef = useRef('');
  const streamingFlushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStreamingTypeRef = useRef<'text' | 'reasoning' | null>(null);
  const STREAMING_FLUSH_INTERVAL = 150;

  // Initialize tool registry lazily
  const getRegistry = useCallback((): ToolRegistry => {
    if (!registryRef.current) {
      const registry = createStratusCodeToolRegistry();
      registerBuiltInTools(registry);
      registryRef.current = registry;
    }
    return registryRef.current;
  }, []);

  // Initialize session ID lazily
  const getSessionId = useCallback((): string => {
    if (!sessionIdRef.current) {
      const session = persistSession(projectDir);
      sessionIdRef.current = session.id;
      setSessionId(session.id);
    }
    return sessionIdRef.current;
  }, [projectDir]);

  // Get the current agent info
  const getAgent = useCallback((): AgentInfo => {
    return BUILT_IN_AGENTS[agent] || BUILT_IN_AGENTS.build!;
  }, [agent]);

  const getContextLimit = useCallback(() => {
    return config.maxTokens ?? 128000;
  }, [config.maxTokens]);

  const computeContextUsage = useCallback(
    (usage: TokenUsage) => {
      const overhead = 1000;
      const limit = getContextLimit();
      const used = (usage.input ?? 0) + (usage.output ?? 0) + overhead;
      const percent = Math.min(99, Math.round((used / limit) * 100));
      setContextUsage({ used, limit, percent });
    },
    [getContextLimit]
  );

  const pushEvent = useCallback(
    (event: TimelineEvent) => {
      timelineEventsRef.current = [...timelineEventsRef.current, event];
      setTimelineEvents([...timelineEventsRef.current]);
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, agentOverride?: string, options?: SendMessageOptions) => {
      if (isLoading) return;

      setError(null);
      setIsLoading(true);
      timelineEventsRef.current = [...timelineEventsRef.current];

      // Expand @file mentions before sending
      const expandedContent = expandMentions(content, projectDir);

      // Add user message (show original content in UI, send expanded to LLM)
      const userMsg: Message = { role: 'user', content }; // Display original
      const newMessages = [...messagesRef.current, userMsg];
      messagesRef.current = newMessages;
      setMessages([...newMessages]);

      // Persist user message
      const sid = getSessionId();
      const userMessageId = createMessage(sid, 'user', content);
      const userEvent = createTimelineEvent(sid, 'user', content, {}, userMessageId);
      timelineEventsRef.current = [...timelineEventsRef.current, userEvent];
      setTimelineEvents([...timelineEventsRef.current]);
      persistSessionUpdate(sid, { status: 'running' });

      // Create abort controller
      abortRef.current = new AbortController();

      const flushReasoningEvent = () => {
        const pending = streamingReasoningRef.current;
        if (!pending) return;
        const last = timelineEventsRef.current[timelineEventsRef.current.length - 1];
        if (last && last.kind === 'reasoning') {
          timelineEventsRef.current = [
            ...timelineEventsRef.current.slice(0, -1),
            { ...last, content: pending, streaming: false },
          ];
          setTimelineEvents([...timelineEventsRef.current]);
        } else {
          const ev = createTimelineEvent(sid, 'reasoning', pending, { streaming: false }, userMessageId);
          pushEvent(ev);
        }
        streamingReasoningRef.current = '';
      };

      const flushTextEvent = () => {
        const pending = streamingContentRef.current;
        if (pending) {
          const ev = createTimelineEvent(sid, 'assistant', pending, {}, userMessageId);
          pushEvent(ev);
          streamingContentRef.current = '';
        }
      };

      try {
        const registry = getRegistry();
        // Use explicit override if provided (e.g., switching from plan → build)
        const effectiveAgentName = agentOverride || agent;
        const currentAgent = agentOverride
          ? (BUILT_IN_AGENTS[agentOverride] || BUILT_IN_AGENTS.build!)
          : getAgent();

        // Resolve modelId for prompt variant selection
        const effectiveModelId = modelOverride || config.model;

        // Build system prompt using StratusCode's prompt builder
        const systemPrompt = buildSystemPrompt({
          agent: currentAgent,
          tools: registry.toAPIFormat().map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
          projectDir,
          customInstructions: config.agent.name ? [`Agent: ${config.agent.name}`] : undefined,
          modelId: effectiveModelId,
        });

        // Build messages for LLM (may include injected reminders)
        let messagesForLLM = [...newMessages];

        // Replace last message content with expanded mentions for LLM
        if (expandedContent !== content) {
          const lastIdx = messagesForLLM.length - 1;
          messagesForLLM[lastIdx] = {
            ...messagesForLLM[lastIdx]!,
            content: expandedContent,
          };
        }

        // Plan mode: ensure plan file exists and inject plan mode reminder
        if (effectiveAgentName === 'plan') {
          const planFilePath = ensurePlanFile(projectDir, sid);
          const lastIdx = messagesForLLM.length - 1;
          const lastMsg = messagesForLLM[lastIdx]!;
          messagesForLLM[lastIdx] = {
            ...lastMsg,
            content: lastMsg.content + '\n\n' + PLAN_MODE_REMINDER(planFilePath),
          };
        }

        // Build-switch: inject reminder when transitioning from plan to build
        if (options?.buildSwitch && previousAgentRef.current === 'plan') {
          const planFilePath = getPlanFilePath(projectDir, sid);
          const lastIdx = messagesForLLM.length - 1;
          const lastMsg = messagesForLLM[lastIdx]!;
          messagesForLLM[lastIdx] = {
            ...lastMsg,
            content: lastMsg.content + '\n\n' + BUILD_SWITCH_REMINDER(planFilePath),
          };
        }

        // Track agent for next transition detection
        previousAgentRef.current = effectiveAgentName;

        // Start streaming flush interval — accumulate tokens in refs, flush to state periodically
        streamingContentRef.current = '';
        streamingReasoningRef.current = '';
        lastStreamingTypeRef.current = null;
        streamingFlushRef.current = setInterval(() => {}, STREAMING_FLUSH_INTERVAL);

        // Run through SAGE's processDirectly - the only agentic engine
        const result = await processDirectly({
          systemPrompt,
          messages: messagesForLLM,
          tools: registry,
          config: toSageConfig(config, modelOverride, providerOverride),
          abort: abortRef.current.signal,
          sessionId: sid,
          toolMetadata: {
            projectDir,
            abort: abortRef.current.signal,
          },
          callbacks: {
            onToken: (token: string) => {
              if (lastStreamingTypeRef.current === 'reasoning' && streamingReasoningRef.current) {
                flushReasoningEvent();
              }
              lastStreamingTypeRef.current = 'text';
              streamingContentRef.current += token;
            },
            onReasoning: (text: string) => {
              if (lastStreamingTypeRef.current === 'text' && streamingContentRef.current) {
                flushTextEvent();
              }
              lastStreamingTypeRef.current = 'reasoning';
              streamingReasoningRef.current += text;
              const last = timelineEventsRef.current[timelineEventsRef.current.length - 1];
              if (last && last.kind === 'reasoning' && last.streaming) {
                timelineEventsRef.current = [
                  ...timelineEventsRef.current.slice(0, -1),
                  { ...last, content: streamingReasoningRef.current, streaming: true },
                ];
                setTimelineEvents([...timelineEventsRef.current]);
              } else {
                const ev = createTimelineEvent(sid, 'reasoning', streamingReasoningRef.current, { streaming: true }, userMessageId);
                pushEvent(ev);
              }
            },
            onToolCall: (tc: ToolCall) => {
              createToolCall(userMessageId, sid, tc);
              const toolEvent = createTimelineEvent(
                sid,
                'tool_call',
                tc.function.name,
                {
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  status: 'running',
                },
                userMessageId
              );
              pushEvent(toolEvent);
            },
            onToolResult: (tc: ToolCall, result: string) => {
              updateToolCallResult(tc.id, result, 'completed');
              const resultEvent = createTimelineEvent(
                sid,
                'tool_result',
                result.slice(0, 2000),
                {
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  status: 'completed',
                },
                userMessageId
              );
              pushEvent(resultEvent);
              if (tc.function.name === 'plan_exit') {
                try {
                  const parsed = JSON.parse(result);
                  if (parsed.proposingExit) {
                    setPlanExitProposed(true);
                  }
                } catch {
                  // ignore
                }
              }
            },
            onStatusChange: () => {},
            onError: (err: Error) => {
              setError(err.message);
            },
          },
        });

        // Snapshot any trailing text/reasoning in chronological order.
        // The lastStreamingTypeRef tells us which type was streaming most recently,
        // so the other one (if any) came first.
        const trailingText = streamingContentRef.current;
        const trailingReasoning = streamingReasoningRef.current;
        if (trailingReasoning) flushReasoningEvent();
        if (trailingText) flushTextEvent();
        streamingContentRef.current = '';
        streamingReasoningRef.current = '';

        // Mark last reasoning event as completed (stop spinner)
        const lastReasoningIdx = timelineEventsRef.current.map(e => e.kind).lastIndexOf('reasoning');
        if (lastReasoningIdx !== -1) {
          timelineEventsRef.current[lastReasoningIdx] = {
            ...timelineEventsRef.current[lastReasoningIdx]!,
            streaming: false,
          } as TimelineEvent;
          setTimelineEvents([...timelineEventsRef.current]);
        }

        // Persist (no final assistant timeline event; streamed text already captured)
        const tokenUsage: TokenUsage = {
          input: result.inputTokens,
          output: result.outputTokens,
          context: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
          model: effectiveModelId,
        };
        const assistantMessageId = createMessage(sid, 'assistant', result.content, undefined, tokenUsage);
        updateMessageTokens(assistantMessageId, tokenUsage);
        persistSessionUpdate(sid, { status: 'completed' });

        // Update tokens
        setTokens(prev => ({
          input: prev.input + result.inputTokens,
          output: prev.output + result.outputTokens,
        }));
        const totals = getSessionTokenTotals(sid);
        setSessionTokens(totals);
        computeContextUsage(tokenUsage);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);

        // Preserve any content/tool calls that were accumulated before the error
        const partialContent = streamingContentRef.current || '';
        const errorMsg: Message = {
          role: 'assistant',
          content: partialContent
            ? `${partialContent}\n\n[Error: ${errorMessage}]`
            : `Error: ${errorMessage}`,
        };
        messagesRef.current = [...messagesRef.current, errorMsg];
        setMessages([...messagesRef.current]);

        pushEvent(createTimelineEvent(sid, 'status', `Error: ${errorMessage}`, {}, userMessageId));
        persistSessionUpdate(sid, { status: 'failed', error: errorMessage });
      } finally {
        // Stop streaming flush interval
        if (streamingFlushRef.current) {
          clearInterval(streamingFlushRef.current);
          streamingFlushRef.current = null;
        }

        setIsLoading(false);
        streamingContentRef.current = '';
        streamingReasoningRef.current = '';
        // NOTE: actions and toolCalls are NOT cleared here — they stay visible
        // as part of the completed response in the dynamic section. They are
        // cleared at the start of the next sendMessage() call.
        abortRef.current = null;
      }
    },
    [isLoading, getRegistry, getSessionId, getAgent, agent, projectDir, config, modelOverride, providerOverride]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setTimelineEvents([]);
    timelineEventsRef.current = [];
    setError(null);
    setTokens({ input: 0, output: 0 });
    setSessionTokens({ input: 0, output: 0 });
    setSessionId(undefined);
    sessionIdRef.current = undefined;
    registryRef.current = null;
    setPlanExitProposed(false);
    setContextUsage({ used: 0, limit: 128000, percent: 0 });
  }, []);

  const resetPlanExit = useCallback(() => {
    setPlanExitProposed(false);
  }, []);

  // Load an existing session from storage
  const loadSession = useCallback(
    async (id: string): Promise<void> => {
      clear();

      try {
        const storedSession = getStoredSession(id);
        if (!storedSession) {
          setError('Session not found');
          return;
        }

        const storedMessages = getStoredMessages(id);
        const storedEvents = listTimelineEvents(id);
        const totals = getSessionTokenTotals(id);
        messagesRef.current = storedMessages;
        timelineEventsRef.current = storedEvents;
        setMessages(storedMessages);
        setTimelineEvents(storedEvents);
        setSessionTokens(totals);
        computeContextUsage(totals);
        setSessionId(id);
        sessionIdRef.current = id;
      } catch (err) {
        setError(`Failed to load session: ${err}`);
      }
    },
    [clear, computeContextUsage]
  );

  // Execute a tool directly without going through the agent
  const executeTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<string> => {
      const registry = getRegistry();
      const tool = registry.get(name);

      if (!tool) {
        return JSON.stringify({ error: true, message: `Tool not found: ${name}` });
      }

      try {
        const result = await registry.execute(name, args, {
          sessionId: getSessionId(),
          conversationId: getSessionId(),
          userId: 'local',
          metadata: { projectDir },
        });
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: true, message: String(err) });
      }
    },
    [getRegistry, getSessionId, projectDir]
  );

  return {
    messages,
    isLoading,
    error,
    timelineEvents,
    sessionTokens,
    contextUsage,
    tokens,
    sessionId,
    planExitProposed,
    sendMessage,
    executeTool,
    loadSession,
    abort,
    clear,
    resetPlanExit,
  };
}
