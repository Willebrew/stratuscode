import { describe, expect, test, beforeEach } from 'bun:test';

import {
  createSession,
  getSession,
  updateSession,
  listSessions,
  deleteSession,
  createMessage,
  getMessages,
  appendMessageContent,
  createTimelineEvent,
  listTimelineEvents,
  updateTimelineEvent,
  createToolCall,
  updateToolCallResult,
  getSessionTokenTotals,
  createTodo,
  listTodos,
  getTodos,
  updateTodo,
  deleteTodo,
  replaceTodos,
  getTodosCount,
  createQuestion,
  createPendingQuestion,
  getQuestion,
  getPendingQuestions,
  getPendingQuestion,
  getFirstPendingQuestion,
  answerQuestion,
  skipQuestion,
  InMemoryErrorStore,
  clearAllStorage,
} from './storage-shim';

beforeEach(() => {
  clearAllStorage();
});

// ============================================
// Session Management
// ============================================

describe('storage-shim: sessions', () => {
  test('createSession returns a session with expected fields', () => {
    const session = createSession('/test/project');
    expect(session.id).toContain('session-');
    expect(session.projectDir).toBe('/test/project');
    expect(session.status).toBe('pending');
    expect(session.title).toBe('New Session');
    expect(session.toolLoopDepth).toBe(0);
  });

  test('getSession retrieves a created session', () => {
    const session = createSession('/test');
    const retrieved = getSession(session.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(session.id);
  });

  test('getSession returns undefined for unknown id', () => {
    expect(getSession('nonexistent')).toBeUndefined();
  });

  test('updateSession modifies session fields', () => {
    const session = createSession('/test');
    updateSession(session.id, { title: 'Updated Title', status: 'running' });
    const updated = getSession(session.id);
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.status).toBe('running');
  });

  test('listSessions returns sessions sorted by updatedAt desc', () => {
    const s1 = createSession('/a');
    const s2 = createSession('/b');
    updateSession(s1.id, { title: 'first' }); // updates updatedAt
    const list = listSessions();
    expect(list.length).toBe(2);
    expect(list[0]!.id).toBe(s1.id); // s1 was updated more recently
  });

  test('deleteSession removes session and associated data', () => {
    const session = createSession('/test');
    createMessage(session.id, 'user', 'hello');
    deleteSession(session.id);
    expect(getSession(session.id)).toBeUndefined();
    expect(getMessages(session.id)).toEqual([]);
  });
});

// ============================================
// Messages
// ============================================

