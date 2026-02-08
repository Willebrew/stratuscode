/**
 * Cloud Session for StratusCode Cloud
 *
 * Uses SAGE's processDirectly — the same agent loop as the CLI/TUI.
 * Tools are sandbox-adapted versions that execute inside Vercel Sandboxes.
 */

import { processDirectly, createToolRegistry, type ToolRegistry } from '@willebrew/sage-core';
import type { Message } from '@stratuscode/shared';
import { buildSystemPrompt, BUILT_IN_AGENTS, modelSupportsReasoning } from '@stratuscode/shared';
import type { SandboxInfo } from './sandbox';
import { registerSandboxTools } from './sandbox-tools';
import { getPlanFilePath, ensurePlanFile as ensurePlanFileInSandbox, PLAN_MODE_REMINDER, BUILD_SWITCH_REMINDER } from './session-manager';

// Per-model context window lookup — mirrors CLI's MODEL_CONTEXT_WINDOWS
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5-mini': 128_000,
  'gpt-4o': 128_000,
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
};

export interface CloudSessionOptions {
  sessionId: string;
  workDir: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  providerType?: string;
  providerHeaders?: Record<string, string>;
  agent?: string;
  sandboxInfo: SandboxInfo;
}

export interface SendMessageCallbacks {
  onToken?: (token: string) => void;
  onReasoning?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCall: ToolCall, result: string) => void;
  onTimelineEvent?: (event: TimelineEvent) => void;
  onComplete?: (content: string) => void;
  onError?: (error: Error) => void;
  onPlanExitProposed?: () => void;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface TimelineEvent {
  id: string;
  kind: string;
  content: string;
  streaming?: boolean;
  toolCallId?: string;
  toolName?: string;
  status?: string;
}

export class CloudSession {
  private options: CloudSessionOptions;
  private agent: string;
  private previousAgent: string;
  private planExitProposed: boolean = false;
  private planFilePath: string | null = null;
  private justSwitchedFromPlan: boolean = false;
  private messages: Message[] = [];
  private registryRef: ToolRegistry | null = null;
  private existingSummaryRef: any = undefined;

  constructor(options: CloudSessionOptions) {
    this.options = options;
    this.agent = options.agent || 'build';
    this.previousAgent = this.agent;
  }

  getSessionId(): string {
    return this.options.sessionId;
  }

  getAgent(): string {
    return this.agent;
  }

  getPlanFilePath(): string | null {
    return this.planFilePath;
  }

  isPlanExitProposed(): boolean {
    return this.planExitProposed;
  }

  switchMode(newAgent: string): void {
    this.previousAgent = this.agent;
    this.agent = newAgent;
  }

  resetPlanExit(): void {
    this.planExitProposed = false;
  }

  private ensurePlanFile(): string {
    if (!this.planFilePath) {
      const sandboxExec = async (cmd: string) => {
        const result = await this.options.sandboxInfo.sandbox.runCommand('bash', ['-c', cmd]);
        return await result.stdout();
      };
      this.planFilePath = ensurePlanFileInSandbox(sandboxExec, this.options.workDir, this.options.sessionId);
    }
    return this.planFilePath;
  }

  private getRegistry(): ToolRegistry {
    if (!this.registryRef) {
      const registry = createToolRegistry();
      registerSandboxTools(registry, this.options.sandboxInfo, this.options.sessionId);
      this.registryRef = registry;
    }
    return this.registryRef;
  }

  /**
   * Build SAGE config — mirrors toSageConfig() from the CLI's ChatSession
   */
  private buildSageConfig() {
    const model = this.options.model;
    const supportsReasoning = modelSupportsReasoning(model);
    const reasoningEffort: 'low' | 'medium' | 'high' | 'minimal' | undefined = supportsReasoning ? 'high' : undefined;

    const baseUrl = this.options.baseUrl || 'https://api.openai.com/v1';

    // Enrich headers for Codex (same as CLI)
    let headers = this.options.providerHeaders;
    if (baseUrl.includes('chatgpt.com/backend-api/codex')) {
      headers = {
        ...headers,
        'originator': 'opencode',
        'User-Agent': `stratuscode/0.1.0 (cloud)`,
        'session_id': this.options.sessionId,
      };
    }

    // Enrich headers for OpenCode Zen (same as CLI)
    if (baseUrl.includes('opencode.ai/zen')) {
      headers = {
        ...headers,
        'x-opencode-session': this.options.sessionId,
        'x-opencode-request': `req-${Date.now()}`,
        'x-opencode-project': 'stratuscode',
      };
    }

    // Per-model context window lookup (same as CLI)
    const contextWindow = MODEL_CONTEXT_WINDOWS[model] ?? 128_000;

    return {
      model,
      // CLI defaults: temperature=undefined, maxTokens=undefined, parallelToolCalls=true
      // Responses API (Codex) does not support these params at all
      parallelToolCalls: true,
      enableReasoningEffort: !!reasoningEffort,
      reasoningEffort,
      provider: {
        apiKey: this.options.apiKey,
        baseUrl,
        type: this.options.providerType as 'responses-api' | 'chat-completions' | undefined,
        headers,
      },
      agent: {
        name: 'stratuscode',
        maxDepth: 300,
        toolTimeout: 60000,
        maxToolResultSize: 100000,
      },
      context: {
        enabled: true,
        contextWindow,
        maxResponseTokens: 16_384,
        summary: {
          enabled: true,
          model,
          targetTokens: 500,
        },
      },
    };
  }

