/**
 * Retry Logic Tests
 *
 * Tests for withRetry, shouldRetryError, and createRetryWrapper.
 */

import { describe, test, expect } from 'bun:test';
import {
  withRetry,
  shouldRetryError,
  createRetryWrapper,
  DEFAULT_RETRY_CONFIG,
} from './retry';

// ============================================
// DEFAULT_RETRY_CONFIG
// ============================================

describe('DEFAULT_RETRY_CONFIG', () => {
  test('has expected defaults', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(100);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(5000);
    expect(DEFAULT_RETRY_CONFIG.backoffFactor).toBe(2);
    expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain('ETIMEDOUT');
    expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain('rate_limit');
  });
});

// ============================================
// shouldRetryError
// ============================================

describe('shouldRetryError', () => {
  test('retries timeout errors', () => {
    expect(shouldRetryError(new Error('Connection ETIMEDOUT'))).toBe(true);
    expect(shouldRetryError(new Error('Request timeout'))).toBe(true);
  });

  test('retries rate limit errors', () => {
    expect(shouldRetryError(new Error('rate_limit exceeded'))).toBe(true);
  });

  test('retries network errors', () => {
    expect(shouldRetryError(new Error('network error'))).toBe(true);
    expect(shouldRetryError(new Error('ECONNRESET'))).toBe(true);
    expect(shouldRetryError(new Error('ECONNREFUSED'))).toBe(true);
  });

  test('retries ENOENT errors', () => {
    expect(shouldRetryError(new Error('ENOENT: no such file'))).toBe(true);
  });

  test('retries EACCES errors', () => {
    expect(shouldRetryError(new Error('EACCES: permission denied'))).toBe(true);
  });

  test('retries EBUSY errors', () => {
    expect(shouldRetryError(new Error('EBUSY: resource busy'))).toBe(true);
  });

  test('does not retry generic errors', () => {
    expect(shouldRetryError(new Error('Syntax error'))).toBe(false);
    expect(shouldRetryError(new Error('Type mismatch'))).toBe(false);
  });

  test('checks error code property', () => {
    const err = new Error('File not found') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    expect(shouldRetryError(err)).toBe(true);
  });
});

// ============================================
// withRetry
// ============================================

describe('withRetry', () => {
  test('succeeds on first attempt', async () => {
    const result = await withRetry(async () => 'success', { maxRetries: 3 });
    expect(result.success).toBe(true);
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
  });

  test('returns failure for non-retryable error', async () => {
    const result = await withRetry(
      async () => { throw new Error('Syntax error'); },
      { maxRetries: 3 },
    );
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.error!.message).toBe('Syntax error');
  });

  test('retries and succeeds on second attempt', async () => {
    let attempt = 0;
    const result = await withRetry(
      async () => {
        attempt++;
        if (attempt === 1) throw new Error('ECONNRESET');
        return 'recovered';
      },
      { maxRetries: 3, initialDelayMs: 1 },
    );
    expect(result.success).toBe(true);
    expect(result.result).toBe('recovered');
    expect(result.attempts).toBe(2);
  });

  test('exhausts retries and returns failure', async () => {
    const result = await withRetry(
      async () => { throw new Error('ECONNRESET'); },
      { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 10 },
    );
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3); // initial + 2 retries
    expect(result.error!.message).toBe('ECONNRESET');
  });

  test('respects maxRetries of 0', async () => {
    const result = await withRetry(
      async () => { throw new Error('ETIMEDOUT'); },
      { maxRetries: 0 },
    );
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
  });
});

// ============================================
// createRetryWrapper
// ============================================

describe('createRetryWrapper', () => {
  test('wraps function with retry logic', async () => {
    let calls = 0;
    const fn = async (x: number) => {
      calls++;
      if (calls === 1) throw new Error('ECONNRESET');
      return x * 2;
    };

    const wrapped = createRetryWrapper(fn, { maxRetries: 2, initialDelayMs: 1 });
    const result = await wrapped(5);
    expect(result).toBe(10);
    expect(calls).toBe(2);
  });

  test('throws on exhausted retries', async () => {
    const fn = async () => { throw new Error('ECONNRESET'); };
    const wrapped = createRetryWrapper(fn, { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 10 });

    try {
      await wrapped();
      expect(true).toBe(false); // Should not reach
    } catch (e: any) {
      expect(e.message).toBe('ECONNRESET');
    }
  });
});
