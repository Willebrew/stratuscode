// @ts-nocheck — test file; runtime correctness verified by bun:test
import { describe, expect, test, beforeEach, mock } from 'bun:test';

// ============================================
// Mocks — must be declared before importing CloudSession
// ============================================

const mockProcessDirectly = mock(() =>
  Promise.resolve({
    content: 'response text',
    reasoning: null,
    responseMessages: [],
    newSummary: null,
  })
);

mock.module('@willebrew/sage-core', () => ({
  processDirectly: mockProcessDirectly,
  createToolRegistry: () => ({
    register: () => {},
    toAPIFormat: () => [],
  }),
}));

mock.module('./sandbox-tools', () => ({
  registerSandboxTools: () => {},
}));

const mockBuildSystemPrompt = mock(() => 'system prompt');
const mockModelSupportsReasoning = mock((m: string) =>
  m.includes('o3') || m.includes('o4')
);

mock.module('@stratuscode/shared', () => ({
  buildSystemPrompt: mockBuildSystemPrompt,
  BUILT_IN_AGENTS: {
    build: { name: 'build', systemPrompt: '' },
    plan: { name: 'plan', systemPrompt: '' },
  },
  modelSupportsReasoning: mockModelSupportsReasoning,
}));

const mockEnsurePlanFile = mock(
  (_exec: any, _workDir: string, _sessionId: string) =>
    '/sandbox/project/.stratuscode/plans/test-session-1.md'
);

mock.module('./session-manager', () => ({
  getPlanFilePath: () => '/sandbox/project/.stratuscode/plans/test-session-1.md',
  ensurePlanFile: mockEnsurePlanFile,
  PLAN_MODE_REMINDER: (path: string) => `[PLAN_MODE_REMINDER:${path}]`,
  BUILD_SWITCH_REMINDER: (path: string) => `[BUILD_SWITCH_REMINDER:${path}]`,
}));

import { CloudSession, type CloudSessionOptions, type ToolCall } from './cloud-session';

// ============================================
// Helpers
// ============================================

const stubSandboxInfo = {
  sandbox: { runCommand: () => Promise.resolve({ stdout: () => '' }) },
  sessionId: 'stub-session',
  workDir: '/sandbox/project',
} as any;

function makeSession(overrides: Partial<CloudSessionOptions> = {}) {
  return new CloudSession({
    sessionId: 'test-session-1',
    workDir: '/sandbox/project',
    model: 'gpt-5-mini',
    apiKey: 'sk-test',
    sandboxInfo: stubSandboxInfo,
    ...overrides,
  });
}

beforeEach(() => {
  mockProcessDirectly.mockReset();
  mockProcessDirectly.mockResolvedValue({
    content: 'response text',
    reasoning: null,
    responseMessages: [],
    newSummary: null,
  });
  mockBuildSystemPrompt.mockReset();
  mockBuildSystemPrompt.mockReturnValue('system prompt');
  mockModelSupportsReasoning.mockReset();
  mockModelSupportsReasoning.mockImplementation(
    (m: string) => m.includes('o3') || m.includes('o4')
  );
  mockEnsurePlanFile.mockReset();
  mockEnsurePlanFile.mockReturnValue(
    '/sandbox/project/.stratuscode/plans/test-session-1.md'
  );
});

// ============================================
// sendMessage — basic flow
// ============================================

