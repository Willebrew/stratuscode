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
import { buildSystemPrompt, BUILT_IN_AGENTS, modelSupportsReasoning } from '@stratuscode/shared';
import { registerBuiltInTools, createStratusCodeToolRegistry } from '@stratuscode/tools';
import {
  getSession as getStoredSession,
  getMessages as getStoredMessages,
  createSession as persistSession,
  updateSession as persistSessionUpdate,
  createMessage,
  updateMessage,
  createTimelineEvent,
  listTimelineEvents,
  createToolCall,
  updateToolCallResult,
  getSessionTokenTotals,
} from '@stratuscode/storage';
import { processDirectly, type AgentResult, type Message, type ToolCall, type ToolRegistry } from '@sage/core';
import { SQLiteErrorStore } from '@stratuscode/storage';
import type { TimelineEvent, TimelineAttachment, TokenUsage, ContentPart } from '@stratuscode/shared';
import type { Attachment } from '../components/UnifiedInput';

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
  /** Override reasoning effort (e.g. from keybind) — 'off' disables reasoning */
  reasoningEffortOverride?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
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
  sessionTokens: TokenUsage | undefined;
  contextUsage: { used: number; limit: number; percent: number };
  contextStatus: string | null;
  tokens: TokenUsage;
  sessionId: string | undefined;
  planExitProposed: boolean;
  sendMessage: (content: string, agentOverride?: string, options?: SendMessageOptions, attachments?: Attachment[]) => Promise<void>;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  abort: () => void;
  clear: () => void;
  resetPlanExit: () => void;
}

// ============================================
// Codex Token Refresh
// ============================================

const CODEX_ISSUER = 'https://auth.openai.com';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const refreshPromises = new Map<string, Promise<void>>();

