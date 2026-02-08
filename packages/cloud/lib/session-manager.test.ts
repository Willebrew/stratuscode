import { describe, expect, test } from 'bun:test';

import {
  getPlanFilePath,
  PLAN_MODE_REMINDER,
  BUILD_SWITCH_REMINDER,
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
