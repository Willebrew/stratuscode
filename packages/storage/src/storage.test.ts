/**
 * Storage Layer Tests - Sessions, Messages, Error Memories
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from './database';
import { createSession, getSession, updateSession, listSessions, deleteSession, getSessionBySlug, listRecentSessions } from './sessions';
import {
  createMessage,
  getMessages,
  updateMessageContent,
  updateMessageReasoning,
  updateMessageTokens,
  createToolCall,
  updateToolCallResult,
  getToolCallsForMessage,
  createMessagePart,
  getMessageParts,
  getMessageTokens,
  getSessionTokenTotals,
  createTimelineEvent,
  listTimelineEvents,
} from './messages';

// Use a unique temp dir to avoid conflicts with other test files
const testDir = `/tmp/stratuscode-storage-test-${Date.now()}`;

beforeAll(() => {
  initDatabase({ dataDir: testDir });
});

afterAll(() => {
  closeDatabase();
});

// ============================================
// Sessions
// ============================================

describe('Session CRUD', () => {
  test('creates a session with generated ID and slug', () => {
    const session = createSession('/home/user/project');
    expect(session.id).toMatch(/^sess_/);
    expect(session.slug.length).toBeGreaterThan(0);
    expect(session.projectDir).toBe('/home/user/project');
    expect(session.status).toBe('pending');
  });

  test('creates a session with custom title', () => {
    const session = createSession('/project', 'My Session');
    expect(session.title).toBe('My Session');
  });

  test('retrieves a session by ID', () => {
    const created = createSession('/project', 'Test Get');
    const retrieved = getSession(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.title).toBe('Test Get');
  });

  test('returns undefined for non-existent session', () => {
    expect(getSession('nonexistent')).toBeUndefined();
  });

  test('updates session fields', () => {
    const session = createSession('/project', 'Before');
    updateSession(session.id, { title: 'After', status: 'active' });
    const updated = getSession(session.id);
    expect(updated!.title).toBe('After');
    expect(updated!.status).toBe('active');
  });

  test('lists sessions for a project', () => {
    const projectDir = `/tmp/test-project-${Date.now()}`;
    createSession(projectDir, 'A');
    createSession(projectDir, 'B');
    createSession('/other', 'C');

    const sessions = listSessions(projectDir);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.every(s => s.projectDir === projectDir)).toBe(true);
  });

  test('deletes session and cascades', () => {
    const session = createSession('/project', 'To Delete');
    const msgId = createMessage(session.id, 'user', 'test message');
    deleteSession(session.id);

    expect(getSession(session.id)).toBeUndefined();
    const messages = getMessages(session.id);
    expect(messages).toHaveLength(0);
  });

  test('gets session by slug', () => {
    const session = createSession('/project', 'Slug Test');
    const found = getSessionBySlug(session.slug);
    expect(found).toBeDefined();
    expect(found!.id).toBe(session.id);
  });

  test('listRecentSessions returns sessions across all projects', () => {
    const s1 = createSession('/project-a', 'Session A');
    const s2 = createSession('/project-b', 'Session B');

    const recent = listRecentSessions();
    expect(recent.length).toBeGreaterThanOrEqual(2);
    // Should contain sessions from both projects
    const ids = recent.map(s => s.id);
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);
  });

  test('listRecentSessions respects limit parameter', () => {
    // Create a few sessions
    createSession('/project-c', 'C1');
    createSession('/project-c', 'C2');
    createSession('/project-c', 'C3');

    const limited = listRecentSessions(2);
    expect(limited.length).toBeLessThanOrEqual(2);
  });
});

// ============================================
// Messages
// ============================================

describe('Message CRUD', () => {
  let sessionId: string;

  beforeAll(() => {
    const session = createSession('/project', 'Message Tests');
    sessionId = session.id;
  });

  test('creates a message and returns ID', () => {
    const id = createMessage(sessionId, 'user', 'Hello');
    expect(id).toMatch(/^msg_/);
  });

  test('retrieves messages for a session', () => {
    // Create fresh session for isolation
    const session = createSession('/project', 'Get Messages');
    createMessage(session.id, 'user', 'Hi');
    createMessage(session.id, 'assistant', 'Hello!');

    const messages = getMessages(session.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('user');
    expect(messages[0]!.content).toBe('Hi');
    expect(messages[1]!.role).toBe('assistant');
    expect(messages[1]!.content).toBe('Hello!');
  });

  test('stores token usage', () => {
    const session = createSession('/project', 'Token Test');
    const id = createMessage(session.id, 'assistant', 'answer', undefined, {
      input: 100,
      output: 50,
      model: 'gpt-4o',
    });

    const tokens = getMessageTokens(id);
    expect(tokens).toBeDefined();
    expect(tokens!.input).toBe(100);
    expect(tokens!.output).toBe(50);
    expect(tokens!.model).toBe('gpt-4o');
  });

  test('updates message content', () => {
    const session = createSession('/project', 'Update Content');
    const id = createMessage(session.id, 'assistant', 'original');
    updateMessageContent(id, 'updated');

    const messages = getMessages(session.id);
    expect(messages[0]!.content).toBe('updated');
  });

  test('updates message reasoning', () => {
    const session = createSession('/project', 'Update Reasoning');
    const id = createMessage(session.id, 'assistant', 'answer');
    updateMessageReasoning(id, 'thinking...');

    const messages = getMessages(session.id);
    expect(messages[0]!.reasoning).toBe('thinking...');
  });

  test('updates message tokens', () => {
    const session = createSession('/project', 'Update Tokens');
    const id = createMessage(session.id, 'assistant', 'answer');
    updateMessageTokens(id, { input: 200, output: 100, model: 'gpt-4o-mini' });

    const tokens = getMessageTokens(id);
    expect(tokens!.input).toBe(200);
    expect(tokens!.output).toBe(100);
  });

  test('calculates session token totals', () => {
    const session = createSession('/project', 'Totals');
    createMessage(session.id, 'user', 'q1', undefined, { input: 10, output: 0 });
    createMessage(session.id, 'assistant', 'a1', undefined, { input: 20, output: 30 });

    const totals = getSessionTokenTotals(session.id);
    expect(totals.input).toBe(30);
    expect(totals.output).toBe(30);
  });
});

// ============================================
// Tool Calls
// ============================================

describe('Tool Call CRUD', () => {
  test('creates and retrieves tool calls', () => {
    const session = createSession('/project', 'Tool Test');
    const msgId = createMessage(session.id, 'assistant', '');

    createToolCall(msgId, session.id, {
      id: 'call_1',
      type: 'function',
      function: { name: 'bash', arguments: '{"command":"ls"}' },
    });

    const calls = getToolCallsForMessage(msgId);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.id).toBe('call_1');
    expect(calls[0]!.function.name).toBe('bash');
    expect(calls[0]!.function.arguments).toBe('{"command":"ls"}');
  });

  test('updates tool call result', () => {
    const session = createSession('/project', 'Tool Result');
    const msgId = createMessage(session.id, 'assistant', '');

    createToolCall(msgId, session.id, {
      id: 'call_2',
      type: 'function',
      function: { name: 'read', arguments: '{}' },
    });

    updateToolCallResult('call_2', 'file contents here', 'completed');

    const calls = getToolCallsForMessage(msgId);
    expect(calls[0]!.result).toBe('file contents here');
    expect(calls[0]!.status).toBe('completed');
  });

  test('skips duplicate tool call inserts', () => {
    const session = createSession('/project', 'Dedup');
    const msgId = createMessage(session.id, 'assistant', '');

    createToolCall(msgId, session.id, {
      id: 'call_dup',
      type: 'function',
      function: { name: 'bash', arguments: '{}' },
    });
    // Insert same ID again — should not throw
    createToolCall(msgId, session.id, {
      id: 'call_dup',
      type: 'function',
      function: { name: 'bash', arguments: '{"new":"args"}' },
    });

    const calls = getToolCallsForMessage(msgId);
    expect(calls).toHaveLength(1);
  });
});

// ============================================
// Message Parts
// ============================================

describe('Message Parts', () => {
  test('creates and retrieves message parts', () => {
    const session = createSession('/project', 'Parts');
    const msgId = createMessage(session.id, 'assistant', 'content');

    createMessagePart(msgId, session.id, 'text', { text: 'Hello world' });

    const parts = getMessageParts(msgId);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.type).toBe('text');
  });
});

// ============================================
// Timeline Events
// ============================================

describe('Timeline Events', () => {
  test('creates and lists timeline events', () => {
    const session = createSession('/project', 'Timeline');
    createTimelineEvent(session.id, 'text', 'User said hello');
    createTimelineEvent(session.id, 'tool_call', 'Running bash', {
      toolCallId: 'call_1',
      toolName: 'bash',
      status: 'pending',
    });

    const events = listTimelineEvents(session.id);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]!.kind).toBe('text');
    expect(events[0]!.content).toBe('User said hello');
  });

  test('includes tool metadata on tool events', () => {
    const session = createSession('/project', 'Tool Events');
    createTimelineEvent(session.id, 'tool_call', 'Running read', {
      toolCallId: 'call_t1',
      toolName: 'read_file',
    });

    const events = listTimelineEvents(session.id);
    const toolEvent = events.find(e => (e as any).toolCallId === 'call_t1');
    expect(toolEvent).toBeDefined();
    expect((toolEvent as any).toolName).toBe('read_file');
  });
});
