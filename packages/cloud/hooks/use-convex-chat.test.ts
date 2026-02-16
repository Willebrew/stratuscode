import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ─── Mock convex/react ───
const mockUseQuery = mock((_ref: any, _args?: any) => undefined as any);
const mockUseMutation = mock(() => mock(() => Promise.resolve()));
const mockUseAction = mock(() => mock(() => Promise.resolve()));

mock.module('convex/react', () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useAction: mockUseAction,
}));

// ─── Mock the generated api (satisfies import; values are never deeply inspected) ───
mock.module('../convex/_generated/api', () => ({
  api: {
    sessions: { get: 'sessions:get', requestCancel: 'sessions:requestCancel' },
    messages: { list: 'messages:list' },
    streaming: { get: 'streaming:get', answerQuestion: 'streaming:answerQuestion' },
    todos: { list: 'todos:list' },
    agent: { send: 'agent:send' },
  },
}));

// ─── Mock React hooks so the module can be imported outside of a React tree ───
// We capture the factory functions passed to useMemo / useCallback so we can
// invoke them directly and test the pure transformations.
let memoFactories: Array<() => any> = [];
let callbackFns: Array<(...args: any[]) => any> = [];

mock.module('react', () => ({
  useMemo: (fn: () => any, _deps: any[]) => {
    const result = fn();
    memoFactories.push(fn);
    return result;
  },
  useCallback: (fn: (...args: any[]) => any, _deps: any[]) => {
    callbackFns.push(fn);
    return fn;
  },
}));

import { useConvexChat } from './use-convex-chat';
import type { ChatMessage, TodoItem, MessagePart } from './use-convex-chat';

// ─── Helpers ───

/** Stub the Nth useQuery call to return a given value. */
function setupQueries(opts: {
  session?: any;
  dbMessages?: any;
  streamingState?: any;
  dbTodos?: any;
}) {
  let callIndex = 0;
  mockUseQuery.mockImplementation((_ref: any, args: any) => {
    // useConvexChat calls useQuery 4 times in order:
    //   1. session  2. dbMessages  3. streamingState  4. dbTodos
    callIndex++;
    if (args === 'skip') return undefined;
    switch (callIndex) {
      case 1:
        return opts.session;
      case 2:
        return opts.dbMessages;
      case 3:
        return opts.streamingState;
      case 4:
        return opts.dbTodos;
      default:
        return undefined;
    }
  });
}

const SESSION_ID = 'session123' as any;

beforeEach(() => {
  mockUseQuery.mockReset();
  mockUseMutation.mockReset();
  mockUseAction.mockReset();
  memoFactories = [];
  callbackFns = [];

  // Default: useMutation/useAction return callable mocks
  mockUseMutation.mockReturnValue(mock(() => Promise.resolve()));
  mockUseAction.mockReturnValue(mock(() => Promise.resolve()));
});

// ─────────────────────────────────────────────
// 1. No sessionId → all nulls / empty
// ─────────────────────────────────────────────

