/**
 * Messages Extended Tests
 *
 * Tests for uncovered code paths in messages.ts:
 * - getMessages with tokenUsage mapping
 * - getMessagesWithDetails (tool call enrichment)
 * - updateMessage with tokenUsage
 * - getToolCallsForSession
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from './database';
import {
  createMessage,
  getMessages,
  getMessagesWithDetails,
  updateMessage,
  updateMessageReasoning,
  updateMessageTokens,
  createToolCall,
  updateToolCallResult,
  getToolCallsForSession,
  createTimelineEvent,
  listTimelineEvents,
  getSessionTokenTotals,
} from './messages';
import { createSession } from './sessions';

const testDir = `/tmp/stratuscode-messages-ext-test-${Date.now()}`;
let sessionId: string;

beforeAll(() => {
  initDatabase({ dataDir: testDir });
  const session = createSession('/test/project');
  sessionId = session.id;
});

afterAll(() => {
  closeDatabase();
});

// ============================================
// getMessages with tokenUsage
// ============================================

describe('getMessages token coverage', () => {
  test('includes tokenUsage when tokens are stored', () => {
    const msgId = createMessage(sessionId, 'assistant', 'Hello');
    updateMessageTokens(msgId, { input: 100, output: 50, context: 150 });

    const messages = getMessages(sessionId);
    const msg = messages.find(m => m.content === 'Hello');
    expect(msg).toBeDefined();
    expect(msg!.tokenUsage).toBeDefined();
    expect(msg!.tokenUsage!.input).toBe(100);
    expect(msg!.tokenUsage!.output).toBe(50);
    expect(msg!.tokenUsage!.context).toBe(150);
  });

  test('tokenUsage is undefined when no tokens stored', () => {
    const msgId = createMessage(sessionId, 'user', 'No tokens');
    const messages = getMessages(sessionId);
    const msg = messages.find(m => m.content === 'No tokens');
    expect(msg!.tokenUsage).toBeUndefined();
  });

  test('includes reasoning when present', () => {
    const msgId = createMessage(sessionId, 'assistant', 'Reasoned response');
    updateMessageReasoning(msgId, 'I thought about this carefully');

    const messages = getMessages(sessionId);
    const msg = messages.find(m => m.content === 'Reasoned response');
    expect(msg!.reasoning).toBe('I thought about this carefully');
  });
});

// ============================================
// getMessagesWithDetails
// ============================================

describe('getMessagesWithDetails', () => {
  test('enriches messages with tool calls', () => {
    const msgId = createMessage(sessionId, 'assistant', 'Using tool');
    createToolCall(msgId, sessionId, {
      id: 'tc-detail-1',
      type: 'function',
      function: { name: 'bash', arguments: '{"command":"ls"}' },
    });

    const detailed = getMessagesWithDetails(sessionId);
    const msg = detailed.find(m => m.content === 'Using tool');
    expect(msg).toBeDefined();
    expect(msg!.toolCalls).toBeDefined();
    expect(msg!.toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(msg!.toolCalls.some(tc => tc.id === 'tc-detail-1')).toBe(true);
  });

  test('returns empty toolCalls for messages without tool calls', () => {
    const msgId = createMessage(sessionId, 'user', 'Plain message');
    const detailed = getMessagesWithDetails(sessionId);
    const msg = detailed.find(m => m.content === 'Plain message');
    expect(msg!.toolCalls).toEqual([]);
  });
});

// ============================================
// updateMessage with tokenUsage
// ============================================

describe('updateMessage with tokenUsage', () => {
  test('updates content and tokens together', () => {
    const msgId = createMessage(sessionId, 'assistant', 'Original');
    updateMessage(msgId, 'Updated content', { input: 200, output: 100 });

    const messages = getMessages(sessionId);
    const msg = messages.find(m => m.content === 'Updated content');
    expect(msg).toBeDefined();
    expect(msg!.tokenUsage).toBeDefined();
    expect(msg!.tokenUsage!.input).toBe(200);
    expect(msg!.tokenUsage!.output).toBe(100);
  });

  test('updates content without tokenUsage', () => {
    const msgId = createMessage(sessionId, 'assistant', 'ContentOnly');
    updateMessage(msgId, 'ContentOnly Updated');

    const messages = getMessages(sessionId);
    const msg = messages.find(m => m.content === 'ContentOnly Updated');
    expect(msg).toBeDefined();
    expect(msg!.tokenUsage).toBeUndefined();
  });
});

// ============================================
// getToolCallsForSession
// ============================================

describe('getToolCallsForSession', () => {
  test('returns all tool calls for a session', () => {
    const sid = createSession('/test/toolcalls').id;
    const msgId = createMessage(sid, 'assistant', 'Multi-tool');
    createToolCall(msgId, sid, {
      id: 'tc-sess-1',
      type: 'function',
      function: { name: 'bash', arguments: '{"command":"pwd"}' },
    });
    createToolCall(msgId, sid, {
      id: 'tc-sess-2',
      type: 'function',
      function: { name: 'read', arguments: '{"path":"file.ts"}' },
    });

    const toolCalls = getToolCallsForSession(sid);
    expect(toolCalls.length).toBe(2);
  });

  test('returns empty array for session with no tool calls', () => {
    const sid = createSession('/test/empty-tc').id;
    createMessage(sid, 'user', 'No tools used');

    const toolCalls = getToolCallsForSession(sid);
    expect(toolCalls).toEqual([]);
  });
});

// ============================================
// getSessionTokenTotals
// ============================================

describe('getSessionTokenTotals extended', () => {
  test('sums tokens across multiple messages', () => {
    const sid = createSession('/test/token-totals').id;
    const msg1 = createMessage(sid, 'assistant', 'First');
    const msg2 = createMessage(sid, 'assistant', 'Second');
    updateMessageTokens(msg1, { input: 100, output: 50 });
    updateMessageTokens(msg2, { input: 200, output: 100 });

    const totals = getSessionTokenTotals(sid);
    expect(totals.input).toBe(300);
    expect(totals.output).toBe(150);
  });
});

// ============================================
// Timeline events
// ============================================

describe('timeline events extended', () => {
  test('creates and lists events in order', () => {
    const sid = createSession('/test/timeline').id;
    const msgId = createMessage(sid, 'assistant', 'Response');

    const e1 = createTimelineEvent(sid, 'user', 'Hello', {}, msgId);
    const e2 = createTimelineEvent(sid, 'assistant', 'Hi there', {}, msgId);
    const e3 = createTimelineEvent(sid, 'tool_call', '{}', {
      toolCallId: 'tc-1',
      toolName: 'bash',
      status: 'running',
    }, msgId);

    const events = listTimelineEvents(sid);
    expect(events.length).toBeGreaterThanOrEqual(3);

    expect(e1.kind).toBe('user');
    expect(e2.kind).toBe('assistant');
    expect(e3.kind).toBe('tool_call');
  });

  test('timeline event includes tool metadata', () => {
    const sid = createSession('/test/timeline-meta').id;
    const msgId = createMessage(sid, 'assistant', 'Tool use');

    const event = createTimelineEvent(sid, 'tool_result', 'file content', {
      toolCallId: 'tc-meta',
      toolName: 'read',
      status: 'completed',
    }, msgId);

    expect(event.kind).toBe('tool_result');
    expect(event.content).toBe('file content');
  });
});
