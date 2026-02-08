import { describe, expect, test } from 'bun:test';

import { CloudSession, type ToolCall } from './cloud-session';

// Minimal stub for SandboxInfo — CloudSession constructor doesn't call sandbox methods
const stubSandboxInfo = {
  sandbox: { runCommand: () => Promise.resolve({ stdout: () => '' }) },
  sessionId: 'stub-session',
  workDir: '/sandbox/project',
} as any;

function makeSession(overrides: Partial<import('./cloud-session').CloudSessionOptions> = {}) {
  return new CloudSession({
    sessionId: 'test-session-1',
    workDir: '/sandbox/project',
    model: 'gpt-5-mini',
    apiKey: 'sk-test',
    sandboxInfo: stubSandboxInfo,
    ...overrides,
  });
}

// ============================================
// Constructor & Getters
// ============================================

describe('CloudSession: constructor & getters', () => {
  test('getSessionId returns the session id', () => {
    const session = makeSession({ sessionId: 'my-session' });
    expect(session.getSessionId()).toBe('my-session');
  });

  test('getAgent defaults to build', () => {
    const session = makeSession();
    expect(session.getAgent()).toBe('build');
  });

  test('getAgent uses provided agent', () => {
    const session = makeSession({ agent: 'plan' });
    expect(session.getAgent()).toBe('plan');
  });

  test('getPlanFilePath initially returns null', () => {
    const session = makeSession();
    expect(session.getPlanFilePath()).toBeNull();
  });

  test('isPlanExitProposed initially returns false', () => {
    const session = makeSession();
    expect(session.isPlanExitProposed()).toBe(false);
  });
});

// ============================================
// switchMode & resetPlanExit
// ============================================

describe('CloudSession: switchMode', () => {
  test('switchMode changes the agent', () => {
    const session = makeSession();
    expect(session.getAgent()).toBe('build');
    session.switchMode('plan');
    expect(session.getAgent()).toBe('plan');
  });

  test('switchMode can switch back', () => {
    const session = makeSession();
    session.switchMode('plan');
    session.switchMode('build');
    expect(session.getAgent()).toBe('build');
  });
});

describe('CloudSession: resetPlanExit', () => {
  test('resetPlanExit clears the planExitProposed flag', () => {
    const session = makeSession();
    // Trigger plan exit via handleToolResult
    const tc: ToolCall = { id: 'tc-1', function: { name: 'plan_exit', arguments: '{}' } };
    session.handleToolResult(tc, JSON.stringify({ proposingExit: true }));
    expect(session.isPlanExitProposed()).toBe(true);

    session.resetPlanExit();
    expect(session.isPlanExitProposed()).toBe(false);
  });
});

// ============================================
// handleToolResult
// ============================================

describe('CloudSession: handleToolResult', () => {
  test('sets planExitProposed on proposingExit', () => {
    const session = makeSession();
    const tc: ToolCall = { id: 'tc-1', function: { name: 'plan_exit', arguments: '{}' } };
    session.handleToolResult(tc, JSON.stringify({ proposingExit: true }));
    expect(session.isPlanExitProposed()).toBe(true);
  });

  test('sets planExitProposed on approved + modeSwitch=build', () => {
    const session = makeSession();
    const tc: ToolCall = { id: 'tc-2', function: { name: 'plan_exit', arguments: '{}' } };
    session.handleToolResult(tc, JSON.stringify({ approved: true, modeSwitch: 'build' }));
    expect(session.isPlanExitProposed()).toBe(true);
  });

  test('calls onPlanExitProposed callback', () => {
    const session = makeSession();
    let called = false;
    const callbacks = { onPlanExitProposed: () => { called = true; } };
    const tc: ToolCall = { id: 'tc-3', function: { name: 'plan_exit', arguments: '{}' } };
    session.handleToolResult(tc, JSON.stringify({ proposingExit: true }), callbacks);
    expect(called).toBe(true);
  });

  test('ignores non-plan_exit tool results', () => {
    const session = makeSession();
    const tc: ToolCall = { id: 'tc-4', function: { name: 'bash', arguments: '{}' } };
    session.handleToolResult(tc, JSON.stringify({ proposingExit: true }));
    expect(session.isPlanExitProposed()).toBe(false);
  });

  test('ignores unparseable JSON result', () => {
    const session = makeSession();
    const tc: ToolCall = { id: 'tc-5', function: { name: 'plan_exit', arguments: '{}' } };
    session.handleToolResult(tc, 'not-json');
    expect(session.isPlanExitProposed()).toBe(false);
  });

  test('does not set flag when approved is false', () => {
    const session = makeSession();
    const tc: ToolCall = { id: 'tc-6', function: { name: 'plan_exit', arguments: '{}' } };
    session.handleToolResult(tc, JSON.stringify({ approved: false, modeSwitch: 'build' }));
    expect(session.isPlanExitProposed()).toBe(false);
  });
});
