import { z } from 'zod';

// ============================================
// Messages
// ============================================

export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | ContentPart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  reasoning?: string;
  tokenUsage?: TokenUsage;
}

export interface ContentPart {
  type: 'text' | 'image' | 'file';
  text?: string;
  imageUrl?: string;
  fileUrl?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  status?: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

// ============================================
// Token usage & timeline events
// ============================================

export interface TokenUsage {
  input: number;
  output: number;
  context?: number;
  model?: string;
}

export type TimelineEventKind =
  | 'user'
  | 'assistant'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'status';

export interface TimelineEventBase {
  id: string;
  sessionId: string;
  createdAt: number;
  kind: TimelineEventKind;
  content: string;
  tokens?: TokenUsage;
  streaming?: boolean;
}

export interface TimelineToolEvent extends TimelineEventBase {
  kind: 'tool_call' | 'tool_result';
  toolCallId: string;
  toolName?: string;
  status?: ToolCall['status'];
}

export type TimelineEvent =
  | (TimelineEventBase & { kind: 'user' | 'assistant' | 'reasoning' | 'status'; role?: Message['role'] })
  | TimelineToolEvent;

// ============================================
// Session
// ============================================

export type SessionStatus =
  | 'pending'
  | 'running'
  | 'tool_loop'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Session {
  id: string;
  slug: string;
  title: string;
  projectDir: string;
  status: SessionStatus;
  toolLoopDepth: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
}

// ============================================
// Streaming
// ============================================

export type StreamChunkType =
  | 'token'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'status'
  | 'error'
  | 'step_start'
  | 'step_finish';

export interface StreamChunk {
  type: StreamChunkType;
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
  toolArguments?: string;
  status?: SessionStatus;
}

// ============================================
// Agent
// ============================================

export type AgentMode = 'primary' | 'subagent';

export interface AgentInfo {
  name: string;
  description?: string;
  mode: AgentMode;
  prompt?: string;
  model?: string;
  temperature?: number;
  permissions: PermissionRuleset;
}

// ============================================
// Permissions
// ============================================

export type PermissionAction = 'allow' | 'deny' | 'ask';

export interface PermissionRule {
  permission: string;
  pattern: string;
  action: PermissionAction;
}

export type PermissionRuleset = PermissionRule[];

// ============================================
// Tool Definition
// ============================================

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  enum?: unknown[];
  default?: unknown;
  additionalProperties?: boolean | JSONSchema;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  timeout?: number;
  maxResultSize?: number;
}

export interface ToolContext {
  sessionId: string;
  projectDir: string;
  abort?: AbortSignal;
}

export interface Tool extends ToolDefinition {
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

// ============================================
// Agent Result
// ============================================

export interface AgentResult {
  content: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  /** The last API call's prompt_tokens — actual context window occupancy (not cumulative) */
  lastInputTokens?: number;
  /** SAGE context summary state (for persistence across calls) */
  newSummary?: { text: string; upToMessageId: string; tokenCount: number };
}

// ============================================
// Lifecycle Hooks
// ============================================

export interface HookContext {
  sessionId: string;
  projectDir: string;
  agentId: string;
  agentDepth: number;
  messages: Message[];
}

export interface LLMResponse {
  content: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}

export interface ToolInfo {
  name: string;
  description: string;
}

export interface StratusCodeHooks {
  beforeLLMCall?: (context: HookContext) => Promise<void>;
  afterLLMCall?: (context: HookContext, response: LLMResponse) => Promise<void>;
  beforeToolExecution?: (
    tool: ToolInfo,
    args: Record<string, unknown>,
    context: HookContext
  ) => Promise<Record<string, unknown>>;
  afterToolExecution?: (
    tool: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    error: Error | null,
    context: HookContext
  ) => Promise<void>;
  onError?: (error: Error, context: HookContext) => Promise<void>;
  onComplete?: (result: AgentResult, context: HookContext) => Promise<void>;
}

// ============================================
// Message Parts (for storage)
// ============================================

export type MessagePartType = 
  | 'text'
  | 'reasoning'
  | 'tool'
  | 'step_start'
  | 'step_finish'
  | 'patch';

export interface BaseMessagePart {
  id: string;
  messageId: string;
  sessionId: string;
  type: MessagePartType;
}

export interface TextPart extends BaseMessagePart {
  type: 'text';
  text: string;
  time: { start: number; end?: number };
}

export interface ReasoningPart extends BaseMessagePart {
  type: 'reasoning';
  text: string;
  time: { start: number; end?: number };
}

export interface ToolPart extends BaseMessagePart {
  type: 'tool';
  tool: string;
  callId: string;
  state: ToolPartState;
}

export type ToolPartStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ToolPartState {
  status: ToolPartStatus;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  time?: { start: number; end?: number };
}

export interface StepStartPart extends BaseMessagePart {
  type: 'step_start';
  snapshot?: string;
}

export interface StepFinishPart extends BaseMessagePart {
  type: 'step_finish';
  reason: string;
  tokens: {
    input: number;
    output: number;
    reasoning?: number;
  };
  cost: number;
  snapshot?: string;
}

export interface PatchPart extends BaseMessagePart {
  type: 'patch';
  hash: string;
  files: FileDiff[];
}

export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
}

export type MessagePart = 
  | TextPart 
  | ReasoningPart 
  | ToolPart 
  | StepStartPart 
  | StepFinishPart
  | PatchPart;

// ============================================
// Subagent Types
// ============================================

export interface SubagentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  toolNames?: string[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxDepth?: number;
  permissions?: PermissionRuleset;
}

export interface SubagentResult {
  agentId: string;
  content: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

export interface SubagentCallbacks {
  onSubagentStart?: (agentId: string, task: string) => void;
  onSubagentEnd?: (agentId: string, result: string) => void;
  onSubagentToken?: (agentId: string, token: string) => void;
}

// Extended stream chunk types for subagents
export type ExtendedStreamChunkType =
  | StreamChunkType
  | 'subagent_start'
  | 'subagent_end'
  | 'subagent_token';

export interface ExtendedStreamChunk extends Omit<StreamChunk, 'type'> {
  type: ExtendedStreamChunkType;
  agentId?: string;
  agentDepth?: number;
}
