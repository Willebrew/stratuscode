/**
 * Message Storage
 *
 * CRUD operations for messages and message parts.
 */

import type { Message, MessagePart, ToolCall } from '@stratuscode/shared';
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
  parentId?: string
): string {
  const id = generateId('msg');
  const now = Date.now();

  insert('messages', {
    id,
    session_id: sessionId,
    parent_id: parentId ?? null,
    role,
    content,
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
 * Update message reasoning
 */
export function updateMessageReasoning(id: string, reasoning: string): void {
  const db = getDatabase();
  db.prepare('UPDATE messages SET reasoning = ? WHERE id = ?').run(reasoning, id);
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
  insert('tool_calls', {
    id: toolCall.id,
    message_id: messageId,
    session_id: sessionId,
    name: toolCall.function.name,
    arguments: toolCall.function.arguments,
    status: 'pending',
  });
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