describe('CloudSession: sendMessage basic flow', () => {
  test('calls processDirectly and triggers onComplete', async () => {
    const session = makeSession();
    let completedContent = '';
    await session.sendMessage('hello', {
      onComplete: (c) => {
        completedContent = c;
      },
    });

    expect(mockProcessDirectly).toHaveBeenCalledTimes(1);
    expect(completedContent).toBe('response text');
  });

  test('passes user message in messages array', async () => {
    const session = makeSession();
    await session.sendMessage('hello world');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const messages = call.messages;
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('hello world');
  });

  test('accumulates messages across turns', async () => {
    const session = makeSession();
    await session.sendMessage('first message');
    await session.sendMessage('second message');

    // Second call should have: user('first'), assistant('response text'), user('second')
    const call = mockProcessDirectly.mock.calls[1]![0] as any;
    const messages = call.messages;
    expect(messages.length).toBe(3);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('first message');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('response text');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toBe('second message');
  });

  test('passes system prompt from buildSystemPrompt', async () => {
    const session = makeSession();
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.systemPrompt).toBe('system prompt');
    expect(mockBuildSystemPrompt).toHaveBeenCalledTimes(1);
  });

  test('passes sessionId in call', async () => {
    const session = makeSession({ sessionId: 'my-session-42' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.sessionId).toBe('my-session-42');
  });

  test('passes toolMetadata with projectDir', async () => {
    const session = makeSession({ workDir: '/my/project' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.toolMetadata).toEqual({ projectDir: '/my/project' });
  });
});

// ============================================
// sendMessage — plan mode
// ============================================

describe('CloudSession: sendMessage in plan mode', () => {
  test('injects PLAN_MODE_REMINDER when agent is plan', async () => {
    const session = makeSession({ agent: 'plan' });
    await session.sendMessage('design a feature');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const userMsg = call.messages[0];
    expect(userMsg.content).toContain('[PLAN_MODE_REMINDER:');
    expect(userMsg.content).toContain('design a feature');
  });

  test('does not inject PLAN_MODE_REMINDER in build mode', async () => {
    const session = makeSession({ agent: 'build' });
    await session.sendMessage('build something');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const userMsg = call.messages[0];
    expect(userMsg.content).toBe('build something');
    expect(userMsg.content).not.toContain('PLAN_MODE_REMINDER');
  });
});

// ============================================
// sendMessage — plan→build switch
// ============================================

describe('CloudSession: sendMessage after plan→build switch', () => {
  test('injects BUILD_SWITCH_REMINDER after plan_exit with approved+build', async () => {
    const session = makeSession({ agent: 'plan' });

    // First: trigger the justSwitchedFromPlan flag via handleToolResult
    const tc: ToolCall = {
      id: 'tc-1',
      function: { name: 'plan_exit', arguments: '{}' },
    };
    session.handleToolResult(
      tc,
      JSON.stringify({ approved: true, modeSwitch: 'build' })
    );

    // Switch mode to build (as the real flow would)
    session.switchMode('build');

    // Now send a message — should include BUILD_SWITCH_REMINDER
    await session.sendMessage('start building');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const userMsg = call.messages[0];
    expect(userMsg.content).toContain('[BUILD_SWITCH_REMINDER:');
    expect(userMsg.content).toContain('start building');
  });

  test('BUILD_SWITCH_REMINDER is only injected once (flag resets)', async () => {
    const session = makeSession({ agent: 'plan' });

    const tc: ToolCall = {
      id: 'tc-1',
      function: { name: 'plan_exit', arguments: '{}' },
    };
    session.handleToolResult(
      tc,
      JSON.stringify({ approved: true, modeSwitch: 'build' })
    );
    session.switchMode('build');

    // First message — reminder injected
    await session.sendMessage('start building');
    const call1 = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call1.messages[0].content).toContain('[BUILD_SWITCH_REMINDER:');

    // Second message — reminder should NOT be injected
    await session.sendMessage('continue building');
    const call2 = mockProcessDirectly.mock.calls[1]![0] as any;
    // The second user message is at index 2 (user, assistant, user)
    const secondUserMsg = call2.messages[call2.messages.length - 1];
    expect(secondUserMsg.content).toBe('continue building');
    expect(secondUserMsg.content).not.toContain('BUILD_SWITCH_REMINDER');
  });
});

// ============================================
// sendMessage — error handling
// ============================================

describe('CloudSession: sendMessage error handling', () => {
  test('calls onError when processDirectly throws', async () => {
    mockProcessDirectly.mockRejectedValue(new Error('API failure'));

    const session = makeSession();
    let capturedError: Error | null = null;
    await session.sendMessage('test', {
      onError: (err) => {
        capturedError = err;
      },
    });

    expect(capturedError).not.toBeNull();
    expect(capturedError!.message).toBe('API failure');
  });

  test('wraps non-Error throwables in Error', async () => {
    mockProcessDirectly.mockRejectedValue('string error');

    const session = makeSession();
    let capturedError: Error | null = null;
    await session.sendMessage('test', {
      onError: (err) => {
        capturedError = err;
      },
    });

    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError!.message).toBe('string error');
  });

  test('does not call onComplete when processDirectly throws', async () => {
    mockProcessDirectly.mockRejectedValue(new Error('fail'));

    const session = makeSession();
    let completeCalled = false;
    await session.sendMessage('test', {
      onComplete: () => {
        completeCalled = true;
      },
      onError: () => {},
    });

    expect(completeCalled).toBe(false);
  });
});