describe('storage-shim: messages', () => {
  test('createMessage adds message to session', () => {
    const session = createSession('/test');
    createMessage(session.id, 'user', 'hello');
    const msgs = getMessages(session.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('user');
    expect(msgs[0]!.content).toBe('hello');
  });

  test('getMessages returns empty array for unknown session', () => {
    expect(getMessages('nonexistent')).toEqual([]);
  });

  test('appendMessageContent appends to last assistant message', () => {
    const session = createSession('/test');
    createMessage(session.id, 'assistant', 'Hello');
    appendMessageContent(session.id, ' world');
    const msgs = getMessages(session.id);
    expect(msgs[0]!.content).toBe('Hello world');
  });

  test('appendMessageContent does nothing if last message is not assistant', () => {
    const session = createSession('/test');
    createMessage(session.id, 'user', 'Hello');
    appendMessageContent(session.id, ' world');
    const msgs = getMessages(session.id);
    expect(msgs[0]!.content).toBe('Hello');
  });

  test('createMessage tracks token usage', () => {
    const session = createSession('/test');
    createMessage(session.id, 'assistant', 'response', { input: 100, output: 50 });
    const msgs = getMessages(session.id);
    expect(msgs[0]!.tokenUsage).toEqual({ input: 100, output: 50 });
  });
});

// ============================================
// Timeline Events
// ============================================

describe('storage-shim: timeline events', () => {
  test('createTimelineEvent creates and returns event', () => {
    const session = createSession('/test');
    const event = createTimelineEvent(session.id, 'assistant', 'Hello');
    expect(event.id).toContain('evt-');
    expect(event.kind).toBe('assistant');
    expect(event.content).toBe('Hello');
  });

  test('tool_call events include tool metadata', () => {
    const session = createSession('/test');
    const event = createTimelineEvent(session.id, 'tool_call', 'running bash', {
      toolCallId: 'tc-1',
      toolName: 'bash',
      status: 'running',
    });
    expect(event.kind).toBe('tool_call');
    if (event.kind === 'tool_call') {
      expect(event.toolCallId).toBe('tc-1');
      expect(event.toolName).toBe('bash');
    }
  });

  test('listTimelineEvents returns events for session', () => {
    const session = createSession('/test');
    createTimelineEvent(session.id, 'user', 'msg1');
    createTimelineEvent(session.id, 'assistant', 'msg2');
    const events = listTimelineEvents(session.id);
    expect(events).toHaveLength(2);
  });

  test('listTimelineEvents returns empty for unknown session', () => {
    expect(listTimelineEvents('nonexistent')).toEqual([]);
  });

  test('updateTimelineEvent modifies event', () => {
    const session = createSession('/test');
    const event = createTimelineEvent(session.id, 'assistant', 'initial');
    updateTimelineEvent(event.id, session.id, { content: 'updated' });
    const events = listTimelineEvents(session.id);
    expect(events[0]!.content).toBe('updated');
  });
});

// ============================================
// Tool Calls
// ============================================

describe('storage-shim: tool calls', () => {
  test('createToolCall and updateToolCallResult', () => {
    const session = createSession('/test');
    createToolCall('msg-1', session.id, {
      id: 'tc-1',
      type: 'function',
      function: { name: 'bash', arguments: '{"command":"ls"}' },
      status: 'running',
    });
    updateToolCallResult('tc-1', 'file1.ts\nfile2.ts', 'completed');
    // Verify via the internal state (no direct getter, but updateToolCallResult doesn't throw)
  });
});

// ============================================
// Token Tracking
// ============================================

describe('storage-shim: token tracking', () => {
  test('getSessionTokenTotals sums token usage across messages', () => {
    const session = createSession('/test');
    createMessage(session.id, 'user', 'q1', { input: 10, output: 0 });
    createMessage(session.id, 'assistant', 'a1', { input: 50, output: 100 });
    createMessage(session.id, 'user', 'q2', { input: 20, output: 0 });
    const totals = getSessionTokenTotals(session.id);
    expect(totals.input).toBe(80);
    expect(totals.output).toBe(100);
  });

  test('getSessionTokenTotals returns zeros for empty session', () => {
    const session = createSession('/test');
    const totals = getSessionTokenTotals(session.id);
    expect(totals.input).toBe(0);
    expect(totals.output).toBe(0);
  });
});

// ============================================
// Todos
// ============================================

describe('storage-shim: todos', () => {
  test('createTodo creates a todo with default status', () => {
    const session = createSession('/test');
    const todo = createTodo(session.id, 'Fix bug');
    expect(todo.id).toContain('todo-');
    expect(todo.content).toBe('Fix bug');
    expect(todo.status).toBe('pending');
  });

  test('createTodo with custom status and priority', () => {
    const session = createSession('/test');
    const todo = createTodo(session.id, 'Urgent fix', { status: 'in_progress', priority: 'high' });
    expect(todo.status).toBe('in_progress');
    expect(todo.priority).toBe('high');
  });

  test('listTodos and getTodos return session todos', () => {
    const session = createSession('/test');
    createTodo(session.id, 'Task 1');
    createTodo(session.id, 'Task 2');
    expect(listTodos(session.id)).toHaveLength(2);
    expect(getTodos(session.id)).toHaveLength(2);
  });

  test('updateTodo modifies todo fields', () => {
    const session = createSession('/test');
    const todo = createTodo(session.id, 'Task');
    const updated = updateTodo(todo.id, { status: 'completed', content: 'Done task' });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('completed');
    expect(updated!.content).toBe('Done task');
  });

  test('updateTodo returns undefined for unknown id', () => {
    expect(updateTodo('nonexistent', { status: 'completed' })).toBeUndefined();
  });

  test('deleteTodo removes a todo', () => {
    const session = createSession('/test');
    const todo = createTodo(session.id, 'To delete');
    createTodo(session.id, 'Keep');
    deleteTodo(todo.id);
    expect(listTodos(session.id)).toHaveLength(1);
  });

  test('replaceTodos replaces all todos', () => {
    const session = createSession('/test');
    createTodo(session.id, 'Old task');
    const replaced = replaceTodos(session.id, [
      { content: 'New 1', status: 'pending' },
      { content: 'New 2', status: 'in_progress' },
    ]);
    expect(replaced).toHaveLength(2);
    expect(listTodos(session.id)).toHaveLength(2);
  });

  test('getTodosCount returns correct counts', () => {
    const session = createSession('/test');
    createTodo(session.id, 'A', { status: 'pending' });
    createTodo(session.id, 'B', { status: 'in_progress' });
    createTodo(session.id, 'C', { status: 'completed' });
    createTodo(session.id, 'D', { status: 'completed' });
    const counts = getTodosCount(session.id);
    expect(counts.total).toBe(4);
    expect(counts.pending).toBe(1);
    expect(counts.in_progress).toBe(1);
    expect(counts.completed).toBe(2);
  });
});

// ============================================
// Questions
// ============================================

describe('storage-shim: questions', () => {
  test('createQuestion stores a question', () => {
    const session = createSession('/test');
    const id = createQuestion(session.id, 'What framework?', ['React', 'Vue']);
    expect(id).toContain('q-');
    const q = getQuestion(session.id, id);
    expect(q).toBeDefined();
    expect(q!.question).toBe('What framework?');
    expect(q!.options).toEqual(['React', 'Vue']);
  });

  test('createPendingQuestion creates a pending question', () => {
    const session = createSession('/test');
    const pq = createPendingQuestion(session.id, 'msg-1', 'Confirm?', ['Yes', 'No'], false);
    expect(pq.id).toContain('pq-');
    expect(pq.question).toBe('Confirm?');
  });

  test('getPendingQuestions returns unanswered questions', () => {
    const session = createSession('/test');
    createPendingQuestion(session.id, undefined, 'Q1');
    createPendingQuestion(session.id, undefined, 'Q2');
    const pending = getPendingQuestions(session.id);
    expect(pending).toHaveLength(2);
  });

  test('getPendingQuestion and getFirstPendingQuestion return first unanswered', () => {
    const session = createSession('/test');
    createPendingQuestion(session.id, undefined, 'First');
    createPendingQuestion(session.id, undefined, 'Second');
    const first = getPendingQuestion(session.id);
    expect(first!.question).toBe('First');
    expect(getFirstPendingQuestion(session.id)!.question).toBe('First');
  });

  test('answerQuestion marks question as answered', () => {
    const session = createSession('/test');
    const pq = createPendingQuestion(session.id, undefined, 'Pick one');
    const result = answerQuestion(pq.id, [['React']]);
    expect(result).toBe(true);
    expect(getPendingQuestions(session.id)).toHaveLength(0);
  });

  test('answerQuestion returns false for unknown id', () => {
    expect(answerQuestion('nonexistent', [['x']])).toBe(false);
  });

  test('skipQuestion marks question as answered with empty array', () => {
    const session = createSession('/test');
    const pq = createPendingQuestion(session.id, undefined, 'Skip me');
    const result = skipQuestion(pq.id);
    expect(result).toBe(true);
    expect(getPendingQuestions(session.id)).toHaveLength(0);
  });
});

// ============================================
// InMemoryErrorStore
// ============================================

describe('storage-shim: InMemoryErrorStore', () => {
  test('recordError and findSimilarErrors', async () => {
    const store = new InMemoryErrorStore();
    await store.recordError('TypeError: undefined', 'Check null');
    await store.recordError('TypeError: undefined', 'Better check');
    const results = await store.findSimilarErrors('TypeError');
    expect(results).toHaveLength(1);
    expect(results[0]!.solution).toBe('Better check');
  });

  test('findSimilarErrors returns empty for no match', async () => {
    const store = new InMemoryErrorStore();
    await store.recordError('SyntaxError', 'Fix syntax');
    const results = await store.findSimilarErrors('TypeError');
    expect(results).toHaveLength(0);
  });
});

// ============================================
// clearAllStorage
// ============================================

describe('storage-shim: clearAllStorage', () => {
  test('clears all stored data', () => {
    const session = createSession('/test');
    createMessage(session.id, 'user', 'hello');
    createTodo(session.id, 'task');
    clearAllStorage();
    expect(listSessions()).toHaveLength(0);
    expect(getMessages(session.id)).toEqual([]);
    expect(listTodos(session.id)).toEqual([]);
  });
});