async function refreshCodexToken(refreshToken: string): Promise<{ access: string; refresh: string; expires: number } | null> {
  try {
    const resp = await fetch(`${CODEX_ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CODEX_CLIENT_ID,
      }).toString(),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { access_token: string; refresh_token: string; expires_in?: number };
    return {
      access: data.access_token,
      refresh: data.refresh_token,
      expires: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  } catch {
    return null;
  }
}

/**
 * Ensure Codex access token is fresh. Mutates config in place if refreshed.
 *
 * Note: Disk writes are not synchronized across processes. If running multiple
 * TUI instances, each maintains its own in-memory token cache; the refresh
 * token flow is inexpensive so this is an acceptable limitation.
 */
async function ensureCodexToken(config: StratusCodeConfig, providerOverride?: string): Promise<void> {
  const key = providerOverride || 'openai-codex';
  const p = config.providers?.[key];
  const auth = p?.auth;
  if (!p || !auth || auth.type !== 'oauth') return;
  if (!p.baseUrl?.includes('chatgpt.com/backend-api/codex')) return;
  if (auth.expires > Date.now() + 60_000) return; // still valid (60s margin)

  const existing = refreshPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const refreshed = await refreshCodexToken(auth.refresh);
      if (!refreshed) return;

      // Update in-memory config
      p.apiKey = refreshed.access;
      auth.access = refreshed.access;
      auth.refresh = refreshed.refresh;
      auth.expires = refreshed.expires;

      // Persist to disk
      try {
        const os = await import('os');
        const configPath = path.join(os.default.homedir(), '.stratuscode', 'config.json');
        const diskConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (diskConfig.providers?.[key]) {
          diskConfig.providers[key].apiKey = refreshed.access;
          diskConfig.providers[key].auth.access = refreshed.access;
          diskConfig.providers[key].auth.refresh = refreshed.refresh;
          diskConfig.providers[key].auth.expires = refreshed.expires;
          fs.writeFileSync(configPath, JSON.stringify(diskConfig, null, 2));
        }
      } catch {
        // Non-fatal: token is refreshed in memory even if disk write fails
      }
    } finally {
      refreshPromises.delete(key);
    }
  })();

  refreshPromises.set(key, promise);
  return promise;
}

// ============================================
// Config Conversion
// ============================================

// Model context window lookup (shared between toSageConfig and useChat)
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5-mini': 128_000,
  'gpt-4o': 128_000,
  'o3-mini': 128_000,
  'gpt-5.2-codex': 272_000,
  'gpt-5.1-codex': 128_000,
  'gpt-5.1-codex-max': 128_000,
  'gpt-5.1-codex-mini': 128_000,
  'gpt-5-codex': 400_000,
  'codex-mini': 200_000,
  'kimi-k2.5-free': 128_000,
  'minimax-m2.1-free': 128_000,
  'trinity-large-preview-free': 128_000,
  'glm-4.7-free': 128_000,
  'big-pickle': 128_000,
};

/**
 * Convert StratusCode config to SAGE config format
 */
function toSageConfig(
  config: StratusCodeConfig,
  modelOverride?: string,
  providerOverride?: string,
  sessionId?: string,
  reasoningEffortOverride?: 'off' | 'minimal' | 'low' | 'medium' | 'high',
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
    type: config.provider.type as 'responses-api' | 'chat-completions' | undefined,
    headers: config.provider.headers,
  };

  if (providerOverride && config.providers?.[providerOverride]) {
    const p = config.providers[providerOverride]!;
    effectiveProvider = {
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      type: p.type as 'responses-api' | 'chat-completions' | undefined,
      headers: p.headers,
    };
  }

  // Codex: strip trailing /responses from baseUrl (SAGE appends it)
  // and inject required headers matching OpenCode's Codex plugin
  if (effectiveProvider.baseUrl?.includes('chatgpt.com/backend-api/codex')) {
    effectiveProvider.baseUrl = effectiveProvider.baseUrl
      .replace(/\/responses\/?$/, '')
      .replace(/\/$/, '');
    effectiveProvider.headers = {
      ...effectiveProvider.headers,
      'originator': 'opencode',
      'User-Agent': `stratuscode/0.1.0 (${process.platform} ${process.arch})`,
      'session_id': sessionId || `sc-${Date.now()}`,
    };
  }

  // Inject OpenCode Zen per-request headers (session, request, project)
  // so Zen's trial limiter correctly identifies the session.
  if (effectiveProvider.baseUrl?.includes('opencode.ai/zen')) {
    effectiveProvider.headers = {
      ...effectiveProvider.headers,
      'x-opencode-session': sessionId || `sc-${Date.now()}`,
      'x-opencode-request': `req-${Date.now()}`,
      'x-opencode-project': 'stratuscode',
    };
  }

  // Determine reasoning effort: keybind override > explicit config > auto-detect from model
  const effectiveModel = modelOverride || config.model;
  const supportsReasoning = modelSupportsReasoning(effectiveModel);
  const reasoningEffort = reasoningEffortOverride === 'off'
    ? undefined
    : (reasoningEffortOverride ?? config.reasoningEffort ?? (supportsReasoning ? 'medium' : undefined));

  const contextWindow = MODEL_CONTEXT_WINDOWS[effectiveModel] ?? 128_000;

  return {
    model: effectiveModel,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    parallelToolCalls: config.parallelToolCalls,
    enableReasoningEffort: !!reasoningEffort,
    reasoningEffort,
    provider: effectiveProvider,
    agent: {
      name: config.agent.name,
      maxDepth: config.agent.maxDepth,
      toolTimeout: config.agent.toolTimeout,
      maxToolResultSize: config.agent.maxToolResultSize,
    },
    context: {
      enabled: true,
      contextWindow,
      maxResponseTokens: config.maxTokens ?? 16_384,
      summary: {
        enabled: true,
        model: effectiveModel,
        targetTokens: 500,
      },
      errorMemory: {
        enabled: true,
        scope: null, // scope resolved from toolMetadata.projectDir in SAGE
      },
    },
    errorMemoryStore: new SQLiteErrorStore(),
  };
}

// ============================================
// Hook
// ============================================

export function useChat(options: UseChatOptions): UseChatReturn {
  const { projectDir, config, agent, modelOverride, providerOverride, reasoningEffortOverride } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [tokens, setTokens] = useState<TokenUsage>({ input: 0, output: 0 });
  const [sessionTokens, setSessionTokens] = useState<TokenUsage | undefined>(undefined);
  const [contextUsage, setContextUsage] = useState({ used: 0, limit: 128000, percent: 0 });
  const [contextStatus, setContextStatus] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [planExitProposed, setPlanExitProposed] = useState(false);

  const registryRef = useRef<ToolRegistry | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const actionIdRef = useRef(0);
  const timelineEventsRef = useRef<TimelineEvent[]>([]);
  const reasoningEventIdRef = useRef<string | null>(null);
  const textEventIdRef = useRef<string | null>(null);
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

  // Model-aware context window lookup (prompt_tokens limit, not response tokens)
  const getContextWindow = useCallback(() => {
    const model = modelOverride || config.model;
    return MODEL_CONTEXT_WINDOWS[model] ?? 128_000;
  }, [modelOverride, config.model]);

  // SAGE context engine: persist summary state across turns
  const existingSummaryRef = useRef<any>(undefined);

  // Track the last API call's prompt_tokens (= current context window occupancy)
  const lastPromptTokensRef = useRef<number>(0);

  const computeContextUsage = useCallback(
    (promptTokens: number) => {
      lastPromptTokensRef.current = promptTokens;
      const limit = getContextWindow();
      const percent = Math.min(99, Math.round((promptTokens / limit) * 100));
      setContextUsage({ used: promptTokens, limit, percent });
    },
    [getContextWindow]
  );

  const pushEvent = useCallback(
    (event: TimelineEvent) => {
      timelineEventsRef.current = [...timelineEventsRef.current, event];
      setTimelineEvents([...timelineEventsRef.current]);
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, agentOverride?: string, options?: SendMessageOptions, attachments?: Attachment[]) => {
      if (isLoading) return;

      setError(null);
      setIsLoading(true);
      timelineEventsRef.current = [...timelineEventsRef.current];

      // Expand @file mentions before sending
      const expandedContent = expandMentions(content, projectDir);

      // Build message content — use ContentPart[] when attachments are present
      let messageContent: string | ContentPart[];
      if (attachments && attachments.length > 0) {
        const parts: ContentPart[] = [
          { type: 'text', text: expandedContent },
          ...attachments.map(a => ({
            type: 'image' as const,
            imageUrl: `data:${a.mime};base64,${a.data}`,
          })),
        ];
        messageContent = parts;
      } else {
        messageContent = expandedContent;
      }

      // Add user message (show original content in UI, send expanded to LLM)
      const userMsg: Message = { role: 'user', content }; // Display original
      const newMessages = [...messagesRef.current, userMsg];
      messagesRef.current = newMessages;
      setMessages([...newMessages]);

      // Build timeline attachment metadata for display and persistence
      const timelineAttachments: TimelineAttachment[] | undefined =
        attachments && attachments.length > 0
          ? attachments.map(a => ({
              type: 'image' as const,
              mime: a.mime,
              data: a.data,
            }))
          : undefined;

      // Persist user message
      const sid = getSessionId();
      const userMessageId = createMessage(sid, 'user', content);
      const assistantMessageId = createMessage(sid, 'assistant', '');
      const userEvent = createTimelineEvent(
        sid, 'user', content,
        { ...(timelineAttachments ? { attachments: timelineAttachments } : {}) },
        userMessageId
      );
      timelineEventsRef.current = [...timelineEventsRef.current, userEvent];
      setTimelineEvents([...timelineEventsRef.current]);
      persistSessionUpdate(sid, { status: 'running' });
      reasoningEventIdRef.current = null;

      // Create abort controller
      abortRef.current = new AbortController();

      const flushReasoningEvent = () => {
        const pending = streamingReasoningRef.current;
        if (!pending) return;
        const id = reasoningEventIdRef.current;
        if (id) {
          const idx = timelineEventsRef.current.findIndex(e => e.id === id);
          if (idx !== -1) {
            timelineEventsRef.current[idx] = { ...timelineEventsRef.current[idx]!, content: pending, streaming: false };
            setTimelineEvents([...timelineEventsRef.current]);
          }
        } else {
          const ev = createTimelineEvent(sid, 'reasoning', pending, { streaming: false }, assistantMessageId);
          reasoningEventIdRef.current = ev.id;
          pushEvent(ev);
        }
        streamingReasoningRef.current = '';
        reasoningEventIdRef.current = null;
      };

      const flushTextEvent = (final = true) => {
        const pending = streamingContentRef.current;
        if (!pending) return;
        const id = textEventIdRef.current;
        if (id) {
          // Update existing streaming text event
          const idx = timelineEventsRef.current.findIndex(e => e.id === id);
          if (idx !== -1) {
            timelineEventsRef.current[idx] = { ...timelineEventsRef.current[idx]!, content: pending, streaming: !final };
            setTimelineEvents([...timelineEventsRef.current]);
          }
        } else {
          // Create new streaming text event
          const ev = createTimelineEvent(sid, 'assistant', pending, { streaming: !final }, assistantMessageId);
          textEventIdRef.current = ev.id;
          pushEvent(ev);
        }
        if (final) {
          streamingContentRef.current = '';
          textEventIdRef.current = null;
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
        let systemPrompt = buildSystemPrompt({
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

        // Replace last message content with expanded mentions / attachments for LLM
        if (messageContent !== content) {
          const lastIdx = messagesForLLM.length - 1;
          messagesForLLM[lastIdx] = {
            ...messagesForLLM[lastIdx]!,
            content: messageContent,
          };
        }

        // Helper to append text to a message's content (handles both string and ContentPart[])
        const appendToLastMessage = (suffix: string) => {
          const lastIdx = messagesForLLM.length - 1;
          const lastMsg = messagesForLLM[lastIdx]!;
          if (typeof lastMsg.content === 'string') {
            messagesForLLM[lastIdx] = { ...lastMsg, content: lastMsg.content + '\n\n' + suffix };
          } else if (Array.isArray(lastMsg.content)) {
            const textPart = lastMsg.content.find(p => p.type === 'text');
            if (textPart && textPart.text != null) {
              textPart.text += '\n\n' + suffix;
            } else {
              lastMsg.content.push({ type: 'text', text: suffix });
            }
            messagesForLLM[lastIdx] = { ...lastMsg, content: [...lastMsg.content] };
          }
        };

        // Plan mode: ensure plan file exists and inject plan mode reminder
        if (effectiveAgentName === 'plan') {
          const planFilePath = ensurePlanFile(projectDir, sid);
          appendToLastMessage(PLAN_MODE_REMINDER(planFilePath));
        }

        // Build-switch: inject reminder when transitioning from plan to build
        if (options?.buildSwitch && previousAgentRef.current === 'plan') {
          const planFilePath = getPlanFilePath(projectDir, sid);
          appendToLastMessage(BUILD_SWITCH_REMINDER(planFilePath));
        }

        // Track agent for next transition detection
        previousAgentRef.current = effectiveAgentName;

        // Start streaming flush interval — periodically push accumulated text to timeline
        streamingContentRef.current = '';
        streamingReasoningRef.current = '';
        lastStreamingTypeRef.current = null;
        textEventIdRef.current = null;
        streamingFlushRef.current = setInterval(() => {
          // Flush accumulated text to a streaming timeline event
          if (streamingContentRef.current && lastStreamingTypeRef.current === 'text') {
            flushTextEvent(false);
          }
        }, STREAMING_FLUSH_INTERVAL);

        // Refresh OAuth tokens if expired before making API calls
        await ensureCodexToken(config, providerOverride);

        // Run through SAGE's processDirectly - the only agentic engine
        const result = await processDirectly({
          systemPrompt,
          messages: messagesForLLM,
          tools: registry,
          config: toSageConfig(config, modelOverride, providerOverride, sid, reasoningEffortOverride),
          abort: abortRef.current.signal,
          sessionId: sid,
          existingSummary: existingSummaryRef.current,
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
              if (!reasoningEventIdRef.current) {
                const ev = createTimelineEvent(sid, 'reasoning', streamingReasoningRef.current, { streaming: true }, assistantMessageId);
                reasoningEventIdRef.current = ev.id;
                pushEvent(ev);
              } else {
                const idx = timelineEventsRef.current.findIndex(e => e.id === reasoningEventIdRef.current);
                if (idx !== -1) {
                  timelineEventsRef.current[idx] = { ...timelineEventsRef.current[idx]!, content: streamingReasoningRef.current, streaming: true };
                  setTimelineEvents([...timelineEventsRef.current]);
                }
              }
            },
            onToolCall: (tc: ToolCall) => {
              // Flush any accumulated reasoning/text before the tool call
              if (lastStreamingTypeRef.current === 'reasoning' && streamingReasoningRef.current) {
                flushReasoningEvent();
              }
              if (lastStreamingTypeRef.current === 'text' && streamingContentRef.current) {
                flushTextEvent();
              }
              lastStreamingTypeRef.current = null;

              try { createToolCall(assistantMessageId, sid, tc); } catch { /* ignore DB errors — don't crash the agent loop */ }
              const toolEvent = createTimelineEvent(
                sid,
                'tool_call',
                tc.function.arguments, // store arguments so Chat can show file paths, commands, etc.
                {
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  status: 'running',
                },
                assistantMessageId
              );
              pushEvent(toolEvent);
            },
            onToolResult: (tc: ToolCall, result: string) => {
              try { updateToolCallResult(tc.id, result, 'completed'); } catch { /* ignore DB errors */ }
              const resultEvent = createTimelineEvent(
                sid,
                'tool_result',
                result.slice(0, 2000),
                {
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  status: 'completed',
                },
                assistantMessageId
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
            onStatusChange: (status: string) => {
              if (status === 'context_compacting') {
                setContextStatus('Compacting...');
              } else if (status === 'context_summarized') {
                setContextStatus('Summarized');
              } else if (status === 'context_truncated') {
                setContextStatus('Truncated');
              }
              // Don't clear on 'running', 'tool_loop', or 'completed' —
              // onContextManaged sets a 15s auto-clear timer instead
            },
            onContextManaged: (event: { wasTruncated: boolean; wasSummarized: boolean; messagesRemoved: number; tokensBefore: number; tokensAfter: number }) => {
              if (event.wasSummarized) {
                setContextStatus(`Summarized (${event.messagesRemoved} msgs compacted)`);
              } else if (event.wasTruncated) {
                setContextStatus(`Truncated (${event.messagesRemoved} msgs dropped)`);
              }
              // Auto-clear after enough time for the user to read it
              setTimeout(() => setContextStatus(null), 15000);
            },
            onError: (err: Error) => {
              // Show as inline timeline event rather than global error state,
              // since the agentic loop may recover (e.g. subagent 429 retries).
              pushEvent(createTimelineEvent(sid, 'status', `Error: ${err.message}`, {}, assistantMessageId));
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
        reasoningEventIdRef.current = null;

        // Capture SAGE context summary for next turn
        if (result.newSummary) {
          existingSummaryRef.current = result.newSummary;
        }

        // Persist (no final assistant timeline event; streamed text already captured)
        const tokenUsage: TokenUsage = {
          input: result.inputTokens,
          output: result.outputTokens,
          context: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
          model: effectiveModelId,
        };
        updateMessage(assistantMessageId, result.content, tokenUsage);
        persistSessionUpdate(sid, { status: 'completed' });

        // Update tokens
        setTokens(prev => ({
          input: prev.input + result.inputTokens,
          output: prev.output + result.outputTokens,
        }));
        const totals = getSessionTokenTotals(sid);
        setSessionTokens(totals);
        computeContextUsage(result.lastInputTokens ?? result.inputTokens);
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
        updateMessage(assistantMessageId, typeof errorMsg.content === 'string' ? errorMsg.content : '');

        pushEvent(createTimelineEvent(sid, 'status', `Error: ${errorMessage}`, {}, assistantMessageId));
        persistSessionUpdate(sid, { status: 'failed', error: errorMessage });
      } finally {
        // Stop streaming flush interval
        if (streamingFlushRef.current) {
          clearInterval(streamingFlushRef.current);
          streamingFlushRef.current = null;
        }

        // Always refresh session token totals from DB (catches partial runs too)
        try {
          const totals = getSessionTokenTotals(sid);
          if (totals.input > 0 || totals.output > 0) {
            setSessionTokens(totals);
            setTokens(totals);
            // Don't override context usage here — it was already set from
            // the last API call's prompt_tokens (actual context window occupancy).
          }
        } catch { /* ignore DB errors here */ }

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
    setSessionTokens(undefined);
    setSessionId(undefined);
    sessionIdRef.current = undefined;
    registryRef.current = null;
    setPlanExitProposed(false);
    setContextUsage({ used: 0, limit: 128000, percent: 0 });
    setContextStatus(null);
    existingSummaryRef.current = undefined;
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
        setTokens(totals);
        setSessionTokens(totals);
        // Estimate context usage from the last assistant message's input tokens
        // (the prompt_tokens from that call = context window occupancy at that point).
        const lastAssistant = [...storedMessages].reverse().find(m => m.role === 'assistant' && m.tokenUsage?.input);
        if (lastAssistant?.tokenUsage?.input) {
          computeContextUsage(lastAssistant.tokenUsage.input);
        }
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
    contextStatus,
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
