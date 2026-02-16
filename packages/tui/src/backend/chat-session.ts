/**
 * ChatSession
 *
 * Non-React wrapper around the SAGE agent loop used by the TUI.
 * Preserves the existing behavior from useChat while exposing
 * events for UI backends (Ink or Ratatui).
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { StratusCodeConfig, AgentInfo, Message, ToolCall, TimelineEvent, TokenUsage, ContentPart, TimelineAttachment } from '@stratuscode/shared';
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
import { processDirectly, type ToolRegistry } from '@willebrew/sage-core';
import { SQLiteErrorStore } from '@stratuscode/storage';

export interface ChatSessionOptions {
  projectDir: string;
  config: StratusCodeConfig;
  agent: string;
  modelOverride?: string;
  providerOverride?: string;
  reasoningEffortOverride?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
}

export interface ChatSessionState {
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
  agent: string;
  modelOverride?: string;
  providerOverride?: string;
  reasoningEffortOverride?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
}

export interface SendMessageOptions {
  buildSwitch?: boolean;
}

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

async function ensureCodexToken(config: StratusCodeConfig, providerOverride?: string): Promise<void> {
  const key = providerOverride || 'openai-codex';
  const p = config.providers?.[key];
  const auth = p?.auth;
  if (!p || !auth || auth.type !== 'oauth') return;
  if (!p.baseUrl?.includes('chatgpt.com/backend-api/codex')) return;
  if (auth.expires > Date.now() + 60_000) return;

  const existing = refreshPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const refreshed = await refreshCodexToken(auth.refresh);
      if (!refreshed) return;

      p.apiKey = refreshed.access;
      auth.access = refreshed.access;
      auth.refresh = refreshed.refresh;
      auth.expires = refreshed.expires;

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
        // ignore
      }
    } finally {
      refreshPromises.delete(key);
    }
  })();

  refreshPromises.set(key, promise);
  return promise;
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5-mini': 128_000,
  'o3-mini': 128_000,
  'gpt-5.3-codex': 272_000,
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
  // OpenRouter models
  'anthropic/claude-sonnet-4': 200_000,
  'anthropic/claude-3.5-sonnet': 200_000,
  'google/gemini-2.5-pro-preview': 1_000_000,
  'google/gemini-2.5-flash-preview': 1_000_000,
  'deepseek/deepseek-r1': 128_000,
  'deepseek/deepseek-chat-v3': 128_000,
  'openai/gpt-4o': 128_000,
  'openai/o3-mini': 128_000,
  'meta-llama/llama-4-maverick': 128_000,
  'moonshotai/kimi-k2': 128_000,
};

export function toSageConfig(
  config: StratusCodeConfig,
  modelOverride?: string,
  providerOverride?: string,
  sessionId?: string,
  reasoningEffortOverride?: 'off' | 'minimal' | 'low' | 'medium' | 'high',
) {
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

  // Auto-resolve the named provider from the model when no explicit override
  // is set.  This ensures Codex models always use the openai-codex provider
  // (with its OAuth access token), OpenRouter models use the openrouter
  // provider, etc., even when the default config.provider points elsewhere.
  const effectiveModel = modelOverride || config.model;
  if (!providerOverride && config.providers) {
    const m = effectiveModel.toLowerCase();

    // Codex models → openai-codex provider (OAuth tokens)
    if (m.includes('codex')) {
      const codexProvider = config.providers['openai-codex'];
      if (codexProvider) {
        effectiveProvider = {
          apiKey: codexProvider.apiKey || (codexProvider as any).auth?.access,
          baseUrl: codexProvider.baseUrl,
          type: codexProvider.type as 'responses-api' | 'chat-completions' | undefined,
          headers: codexProvider.headers,
        };
      }
    }

    // OpenRouter models (vendor/model format, e.g. "anthropic/claude-sonnet-4")
    else if (effectiveModel.includes('/')) {
      const orProvider = config.providers['openrouter'];
      if (orProvider) {
        effectiveProvider = {
          apiKey: orProvider.apiKey,
          baseUrl: orProvider.baseUrl,
          type: orProvider.type as 'responses-api' | 'chat-completions' | undefined,
          headers: orProvider.headers,
        };
      }
    }

    // OpenCode Zen free models
    else if (m.includes('-free') || m === 'big-pickle') {
      const zenProvider = config.providers['opencode-zen'];
      if (zenProvider) {
        effectiveProvider = {
          apiKey: zenProvider.apiKey,
          baseUrl: zenProvider.baseUrl,
          type: zenProvider.type as 'responses-api' | 'chat-completions' | undefined,
          headers: zenProvider.headers,
        };
      }
    }
  }

  if (
    (effectiveProvider.baseUrl?.includes('localhost') ||
     effectiveProvider.baseUrl?.includes('127.0.0.1')) &&
    !effectiveProvider.apiKey
  ) {
    effectiveProvider.apiKey = 'ollama';
  }

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

  if (effectiveProvider.baseUrl?.includes('opencode.ai/zen')) {
    effectiveProvider.headers = {
      ...effectiveProvider.headers,
      'x-opencode-session': sessionId || `sc-${Date.now()}`,
      'x-opencode-request': `req-${Date.now()}`,
      'x-opencode-project': 'stratuscode',
    };
  }

  if (effectiveProvider.baseUrl?.includes('openrouter.ai')) {
    effectiveProvider.headers = {
      ...effectiveProvider.headers,
      'HTTP-Referer': 'https://stratuscode.dev/',
      'X-Title': 'StratusCode',
    };
  }

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
        scope: null,
      },
    },
    errorMemoryStore: new SQLiteErrorStore(),
  };
}

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

function PLAN_MODE_REMINDER(planFilePath: string): string {
  return `<system-reminder>\nYou are in PLAN mode. Follow this workflow:\n\n## Plan Workflow\n\n### Phase 1: Initial Understanding\nGoal: Understand the user's request by reading code and asking clarifying questions.\n\n1. Explore the codebase to understand the relevant code and existing patterns.\n2. Use the delegate_to_explore tool to search the codebase efficiently.\n3. After exploring, use the **question** tool to clarify ambiguities in the user's request.\n\n### Phase 2: Design\nGoal: Design an implementation approach based on your exploration and the user's answers.\n\n1. Synthesize what you learned from exploration and user answers.\n2. Consider trade-offs between approaches.\n3. Use the **question** tool to clarify any remaining decisions with the user.\n\n### Phase 3: Create Plan\nGoal: Write a structured plan using the todowrite tool AND the plan file.\n\n1. Create a clear, ordered todo list capturing each implementation step using todowrite.\n2. Write a detailed plan to the plan file at: ${planFilePath}\n   This is the ONLY file you are allowed to edit in plan mode.\n3. The plan file should contain: summary, approach, file list, and implementation order.\n4. Keep the plan concise but detailed enough to execute.\n\n### Phase 4: Call plan_exit\nAt the very end of your turn, once you have asked the user questions and are satisfied with your plan, call plan_exit to indicate you are done planning.\n\n### Phase 5: Iteration\nIf the user asks follow-up questions or requests changes, update both the todo list and plan file accordingly, then call plan_exit again.\n\n**Critical rule:** Your turn should ONLY end with either asking the user a question (via the question tool) or calling plan_exit. Do not stop for any other reason.\n\n## Question Tool Usage\n\n**You MUST use the question tool whenever you need the user to make a choice.** Do NOT write questions as plain text in your response — the question tool renders an interactive UI.\n\nUse the question tool for:\n- Choosing between approaches or technologies\n- Selecting features, pages, or components\n- Confirming preferences (styling, deployment, etc.)\n- Any decision with a finite set of options\n\n**Important:** Use the question tool to clarify requirements/approach. Use plan_exit to request plan approval. Do NOT use the question tool to ask \"Is this plan okay?\" — that is what plan_exit does.\n\nNOTE: At any point in this workflow you should feel free to ask the user questions or clarifications via the question tool. Don't make large assumptions about user intent. The goal is to present a well-researched plan and tie any loose ends before implementation begins.\n</system-reminder>`;
}

function BUILD_SWITCH_REMINDER(planFilePath: string): string {
  return `<system-reminder>\nYour operational mode has changed from plan to build.\nYou are no longer in read-only mode.\nYou are permitted to make file changes, run shell commands, and utilize your full arsenal of tools.\n\nA plan file exists at: ${planFilePath}\nYou should execute on the plan defined within it and in the todo list.\nRead the plan file first, then work through each task, updating status as you go.\n</system-reminder>`;
}

export function expandMentions(content: string, projectDir: string): string {
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
        const truncated = fileContent.length > 10000
          ? fileContent.slice(0, 10000) + '\n... (truncated)'
          : fileContent;
        context += `<file path="${mention}">\n${truncated}\n</file>\n\n`;
      }
    } catch {
      // ignore
    }
  }

  if (context) {
    return context + content;
  }
  return content;
}

export class ChatSession extends EventEmitter {
  private options: ChatSessionOptions;
  private state: ChatSessionState;

  private registryRef: ToolRegistry | null = null;
  private abortRef: AbortController | null = null;
  private sessionIdRef: string | undefined;
  private messagesRef: Message[] = [];
  private timelineEventsRef: TimelineEvent[] = [];
  private reasoningEventIdRef: string | null = null;
  private textEventIdRef: string | null = null;
  private previousAgentRef: string;
  private existingSummaryRef: any = undefined;
  private lastPromptTokensRef = 0;

  private streamingContentRef = '';
  private streamingReasoningRef = '';
  private streamingFlushRef: ReturnType<typeof setInterval> | null = null;
  private lastStreamingTypeRef: 'text' | 'reasoning' | null = null;
  private readonly STREAMING_FLUSH_INTERVAL = 75;
  private lastStreamingFlushAt = 0;
  private streamingTokenCount = 0;

  constructor(options: ChatSessionOptions) {
    super();
    this.options = { ...options };
    this.state = {
      messages: [],
      isLoading: false,
      error: null,
      timelineEvents: [],
      sessionTokens: undefined,
      contextUsage: { used: 0, limit: 128000, percent: 0 },
      contextStatus: null,
      tokens: { input: 0, output: 0 },
      sessionId: undefined,
      planExitProposed: false,
      agent: options.agent,
      modelOverride: options.modelOverride,
      providerOverride: options.providerOverride,
      reasoningEffortOverride: options.reasoningEffortOverride,
    };
    this.previousAgentRef = options.agent;
  }

  getState(): ChatSessionState {
    return {
      ...this.state,
      messages: [...this.state.messages],
      timelineEvents: [...this.state.timelineEvents],
      tokens: { ...this.state.tokens },
      sessionTokens: this.state.sessionTokens ? { ...this.state.sessionTokens } : undefined,
      contextUsage: { ...this.state.contextUsage },
    };
  }

  ensureSessionId(): string {
    return this.getSessionId();
  }

  private emitState(): void {
    this.emit('state', this.getState());
  }

  private emitTimelineEvent(event: TimelineEvent): void {
    this.emit('timeline_event', event);
  }

  private emitTokens(): void {
    this.emit('tokens_update', {
      tokens: this.state.tokens,
      sessionTokens: this.state.sessionTokens,
      contextUsage: this.state.contextUsage,
    });
  }

  private emitContextStatus(): void {
    this.emit('context_status', this.state.contextStatus);
  }

  private emitPlanExit(): void {
    this.emit('plan_exit_proposed', this.state.planExitProposed);
  }

  private emitError(message: string): void {
    this.emit('error', message);
  }

  private setState(partial: Partial<ChatSessionState>): void {
    this.state = { ...this.state, ...partial };
    this.emitState();
  }

  private pushEvent(event: TimelineEvent): void {
    this.timelineEventsRef = [...this.timelineEventsRef, event];
    this.setState({ timelineEvents: [...this.timelineEventsRef] });
    this.emitTimelineEvent(event);
  }

  private getRegistry(): ToolRegistry {
    if (!this.registryRef) {
      const registry = createStratusCodeToolRegistry();
      registerBuiltInTools(registry);
      this.registryRef = registry;
    }
    return this.registryRef;
  }

  private getSessionId(): string {
    if (!this.sessionIdRef) {
      const session = persistSession(this.options.projectDir);
      this.sessionIdRef = session.id;
      this.setState({ sessionId: session.id });
      this.emit('session_changed', session.id);
    }
    return this.sessionIdRef;
  }

  private getAgent(): AgentInfo {
    return BUILT_IN_AGENTS[this.options.agent] || BUILT_IN_AGENTS.build!;
  }

  private getContextWindow(): number {
    const model = this.options.modelOverride || this.options.config.model;
    return MODEL_CONTEXT_WINDOWS[model] ?? 128_000;
  }

  private computeContextUsage(promptTokens: number): void {
    this.lastPromptTokensRef = promptTokens;
    const limit = this.getContextWindow();
    const percent = Math.min(99, Math.round((promptTokens / limit) * 100));
    this.setState({ contextUsage: { used: promptTokens, limit, percent } });
    this.emitTokens();
  }

  setAgent(agent: string): void {
    this.options.agent = agent;
    this.setState({ agent });
  }

  setModelOverride(model?: string): void {
    this.options.modelOverride = model;
    this.setState({ modelOverride: model });
  }

  setProviderOverride(provider?: string): void {
    this.options.providerOverride = provider;
    this.setState({ providerOverride: provider });
  }

  setReasoningEffortOverride(reasoning?: 'off' | 'minimal' | 'low' | 'medium' | 'high'): void {
    this.options.reasoningEffortOverride = reasoning;
    this.setState({ reasoningEffortOverride: reasoning });
  }

  async sendMessage(content: string, agentOverride?: string, options?: SendMessageOptions, attachments?: { type: 'image'; data: string; mime?: string }[]): Promise<void> {
    if (this.state.isLoading) return;

    this.setState({ error: null, isLoading: true });

    const expandedContent = expandMentions(content, this.options.projectDir);

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

    const userMsg: Message = { role: 'user', content };
    const newMessages = [...this.messagesRef, userMsg];
    this.messagesRef = newMessages;
    this.setState({ messages: [...newMessages] });

    const timelineAttachments: TimelineAttachment[] | undefined =
      attachments && attachments.length > 0
        ? attachments.map(a => ({ type: 'image' as const, mime: a.mime, data: a.data }))
        : undefined;

    const sid = this.getSessionId();
    const userMessageId = createMessage(sid, 'user', content);
    const assistantMessageId = createMessage(sid, 'assistant', '');
    const userEvent = createTimelineEvent(
      sid,
      'user',
      content,
      { ...(timelineAttachments ? { attachments: timelineAttachments } : {}) },
      userMessageId
    );
    this.timelineEventsRef = [...this.timelineEventsRef, userEvent];
    this.setState({ timelineEvents: [...this.timelineEventsRef] });
    this.emitTimelineEvent(userEvent);
    persistSessionUpdate(sid, { status: 'running' });
    this.reasoningEventIdRef = null;

    this.abortRef = new AbortController();

    const flushReasoningEvent = () => {
      const pending = this.streamingReasoningRef;
      if (!pending) return;
      const id = this.reasoningEventIdRef;
      if (id) {
        const idx = this.timelineEventsRef.findIndex(e => e.id === id);
        if (idx !== -1) {
          this.timelineEventsRef[idx] = { ...this.timelineEventsRef[idx]!, content: pending, streaming: false };
          this.setState({ timelineEvents: [...this.timelineEventsRef] });
        }
      } else {
        const ev = createTimelineEvent(sid, 'reasoning', pending, { streaming: false }, assistantMessageId);
        this.reasoningEventIdRef = ev.id;
        this.pushEvent(ev);
      }
      this.streamingReasoningRef = '';
      this.reasoningEventIdRef = null;
    };

    const flushTextEvent = (final = true) => {
      const pending = this.streamingContentRef;
      if (!pending) return;
      const id = this.textEventIdRef;
      if (id) {
        const idx = this.timelineEventsRef.findIndex(e => e.id === id);
        if (idx !== -1) {
          this.timelineEventsRef[idx] = { ...this.timelineEventsRef[idx]!, content: pending, streaming: !final };
          this.setState({ timelineEvents: [...this.timelineEventsRef] });
        }
      } else {
        const ev = createTimelineEvent(sid, 'assistant', pending, { streaming: !final }, assistantMessageId);
        this.textEventIdRef = ev.id;
        this.pushEvent(ev);
      }
      if (final) {
        this.streamingContentRef = '';
        this.textEventIdRef = null;
      }
    };

    try {
      const registry = this.getRegistry();
      const effectiveAgentName = agentOverride || this.options.agent;
      const currentAgent = agentOverride
        ? (BUILT_IN_AGENTS[agentOverride] || BUILT_IN_AGENTS.build!)
        : this.getAgent();

      const effectiveModelId = this.options.modelOverride || this.options.config.model;

      let systemPrompt = buildSystemPrompt({
        agent: currentAgent,
        tools: registry.toAPIFormat().map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        projectDir: this.options.projectDir,
        customInstructions: this.options.config.agent.name ? [`Agent: ${this.options.config.agent.name}`] : undefined,
        modelId: effectiveModelId,
      });

      let messagesForLLM = [...newMessages];

      if (messageContent !== content) {
        const lastIdx = messagesForLLM.length - 1;
        messagesForLLM[lastIdx] = {
          ...messagesForLLM[lastIdx]!,
          content: messageContent,
        };
      }

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

      if (effectiveAgentName === 'plan') {
        const planFilePath = ensurePlanFile(this.options.projectDir, sid);
        appendToLastMessage(PLAN_MODE_REMINDER(planFilePath));
      }

      if (options?.buildSwitch && this.previousAgentRef === 'plan') {
        const planFilePath = getPlanFilePath(this.options.projectDir, sid);
        appendToLastMessage(BUILD_SWITCH_REMINDER(planFilePath));
      }

      this.previousAgentRef = effectiveAgentName;

      this.streamingContentRef = '';
      this.streamingReasoningRef = '';
      this.lastStreamingTypeRef = null;
      this.textEventIdRef = null;
      this.lastStreamingFlushAt = Date.now();
      this.streamingTokenCount = 0;
      this.streamingFlushRef = setInterval(() => {
        if (this.streamingContentRef && this.lastStreamingTypeRef === 'text') {
          flushTextEvent(false);
        }
      }, this.STREAMING_FLUSH_INTERVAL);

      await ensureCodexToken(this.options.config, this.options.providerOverride);

      const result: any = await processDirectly({
        systemPrompt,
        messages: messagesForLLM,
        tools: registry,
        config: toSageConfig(this.options.config, this.options.modelOverride, this.options.providerOverride, sid, this.options.reasoningEffortOverride),
        abort: this.abortRef.signal,
        sessionId: sid,
        existingSummary: this.existingSummaryRef,
        toolMetadata: {
          projectDir: this.options.projectDir,
          abort: this.abortRef.signal,
        },
        callbacks: {
          onToken: (token: string) => {
            if (this.lastStreamingTypeRef === 'reasoning' && this.streamingReasoningRef) {
              flushReasoningEvent();
            }
            this.lastStreamingTypeRef = 'text';
            this.streamingContentRef += token;
            this.streamingTokenCount += 1;
            const now = Date.now();
            if (now - this.lastStreamingFlushAt > 50 || this.streamingTokenCount % 8 === 0) {
              flushTextEvent(false);
              this.lastStreamingFlushAt = now;
            }
          },
          onReasoning: (text: string) => {
            if (this.lastStreamingTypeRef === 'text' && this.streamingContentRef) {
              flushTextEvent();
            }
            this.lastStreamingTypeRef = 'reasoning';
            this.streamingReasoningRef += text;
            if (!this.reasoningEventIdRef) {
              const ev = createTimelineEvent(sid, 'reasoning', this.streamingReasoningRef, { streaming: true }, assistantMessageId);
              this.reasoningEventIdRef = ev.id;
              this.pushEvent(ev);
            } else {
              const idx = this.timelineEventsRef.findIndex(e => e.id === this.reasoningEventIdRef);
              if (idx !== -1) {
                this.timelineEventsRef[idx] = { ...this.timelineEventsRef[idx]!, content: this.streamingReasoningRef, streaming: true };
                this.setState({ timelineEvents: [...this.timelineEventsRef] });
              }
            }
          },
          onToolCall: (tc: ToolCall) => {
            if (this.lastStreamingTypeRef === 'reasoning' && this.streamingReasoningRef) {
              flushReasoningEvent();
            }
            if (this.lastStreamingTypeRef === 'text' && this.streamingContentRef) {
              flushTextEvent();
            }
            this.lastStreamingTypeRef = null;

            try { createToolCall(assistantMessageId, sid, tc); } catch { /* ignore */ }
            const toolEvent = createTimelineEvent(
              sid,
              'tool_call',
              tc.function.arguments,
              {
                toolCallId: tc.id,
                toolName: tc.function.name,
                status: 'running',
              },
              assistantMessageId
            );
            this.pushEvent(toolEvent);
          },
          onToolResult: (tc: ToolCall, result: string) => {
            try { updateToolCallResult(tc.id, result, 'completed'); } catch { /* ignore */ }
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
            this.pushEvent(resultEvent);
            try {
              const parsed = JSON.parse(result);
              if (parsed?.error || parsed?.success === false) {
                const idx = this.timelineEventsRef.findIndex(e => e.kind === 'tool_call' && (e as any).toolCallId === tc.id);
                if (idx !== -1) {
                  this.timelineEventsRef[idx] = { ...this.timelineEventsRef[idx]!, status: 'failed' } as TimelineEvent;
                  this.setState({ timelineEvents: [...this.timelineEventsRef] });
                }
              } else {
                const idx = this.timelineEventsRef.findIndex(e => e.kind === 'tool_call' && (e as any).toolCallId === tc.id);
                if (idx !== -1) {
                  this.timelineEventsRef[idx] = { ...this.timelineEventsRef[idx]!, status: 'completed' } as TimelineEvent;
                  this.setState({ timelineEvents: [...this.timelineEventsRef] });
                }
              }
            } catch {
              const idx = this.timelineEventsRef.findIndex(e => e.kind === 'tool_call' && (e as any).toolCallId === tc.id);
              if (idx !== -1) {
                this.timelineEventsRef[idx] = { ...this.timelineEventsRef[idx]!, status: 'completed' } as TimelineEvent;
                this.setState({ timelineEvents: [...this.timelineEventsRef] });
              }
            }
            if (tc.function.name === 'plan_exit') {
              try {
                const parsed = JSON.parse(result);
                if (parsed.proposingExit) {
                  this.setState({ planExitProposed: true });
                  this.emitPlanExit();
                }
              } catch {
                // ignore
              }
            }
          },
          // @ts-expect-error onStepComplete exists on internal AgentLoopCallbacks but not on sage-core AgentCallbacks
          onStepComplete: (_step: number, accumulator: { inputTokens?: number; outputTokens?: number }) => {
            const inputTokens = accumulator.inputTokens ?? 0;
            const outputTokens = accumulator.outputTokens ?? 0;
            this.setState({
              tokens: {
                input: inputTokens,
                output: outputTokens,
              },
            });
            if (inputTokens > 0) {
              this.computeContextUsage(inputTokens);
            } else {
              this.emitTokens();
            }
          },
          onStatusChange: (status: string) => {
            if (status === 'context_compacting') {
              this.setState({ contextStatus: 'Compacting...' });
            } else if (status === 'context_summarized') {
              this.setState({ contextStatus: 'Summarized' });
            } else if (status === 'context_truncated') {
              this.setState({ contextStatus: 'Truncated' });
            }
            this.emitContextStatus();
          },
          onContextManaged: (event: { wasTruncated: boolean; wasSummarized: boolean; messagesRemoved: number; tokensBefore: number; tokensAfter: number }) => {
            if (event.wasSummarized) {
              this.setState({ contextStatus: `Summarized (${event.messagesRemoved} msgs compacted)` });
            } else if (event.wasTruncated) {
              this.setState({ contextStatus: `Truncated (${event.messagesRemoved} msgs dropped)` });
            }
            this.emitContextStatus();
            setTimeout(() => {
              this.setState({ contextStatus: null });
              this.emitContextStatus();
            }, 15000);
          },
          onError: (err: Error) => {
            this.pushEvent(createTimelineEvent(sid, 'status', `Error: ${err.message}`, {}, assistantMessageId));
          },
        },
      });

      const trailingText = this.streamingContentRef;
      const trailingReasoning = this.streamingReasoningRef;
      if (trailingReasoning) flushReasoningEvent();
      if (trailingText) flushTextEvent();
      this.streamingContentRef = '';
      this.streamingReasoningRef = '';

      const lastReasoningIdx = this.timelineEventsRef.map(e => e.kind).lastIndexOf('reasoning');
      if (lastReasoningIdx !== -1) {
        this.timelineEventsRef[lastReasoningIdx] = {
          ...this.timelineEventsRef[lastReasoningIdx]!,
          streaming: false,
        } as TimelineEvent;
        this.setState({ timelineEvents: [...this.timelineEventsRef] });
      }

      if (result.newSummary) {
        this.existingSummaryRef = result.newSummary;
      }

      const tokenUsage: TokenUsage = {
        input: result.inputTokens,
        output: result.outputTokens,
        context: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
        model: effectiveModelId,
      };
      updateMessage(assistantMessageId, result.content, tokenUsage);
      persistSessionUpdate(sid, { status: 'completed' });

      if (result.responseMessages && result.responseMessages.length > 0) {
        this.messagesRef = [...this.messagesRef, ...result.responseMessages];
        this.setState({ messages: [...this.messagesRef] });
      }

      this.setState({
        tokens: {
          input: this.state.tokens.input + result.inputTokens,
          output: this.state.tokens.output + result.outputTokens,
        },
      });
      const totals = getSessionTokenTotals(sid);
      this.setState({ sessionTokens: totals });
      this.computeContextUsage(result.lastInputTokens ?? result.inputTokens);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.setState({ error: errorMessage });
      this.emitError(errorMessage);

      const partialContent = this.streamingContentRef || '';
      const errorMsg: Message = {
        role: 'assistant',
        content: partialContent
          ? `${partialContent}\n\n[Error: ${errorMessage}]`
          : `Error: ${errorMessage}`,
      };
      this.messagesRef = [...this.messagesRef, errorMsg];
      this.setState({ messages: [...this.messagesRef] });
      updateMessage(assistantMessageId, typeof errorMsg.content === 'string' ? errorMsg.content : '');

      this.pushEvent(createTimelineEvent(sid, 'status', `Error: ${errorMessage}`, {}, assistantMessageId));
      persistSessionUpdate(sid, { status: 'failed', error: errorMessage });
    } finally {
      if (this.streamingFlushRef) {
        clearInterval(this.streamingFlushRef);
        this.streamingFlushRef = null;
      }

      try {
        const totals = getSessionTokenTotals(sid);
        if (totals.input > 0 || totals.output > 0) {
          this.setState({ sessionTokens: totals, tokens: totals });
        }
      } catch {
        // ignore
      }

      this.setState({ isLoading: false });
      this.streamingContentRef = '';
      this.streamingReasoningRef = '';
      this.abortRef = null;
    }
  }

  abort(): void {
    this.abortRef?.abort();
    this.setState({ isLoading: false });
  }

  clear(): void {
    this.setState({
      messages: [],
      timelineEvents: [],
      error: null,
      tokens: { input: 0, output: 0 },
      sessionTokens: undefined,
      sessionId: undefined,
      planExitProposed: false,
      contextUsage: { used: 0, limit: 128000, percent: 0 },
      contextStatus: null,
    });
    this.messagesRef = [];
    this.timelineEventsRef = [];
    this.sessionIdRef = undefined;
    this.registryRef = null;
    this.existingSummaryRef = undefined;
  }

  resetPlanExit(): void {
    this.setState({ planExitProposed: false });
    this.emitPlanExit();
  }

  async loadSession(id: string): Promise<void> {
    this.clear();

    try {
      const storedSession = getStoredSession(id);
      if (!storedSession) {
        this.setState({ error: 'Session not found' });
        this.emitError('Session not found');
        return;
      }

      const storedMessages = getStoredMessages(id);
      const storedEvents = listTimelineEvents(id);
      const totals = getSessionTokenTotals(id);
      this.messagesRef = storedMessages;
      this.timelineEventsRef = storedEvents;
      this.setState({
        messages: storedMessages,
        timelineEvents: storedEvents,
        tokens: totals,
        sessionTokens: totals,
        sessionId: id,
      });
      const lastAssistant = [...storedMessages].reverse().find(m => m.role === 'assistant' && m.tokenUsage?.input);
      if (lastAssistant?.tokenUsage?.input) {
        this.computeContextUsage(lastAssistant.tokenUsage.input);
      }
      this.sessionIdRef = id;
      this.emit('session_changed', id);
    } catch (err) {
      const message = `Failed to load session: ${err}`;
      this.setState({ error: message });
      this.emitError(message);
    }
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const registry = this.getRegistry();
    const tool = registry.get(name);

    if (!tool) {
      return JSON.stringify({ error: true, message: `Tool not found: ${name}` });
    }

    try {
      const result = await registry.execute(name, args, {
        sessionId: this.getSessionId(),
        conversationId: this.getSessionId(),
        userId: 'local',
        metadata: { projectDir: this.options.projectDir },
      });
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: true, message: String(err) });
    }
  }
}