  async sendMessage(
    content: string,
    callbacks?: SendMessageCallbacks
  ): Promise<void> {
    let messageContent = content;

    // Inject plan mode reminder if in plan mode
    if (this.agent === 'plan') {
      const planPath = this.ensurePlanFile();
      messageContent = content + '\n\n' + PLAN_MODE_REMINDER(planPath);
    }

    // Inject build switch reminder if switching from plan to build
    if (this.justSwitchedFromPlan) {
      const planPath = this.planFilePath || this.ensurePlanFile();
      messageContent = content + '\n\n' + BUILD_SWITCH_REMINDER(planPath);
      this.justSwitchedFromPlan = false;
    }

    this.previousAgent = this.agent;

    // Add user message to conversation history
    this.messages.push({ role: 'user', content: messageContent });

    const registry = this.getRegistry();
    const sid = this.options.sessionId;

    // Get agent info for system prompt (same as CLI)
    const currentAgent = BUILT_IN_AGENTS[this.agent] || BUILT_IN_AGENTS.build!;

    const systemPrompt = buildSystemPrompt({
      agent: currentAgent,
      tools: registry.toAPIFormat().map((t: any) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      projectDir: this.options.workDir,
      modelId: this.options.model,
    });

    try {
      console.log('[cloud-session] Starting processDirectly...');
      // Call processDirectly — the SAME SAGE agent loop the CLI uses
      const result: any = await processDirectly({
        systemPrompt,
        messages: [...this.messages],
        tools: registry,
        config: this.buildSageConfig(),
        sessionId: sid,
        existingSummary: this.existingSummaryRef,
        toolMetadata: {
          projectDir: this.options.workDir,
        },
        callbacks: {
          onToken: (token: string) => {
            callbacks?.onToken?.(token);
          },
          onReasoning: (text: string) => {
            callbacks?.onReasoning?.(text);
          },
          onToolCall: (tc: any) => {
            console.log(`[cloud-session] Tool call: ${tc.function?.name || tc.name || 'unknown'}`);
            callbacks?.onToolCall?.({
              id: tc.id,
              function: { name: tc.function?.name || tc.name || '', arguments: tc.function?.arguments || '' },
            });
          },
          onToolResult: (tc: any, result: string) => {
            const toolCall: ToolCall = {
              id: tc.id,
              function: {
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              },
            };
            callbacks?.onToolResult?.(toolCall, result);

            // Track plan_exit proposals
            this.handleToolResult(toolCall, result, callbacks);
          },
          onError: (err: Error) => {
            callbacks?.onError?.(err);
          },
        },
      });

      // Persist summary state across turns (same as CLI)
      if (result.newSummary) {
        this.existingSummaryRef = result.newSummary;
      }

      // Use responseMessages for multi-turn consistency (same as CLI)
      if (result.responseMessages && result.responseMessages.length > 0) {
        this.messages = [...this.messages, ...result.responseMessages];
      } else {
        this.messages.push({
          role: 'assistant',
          content: result.content,
          reasoning: result.reasoning,
        });
      }

      callbacks?.onComplete?.(result.content);
    } catch (error) {
      console.error('[cloud-session] processDirectly error:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      callbacks?.onError?.(err);
    }
  }

  handleToolResult(toolCall: ToolCall, result: string, callbacks?: SendMessageCallbacks): void {
    if (toolCall.function.name === 'plan_exit') {
      try {
        const parsed = JSON.parse(result);
        if (parsed.approved && parsed.modeSwitch === 'build') {
          this.planExitProposed = true;
          this.justSwitchedFromPlan = true;
          callbacks?.onPlanExitProposed?.();
        }
        if (parsed.proposingExit) {
          this.planExitProposed = true;
          callbacks?.onPlanExitProposed?.();
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
}
