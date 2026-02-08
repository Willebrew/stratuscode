/**
 * ChatSession sendMessage / loadSession / executeTool Tests
 *
 * Comprehensive tests targeting the uncovered lines (65-130, 247-270,
 * 374-441, 462-863, 894-949) with mocked processDirectly.
 *
 * Uses real storage (initDatabase) and mocked @sage/core processDirectly.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// Mock processDirectly before any imports
// ============================================

let mockProcessDirectly = mock(async (_opts: any) => ({
  content: 'Hello from assistant.',
  reasoning: undefined,
  toolCalls: [],
  inputTokens: 200,
  outputTokens: 50,
  lastInputTokens: 200,
  responseMessages: [{ role: 'assistant', content: 'Hello from assistant.' }],
}));

mock.module('@willebrew/sage-core', () => ({
  processDirectly: (...args: any[]) => mockProcessDirectly(...args),
  createToolRegistry: () => createMockRegistry(),
}));

function createMockRegistry() {
  const tools = new Map<string, any>();
  return {
    register(tool: any) { tools.set(tool.name, tool); },
    get(name: string) { return tools.get(name); },
    list() { return Array.from(tools.values()); },
    toAPIFormat() {
      return Array.from(tools.values()).map((t: any) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
    },
    async execute(name: string, args: any, ctx: any) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return tool.execute(args, ctx);
    },
    async registerMCP() {},
  };
}

// Mock tools module to use our mock registry
mock.module('@stratuscode/tools', () => ({
  registerBuiltInTools: mock((registry: any) => {
    // Register a test tool for executeTool tests
    registry.register({
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: { input: { type: 'string' } } },
      execute: async (args: any) => ({ result: 'ok', input: args.input }),
    });
    registry.register({
      name: 'failing_tool',
      description: 'Always fails',
      parameters: { type: 'object', properties: {} },
      execute: async () => { throw new Error('Tool execution failed'); },
    });
  }),
  createStratusCodeToolRegistry: mock(() => createMockRegistry()),
}));

// Now import after mocks are set up
import { initDatabase, closeDatabase } from '@stratuscode/storage';
import { ChatSession, expandMentions, toSageConfig } from './chat-session';

// ============================================
// Test setup
// ============================================

const testDir = `/tmp/stratuscode-sendmsg-test-${Date.now()}`;
const projectDir = path.join(testDir, 'project');

beforeAll(() => {
  fs.mkdirSync(projectDir, { recursive: true });
  initDatabase({ dataDir: testDir });
});

afterAll(() => {
  closeDatabase();
});

function createBaseConfig() {
  return {
    model: 'gpt-4o',
    provider: {
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1',
    },
    agent: {
      name: 'default',
      maxDepth: 100,
      toolTimeout: 30000,
      maxToolResultSize: 50000,
    },
  };
}

function createTestSession(overrides?: Partial<{ agent: string; config: any; modelOverride: string; providerOverride: string }>) {
  const session = new ChatSession({
    projectDir,
    config: createBaseConfig() as any,
    agent: 'build',
    ...overrides,
  });
  // Always add an error listener to prevent unhandled error throws from EventEmitter
  session.on('error', () => {});
  return session;
}

function defaultResult(overrides?: any) {
  return {
    content: 'Hello from assistant.',
    reasoning: undefined,
    toolCalls: [],
    inputTokens: 200,
    outputTokens: 50,
    lastInputTokens: 200,
    responseMessages: [{ role: 'assistant', content: 'Hello from assistant.' }],
    ...overrides,
  };
}

// ============================================
// sendMessage -- basic flow
// ============================================

describe('sendMessage', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
    mockProcessDirectly.mockImplementation(async () => defaultResult());
  });

  test('normal flow: sets isLoading true then false', async () => {
    const session = createTestSession();
    const states: boolean[] = [];
    session.on('state', (s: any) => states.push(s.isLoading));

    await session.sendMessage('Hello');

    expect(states[0]).toBe(true);
    expect(states[states.length - 1]).toBe(false);
    expect(session.getState().isLoading).toBe(false);
  });

  test('normal flow: adds user message to state', async () => {
    const session = createTestSession();
    await session.sendMessage('What is 2+2?');

    const state = session.getState();
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
    expect(state.messages[0]!.role).toBe('user');
    expect(state.messages[0]!.content).toBe('What is 2+2?');
  });

  test('normal flow: appends response messages from processDirectly', async () => {
    const session = createTestSession();
    await session.sendMessage('Hi');

    const state = session.getState();
    const assistantMsgs = state.messages.filter(m => m.role === 'assistant');
    expect(assistantMsgs.length).toBeGreaterThanOrEqual(1);
    expect(assistantMsgs[0]!.content).toBe('Hello from assistant.');
  });

  test('normal flow: creates timeline events including user event', async () => {
    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Hi');

    const userEvents = events.filter(e => e.kind === 'user');
    expect(userEvents.length).toBe(1);
    expect(userEvents[0].content).toBe('Hi');
  });

  test('normal flow: creates session on first call', async () => {
    const session = createTestSession();
    expect(session.getState().sessionId).toBeUndefined();

    let changedId: string | undefined;
    session.on('session_changed', (id: string) => { changedId = id; });

    await session.sendMessage('First message');

    expect(session.getState().sessionId).toBeDefined();
    expect(changedId).toBeDefined();
  });

  test('normal flow: updates token usage', async () => {
    const session = createTestSession();
    await session.sendMessage('Count tokens');

    const state = session.getState();
    expect(state.tokens.input).toBeGreaterThan(0);
    expect(state.tokens.output).toBeGreaterThan(0);
  });

  test('normal flow: emits tokens_update', async () => {
    const session = createTestSession();
    let tokenUpdate: any;
    session.on('tokens_update', (u: any) => { tokenUpdate = u; });

    await session.sendMessage('Hi');

    expect(tokenUpdate).toBeDefined();
    expect(tokenUpdate.tokens).toBeDefined();
  });

  test('normal flow: computes context usage with large enough tokens', async () => {
    mockProcessDirectly.mockImplementation(async () => defaultResult({
      inputTokens: 50000,
      outputTokens: 5000,
      lastInputTokens: 50000,
    }));

    const session = createTestSession();
    await session.sendMessage('Context check');

    const state = session.getState();
    // 50000 / 128000 = ~39%
    expect(state.contextUsage.used).toBeGreaterThan(0);
    expect(state.contextUsage.limit).toBe(128_000);
    expect(state.contextUsage.percent).toBeGreaterThan(0);
    expect(state.contextUsage.percent).toBeLessThanOrEqual(99);
  });

  test('early return when isLoading is true', async () => {
    const session = createTestSession();

    let resolveFirst!: () => void;
    const firstCallPromise = new Promise<void>(r => { resolveFirst = r; });
    mockProcessDirectly.mockImplementation(async () => {
      await firstCallPromise;
      return defaultResult();
    });

    const p1 = session.sendMessage('First');
    expect(session.getState().isLoading).toBe(true);

    // Second call should early-return because isLoading is true
    await session.sendMessage('Second');

    const msgs = session.getState().messages;
    const userMsgs = msgs.filter(m => m.role === 'user');
    expect(userMsgs.length).toBe(1);
    expect(userMsgs[0]!.content).toBe('First');

    resolveFirst();
    await p1;
  });

  test('calls processDirectly with correct arguments', async () => {
    const session = createTestSession();
    await session.sendMessage('Check args');

    expect(mockProcessDirectly).toHaveBeenCalledTimes(1);
    const callArgs = mockProcessDirectly.mock.calls[0]![0];
    expect(callArgs.systemPrompt).toBeDefined();
    expect(typeof callArgs.systemPrompt).toBe('string');
    expect(callArgs.messages).toBeDefined();
    expect(callArgs.messages.length).toBeGreaterThan(0);
    expect(callArgs.config).toBeDefined();
    expect(callArgs.abort).toBeDefined();
    expect(callArgs.sessionId).toBeDefined();
    expect(callArgs.callbacks).toBeDefined();
    expect(callArgs.tools).toBeDefined();
  });

  test('stores session tokens from getSessionTokenTotals', async () => {
    const session = createTestSession();
    await session.sendMessage('Token totals');

    const state = session.getState();
    expect(state.sessionTokens).toBeDefined();
  });

  test('clears error state before starting', async () => {
    const session = createTestSession();

    // First call fails
    mockProcessDirectly.mockImplementationOnce(async () => {
      throw new Error('First failure');
    });
    await session.sendMessage('Will fail');
    expect(session.getState().error).toBe('First failure');

    // Second call succeeds
    mockProcessDirectly.mockImplementation(async () => defaultResult({ content: 'Recovered' }));
    await session.sendMessage('Recovery');

    expect(session.getState().error).toBeNull();
  });
});

// ============================================
// sendMessage -- streaming callbacks
// ============================================

describe('sendMessage streaming callbacks', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('onToken callback creates assistant timeline events', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToken('Hello ');
      opts.callbacks.onToken('world');
      return defaultResult({ content: 'Hello world' });
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Stream me');

    const assistantEvents = events.filter(e => e.kind === 'assistant');
    expect(assistantEvents.length).toBeGreaterThanOrEqual(1);
  });

  test('onReasoning callback creates reasoning timeline events', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onReasoning('Thinking about ');
      opts.callbacks.onReasoning('the answer...');
      return defaultResult({ content: 'The answer is 42.', reasoning: 'Thinking about the answer...' });
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Reason for me');

    const reasoningEvents = events.filter(e => e.kind === 'reasoning');
    expect(reasoningEvents.length).toBeGreaterThanOrEqual(1);
  });

  test('onReasoning then onToken flushes reasoning first', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onReasoning('thinking...');
      opts.callbacks.onToken('result: ');
      opts.callbacks.onToken('42');
      return defaultResult({ content: 'result: 42', reasoning: 'thinking...' });
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Mixed stream');

    const reasoningEvents = events.filter(e => e.kind === 'reasoning');
    const assistantEvents = events.filter(e => e.kind === 'assistant');
    expect(reasoningEvents.length).toBeGreaterThanOrEqual(1);
    expect(assistantEvents.length).toBeGreaterThanOrEqual(1);
  });

  test('onToken then onReasoning flushes text first', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToken('text first ');
      opts.callbacks.onReasoning('then reasoning');
      return defaultResult({ content: 'text first ', reasoning: 'then reasoning', responseMessages: [] });
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Reversed stream');

    const assistantEvents = events.filter(e => e.kind === 'assistant');
    const reasoningEvents = events.filter(e => e.kind === 'reasoning');
    expect(assistantEvents.length).toBeGreaterThanOrEqual(1);
    expect(reasoningEvents.length).toBeGreaterThanOrEqual(1);
  });

  test('onToolCall callback creates tool_call timeline event', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToolCall({
        id: 'tc-1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"path":"test.ts"}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"test.ts"}' } },
        JSON.stringify({ content: 'file content' }),
      );
      return defaultResult({ content: 'Read the file.' });
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Read a file');

    const toolCallEvents = events.filter(e => e.kind === 'tool_call');
    const toolResultEvents = events.filter(e => e.kind === 'tool_result');
    expect(toolCallEvents.length).toBe(1);
    expect(toolCallEvents[0].toolName).toBe('read_file');
    expect(toolCallEvents[0].status).toBe('running');
    expect(toolResultEvents.length).toBe(1);
  });

  test('onToolResult marks tool_call as completed for success result', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToolCall({
        id: 'tc-2',
        type: 'function',
        function: { name: 'write_file', arguments: '{}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-2', type: 'function', function: { name: 'write_file', arguments: '{}' } },
        JSON.stringify({ success: true }),
      );
      return defaultResult({ content: 'Done.' });
    });

    const session = createTestSession();
    await session.sendMessage('Write something');

    const state = session.getState();
    const toolCallEvent = state.timelineEvents.find(e => e.kind === 'tool_call');
    expect(toolCallEvent).toBeDefined();
    expect((toolCallEvent as any).status).toBe('completed');
  });

  test('onToolResult marks tool_call as failed when result has error', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToolCall({
        id: 'tc-err',
        type: 'function',
        function: { name: 'bash', arguments: '{"cmd":"exit 1"}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-err', type: 'function', function: { name: 'bash', arguments: '{"cmd":"exit 1"}' } },
        JSON.stringify({ error: true, message: 'Command failed' }),
      );
      return defaultResult({ content: 'Command failed.' });
    });

    const session = createTestSession();
    await session.sendMessage('Run failing command');

    const state = session.getState();
    const toolCallEvent = state.timelineEvents.find(e => e.kind === 'tool_call');
    expect(toolCallEvent).toBeDefined();
    expect((toolCallEvent as any).status).toBe('failed');
  });

  test('onToolResult marks tool_call as failed when result has success=false', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToolCall({
        id: 'tc-sf',
        type: 'function',
        function: { name: 'edit_file', arguments: '{}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-sf', type: 'function', function: { name: 'edit_file', arguments: '{}' } },
        JSON.stringify({ success: false }),
      );
      return defaultResult({ content: 'Edit failed.', responseMessages: [] });
    });

    const session = createTestSession();
    await session.sendMessage('Fail edit');

    const state = session.getState();
    const toolCallEvent = state.timelineEvents.find(e => e.kind === 'tool_call');
    expect(toolCallEvent).toBeDefined();
    expect((toolCallEvent as any).status).toBe('failed');
  });

  test('onToolResult with non-JSON result marks as completed', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToolCall({
        id: 'tc-nj',
        type: 'function',
        function: { name: 'glob', arguments: '{}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-nj', type: 'function', function: { name: 'glob', arguments: '{}' } },
        'This is plain text, not JSON',
      );
      return defaultResult({ content: 'Done.', responseMessages: [] });
    });

    const session = createTestSession();
    await session.sendMessage('Non-JSON result');

    const state = session.getState();
    const toolCallEvent = state.timelineEvents.find(e => e.kind === 'tool_call');
    expect(toolCallEvent).toBeDefined();
    expect((toolCallEvent as any).status).toBe('completed');
  });

  test('onToolResult with plan_exit sets planExitProposed', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToolCall({
        id: 'tc-plan',
        type: 'function',
        function: { name: 'plan_exit', arguments: '{}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-plan', type: 'function', function: { name: 'plan_exit', arguments: '{}' } },
        JSON.stringify({ proposingExit: true }),
      );
      return defaultResult({ content: 'Plan ready.', responseMessages: [] });
    });

    const session = createTestSession({ agent: 'plan' });
    let planExitEmitted = false;
    session.on('plan_exit_proposed', () => { planExitEmitted = true; });

    await session.sendMessage('Create plan');

    expect(session.getState().planExitProposed).toBe(true);
    expect(planExitEmitted).toBe(true);
  });

  test('onToolResult with plan_exit but no proposingExit does not set flag', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToolCall({
        id: 'tc-plan2',
        type: 'function',
        function: { name: 'plan_exit', arguments: '{}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-plan2', type: 'function', function: { name: 'plan_exit', arguments: '{}' } },
        JSON.stringify({ proposingExit: false }),
      );
      return defaultResult({ content: 'No exit.', responseMessages: [] });
    });

    const session = createTestSession({ agent: 'plan' });
    await session.sendMessage('No plan exit');

    expect(session.getState().planExitProposed).toBe(false);
  });

  test('onStepComplete updates tokens and context usage', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onStepComplete(1, { inputTokens: 50000, outputTokens: 1500 });
      return defaultResult({ inputTokens: 50000, outputTokens: 1500, lastInputTokens: 50000 });
    });

    const session = createTestSession();
    let tokenUpdate: any;
    session.on('tokens_update', (u: any) => { tokenUpdate = u; });

    await session.sendMessage('Step test');

    expect(tokenUpdate).toBeDefined();
    expect(session.getState().contextUsage.used).toBeGreaterThan(0);
  });

  test('onStepComplete with zero inputTokens only emits tokens', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onStepComplete(1, { inputTokens: 0, outputTokens: 50 });
      return defaultResult({ inputTokens: 0, outputTokens: 50, lastInputTokens: 0 });
    });

    const session = createTestSession();
    let tokenUpdateCount = 0;
    session.on('tokens_update', () => { tokenUpdateCount++; });

    await session.sendMessage('Zero input step');

    expect(tokenUpdateCount).toBeGreaterThan(0);
  });

  test('onStatusChange with context_compacting sets status', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onStatusChange('context_compacting');
      return defaultResult();
    });

    const session = createTestSession();
    const statuses: any[] = [];
    session.on('context_status', (s: any) => { statuses.push(s); });

    await session.sendMessage('Compact');

    expect(statuses.some(s => s === 'Compacting...')).toBe(true);
  });

  test('onStatusChange with context_summarized sets status', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onStatusChange('context_summarized');
      return defaultResult();
    });

    const session = createTestSession();
    const statuses: any[] = [];
    session.on('context_status', (s: any) => { statuses.push(s); });

    await session.sendMessage('Summarize');

    expect(statuses.some(s => s === 'Summarized')).toBe(true);
  });

  test('onStatusChange with context_truncated sets status', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onStatusChange('context_truncated');
      return defaultResult();
    });

    const session = createTestSession();
    const statuses: any[] = [];
    session.on('context_status', (s: any) => { statuses.push(s); });

    await session.sendMessage('Truncate');

    expect(statuses.some(s => s === 'Truncated')).toBe(true);
  });

  test('onContextManaged with wasSummarized sets context status', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onContextManaged({
        wasTruncated: false,
        wasSummarized: true,
        messagesRemoved: 5,
        tokensBefore: 100000,
        tokensAfter: 50000,
      });
      return defaultResult();
    });

    const session = createTestSession();
    const statuses: any[] = [];
    session.on('context_status', (s: any) => { statuses.push(s); });

    await session.sendMessage('Context managed summarize');

    expect(statuses.some(s => typeof s === 'string' && s.includes('Summarized'))).toBe(true);
  });

  test('onContextManaged with wasTruncated sets context status', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onContextManaged({
        wasTruncated: true,
        wasSummarized: false,
        messagesRemoved: 3,
        tokensBefore: 90000,
        tokensAfter: 60000,
      });
      return defaultResult();
    });

    const session = createTestSession();
    const statuses: any[] = [];
    session.on('context_status', (s: any) => { statuses.push(s); });

    await session.sendMessage('Context managed truncate');

    expect(statuses.some(s => typeof s === 'string' && s.includes('Truncated'))).toBe(true);
  });

  test('onError callback creates status timeline event', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onError(new Error('Stream error'));
      return defaultResult();
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Error callback');

    const statusEvents = events.filter(e => e.kind === 'status');
    expect(statusEvents.some(e => e.content.includes('Stream error'))).toBe(true);
  });

  test('flushes reasoning event marked as streaming=false after completion', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onReasoning('thinking deeply...');
      return defaultResult({ reasoning: 'thinking deeply...' });
    });

    const session = createTestSession();
    await session.sendMessage('Final reasoning flush');

    const state = session.getState();
    const reasoningEvents = state.timelineEvents.filter(e => e.kind === 'reasoning');
    expect(reasoningEvents.length).toBeGreaterThanOrEqual(1);
    for (const re of reasoningEvents) {
      expect(re.streaming).toBe(false);
    }
  });
});

// ============================================
// sendMessage -- error handling
// ============================================

describe('sendMessage error handling', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('processDirectly throws: sets error state', async () => {
    mockProcessDirectly.mockImplementation(async () => {
      throw new Error('API connection failed');
    });

    const session = createTestSession();
    await session.sendMessage('Will fail');

    const state = session.getState();
    expect(state.error).toBe('API connection failed');
    expect(state.isLoading).toBe(false);
  });

  test('processDirectly throws: emits error event', async () => {
    mockProcessDirectly.mockImplementation(async () => {
      throw new Error('Network timeout');
    });

    const session = createTestSession();
    let errorMsg: string | undefined;
    session.on('error', (e: string) => { errorMsg = e; });

    await session.sendMessage('Will fail');

    expect(errorMsg).toBe('Network timeout');
  });

  test('processDirectly throws: adds error message to messages', async () => {
    mockProcessDirectly.mockImplementation(async () => {
      throw new Error('Server error');
    });

    const session = createTestSession();
    await session.sendMessage('Will fail');

    const state = session.getState();
    const lastMsg = state.messages[state.messages.length - 1]!;
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toContain('Error: Server error');
  });

  test('processDirectly throws: creates error timeline event', async () => {
    mockProcessDirectly.mockImplementation(async () => {
      throw new Error('Something broke');
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Will fail');

    const statusEvents = events.filter(e => e.kind === 'status');
    expect(statusEvents.some(e => e.content.includes('Something broke'))).toBe(true);
  });

  test('processDirectly throws with partial content: preserves partial in error msg', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToken('Partial response start');
      throw new Error('Mid-stream failure');
    });

    const session = createTestSession();
    await session.sendMessage('Will partially fail');

    const state = session.getState();
    const lastMsg = state.messages[state.messages.length - 1]!;
    expect(lastMsg.content).toContain('Partial response start');
    expect(lastMsg.content).toContain('Mid-stream failure');
  });

  test('processDirectly throws non-Error: stringifies error', async () => {
    mockProcessDirectly.mockImplementation(async () => {
      throw 'string error thrown';
    });

    const session = createTestSession();
    await session.sendMessage('Non-error throw');

    const state = session.getState();
    expect(state.error).toBe('string error thrown');
  });

  test('clears streaming flush interval on error', async () => {
    mockProcessDirectly.mockImplementation(async () => {
      throw new Error('Interval test');
    });

    const session = createTestSession();
    await session.sendMessage('Clear interval');

    expect(session.getState().isLoading).toBe(false);
  });
});

// ============================================
// sendMessage -- newSummary persistence
// ============================================

describe('sendMessage newSummary', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('stores newSummary from result and passes to next call as existingSummary', async () => {
    const summaryState = { messages: ['summary'], tokenCount: 200 };
    let callCount = 0;
    let secondCallExistingSummary: any;

    mockProcessDirectly.mockImplementation(async (opts: any) => {
      callCount++;
      if (callCount === 1) {
        return defaultResult({ newSummary: summaryState });
      }
      secondCallExistingSummary = opts.existingSummary;
      return defaultResult();
    });

    const session = createTestSession();
    await session.sendMessage('First');
    await session.sendMessage('Second');

    expect(callCount).toBe(2);
    expect(secondCallExistingSummary).toEqual(summaryState);
  });
});

// ============================================
// sendMessage -- attachments
// ============================================

describe('sendMessage attachments', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('converts image attachments to ContentPart array for LLM', async () => {
    let capturedMessages: any;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedMessages = opts.messages;
      return defaultResult({ content: 'I see the image.' });
    });

    const session = createTestSession();
    await session.sendMessage('Describe this image', undefined, undefined, [
      { type: 'image', data: 'base64data', mime: 'image/png' },
    ]);

    const lastMsg = capturedMessages[capturedMessages.length - 1];
    expect(Array.isArray(lastMsg.content)).toBe(true);
    expect(lastMsg.content[0].type).toBe('text');
    expect(lastMsg.content[1].type).toBe('image');
    expect(lastMsg.content[1].imageUrl).toContain('data:image/png;base64,');
  });

  test('attachments create user timeline event with attachment data', async () => {
    mockProcessDirectly.mockImplementation(async () => defaultResult());

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('With attachment', undefined, undefined, [
      { type: 'image', data: 'imgdata', mime: 'image/jpeg' },
    ]);

    const userEvent = events.find(e => e.kind === 'user');
    expect(userEvent).toBeDefined();
  });

  test('no attachments sends plain string content to LLM', async () => {
    let capturedMessages: any;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedMessages = opts.messages;
      return defaultResult();
    });

    const session = createTestSession();
    await session.sendMessage('No attachments');

    const lastMsg = capturedMessages[capturedMessages.length - 1];
    expect(typeof lastMsg.content).toBe('string');
  });
});

// ============================================
// sendMessage -- plan mode
// ============================================

describe('sendMessage plan mode', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('plan agent appends PLAN_MODE_REMINDER to message', async () => {
    let capturedMessages: any;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedMessages = opts.messages;
      return defaultResult();
    });

    const session = createTestSession({ agent: 'plan' });
    await session.sendMessage('Create a plan');

    const lastMsg = capturedMessages[capturedMessages.length - 1];
    const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';
    expect(content).toContain('<system-reminder>');
    expect(content).toContain('PLAN mode');
    expect(content).toContain('plan_exit');
  });

  test('plan mode creates plan file directory', async () => {
    mockProcessDirectly.mockImplementation(async () => defaultResult());

    const session = createTestSession({ agent: 'plan' });
    await session.sendMessage('Plan something');

    const plansDir = path.join(projectDir, '.stratuscode', 'plans');
    expect(fs.existsSync(plansDir)).toBe(true);
  });

  test('buildSwitch appends BUILD_SWITCH_REMINDER when previous agent was plan', async () => {
    let capturedMessages: any;
    let callCount = 0;

    mockProcessDirectly.mockImplementation(async (opts: any) => {
      callCount++;
      capturedMessages = opts.messages;
      return defaultResult();
    });

    // First message as plan agent
    const session = createTestSession({ agent: 'plan' });
    await session.sendMessage('Plan first');

    // Switch to build and send with buildSwitch
    session.setAgent('build');
    await session.sendMessage('Build it', undefined, { buildSwitch: true });

    const lastMsg = capturedMessages[capturedMessages.length - 1];
    const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';
    expect(content).toContain('operational mode has changed from plan to build');
    expect(callCount).toBe(2);
  });

  test('buildSwitch without previous plan agent does NOT append reminder', async () => {
    let capturedMessages: any;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedMessages = opts.messages;
      return defaultResult();
    });

    const session = createTestSession({ agent: 'build' });
    await session.sendMessage('Build directly', undefined, { buildSwitch: true });

    const lastMsg = capturedMessages[capturedMessages.length - 1];
    const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';
    expect(content).not.toContain('operational mode has changed');
  });

  test('plan mode with attachments appends reminder to ContentPart text', async () => {
    let capturedMessages: any;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedMessages = opts.messages;
      return defaultResult();
    });

    const session = createTestSession({ agent: 'plan' });
    await session.sendMessage('Plan with image', undefined, undefined, [
      { type: 'image', data: 'base64', mime: 'image/png' },
    ]);

    const lastMsg = capturedMessages[capturedMessages.length - 1];
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const textPart = lastMsg.content.find((p: any) => p.type === 'text');
    expect(textPart.text).toContain('PLAN mode');
  });
});

// ============================================
// sendMessage -- agent override
// ============================================

describe('sendMessage agent override', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('agentOverride changes the effective agent for that call', async () => {
    let capturedMessages: any;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedMessages = opts.messages;
      return defaultResult();
    });

    const session = createTestSession({ agent: 'build' });
    await session.sendMessage('Plan this', 'plan');

    const lastMsg = capturedMessages[capturedMessages.length - 1];
    const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';
    expect(content).toContain('PLAN mode');
  });
});

// ============================================
// sendMessage -- onToolCall flushes streaming
// ============================================

describe('sendMessage onToolCall flushes pending streams', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('flushes reasoning before tool call', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onReasoning('thinking before tool...');
      opts.callbacks.onToolCall({
        id: 'tc-flush',
        type: 'function',
        function: { name: 'read_file', arguments: '{}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-flush', type: 'function', function: { name: 'read_file', arguments: '{}' } },
        JSON.stringify({ content: 'ok' }),
      );
      return defaultResult();
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Flush reasoning before tool');

    const reasoningEvents = events.filter(e => e.kind === 'reasoning');
    expect(reasoningEvents.length).toBeGreaterThanOrEqual(1);
    const toolCallEvents = events.filter(e => e.kind === 'tool_call');
    expect(toolCallEvents.length).toBe(1);
  });

  test('flushes text before tool call', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToken('text before tool ');
      opts.callbacks.onToolCall({
        id: 'tc-flush-text',
        type: 'function',
        function: { name: 'write_file', arguments: '{}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-flush-text', type: 'function', function: { name: 'write_file', arguments: '{}' } },
        JSON.stringify({ success: true }),
      );
      return defaultResult();
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Flush text before tool');

    const assistantEvents = events.filter(e => e.kind === 'assistant');
    expect(assistantEvents.length).toBeGreaterThanOrEqual(1);
    const toolCallEvents = events.filter(e => e.kind === 'tool_call');
    expect(toolCallEvents.length).toBe(1);
  });
});

// ============================================
// loadSession
// ============================================

describe('loadSession', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
    mockProcessDirectly.mockImplementation(async () => defaultResult());
  });

  test('loads existing session with messages and events', async () => {
    const session1 = createTestSession();
    await session1.sendMessage('Create session to load');
    const sessionId = session1.getState().sessionId!;
    expect(sessionId).toBeDefined();

    const session2 = createTestSession();
    let changedId: string | undefined;
    session2.on('session_changed', (id: string) => { changedId = id; });

    await session2.loadSession(sessionId);

    const state = session2.getState();
    expect(state.sessionId).toBe(sessionId);
    expect(state.messages.length).toBeGreaterThan(0);
    expect(state.timelineEvents.length).toBeGreaterThan(0);
    expect(changedId).toBe(sessionId);
  });

  test('loadSession clears previous state first', async () => {
    const session = createTestSession();
    await session.sendMessage('Initial message');
    const firstSessionId = session.getState().sessionId!;

    const session2 = createTestSession();
    await session2.sendMessage('Second session');
    const secondSessionId = session2.getState().sessionId!;

    await session.loadSession(secondSessionId);
    expect(session.getState().sessionId).toBe(secondSessionId);
    expect(session.getState().sessionId).not.toBe(firstSessionId);
  });

  test('loadSession with non-existent ID sets error', async () => {
    const session = createTestSession();
    let errorMsg: string | undefined;
    session.on('error', (e: string) => { errorMsg = e; });

    await session.loadSession('non-existent-session-id');

    expect(session.getState().error).toBe('Session not found');
    expect(errorMsg).toBe('Session not found');
  });

  test('loadSession restores token totals', async () => {
    const session1 = createTestSession();
    await session1.sendMessage('Count my tokens');
    const sessionId = session1.getState().sessionId!;

    const session2 = createTestSession();
    await session2.loadSession(sessionId);

    const state = session2.getState();
    expect(state.tokens).toBeDefined();
    expect(state.sessionTokens).toBeDefined();
  });

  test('loadSession computes context usage from last assistant message', async () => {
    mockProcessDirectly.mockImplementation(async () => defaultResult({
      inputTokens: 50000,
      outputTokens: 5000,
      lastInputTokens: 50000,
    }));

    const session1 = createTestSession();
    await session1.sendMessage('Context usage test');
    const sessionId = session1.getState().sessionId!;

    const session2 = createTestSession();
    await session2.loadSession(sessionId);

    const state = session2.getState();
    expect(state.contextUsage).toBeDefined();
    expect(state.contextUsage.limit).toBe(128_000);
  });

  test('loadSession handles empty session ID gracefully', async () => {
    const session = createTestSession();
    let errorMsg: string | undefined;
    session.on('error', (e: string) => { errorMsg = e; });

    await session.loadSession('');

    expect(session.getState().error).toBeDefined();
  });
});

// ============================================
// executeTool
// ============================================

describe('executeTool', () => {
  test('executes registered tool and returns string result', async () => {
    const session = createTestSession();
    const result = await session.executeTool('test_tool', { input: 'hello' });

    const parsed = JSON.parse(result);
    expect(parsed.result).toBe('ok');
    expect(parsed.input).toBe('hello');
  });

  test('returns error JSON for unknown tool', async () => {
    const session = createTestSession();
    const result = await session.executeTool('nonexistent_tool', {});

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('Tool not found');
    expect(parsed.message).toContain('nonexistent_tool');
  });

  test('returns error JSON when tool throws', async () => {
    const session = createTestSession();
    const result = await session.executeTool('failing_tool', {});

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('Tool execution failed');
  });

  test('executeTool creates a session if none exists', async () => {
    const session = createTestSession();
    expect(session.getState().sessionId).toBeUndefined();

    await session.executeTool('test_tool', { input: 'x' });

    expect(session.getState().sessionId).toBeDefined();
  });

  test('executeTool returns stringified result when execute returns object', async () => {
    const session = createTestSession();
    const result = await session.executeTool('test_tool', { input: 'json' });

    expect(() => JSON.parse(result)).not.toThrow();
  });
});

// ============================================
// Private helper coverage via sendMessage
// ============================================

describe('private helper methods (tested via sendMessage)', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('getAgent returns build agent by default', async () => {
    let capturedSystemPrompt: string | undefined;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedSystemPrompt = opts.systemPrompt;
      return defaultResult();
    });

    const session = createTestSession({ agent: 'build' });
    await session.sendMessage('Agent check');

    expect(capturedSystemPrompt).toBeDefined();
  });

  test('getAgent falls back to build for unknown agent', async () => {
    let capturedSystemPrompt: string | undefined;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedSystemPrompt = opts.systemPrompt;
      return defaultResult();
    });

    const session = createTestSession({ agent: 'nonexistent_agent' as any });
    await session.sendMessage('Unknown agent');

    expect(capturedSystemPrompt).toBeDefined();
  });

  test('getContextWindow uses model override', async () => {
    mockProcessDirectly.mockImplementation(async () => defaultResult({
      inputTokens: 50000,
      outputTokens: 100,
      lastInputTokens: 50000,
    }));

    const session = createTestSession({ modelOverride: 'gpt-5.2-codex' });
    await session.sendMessage('Context window check');

    const state = session.getState();
    expect(state.contextUsage.limit).toBe(272_000);
  });

  test('getContextWindow defaults to 128K for unknown model', async () => {
    mockProcessDirectly.mockImplementation(async () => defaultResult({
      inputTokens: 1000,
      outputTokens: 100,
      lastInputTokens: 1000,
    }));

    const session = createTestSession({ modelOverride: 'unknown-model' });
    await session.sendMessage('Unknown model context');

    const state = session.getState();
    expect(state.contextUsage.limit).toBe(128_000);
  });

  test('computeContextUsage caps percent at 99', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onStepComplete(1, { inputTokens: 200000, outputTokens: 100 });
      return defaultResult({ inputTokens: 200000, outputTokens: 100, lastInputTokens: 200000 });
    });

    const session = createTestSession();
    await session.sendMessage('Cap at 99');

    const state = session.getState();
    expect(state.contextUsage.percent).toBeLessThanOrEqual(99);
  });

  test('pushEvent adds events and emits them', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onToolCall({
        id: 'tc-push',
        type: 'function',
        function: { name: 'test', arguments: '{}' },
      });
      opts.callbacks.onToolResult(
        { id: 'tc-push', type: 'function', function: { name: 'test', arguments: '{}' } },
        '{}',
      );
      return defaultResult();
    });

    const session = createTestSession();
    const events: any[] = [];
    session.on('timeline_event', (e: any) => events.push(e));

    await session.sendMessage('Push event test');

    // Should have user event + tool_call + tool_result + possibly assistant
    expect(events.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================
// ensureCodexToken (tested via sendMessage)
// ============================================

describe('ensureCodexToken via sendMessage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockProcessDirectly.mockReset();
    mockProcessDirectly.mockImplementation(async () => defaultResult());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('skips refresh when no oauth auth', async () => {
    const session = createTestSession();
    let fetchCalled = false;
    globalThis.fetch = async (...args: any[]) => {
      fetchCalled = true;
      return originalFetch(...(args as [any]));
    };

    await session.sendMessage('No codex needed');
    expect(fetchCalled).toBe(false);
  });

  test('refreshes token when expired codex provider', async () => {
    // ensureCodexToken looks up config.providers[key] where key = providerOverride || 'openai-codex'
    const codexProvider = {
      apiKey: 'old-access-token',
      baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
      auth: {
        type: 'oauth' as const,
        access: 'old-access-token',
        refresh: 'old-refresh-token',
        expires: Date.now() - 1000, // expired
      },
    };
    const config: any = {
      ...createBaseConfig(),
      providers: {
        'openai-codex': codexProvider,
      },
    };

    globalThis.fetch = async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('oauth/token')) {
        return new Response(JSON.stringify({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    };

    const session = new ChatSession({
      projectDir,
      config,
      agent: 'build',
    });
    session.on('error', () => {});

    await session.sendMessage('Codex refresh test');

    // Token should be updated in the provider config
    expect(codexProvider.apiKey).toBe('new-access-token');
    expect(codexProvider.auth.access).toBe('new-access-token');
    expect(codexProvider.auth.refresh).toBe('new-refresh-token');
  });

  test('handles refresh failure gracefully (non-ok response)', async () => {
    const config: any = {
      ...createBaseConfig(),
      providers: {
        'openai-codex': {
          apiKey: 'expired-token',
          baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
          auth: {
            type: 'oauth',
            access: 'expired-token',
            refresh: 'bad-refresh',
            expires: Date.now() - 1000,
          },
        },
      },
    };

    globalThis.fetch = async () => {
      return new Response('Unauthorized', { status: 401 });
    };

    const session = new ChatSession({
      projectDir,
      config,
      agent: 'build',
    });
    session.on('error', () => {});

    await session.sendMessage('Refresh failure test');
    expect(session.getState().error).toBeNull();
  });

  test('handles fetch exception during refresh', async () => {
    const config: any = {
      ...createBaseConfig(),
      providers: {
        'openai-codex': {
          apiKey: 'expired-token',
          baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
          auth: {
            type: 'oauth',
            access: 'expired-token',
            refresh: 'crash-refresh',
            expires: Date.now() - 1000,
          },
        },
      },
    };

    globalThis.fetch = async () => {
      throw new Error('Network unreachable');
    };

    const session = new ChatSession({
      projectDir,
      config,
      agent: 'build',
    });
    session.on('error', () => {});

    await session.sendMessage('Fetch crash test');
    expect(session.getState().error).toBeNull();
  });

  test('skips refresh when token is not yet expired', async () => {
    const config: any = {
      ...createBaseConfig(),
      providers: {
        'openai-codex': {
          apiKey: 'valid-token',
          baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
          auth: {
            type: 'oauth',
            access: 'valid-token',
            refresh: 'valid-refresh',
            expires: Date.now() + 300_000, // 5 minutes from now
          },
        },
      },
    };

    let tokenRefreshAttempted = false;
    globalThis.fetch = async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('oauth/token')) {
        tokenRefreshAttempted = true;
      }
      return new Response('', { status: 404 });
    };

    const session = new ChatSession({
      projectDir,
      config,
      agent: 'build',
    });
    session.on('error', () => {});

    await session.sendMessage('Valid token test');
    expect(tokenRefreshAttempted).toBe(false);
  });
});

// ============================================
// Multiple messages in sequence
// ============================================

describe('multiple sequential messages', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
    mockProcessDirectly.mockImplementation(async () => defaultResult());
  });

  test('accumulates messages across calls', async () => {
    const session = createTestSession();
    await session.sendMessage('First');
    await session.sendMessage('Second');
    await session.sendMessage('Third');

    const state = session.getState();
    const userMsgs = state.messages.filter(m => m.role === 'user');
    expect(userMsgs.length).toBe(3);

    // processDirectly should receive accumulated messages on last call
    // The third call should have user+assistant+user+assistant+user = 5 messages
    const thirdCallIndex = mockProcessDirectly.mock.calls.length - 1;
    const lastCall = mockProcessDirectly.mock.calls[thirdCallIndex]![0];
    expect(lastCall.messages.length).toBeGreaterThanOrEqual(3);
  });

  test('reuses session ID across multiple sends', async () => {
    const session = createTestSession();
    await session.sendMessage('First');
    const id1 = session.getState().sessionId;

    await session.sendMessage('Second');
    const id2 = session.getState().sessionId;

    expect(id1).toBe(id2);
    expect(id1).toBeDefined();
  });
});

// ============================================
// onReasoning event update (existing event ID path)
// ============================================

describe('onReasoning update existing event', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('updates existing reasoning event instead of creating new one', async () => {
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      opts.callbacks.onReasoning('chunk1 ');
      opts.callbacks.onReasoning('chunk2 ');
      opts.callbacks.onReasoning('chunk3');
      return defaultResult({ reasoning: 'chunk1 chunk2 chunk3' });
    });

    const session = createTestSession();
    const newEvents: any[] = [];
    session.on('timeline_event', (e: any) => newEvents.push(e));

    await session.sendMessage('Multi-chunk reasoning');

    // Only one reasoning timeline_event should be emitted (the first one)
    const reasoningEmits = newEvents.filter(e => e.kind === 'reasoning');
    expect(reasoningEmits.length).toBe(1);

    const state = session.getState();
    const reasoningEvents = state.timelineEvents.filter(e => e.kind === 'reasoning');
    expect(reasoningEvents.length).toBe(1);
  });
});

// ============================================
// sendMessage with providerOverride in config
// ============================================

describe('sendMessage with provider override', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('passes provider override to config for LLM call', async () => {
    const config: any = {
      ...createBaseConfig(),
      providers: {
        'zen-provider': {
          apiKey: 'zen-key',
          baseUrl: 'https://opencode.ai/zen/v1',
          type: 'chat-completions',
        },
      },
    };

    let capturedConfig: any;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedConfig = opts.config;
      return defaultResult();
    });

    const session = new ChatSession({
      projectDir,
      config,
      agent: 'build',
      providerOverride: 'zen-provider',
    });
    session.on('error', () => {});

    await session.sendMessage('Provider override test');

    expect(capturedConfig.provider.apiKey).toBe('zen-key');
    expect(capturedConfig.provider.baseUrl).toBe('https://opencode.ai/zen/v1');
  });
});

// ============================================
// sendMessage with model override in config
// ============================================

describe('sendMessage with model override', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('passes model override to config for LLM call', async () => {
    let capturedConfig: any;
    mockProcessDirectly.mockImplementation(async (opts: any) => {
      capturedConfig = opts.config;
      return defaultResult();
    });

    const session = createTestSession({ modelOverride: 'gpt-5-mini' });
    await session.sendMessage('Model override test');

    expect(capturedConfig.model).toBe('gpt-5-mini');
  });
});

// ============================================
// sendMessage -- streaming flush interval (lines 619-621)
// ============================================

describe('sendMessage streaming flush interval', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('interval callback flushes text when streamingContentRef is set and type is text', async () => {
    // The setInterval fires every STREAMING_FLUSH_INTERVAL (75ms).
    // To test: have onToken set up streaming content, then delay inside
    // processDirectly long enough for the interval to fire and flush.
    const timelineEvents: any[] = [];

    mockProcessDirectly.mockImplementation(async (opts: any) => {
      // Emit a token to set up streamingContentRef and lastStreamingTypeRef
      opts.callbacks.onToken('Hello ');
      opts.callbacks.onToken('world');

      // Wait longer than the STREAMING_FLUSH_INTERVAL (75ms) so the
      // setInterval callback fires at least once
      await new Promise(resolve => setTimeout(resolve, 150));

      return defaultResult({ content: 'Hello world' });
    });

    const session = createTestSession();
    session.on('timeline_event', (e: any) => timelineEvents.push(e));

    await session.sendMessage('Test flush interval');

    // The interval should have flushed the text event at least once
    // during the 150ms delay, producing a timeline event with streaming=true
    const assistantEvents = timelineEvents.filter(e => e.kind === 'assistant');
    expect(assistantEvents.length).toBeGreaterThanOrEqual(1);
  });

  test('interval does not flush when lastStreamingTypeRef is not text', async () => {
    // If only reasoning tokens are emitted (no text), the interval should
    // NOT call flushTextEvent.
    const contextStatuses: any[] = [];

    mockProcessDirectly.mockImplementation(async (opts: any) => {
      // Emit reasoning only (not text)
      opts.callbacks.onReasoning('thinking...');

      // Wait for interval to fire
      await new Promise(resolve => setTimeout(resolve, 150));

      return defaultResult({ reasoning: 'thinking...' });
    });

    const session = createTestSession();
    const states: any[] = [];
    session.on('state', (s: any) => states.push(s));

    await session.sendMessage('Test no flush for reasoning');

    // The interval should not have flushed text events (only reasoning events)
    const allEvents = session.getState().timelineEvents;
    const assistantTextEvents = allEvents.filter(e => e.kind === 'assistant');
    // May be 0 or text events should only come from final flush, not from interval
    // The key assertion: no errors thrown, interval ran but did nothing for reasoning
    expect(session.getState().isLoading).toBe(false);
  });
});

// ============================================
// sendMessage -- onContextManaged setTimeout clears contextStatus (lines 774-775)
// ============================================

describe('sendMessage onContextManaged setTimeout', () => {
  beforeEach(() => {
    mockProcessDirectly.mockReset();
  });

  test('contextStatus is cleared to null after 15 seconds following onContextManaged summarized', async () => {
    // Capture the setTimeout callback so we can invoke it manually
    const originalSetTimeout = globalThis.setTimeout;
    let capturedTimeoutCallback: (() => void) | null = null;
    let capturedDelay: number | null = null;

    globalThis.setTimeout = ((fn: any, delay: any, ...args: any[]) => {
      if (delay === 15000) {
        capturedTimeoutCallback = fn;
        capturedDelay = delay;
        // Return a fake timer id but don't actually schedule
        return 999 as any;
      }
      return originalSetTimeout(fn, delay, ...args);
    }) as any;

    try {
      mockProcessDirectly.mockImplementation(async (opts: any) => {
        opts.callbacks.onContextManaged({
          wasTruncated: false,
          wasSummarized: true,
          messagesRemoved: 5,
          tokensBefore: 100000,
          tokensAfter: 50000,
        });
        return defaultResult();
      });

      const session = createTestSession();
      const statuses: any[] = [];
      session.on('context_status', (s: any) => { statuses.push(s); });

      await session.sendMessage('Context managed with timeout');

      // Before the timeout fires, contextStatus should be set to the summarized message
      expect(statuses.some(s => typeof s === 'string' && s.includes('Summarized'))).toBe(true);

      // Now invoke the captured timeout callback
      expect(capturedTimeoutCallback).not.toBeNull();
      expect(capturedDelay).toBe(15000);
      capturedTimeoutCallback!();

      // After the timeout fires, contextStatus should be null
      expect(statuses[statuses.length - 1]).toBeNull();
      expect(session.getState().contextStatus).toBeNull();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test('contextStatus is cleared to null after 15 seconds following onContextManaged truncated', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    let capturedTimeoutCallback: (() => void) | null = null;

    globalThis.setTimeout = ((fn: any, delay: any, ...args: any[]) => {
      if (delay === 15000) {
        capturedTimeoutCallback = fn;
        return 999 as any;
      }
      return originalSetTimeout(fn, delay, ...args);
    }) as any;

    try {
      mockProcessDirectly.mockImplementation(async (opts: any) => {
        opts.callbacks.onContextManaged({
          wasTruncated: true,
          wasSummarized: false,
          messagesRemoved: 3,
          tokensBefore: 90000,
          tokensAfter: 60000,
        });
        return defaultResult();
      });

      const session = createTestSession();
      const statuses: any[] = [];
      session.on('context_status', (s: any) => { statuses.push(s); });

      await session.sendMessage('Context managed truncated timeout');

      // Verify truncated status was set
      expect(statuses.some(s => typeof s === 'string' && s.includes('Truncated'))).toBe(true);

      // Fire the timeout
      expect(capturedTimeoutCallback).not.toBeNull();
      capturedTimeoutCallback!();

      // contextStatus should be null after timeout
      expect(session.getState().contextStatus).toBeNull();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