describe('useConvexChat: no sessionId', () => {
  test('returns empty messages, no error, not loading', () => {
    setupQueries({});
    const result = useConvexChat(null);

    expect(result.messages).toEqual([]);
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeNull();
    expect(result.sessionId).toBeNull();
    expect(result.session).toBeNull();
    expect(result.todos).toEqual([]);
    expect(result.pendingQuestion).toBeNull();
    expect(result.sandboxStatus).toBe('idle');
  });

  test('sendMessage is a no-op when sessionId is null', async () => {
    const sendActionMock = mock(() => Promise.resolve());
    mockUseAction.mockReturnValue(sendActionMock);
    setupQueries({});

    const result = useConvexChat(null);
    await result.sendMessage('hello');

    expect(sendActionMock).not.toHaveBeenCalled();
  });

  test('answerQuestion is a no-op when sessionId is null', async () => {
    const answerMock = mock(() => Promise.resolve());
    mockUseMutation.mockReturnValue(answerMock);
    setupQueries({});

    const result = useConvexChat(null);
    await result.answerQuestion('yes');

    expect(answerMock).not.toHaveBeenCalled();
  });

  test('requestCancel is a no-op when sessionId is null', async () => {
    const cancelMock = mock(() => Promise.resolve());
    mockUseMutation.mockReturnValue(cancelMock);
    setupQueries({});

    const result = useConvexChat(null);
    await result.requestCancel();

    expect(cancelMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// 2. Derived state: isLoading, error, sandboxStatus
// ─────────────────────────────────────────────

describe('useConvexChat: derived state', () => {
  test('isLoading is true when session status is running', () => {
    setupQueries({ session: { status: 'running' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.isLoading).toBe(true);
  });

  test('isLoading is true when session status is booting', () => {
    setupQueries({ session: { status: 'booting' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.isLoading).toBe(true);
  });

  test('isLoading is false when session status is idle', () => {
    setupQueries({ session: { status: 'idle' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.isLoading).toBe(false);
  });

  test('isLoading is false when session status is completed', () => {
    setupQueries({ session: { status: 'completed' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.isLoading).toBe(false);
  });

  test('isLoading is false when session is undefined', () => {
    setupQueries({ session: undefined });
    const result = useConvexChat(SESSION_ID);
    expect(result.isLoading).toBe(false);
  });

  test('error is set when session status is error with message', () => {
    setupQueries({ session: { status: 'error', errorMessage: 'Sandbox crashed' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.error).toBe('Sandbox crashed');
  });

  test('error defaults to generic message when errorMessage is empty', () => {
    setupQueries({ session: { status: 'error', errorMessage: '' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.error).toBe('An error occurred');
  });

  test('error is null when session status is not error', () => {
    setupQueries({ session: { status: 'running' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.error).toBeNull();
  });

  test('sandboxStatus is initializing when session is booting', () => {
    setupQueries({ session: { status: 'booting' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.sandboxStatus).toBe('initializing');
  });

  test('sandboxStatus is idle when session is not booting', () => {
    setupQueries({ session: { status: 'running' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.sandboxStatus).toBe('idle');
  });

  test('sandboxStatus is idle when session is completed', () => {
    setupQueries({ session: { status: 'completed' } });
    const result = useConvexChat(SESSION_ID);
    expect(result.sandboxStatus).toBe('idle');
  });

  test('session is returned as-is when present', () => {
    const sessionObj = { status: 'idle', title: 'My Session' };
    setupQueries({ session: sessionObj });
    const result = useConvexChat(SESSION_ID);
    expect(result.session).toEqual(sessionObj);
  });

  test('session is null when query returns undefined', () => {
    setupQueries({ session: undefined });
    const result = useConvexChat(SESSION_ID);
    expect(result.session).toBeNull();
  });
});

// ─────────────────────────────────────────────
// 3. Message merging
// ─────────────────────────────────────────────

describe('useConvexChat: message merging', () => {
  test('maps completed messages from dbMessages', () => {
    const dbMessages = [
      {
        _id: 'msg1',
        role: 'user',
        content: 'Hello',
        parts: [{ type: 'text', content: 'Hello' }],
      },
      {
        _id: 'msg2',
        role: 'assistant',
        content: 'Hi there',
        parts: [{ type: 'text', content: 'Hi there' }],
      },
    ];
    setupQueries({ session: { status: 'idle' }, dbMessages });
    const result = useConvexChat(SESSION_ID);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({
      id: 'msg1',
      role: 'user',
      content: 'Hello',
      parts: [{ type: 'text', content: 'Hello' }],
      streaming: false,
    });
    expect(result.messages[1]).toEqual({
      id: 'msg2',
      role: 'assistant',
      content: 'Hi there',
      parts: [{ type: 'text', content: 'Hi there' }],
      streaming: false,
    });
  });

  test('returns empty messages when dbMessages is null', () => {
    setupQueries({ session: { status: 'idle' }, dbMessages: null });
    const result = useConvexChat(SESSION_ID);
    expect(result.messages).toEqual([]);
  });

  test('returns empty messages when dbMessages is undefined', () => {
    setupQueries({ session: { status: 'idle' }, dbMessages: undefined });
    const result = useConvexChat(SESSION_ID);
    expect(result.messages).toEqual([]);
  });

  test('appends streaming message when streamingState.isStreaming is true', () => {
    const dbMessages = [
      { _id: 'msg1', role: 'user', content: 'Do something', parts: [] },
    ];
    const streamingState = {
      isStreaming: true,
      content: 'Working on it...',
      reasoning: null,
      toolCalls: null,
    };
    setupQueries({ session: { status: 'running' }, dbMessages, streamingState });
    const result = useConvexChat(SESSION_ID);

    expect(result.messages).toHaveLength(2);
    const streamMsg = result.messages[1]!;
    expect(streamMsg.id).toBe('streaming');
    expect(streamMsg.role).toBe('assistant');
    expect(streamMsg.streaming).toBe(true);
    expect(streamMsg.content).toBe('Working on it...');
    expect(streamMsg.parts).toEqual([{ type: 'text', content: 'Working on it...' }]);
  });

  test('streaming message includes reasoning part', () => {
    const streamingState = {
      isStreaming: true,
      content: '',
      reasoning: 'Let me think about this...',
      toolCalls: null,
    };
    setupQueries({ session: { status: 'running' }, dbMessages: [], streamingState });
    const result = useConvexChat(SESSION_ID);

    const streamMsg = result.messages[0]!;
    expect(streamMsg.parts[0]).toEqual({
      type: 'reasoning',
      content: 'Let me think about this...',
    });
  });

  test('streaming message includes tool call parts', () => {
    const toolCalls = [
      { id: 'tc1', name: 'read_file', args: '{"path":"index.ts"}', result: 'file content', status: 'completed' },
      { id: 'tc2', name: 'write_file', args: '{"path":"out.ts"}', status: 'running' },
    ];
    const streamingState = {
      isStreaming: true,
      content: '',
      reasoning: null,
      toolCalls: JSON.stringify(toolCalls),
    };
    setupQueries({ session: { status: 'running' }, dbMessages: [], streamingState });
    const result = useConvexChat(SESSION_ID);

    const streamMsg = result.messages[0]!;
    expect(streamMsg.parts).toHaveLength(2);
    expect(streamMsg.parts[0]).toEqual({
      type: 'tool_call',
      toolCall: {
        id: 'tc1',
        name: 'read_file',
        args: '{"path":"index.ts"}',
        result: 'file content',
        status: 'completed',
      },
    });
    expect(streamMsg.parts[1]).toEqual({
      type: 'tool_call',
      toolCall: {
        id: 'tc2',
        name: 'write_file',
        args: '{"path":"out.ts"}',
        result: undefined,
        status: 'running',
      },
    });
  });

  test('streaming message with reasoning + tool calls + content has all parts in order', () => {
    const toolCalls = [{ id: 'tc1', name: 'exec', args: '{}', status: 'completed' }];
    const streamingState = {
      isStreaming: true,
      content: 'Done!',
      reasoning: 'Thinking...',
      toolCalls: JSON.stringify(toolCalls),
    };
    setupQueries({ session: { status: 'running' }, dbMessages: [], streamingState });
    const result = useConvexChat(SESSION_ID);

    const streamMsg = result.messages[0]!;
    expect(streamMsg.parts).toHaveLength(3);
    expect(streamMsg.parts[0]!.type).toBe('reasoning');
    expect(streamMsg.parts[1]!.type).toBe('tool_call');
    expect(streamMsg.parts[2]!.type).toBe('text');
  });

  test('tool call defaults status to running when not provided', () => {
    const toolCalls = [{ id: 'tc1', name: 'shell', args: '{}' }];
    const streamingState = {
      isStreaming: true,
      content: '',
      reasoning: null,
      toolCalls: JSON.stringify(toolCalls),
    };
    setupQueries({ session: { status: 'running' }, dbMessages: [], streamingState });
    const result = useConvexChat(SESSION_ID);

    const tcPart = result.messages[0]!.parts[0]! as Extract<MessagePart, { type: 'tool_call' }>;
    expect(tcPart.toolCall.status).toBe('running');
  });

  test('no streaming message appended when isStreaming is false', () => {
    const streamingState = {
      isStreaming: false,
      content: 'leftover',
      reasoning: null,
      toolCalls: null,
    };
    setupQueries({ session: { status: 'idle' }, dbMessages: [], streamingState });
    const result = useConvexChat(SESSION_ID);

    expect(result.messages).toHaveLength(0);
  });

  test('streaming content fallback to empty string when content is null', () => {
    const streamingState = {
      isStreaming: true,
      content: null,
      reasoning: null,
      toolCalls: null,
    };
    setupQueries({ session: { status: 'running' }, dbMessages: [], streamingState });
    const result = useConvexChat(SESSION_ID);

    const streamMsg = result.messages[0]!;
    expect(streamMsg.content).toBe('');
    expect(streamMsg.parts).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// 4. Todo mapping
// ─────────────────────────────────────────────

describe('useConvexChat: todo mapping', () => {
  test('maps dbTodos to TodoItem[]', () => {
    const dbTodos = [
      { _id: 'todo1', content: 'Fix bug', status: 'pending', priority: 'high' },
      { _id: 'todo2', content: 'Write tests', status: 'completed', priority: undefined },
    ];
    setupQueries({ session: { status: 'idle' }, dbTodos });
    const result = useConvexChat(SESSION_ID);

    expect(result.todos).toHaveLength(2);
    expect(result.todos[0]).toEqual({
      id: 'todo1',
      content: 'Fix bug',
      status: 'pending',
      priority: 'high',
    });
    expect(result.todos[1]).toEqual({
      id: 'todo2',
      content: 'Write tests',
      status: 'completed',
      priority: undefined,
    });
  });

  test('returns empty todos when dbTodos is null', () => {
    setupQueries({ session: { status: 'idle' }, dbTodos: null });
    const result = useConvexChat(SESSION_ID);
    expect(result.todos).toEqual([]);
  });

  test('returns empty todos when dbTodos is undefined', () => {
    setupQueries({ session: { status: 'idle' }, dbTodos: undefined });
    const result = useConvexChat(SESSION_ID);
    expect(result.todos).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// 5. Pending question parsing
// ─────────────────────────────────────────────

describe('useConvexChat: pendingQuestion', () => {
  test('parses valid pendingQuestion JSON', () => {
    const question = { question: 'Continue?', options: ['yes', 'no'] };
    const streamingState = {
      isStreaming: true,
      content: '',
      reasoning: null,
      toolCalls: null,
      pendingQuestion: JSON.stringify(question),
    };
    setupQueries({ session: { status: 'running' }, streamingState });
    const result = useConvexChat(SESSION_ID);

    expect(result.pendingQuestion).toEqual(question);
  });

  test('returns null when pendingQuestion is null', () => {
    const streamingState = {
      isStreaming: false,
      content: '',
      reasoning: null,
      toolCalls: null,
      pendingQuestion: null,
    };
    setupQueries({ session: { status: 'idle' }, streamingState });
    const result = useConvexChat(SESSION_ID);

    expect(result.pendingQuestion).toBeNull();
  });

  test('returns null when pendingQuestion is undefined', () => {
    const streamingState = {
      isStreaming: false,
      content: '',
      reasoning: null,
      toolCalls: null,
    };
    setupQueries({ session: { status: 'idle' }, streamingState });
    const result = useConvexChat(SESSION_ID);

    expect(result.pendingQuestion).toBeNull();
  });

  test('returns null when pendingQuestion is invalid JSON', () => {
    const streamingState = {
      isStreaming: true,
      content: '',
      reasoning: null,
      toolCalls: null,
      pendingQuestion: '{bad json',
    };
    setupQueries({ session: { status: 'running' }, streamingState });
    const result = useConvexChat(SESSION_ID);

    expect(result.pendingQuestion).toBeNull();
  });

  test('parses question without options', () => {
    const question = { question: 'Are you sure?' };
    const streamingState = {
      isStreaming: true,
      content: '',
      reasoning: null,
      toolCalls: null,
      pendingQuestion: JSON.stringify(question),
    };
    setupQueries({ session: { status: 'running' }, streamingState });
    const result = useConvexChat(SESSION_ID);

    expect(result.pendingQuestion).toEqual({ question: 'Are you sure?' });
  });
});

// ─────────────────────────────────────────────
// 6. Callbacks: sendMessage, answerQuestion, requestCancel
// ─────────────────────────────────────────────

describe('useConvexChat: sendMessage', () => {
  test('calls sendAction with correct args', async () => {
    const sendActionMock = mock(() => Promise.resolve());
    mockUseAction.mockReturnValue(sendActionMock);
    setupQueries({ session: { status: 'idle' } });

    const result = useConvexChat(SESSION_ID);
    await result.sendMessage('Build the app', { model: 'gpt-4o', alphaMode: true, reasoningEffort: 'high' });

    expect(sendActionMock).toHaveBeenCalledTimes(1);
    expect(sendActionMock).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      message: 'Build the app',
      model: 'gpt-4o',
      alphaMode: true,
      reasoningEffort: 'high',
    });
  });

  test('sendMessage does not call action when isLoading is true', async () => {
    const sendActionMock = mock(() => Promise.resolve());
    mockUseAction.mockReturnValue(sendActionMock);
    setupQueries({ session: { status: 'running' } });

    const result = useConvexChat(SESSION_ID);
    await result.sendMessage('Please stop');

    expect(sendActionMock).not.toHaveBeenCalled();
  });

  test('sendMessage passes undefined for optional fields when not provided', async () => {
    const sendActionMock = mock(() => Promise.resolve());
    mockUseAction.mockReturnValue(sendActionMock);
    setupQueries({ session: { status: 'idle' } });

    const result = useConvexChat(SESSION_ID);
    await result.sendMessage('Hello');

    expect(sendActionMock).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      message: 'Hello',
      model: undefined,
      alphaMode: undefined,
      reasoningEffort: undefined,
    });
  });
});

describe('useConvexChat: answerQuestion', () => {
  test('calls answerMutation with sessionId and answer', async () => {
    const answerMock = mock(() => Promise.resolve());
    // useMutation is called twice: first for cancelMutation, then for answerMutation
    let mutCallIndex = 0;
    mockUseMutation.mockImplementation(() => {
      mutCallIndex++;
      if (mutCallIndex === 2) return answerMock;
      return mock(() => Promise.resolve());
    });
    setupQueries({ session: { status: 'running' } });

    const result = useConvexChat(SESSION_ID);
    await result.answerQuestion('yes');

    expect(answerMock).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answer: 'yes',
    });
  });
});

describe('useConvexChat: requestCancel', () => {
  test('calls cancelMutation with session id', async () => {
    const cancelMock = mock(() => Promise.resolve());
    // useMutation is called twice: first for cancelMutation, then for answerMutation
    let mutCallIndex = 0;
    mockUseMutation.mockImplementation(() => {
      mutCallIndex++;
      if (mutCallIndex === 1) return cancelMock;
      return mock(() => Promise.resolve());
    });
    setupQueries({ session: { status: 'running' } });

    const result = useConvexChat(SESSION_ID);
    await result.requestCancel();

    expect(cancelMock).toHaveBeenCalledWith({ id: SESSION_ID });
  });
});
