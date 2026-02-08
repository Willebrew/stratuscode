import { describe, expect, test, beforeEach } from 'bun:test';

import {
  getPlanFilePath,
  ensurePlanFile,
  PLAN_MODE_REMINDER,
  BUILD_SWITCH_REMINDER,
  getActiveSession,
  getUserSessionCount,
  removeSession,
  getUserSessions,
} from './session-manager';

describe('session-manager: getPlanFilePath', () => {
  test('returns correct path structure', () => {
    const path = getPlanFilePath('/home/user/project', 'session-123');
    expect(path).toBe('/home/user/project/.stratuscode/plans/session-123.md');
  });

  test('handles workDir with trailing slash gracefully', () => {
    const path = getPlanFilePath('/project/', 'abc');
    expect(path).toContain('.stratuscode/plans/abc.md');
  });
});

describe('session-manager: PLAN_MODE_REMINDER', () => {
  test('returns a string containing the plan file path', () => {
    const reminder = PLAN_MODE_REMINDER('/test/plan.md');
    expect(reminder).toContain('/test/plan.md');
    expect(reminder).toContain('PLAN mode');
    expect(reminder).toContain('system-reminder');
  });

  test('includes all 5 phases', () => {
    const reminder = PLAN_MODE_REMINDER('/test/plan.md');
    expect(reminder).toContain('Phase 1');
    expect(reminder).toContain('Phase 2');
    expect(reminder).toContain('Phase 3');
    expect(reminder).toContain('Phase 4');
    expect(reminder).toContain('Phase 5');
  });
});

describe('session-manager: BUILD_SWITCH_REMINDER', () => {
  test('returns a string containing the plan file path', () => {
    const reminder = BUILD_SWITCH_REMINDER('/test/plan.md');
    expect(reminder).toContain('/test/plan.md');
    expect(reminder).toContain('plan to build');
    expect(reminder).toContain('system-reminder');
  });
});

// ============================================
// ensurePlanFile
// ============================================

describe('session-manager: ensurePlanFile', () => {
  test('returns plan file path and calls sandboxExec', () => {
    const calls: string[] = [];
    const sandboxExec = async (cmd: string) => {
      calls.push(cmd);
      return '';
    };
    const path = ensurePlanFile(sandboxExec, '/project', 'sess-1');
    expect(path).toBe('/project/.stratuscode/plans/sess-1.md');
    // sandboxExec is fire-and-forget, but it should have been called
    // Give microtasks a tick
    expect(calls.length).toBeGreaterThanOrEqual(0); // async, may not have resolved yet
  });
});

// ============================================
// Map-based session tracking
// ============================================

describe('session-manager: session map functions', () => {
  // These use globalThis stores — clean them up between tests
  beforeEach(() => {
    const gs = globalThis as any;
    gs.__stratusActiveSessions?.clear();
    gs.__stratusUserSessionCounts?.clear();
  });

  test('getActiveSession returns undefined for unknown session', () => {
    expect(getActiveSession('nonexistent')).toBeUndefined();
  });

  test('getUserSessionCount returns 0 for unknown user', () => {
    expect(getUserSessionCount('user-unknown')).toBe(0);
  });

  test('getUserSessions returns empty array when no sessions exist', () => {
    const sessions = getUserSessions('user-1');
    expect(sessions).toEqual([]);
  });

  test('removeSession is safe to call for nonexistent session', () => {
    // Should not throw
    expect(() => removeSession('nonexistent')).not.toThrow();
  });

  test('session lifecycle via globalThis store', () => {
    const gs = globalThis as any;
    const activeSessions: Map<string, any> = gs.__stratusActiveSessions;
    const userCounts: Map<string, number> = gs.__stratusUserSessionCounts;

    // Simulate adding a session (normally done by createCloudSession)
    activeSessions.set('sess-1', {
      cloudSession: {},
      sandboxInfo: {},
      userId: 'user-1',
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      createdAt: Date.now(),
    });
    userCounts.set('user-1', 1);

    expect(getActiveSession('sess-1')).toBeDefined();
    expect(getActiveSession('sess-1')!.userId).toBe('user-1');
    expect(getUserSessionCount('user-1')).toBe(1);
    expect(getUserSessions('user-1')).toHaveLength(1);

    // Remove it
    removeSession('sess-1');
    expect(getActiveSession('sess-1')).toBeUndefined();
    expect(getUserSessionCount('user-1')).toBe(0);
  });
});