// ============================================
// sendMessage — responseMessages in result
// ============================================

describe('CloudSession: sendMessage with responseMessages', () => {
  test('uses responseMessages when present', async () => {
    mockProcessDirectly.mockResolvedValue({
      content: 'final answer',
      reasoning: null,
      responseMessages: [
        { role: 'assistant', content: 'tool call step' },
        { role: 'tool', content: 'tool result' },
        { role: 'assistant', content: 'final answer' },
      ],
      newSummary: null,
    });

    const session = makeSession();
    await session.sendMessage('do something');

    // Send a second message to inspect accumulated messages
    await session.sendMessage('follow up');

    const call2 = mockProcessDirectly.mock.calls[1]![0] as any;
    // messages = [user, ...3 responseMessages, user]
    expect(call2.messages.length).toBe(5);
    expect(call2.messages[1].role).toBe('assistant');
    expect(call2.messages[1].content).toBe('tool call step');
    expect(call2.messages[2].role).toBe('tool');
    expect(call2.messages[3].role).toBe('assistant');
    expect(call2.messages[3].content).toBe('final answer');
    expect(call2.messages[4].role).toBe('user');
    expect(call2.messages[4].content).toBe('follow up');
  });

  test('falls back to pushing assistant message when responseMessages is empty', async () => {
    mockProcessDirectly.mockResolvedValue({
      content: 'simple answer',
      reasoning: 'some reasoning',
      responseMessages: [],
      newSummary: null,
    });

    const session = makeSession();
    await session.sendMessage('ask something');
    await session.sendMessage('follow up');

    const call2 = mockProcessDirectly.mock.calls[1]![0] as any;
    // messages = [user, assistant(simple answer), user(follow up)]
    expect(call2.messages.length).toBe(3);
    expect(call2.messages[1].role).toBe('assistant');
    expect(call2.messages[1].content).toBe('simple answer');
    expect(call2.messages[1].reasoning).toBe('some reasoning');
  });
});

// ============================================
// sendMessage — newSummary in result
// ============================================

describe('CloudSession: sendMessage with newSummary', () => {
  test('persists newSummary and passes as existingSummary in next call', async () => {
    const summaryObj = { text: 'conversation summary', tokenCount: 50 };
    mockProcessDirectly.mockResolvedValueOnce({
      content: 'first response',
      reasoning: null,
      responseMessages: [],
      newSummary: summaryObj,
    });
    mockProcessDirectly.mockResolvedValueOnce({
      content: 'second response',
      reasoning: null,
      responseMessages: [],
      newSummary: null,
    });

    const session = makeSession();
    await session.sendMessage('first');
    await session.sendMessage('second');

    const call1 = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call1.existingSummary).toBeUndefined();

    const call2 = mockProcessDirectly.mock.calls[1]![0] as any;
    expect(call2.existingSummary).toEqual(summaryObj);
  });

  test('does not overwrite existing summary when newSummary is null', async () => {
    const summaryObj = { text: 'summary', tokenCount: 30 };
    mockProcessDirectly.mockResolvedValueOnce({
      content: 'r1',
      reasoning: null,
      responseMessages: [],
      newSummary: summaryObj,
    });
    mockProcessDirectly.mockResolvedValueOnce({
      content: 'r2',
      reasoning: null,
      responseMessages: [],
      newSummary: null,
    });
    mockProcessDirectly.mockResolvedValueOnce({
      content: 'r3',
      reasoning: null,
      responseMessages: [],
      newSummary: null,
    });

    const session = makeSession();
    await session.sendMessage('first');
    await session.sendMessage('second');
    await session.sendMessage('third');

    // Third call should still have the original summary
    const call3 = mockProcessDirectly.mock.calls[2]![0] as any;
    expect(call3.existingSummary).toEqual(summaryObj);
  });
});

// ============================================
// buildSageConfig — exercised indirectly
// ============================================

