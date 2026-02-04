/**
 * Message Storage
 *
 * CRUD operations for messages and message parts.
 */

import type { Message, MessagePart, ToolCall, TimelineEvent, TimelineAttachment, TokenUsage, TimelineEventKind } from '@stratuscode/shared';
import { generateId } from '@stratuscode/shared';
import { getDatabase, insert, findAll } from './database';

// ============================================
// Types
// ============================================

interface MessageRow {
  id: string;
  session_id: string;
  parent_id: string | null;
  role: string;
  content: string | null;
  reasoning: string | null;
  finish_reason: string | null;
  cost: number;
  input_tokens: number | null;
  output_tokens: number | null;
  context_tokens: number | null;
  model: string | null;
  created_at: number;
}

interface MessagePartRow {
  id: string;
  message_id: string;
  session_id: string;
  type: string;
  data: string;
  created_at: number;
}

interface ToolCallRow {
  id: string;
  message_id: string;
  session_id: string;
  name: string;
  arguments: string;
  result: string | null;
  status: string;
  started_at: number | null;
  completed_at: number | null;
}

// ============================================
// Message Operations
// ============================================

/**
 * Create a message
 */
export function createMessage(
  sessionId: string,
  role: Message['role'],
  content: string,
  parentId?: string,
  tokenUsage?: TokenUsage
): string {
  const id = generateId('msg');
  const now = Date.now();

  insert('messages', {
    id,
    session_id: sessionId,
    parent_id: parentId ?? null,
    role,
    content,
    input_tokens: tokenUsage?.input ?? null,
    output_tokens: tokenUsage?.output ?? null,
    context_tokens: tokenUsage?.context ?? null,
    model: tokenUsage?.model ?? null,
    created_at: now,
  });

  return id;
}

/**
 * Get messages for a session
 */
export function getMessages(sessionId: string): Message[] {
  const rows = findAll<MessageRow>(
    'messages',
    { session_id: sessionId },
    'created_at ASC'
  );

  return rows.map(row => ({
    role: row.role as Message['role'],
    content: row.content || '',
    reasoning: row.reasoning ?? undefined,
    tokenUsage: row.input_tokens != null || row.output_tokens != null ? {
      input: row.input_tokens ?? 0,
      output: row.output_tokens ?? 0,
      context: row.context_tokens ?? undefined,
      model: row.model ?? undefined,
    } : undefined,
  }));
}

/**
 * Get messages with full details
 */
export function getMessagesWithDetails(sessionId: string): Array<MessageRow & { toolCalls: ToolCall[] }> {
  const messages = findAll<MessageRow>(
    'messages',
    { session_id: sessionId },
    'created_at ASC'
  );

  return messages.map(msg => {
    const toolCalls = getToolCallsForMessage(msg.id);
    return { ...msg, toolCalls };
  });
}

/**
 * Update message content
 */
export function updateMessageContent(id: string, content: string): void {
  const db = getDatabase();
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
}

/**
 * Update message content and optional token usage in a single helper.
 */
export function updateMessage(id: string, content: string, tokenUsage?: TokenUsage): void {
  const db = getDatabase();
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
  if (tokenUsage) {
    updateMessageTokens(id, tokenUsage);
  }
}

/**
 * Update message reasoning
 */
export function updateMessageReasoning(id: string, reasoning: string): void {
  const db = getDatabase();
  db.prepare('UPDATE messages SET reasoning = ? WHERE id = ?').run(reasoning, id);
}

/**
 * Update message token usage
 */
export function updateMessageTokens(id: string, tokenUsage: TokenUsage): void {
  const db = getDatabase();
  db.prepare(
    'UPDATE messages SET input_tokens = ?, output_tokens = ?, context_tokens = ?, model = ? WHERE id = ?'
  ).run(
    tokenUsage.input ?? null,
    tokenUsage.output ?? null,
    tokenUsage.context ?? null,
    tokenUsage.model ?? null,
    id
  );
}

// ============================================
// Message Part Operations
// ============================================

/**
 * Create a message part
 */
export function createMessagePart(
  messageId: string,
  sessionId: string,
  type: string,
  data: unknown
): string {
  const id = generateId('part');
  const now = Date.now();

  insert('message_parts', {
    id,
    message_id: messageId,
    session_id: sessionId,
    type,
    data: JSON.stringify(data),
    created_at: now,
  });

  return id;
}

/**
 * Get message parts
 */
export function getMessageParts(messageId: string): MessagePart[] {
  const rows = findAll<MessagePartRow>(
    'message_parts',
    { message_id: messageId },
    'created_at ASC'
  );

  return rows.map(row => ({
    id: row.id,
    messageId: row.message_id,
    sessionId: row.session_id,
    type: row.type,
    ...JSON.parse(row.data),
  })) as MessagePart[];
}

// ============================================
// Tool Call Operations
// ============================================

