/**
 * Shared Utils Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  generateId,
  generateSlug,
  truncate,
  truncateResult,
  normalizePath,
  isAbsolutePath,
  safeJsonParse,
  prettyJson,
  deepMerge,
  formatBytes,
  formatDuration,
  formatNumber,
  withTimeout,
  withRetry,
} from './utils';

// ============================================
// ID Generation
// ============================================

describe('generateId', () => {
  test('generates a non-empty string', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(0);
  });

  test('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  test('includes prefix when provided', () => {
    const id = generateId('msg');
    expect(id.startsWith('msg_')).toBe(true);
  });

  test('works without prefix', () => {
    const id = generateId();
    expect(id).not.toContain('_');
  });
});

// ============================================
// Slug Generation
// ============================================

describe('generateSlug', () => {
  test('converts text to lowercase slug', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  test('removes special characters', () => {
    expect(generateSlug('Test@#$%Slug!')).toBe('test-slug');
  });

  test('truncates to 50 characters', () => {
    const longText = 'a'.repeat(100);
    const slug = generateSlug(longText);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  test('generates random slug when text is empty', () => {
    const slug = generateSlug('');
    expect(slug.length).toBeGreaterThan(0);
  });

  test('generates random slug when text is undefined', () => {
    const slug = generateSlug();
    expect(slug.length).toBeGreaterThan(0);
  });

  test('removes leading and trailing dashes', () => {
    expect(generateSlug('---hello---')).toBe('hello');
  });
});

// ============================================
// String Utilities
// ============================================

describe('truncate', () => {
  test('returns string unchanged if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  test('truncates with ellipsis when over limit', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  test('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('truncateResult', () => {
  test('returns result unchanged if within limit', () => {
    expect(truncateResult('short', 1000)).toBe('short');
  });

  test('truncates with informational message when over limit', () => {
    const longResult = 'x'.repeat(500);
    const truncated = truncateResult(longResult, 200);
    expect(truncated.length).toBeLessThanOrEqual(200);
    expect(truncated).toContain('[TRUNCATED');
    expect(truncated).toContain('500 characters');
  });
});

// ============================================
// Path Utilities
// ============================================

describe('normalizePath', () => {
  test('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\test\\file.txt')).toBe('C:/Users/test/file.txt');
  });

  test('leaves forward slashes unchanged', () => {
    expect(normalizePath('/home/user/file.txt')).toBe('/home/user/file.txt');
  });
});

describe('isAbsolutePath', () => {
  test('recognizes Unix absolute paths', () => {
    expect(isAbsolutePath('/home/user')).toBe(true);
  });

  test('recognizes Windows absolute paths', () => {
    expect(isAbsolutePath('C:\\Users')).toBe(true);
    expect(isAbsolutePath('D:/Projects')).toBe(true);
  });

  test('rejects relative paths', () => {
    expect(isAbsolutePath('src/file.ts')).toBe(false);
    expect(isAbsolutePath('./file.ts')).toBe(false);
    expect(isAbsolutePath('../file.ts')).toBe(false);
  });
});

// ============================================
// JSON Utilities
// ============================================

describe('safeJsonParse', () => {
  test('parses valid JSON', () => {
    expect(safeJsonParse('{"key":"value"}', null)).toEqual({ key: 'value' } as any);
  });

  test('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', 'fallback')).toBe('fallback');
  });

  test('returns fallback for empty string', () => {
    expect(safeJsonParse('', {})).toEqual({});
  });
});

describe('prettyJson', () => {
  test('formats object with indentation', () => {
    const result = prettyJson({ a: 1 });
    expect(result).toBe('{\n  "a": 1\n}');
  });
});

// ============================================
// Object Utilities
// ============================================

describe('deepMerge', () => {
  test('merges flat objects', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 } as any);
    expect(result).toEqual({ a: 1, b: 3, c: 4 } as any);
  });

  test('deep merges nested objects', () => {
    const result = deepMerge(
      { nested: { a: 1, b: 2 } },
      { nested: { b: 3 } } as any
    );
    expect(result).toEqual({ nested: { a: 1, b: 3 } });
  });

  test('does not merge arrays (replaces them)', () => {
    const result = deepMerge({ arr: [1, 2] }, { arr: [3, 4] });
    expect(result).toEqual({ arr: [3, 4] });
  });

  test('does not mutate the target', () => {
    const target = { a: 1 };
    const result = deepMerge(target, { b: 2 } as any);
    expect(target).toEqual({ a: 1 });
    expect(result).toEqual({ a: 1, b: 2 } as any);
  });

  test('ignores undefined source values', () => {
    const result = deepMerge({ a: 1 }, { a: undefined } as any);
    expect(result).toEqual({ a: 1 });
  });
});

// ============================================
// Formatting
// ============================================

describe('formatBytes', () => {
  test('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  test('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  test('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  test('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  test('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});

describe('formatDuration', () => {
  test('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  test('formats seconds', () => {
    expect(formatDuration(3500)).toBe('3.5s');
  });

  test('formats minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});

describe('formatNumber', () => {
  test('formats with locale separators', () => {
    const result = formatNumber(1234567);
    // Locale-dependent but should contain separators
    expect(result.length).toBeGreaterThan(6);
  });
});

// ============================================
// Async Utilities
// ============================================

describe('withTimeout', () => {
  test('resolves when promise completes in time', async () => {
    const result = await withTimeout(
      Promise.resolve('done'),
      1000
    );
    expect(result).toBe('done');
  });

  test('rejects with timeout error when too slow', async () => {
    const slow = new Promise(resolve => setTimeout(resolve, 5000));
    await expect(withTimeout(slow, 50, 'Too slow')).rejects.toThrow('Too slow');
  });

  test('uses default timeout message', async () => {
    const slow = new Promise(resolve => setTimeout(resolve, 5000));
    await expect(withTimeout(slow, 50)).rejects.toThrow('Operation timed out');
  });
});

describe('withRetry', () => {
  test('succeeds on first attempt', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => { attempts++; return 'ok'; },
      { maxAttempts: 3, baseDelay: 10, maxDelay: 100 }
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(1);
  });

  test('retries on failure and succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'ok';
      },
      { maxAttempts: 3, baseDelay: 10, maxDelay: 100 }
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  test('throws after max attempts exhausted', async () => {
    await expect(withRetry(
      async () => { throw new Error('always fails'); },
      { maxAttempts: 2, baseDelay: 10, maxDelay: 100 }
    )).rejects.toThrow('always fails');
  });

  test('respects shouldRetry predicate', async () => {
    let attempts = 0;
    await expect(withRetry(
      async () => { attempts++; throw new Error('non-retryable'); },
      {
        maxAttempts: 5,
        baseDelay: 10,
        maxDelay: 100,
        shouldRetry: () => false,
      }
    )).rejects.toThrow('non-retryable');
    expect(attempts).toBe(1);
  });

  test('calls onRetry callback', async () => {
    const retries: number[] = [];
    let attempts = 0;
    await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'ok';
      },
      {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        onRetry: (attempt) => retries.push(attempt),
      }
    );
    expect(retries).toEqual([1, 2]);
  });

  test('throws when maxAttempts is 0 (post-loop safeguard)', async () => {
    await expect(withRetry(
      async () => 'should never run',
      { maxAttempts: 0, baseDelay: 10, maxDelay: 100 }
    )).rejects.toThrow();
  });
});