describe('CloudSession: buildSageConfig (via processDirectly calls)', () => {
  test('passes model and apiKey in config', async () => {
    const session = makeSession({ model: 'gpt-5-mini', apiKey: 'sk-mykey' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.model).toBe('gpt-5-mini');
    expect(call.config.provider.apiKey).toBe('sk-mykey');
  });

  test('uses default baseUrl when not provided', async () => {
    const session = makeSession({ baseUrl: undefined });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.provider.baseUrl).toBe('https://api.openai.com/v1');
  });

  test('uses provided baseUrl', async () => {
    const session = makeSession({
      baseUrl: 'https://custom.provider.com/v1',
    });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.provider.baseUrl).toBe(
      'https://custom.provider.com/v1'
    );
  });

  test('enriches headers for Codex baseUrl', async () => {
    const session = makeSession({
      baseUrl: 'https://chatgpt.com/backend-api/codex/v1',
      sessionId: 'codex-session',
    });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const headers = call.config.provider.headers;
    expect(headers.originator).toBe('opencode');
    expect(headers['User-Agent']).toContain('stratuscode');
    expect(headers.session_id).toBe('codex-session');
  });

  test('enriches headers for OpenCode Zen baseUrl', async () => {
    const session = makeSession({
      baseUrl: 'https://opencode.ai/zen/v1',
      sessionId: 'zen-session',
    });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const headers = call.config.provider.headers;
    expect(headers['x-opencode-session']).toBe('zen-session');
    expect(headers['x-opencode-request']).toMatch(/^req-\d+$/);
    expect(headers['x-opencode-project']).toBe('stratuscode');
  });

  test('enriches headers for OpenRouter baseUrl', async () => {
    const session = makeSession({
      baseUrl: 'https://openrouter.ai/api/v1',
      sessionId: 'openrouter-session',
    });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const headers = call.config.provider.headers;
    expect(headers['HTTP-Referer']).toBe('https://stratuscode.dev/');
    expect(headers['X-Title']).toBe('StratusCode');
  });

  test('merges existing providerHeaders with Codex headers', async () => {
    const session = makeSession({
      baseUrl: 'https://chatgpt.com/backend-api/codex/v1',
      providerHeaders: { 'x-custom': 'value' },
    });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const headers = call.config.provider.headers;
    expect(headers['x-custom']).toBe('value');
    expect(headers.originator).toBe('opencode');
  });

  test('merges existing providerHeaders with OpenRouter headers', async () => {
    const session = makeSession({
      baseUrl: 'https://openrouter.ai/api/v1',
      providerHeaders: { 'X-Custom': 'custom-value' },
    });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    const headers = call.config.provider.headers;
    expect(headers['X-Custom']).toBe('custom-value');
    expect(headers['HTTP-Referer']).toBe('https://stratuscode.dev/');
    expect(headers['X-Title']).toBe('StratusCode');
  });

  test('uses context window from MODEL_CONTEXT_WINDOWS for known model', async () => {
    const session = makeSession({ model: 'gpt-5-codex' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.context.contextWindow).toBe(400_000);
  });

  test('defaults context window to 128k for unknown model', async () => {
    const session = makeSession({ model: 'unknown-model-xyz' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.context.contextWindow).toBe(128_000);
  });

  test('sets reasoningEffort to high for reasoning models', async () => {
    // Our mock makes o3/o4 models return true for supportsReasoning
    const session = makeSession({ model: 'o3-mini' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.enableReasoningEffort).toBe(true);
    expect(call.config.reasoningEffort).toBe('high');
  });

  test('sets reasoningEffort to undefined for non-reasoning models', async () => {
    const session = makeSession({ model: 'gpt-5-mini' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.enableReasoningEffort).toBe(false);
    expect(call.config.reasoningEffort).toBeUndefined();
  });

  test('passes providerType in config', async () => {
    const session = makeSession({ providerType: 'responses-api' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.provider.type).toBe('responses-api');
  });

  test('config includes agent settings with expected values', async () => {
    const session = makeSession();
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.agent.name).toBe('stratuscode');
    expect(call.config.agent.maxDepth).toBe(300);
    expect(call.config.agent.toolTimeout).toBe(60000);
    expect(call.config.agent.maxToolResultSize).toBe(100000);
  });

  test('config includes summary settings', async () => {
    const session = makeSession({ model: 'gpt-5-mini' });
    await session.sendMessage('test');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.config.context.summary.enabled).toBe(true);
    expect(call.config.context.summary.model).toBe('gpt-5-mini');
    expect(call.config.context.summary.targetTokens).toBe(500);
  });
});

// ============================================
// handleToolResult — justSwitchedFromPlan
// ============================================

describe('CloudSession: handleToolResult sets justSwitchedFromPlan', () => {
  test('approved+modeSwitch=build sets justSwitchedFromPlan flag', async () => {
    const session = makeSession({ agent: 'plan' });

    const tc: ToolCall = {
      id: 'tc-1',
      function: { name: 'plan_exit', arguments: '{}' },
    };
    session.handleToolResult(
      tc,
      JSON.stringify({ approved: true, modeSwitch: 'build' })
    );
    session.switchMode('build');

    // The flag is set internally — verify by sending a message
    await session.sendMessage('go');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    expect(call.messages[0].content).toContain('[BUILD_SWITCH_REMINDER:');
  });

  test('proposingExit does NOT set justSwitchedFromPlan', async () => {
    const session = makeSession({ agent: 'plan' });

    const tc: ToolCall = {
      id: 'tc-1',
      function: { name: 'plan_exit', arguments: '{}' },
    };
    session.handleToolResult(
      tc,
      JSON.stringify({ proposingExit: true })
    );
    session.switchMode('build');

    await session.sendMessage('go');

    const call = mockProcessDirectly.mock.calls[0]![0] as any;
    // Should NOT contain BUILD_SWITCH_REMINDER (only plan_exit approved+build sets the flag)
    expect(call.messages[0].content).not.toContain('[BUILD_SWITCH_REMINDER:');
  });
});

// ============================================
// sendMessage — callbacks wiring
// ============================================

describe('CloudSession: sendMessage callbacks', () => {
  test('onToken callback is wired through', async () => {
    mockProcessDirectly.mockImplementation(async (args: any) => {
      // Simulate calling onToken during processing
      args.callbacks?.onToken?.('hello ');
      args.callbacks?.onToken?.('world');
      return {
        content: 'hello world',
        reasoning: null,
        responseMessages: [],
        newSummary: null,
      };
    });

    const session = makeSession();
    const tokens: string[] = [];
    await session.sendMessage('test', {
      onToken: (t) => tokens.push(t),
    });

    expect(tokens).toEqual(['hello ', 'world']);
  });

  test('onReasoning callback is wired through', async () => {
    mockProcessDirectly.mockImplementation(async (args: any) => {
      args.callbacks?.onReasoning?.('thinking...');
      return {
        content: 'answer',
        reasoning: 'thinking...',
        responseMessages: [],
        newSummary: null,
      };
    });

    const session = makeSession();
    const reasoning: string[] = [];
    await session.sendMessage('test', {
      onReasoning: (t) => reasoning.push(t),
    });

    expect(reasoning).toEqual(['thinking...']);
  });

  test('onToolCall callback is wired through and normalizes shape', async () => {
    mockProcessDirectly.mockImplementation(async (args: any) => {
      args.callbacks?.onToolCall?.({
        id: 'tc-1',
        function: { name: 'bash', arguments: '{"cmd":"ls"}' },
      });
      return {
        content: 'done',
        reasoning: null,
        responseMessages: [],
        newSummary: null,
      };
    });

    const session = makeSession();
    const toolCalls: any[] = [];
    await session.sendMessage('test', {
      onToolCall: (tc) => toolCalls.push(tc),
    });

    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].id).toBe('tc-1');
    expect(toolCalls[0].function.name).toBe('bash');
  });

  test('onToolResult callback is wired through', async () => {
    mockProcessDirectly.mockImplementation(async (args: any) => {
      args.callbacks?.onToolResult?.(
        { id: 'tc-1', function: { name: 'bash', arguments: '' } },
        'output text'
      );
      return {
        content: 'done',
        reasoning: null,
        responseMessages: [],
        newSummary: null,
      };
    });

    const session = makeSession();
    const results: Array<{ tc: any; result: string }> = [];
    await session.sendMessage('test', {
      onToolResult: (tc, result) => results.push({ tc, result }),
    });

    expect(results.length).toBe(1);
    expect(results[0].tc.function.name).toBe('bash');
    expect(results[0].result).toBe('output text');
  });

  test('onError callback in processDirectly callbacks is wired', async () => {
    const innerError = new Error('inner error');
    mockProcessDirectly.mockImplementation(async (args: any) => {
      args.callbacks?.onError?.(innerError);
      return {
        content: 'done',
        reasoning: null,
        responseMessages: [],
        newSummary: null,
      };
    });

    const session = makeSession();
    const errors: Error[] = [];
    await session.sendMessage('test', {
      onError: (err) => errors.push(err),
    });

    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('inner error');
  });
});
