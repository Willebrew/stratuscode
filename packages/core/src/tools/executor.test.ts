/**
 * Tool Executor Tests
 *
 * Tests for validateToolArgs, formatValidationError, parseToolArguments,
 * formatToolResult, executeWithTimeout, and executeTool.
 */

import { describe, test, expect } from 'bun:test';
import {
  validateToolArgs,
  formatValidationError,
  parseToolArguments,
  formatToolResult,
  executeWithTimeout,
  executeTool,
  DEFAULT_TOOL_TIMEOUT,
  DEFAULT_MAX_RESULT_SIZE,
} from './executor';
import type { Tool, ToolContext } from '@stratuscode/shared';

// ============================================
// Constants
// ============================================

describe('constants', () => {
  test('DEFAULT_TOOL_TIMEOUT is 60 seconds', () => {
    expect(DEFAULT_TOOL_TIMEOUT).toBe(60000);
  });

  test('DEFAULT_MAX_RESULT_SIZE is 100KB', () => {
    expect(DEFAULT_MAX_RESULT_SIZE).toBe(100000);
  });
});

// ============================================
// validateToolArgs
// ============================================

describe('validateToolArgs', () => {
  function makeTool(overrides?: Partial<Tool>): Tool {
    return {
      name: 'test_tool',
      description: 'Test tool',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['name'],
      },
      execute: async () => 'ok',
      ...overrides,
    };
  }

  test('valid args return valid result', () => {
    const result = validateToolArgs(makeTool(), { name: 'hello', count: 5 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('missing required field returns error', () => {
    const result = validateToolArgs(makeTool(), { count: 5 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('name');
    expect(result.errors[0].message).toContain('Required field');
  });

  test('wrong type returns error', () => {
    const result = validateToolArgs(makeTool(), { name: 123, count: 5 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'name' && e.message.includes('Expected string'))).toBe(true);
  });

  test('integer validation - accepts integer', () => {
    const tool = makeTool({
      parameters: {
        type: 'object',
        properties: { count: { type: 'integer' } },
      },
    });
    const result = validateToolArgs(tool, { count: 5 });
    expect(result.valid).toBe(true);
  });

  test('integer validation - rejects float', () => {
    const tool = makeTool({
      parameters: {
        type: 'object',
        properties: { count: { type: 'integer' } },
      },
    });
    const result = validateToolArgs(tool, { count: 5.5 });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('integer');
  });

  test('enum validation - accepts valid value', () => {
    const tool = makeTool({
      parameters: {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['fast', 'slow'] } },
      },
    });
    const result = validateToolArgs(tool, { mode: 'fast' });
    expect(result.valid).toBe(true);
  });

  test('enum validation - rejects invalid value', () => {
    const tool = makeTool({
      parameters: {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['fast', 'slow'] } },
      },
    });
    const result = validateToolArgs(tool, { mode: 'medium' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('one of');
  });

  test('array type validation', () => {
    const tool = makeTool({
      parameters: {
        type: 'object',
        properties: { items: { type: 'array' } },
      },
    });
    const result = validateToolArgs(tool, { items: [1, 2, 3] });
    expect(result.valid).toBe(true);
  });

  test('array type mismatch', () => {
    const tool = makeTool({
      parameters: {
        type: 'object',
        properties: { items: { type: 'array' } },
      },
    });
    const result = validateToolArgs(tool, { items: 'not-an-array' });
    expect(result.valid).toBe(false);
  });

  test('undefined optional fields are skipped', () => {
    const result = validateToolArgs(makeTool(), { name: 'hello' });
    expect(result.valid).toBe(true);
  });

  test('multiple errors for multiple issues', () => {
    const tool = makeTool({
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['name', 'count'],
      },
    });
    const result = validateToolArgs(tool, {});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  test('no properties schema skips type validation', () => {
    const tool = makeTool({
      parameters: { type: 'object' },
    });
    const result = validateToolArgs(tool, { anything: 'goes' });
    expect(result.valid).toBe(true);
  });
});

// ============================================
// formatValidationError
// ============================================

describe('formatValidationError', () => {
  test('returns JSON string with error details', () => {
    const errors = [{ path: 'name', message: 'Required field "name" is missing' }];
    const result = formatValidationError(errors, 'bash');
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe(true);
    expect(parsed.type).toBe('validation_error');
    expect(parsed.toolName).toBe('bash');
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.suggestion).toBeDefined();
  });

  test('includes multiple errors', () => {
    const errors = [
      { path: 'a', message: 'missing' },
      { path: 'b', message: 'wrong type' },
    ];
    const result = formatValidationError(errors, 'edit');
    const parsed = JSON.parse(result);
    expect(parsed.errors).toHaveLength(2);
  });
});

// ============================================
// parseToolArguments
// ============================================

describe('parseToolArguments', () => {
  test('parses valid JSON', () => {
    const result = parseToolArguments('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  test('parses empty string as empty object', () => {
    const result = parseToolArguments('');
    expect(result).toEqual({});
  });

  test('throws ToolError on invalid JSON', () => {
    expect(() => parseToolArguments('not json')).toThrow('Failed to parse tool arguments');
  });

  test('preserves nested objects', () => {
    const result = parseToolArguments('{"a": {"b": 1}}');
    expect(result.a).toEqual({ b: 1 });
  });

  test('preserves arrays', () => {
    const result = parseToolArguments('{"items": [1, 2, 3]}');
    expect(result.items).toEqual([1, 2, 3]);
  });
});

// ============================================
// formatToolResult
// ============================================

describe('formatToolResult', () => {
  test('returns result as-is on success', () => {
    expect(formatToolResult('bash', 'output text', true)).toBe('output text');
  });

  test('returns result as-is on failure (already formatted)', () => {
    const errorJson = '{"error": true}';
    expect(formatToolResult('bash', errorJson, false)).toBe(errorJson);
  });
});

// ============================================
// executeWithTimeout
// ============================================

describe('executeWithTimeout', () => {
  test('returns result for fast functions', async () => {
    const result = await executeWithTimeout(
      async () => 'done',
      5000,
      'timeout',
    );
    expect(result).toBe('done');
  });

  test('throws TimeoutError for slow functions', async () => {
    try {
      await executeWithTimeout(
        () => new Promise(resolve => setTimeout(resolve, 5000)),
        50,
        'Tool timed out',
      );
      expect(true).toBe(false); // Should not reach
    } catch (e: any) {
      expect(e.message).toContain('Tool timed out');
    }
  });
});

// ============================================
// executeTool
// ============================================

describe('executeTool', () => {
  const ctx: ToolContext = {
    userId: 'user-1',
    conversationId: 'conv-1',
    sessionId: 'sess-1',
  };

  test('returns success for valid tool execution', async () => {
    const tool: Tool = {
      name: 'echo',
      description: 'Echo input',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      execute: async (args) => args.text,
    };

    const result = await executeTool(tool, { text: 'hello' }, ctx);
    expect(result.success).toBe(true);
    expect(result.result).toBe('hello');
  });

  test('returns validation error for bad args', async () => {
    const tool: Tool = {
      name: 'strict',
      description: 'Strict params',
      parameters: {
        type: 'object',
        properties: { count: { type: 'number' } },
        required: ['count'],
      },
      execute: async () => 'ok',
    };

    const result = await executeTool(tool, {}, ctx);
    expect(result.success).toBe(false);
    expect(result.result).toContain('validation_error');
  });

  test('stringifies non-string results', async () => {
    const tool: Tool = {
      name: 'json',
      description: 'Returns JSON',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ key: 'value' }),
    };

    const result = await executeTool(tool, {}, ctx);
    expect(result.success).toBe(true);
    expect(JSON.parse(result.result)).toEqual({ key: 'value' });
  });

  test('handles tool execution error gracefully', async () => {
    const tool: Tool = {
      name: 'fail',
      description: 'Always fails',
      parameters: { type: 'object', properties: {} },
      execute: async () => { throw new Error('Boom'); },
    };

    const result = await executeTool(tool, {}, ctx);
    expect(result.success).toBe(false);
    expect(result.result).toContain('Boom');
  });
});
