/**
 * Error Classes Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  StratusCodeError,
  ConfigError,
  ProviderError,
  ToolError,
  PermissionError,
  SessionError,
  TimeoutError,
  MaxDepthError,
  AbortError,
  ValidationError,
  formatError,
  formatToolError,
} from './errors';

// ============================================
// Error class hierarchy
// ============================================

describe('StratusCodeError', () => {
  test('has correct name and code', () => {
    const err = new StratusCodeError('test', 'TEST_CODE');
    expect(err.name).toBe('StratusCodeError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test');
  });

  test('includes details when provided', () => {
    const err = new StratusCodeError('test', 'CODE', { key: 'value' });
    expect(err.details).toEqual({ key: 'value' });
  });

  test('is instanceof Error', () => {
    const err = new StratusCodeError('test', 'CODE');
    expect(err instanceof Error).toBe(true);
  });
});

describe('ConfigError', () => {
  test('has correct name and code', () => {
    const err = new ConfigError('Invalid config');
    expect(err.name).toBe('ConfigError');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err instanceof StratusCodeError).toBe(true);
  });
});

describe('ProviderError', () => {
  test('includes statusCode', () => {
    const err = new ProviderError('Rate limited', 429);
    expect(err.statusCode).toBe(429);
    expect(err.name).toBe('ProviderError');
  });

  test('isRetryable returns true for 429', () => {
    expect(ProviderError.isRetryable(new ProviderError('', 429))).toBe(true);
  });

  test('isRetryable returns true for 500+', () => {
    expect(ProviderError.isRetryable(new ProviderError('', 500))).toBe(true);
    expect(ProviderError.isRetryable(new ProviderError('', 503))).toBe(true);
  });

  test('isRetryable returns false for 400', () => {
    expect(ProviderError.isRetryable(new ProviderError('', 400))).toBe(false);
  });

  test('isRetryable returns false for non-ProviderError', () => {
    expect(ProviderError.isRetryable(new Error('generic'))).toBe(false);
  });
});

describe('ToolError', () => {
  test('includes toolName in details', () => {
    const err = new ToolError('Tool failed', 'bash');
    expect(err.toolName).toBe('bash');
    expect(err.details?.toolName).toBe('bash');
  });
});

describe('PermissionError', () => {
  test('includes permission and pattern', () => {
    const err = new PermissionError('Denied', 'write', '/etc/**');
    expect(err.permission).toBe('write');
    expect(err.pattern).toBe('/etc/**');
  });
});

describe('SessionError', () => {
  test('includes sessionId', () => {
    const err = new SessionError('Not found', 'sess-123');
    expect(err.sessionId).toBe('sess-123');
  });
});

describe('TimeoutError', () => {
  test('includes timeoutMs', () => {
    const err = new TimeoutError('Timed out', 30000);
    expect(err.timeoutMs).toBe(30000);
  });
});

describe('MaxDepthError', () => {
  test('auto-generates message', () => {
    const err = new MaxDepthError(15, 10);
    expect(err.message).toContain('max depth of 10');
    expect(err.depth).toBe(15);
    expect(err.maxDepth).toBe(10);
  });
});

describe('AbortError', () => {
  test('has default message', () => {
    const err = new AbortError();
    expect(err.message).toBe('Operation was aborted');
  });

  test('accepts custom message', () => {
    const err = new AbortError('User cancelled');
    expect(err.message).toBe('User cancelled');
  });
});

describe('ValidationError', () => {
  test('includes validation errors array', () => {
    const errors = [{ path: 'name', message: 'required' }];
    const err = new ValidationError('Validation failed', errors);
    expect(err.errors).toEqual(errors);
  });
});

// ============================================
// Error formatting
// ============================================

describe('formatError', () => {
  test('formats StratusCodeError with details', () => {
    const err = new StratusCodeError('test', 'CODE', { key: 'value' });
    const result = formatError(err);
    expect(result).toContain('StratusCodeError: test');
    expect(result).toContain('Details:');
    expect(result).toContain('"key": "value"');
  });

  test('formats plain Error with just message', () => {
    const result = formatError(new Error('simple'));
    expect(result).toBe('simple');
  });
});

describe('formatToolError', () => {
  test('formats as JSON with tool name and suggestion', () => {
    const err = new PermissionError('Denied', 'write');
    const result = formatToolError(err, 'file_write', { path: '/etc/passwd' });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toBe('Denied');
    expect(parsed.toolName).toBe('file_write');
    expect(parsed.suggestion).toContain('permission');
    expect(parsed.providedArgs).toEqual({ path: '/etc/passwd' });
  });

  test('provides timeout suggestion for TimeoutError', () => {
    const err = new TimeoutError('slow', 5000);
    const result = JSON.parse(formatToolError(err, 'bash'));
    expect(result.suggestion).toContain('timed out');
  });

  test('provides validation suggestion for ValidationError', () => {
    const err = new ValidationError('Bad args', []);
    const result = JSON.parse(formatToolError(err, 'read'));
    expect(result.suggestion).toContain('parameters');
  });

  test('provides ENOENT suggestion', () => {
    const err = new Error('ENOENT: no such file');
    const result = JSON.parse(formatToolError(err, 'read'));
    expect(result.suggestion).toContain('not found');
  });

  test('provides EACCES suggestion', () => {
    const err = new Error('EACCES: permission denied');
    const result = JSON.parse(formatToolError(err, 'write'));
    expect(result.suggestion).toContain('read-only');
  });

  test('provides generic suggestion for unknown errors', () => {
    const err = new Error('Something went wrong');
    const result = JSON.parse(formatToolError(err, 'bash'));
    expect(result.suggestion).toContain('Review the error');
  });

  test('omits providedArgs when not given', () => {
    const err = new Error('fail');
    const result = JSON.parse(formatToolError(err, 'bash'));
    expect(result.providedArgs).toBeUndefined();
  });
});