/**
 * Create a tool call record
 */
export function createToolCall(
  messageId: string,
  sessionId: string,
  toolCall: ToolCall
): void {
  const now = Date.now();
  const db = getDatabase();
  const result = db.prepare(
    'INSERT OR IGNORE INTO tool_calls (id, message_id, session_id, name, arguments, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    toolCall.id,
    messageId,
    sessionId,
    toolCall.function.name,
    toolCall.function.arguments,
    'pending',
    now,
  );

  if (result.changes === 0) {
    console.warn(`[Storage] Tool call ${toolCall.id} already exists - skipped duplicate`);
  }
}

/**
 * Update tool call result
 */
export function updateToolCallResult(id: string, result: string, status: 'completed' | 'failed'): void {
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    'UPDATE tool_calls SET result = ?, status = ?, completed_at = ? WHERE id = ?'
  ).run(result, status, now, id);
}

/**
 * Get tool calls for a message
 */
export function getToolCallsForMessage(messageId: string): ToolCall[] {
  const rows = findAll<ToolCallRow>(
    'tool_calls',
    { message_id: messageId },
    'started_at ASC'
  );

  return rows.map(row => ({
    id: row.id,
    type: 'function' as const,
    function: {
      name: row.name,
      arguments: row.arguments,
    },
    status: row.status as ToolCall['status'],
    result: row.result ?? undefined,
  }));
}

/**
 * Get all tool calls for a session
 */
export function getToolCallsForSession(sessionId: string): ToolCallRow[] {
  return findAll<ToolCallRow>(
    'tool_calls',
    { session_id: sessionId },
    'started_at ASC'
  );
}

// ============================================
// Timeline Event Operations
// ============================================

export function createTimelineEvent(
  sessionId: string,
  kind: TimelineEventKind,
  content: string,
  data: { toolCallId?: string; toolName?: string; status?: ToolCall['status']; tokens?: TokenUsage; streaming?: boolean; attachments?: TimelineAttachment[] } = {},
  messageId?: string
): TimelineEvent {
  const id = generateId('event');
  const now = Date.now();
  const payload = {
    kind,
    content,
    toolCallId: data.toolCallId,
    toolName: data.toolName,
    status: data.status,
    tokens: data.tokens,
    streaming: data.streaming,
    attachments: data.attachments,
    messageId,
  };

  insert('message_parts', {
    id,
    message_id: messageId ?? sessionId,
    session_id: sessionId,
    type: 'timeline_event',
    data: JSON.stringify(payload),
    created_at: now,
  });

  return {
    id,
    sessionId,
    createdAt: now,
    kind,
    content,
    tokens: data.tokens,
    streaming: data.streaming,
    ...(data.attachments ? { attachments: data.attachments } : {}),
    ...(data.toolCallId ? { toolCallId: data.toolCallId } : {}),
    ...(data.toolName ? { toolName: data.toolName } : {}),
    ...(data.status ? { status: data.status } : {}),
  } as TimelineEvent;
}

export function listTimelineEvents(sessionId: string): TimelineEvent[] {
  const rows = findAll<MessagePartRow>(
    'message_parts',
    { session_id: sessionId, type: 'timeline_event' },
    'created_at ASC'
  );

  return rows.map(row => {
    const parsed = JSON.parse(row.data) as any;
    const base: TimelineEvent = {
      id: row.id,
      sessionId,
      createdAt: row.created_at,
      kind: parsed.kind,
      content: parsed.content,
      tokens: parsed.tokens,
      streaming: false, // Loaded events are never streaming
      ...(parsed.attachments ? { attachments: parsed.attachments } : {}),
    };
    if (parsed.toolCallId) {
      return {
        ...base,
        toolCallId: parsed.toolCallId,
        toolName: parsed.toolName,
        status: parsed.status,
      } as TimelineEvent;
    }
    return base;
  });
}

export function getMessageTokens(messageId: string): TokenUsage | undefined {
  const db = getDatabase();
  const row = db.prepare('SELECT input_tokens, output_tokens, context_tokens, model FROM messages WHERE id = ?').get(messageId) as MessageRow | undefined;
  if (!row) return undefined;
  if (row.input_tokens == null && row.output_tokens == null) return undefined;
  return {
    input: row.input_tokens ?? 0,
    output: row.output_tokens ?? 0,
    context: row.context_tokens ?? undefined,
    model: row.model ?? undefined,
  };
}

export function getSessionTokenTotals(sessionId: string): TokenUsage {
  const db = getDatabase();
  const row = db.prepare('SELECT SUM(input_tokens) as input, SUM(output_tokens) as output, SUM(context_tokens) as context FROM messages WHERE session_id = ?').get(sessionId) as { input: number | null; output: number | null; context: number | null };
  return {
    input: row.input ?? 0,
    output: row.output ?? 0,
    context: row.context ?? undefined,
  };
}
