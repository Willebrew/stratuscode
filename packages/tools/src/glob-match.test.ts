/**
 * Glob Pattern Matching Tests
 *
 * Tests for the matchGlob pure function used by the glob tool.
 */

import { describe, test, expect } from 'bun:test';
import { matchGlob } from './glob';

// ============================================
// matchGlob
// ============================================

describe('matchGlob', () => {
  test('matches exact filename', () => {
    expect(matchGlob('file.ts', 'file.ts')).toBe(true);
  });

  test('matches with * wildcard', () => {
    expect(matchGlob('file.ts', '*.ts')).toBe(true);
    expect(matchGlob('file.js', '*.ts')).toBe(false);
  });

  test('matches with ** globstar', () => {
    expect(matchGlob('src/utils/helper.ts', '**/*.ts')).toBe(true);
    expect(matchGlob('deep/nested/path/file.ts', '**/*.ts')).toBe(true);
  });

  test('matches with ? single-char wildcard', () => {
    expect(matchGlob('file1.ts', 'file?.ts')).toBe(true);
    expect(matchGlob('file12.ts', 'file?.ts')).toBe(false);
  });

  test('matches pattern with directory prefix', () => {
    expect(matchGlob('src/index.ts', 'src/*.ts')).toBe(true);
    expect(matchGlob('lib/index.ts', 'src/*.ts')).toBe(false);
  });

  test('** matches nested directories', () => {
    expect(matchGlob('a/b/c/d.ts', '**/d.ts')).toBe(true);
    // Note: ** requires a / prefix, so bare 'd.ts' doesn't match '**/d.ts'
    expect(matchGlob('d.ts', '**/d.ts')).toBe(false);
  });

  test('handles dots in filenames', () => {
    expect(matchGlob('package.json', '*.json')).toBe(true);
    expect(matchGlob('.gitignore', '.gitignore')).toBe(true);
  });

  test('non-glob pattern matches exact path', () => {
    // Non-glob patterns are anchored, so they match the full path
    expect(matchGlob('config.ts', 'config.ts')).toBe(true);
    // Pattern without wildcards won't match nested paths
    expect(matchGlob('src/config.ts', 'config.ts')).toBe(false);
  });

  test('returns false for non-matching patterns', () => {
    expect(matchGlob('file.ts', '*.js')).toBe(false);
    expect(matchGlob('src/file.ts', 'lib/*.ts')).toBe(false);
  });

  test('returns false for invalid regex (graceful fallback)', () => {
    // Patterns that might produce invalid regex
    expect(matchGlob('file.ts', '[invalid')).toBe(false);
  });

  test('handles * not matching directory separators', () => {
    // * should not cross directory boundaries
    expect(matchGlob('src/file.ts', 'src/*.ts')).toBe(true);
    // This should fail because * doesn't cross /
    expect(matchGlob('src/deep/file.ts', 'src/*.ts')).toBe(false);
  });

  test('matches **/*.tsx pattern', () => {
    expect(matchGlob('src/components/Button.tsx', '**/*.tsx')).toBe(true);
    expect(matchGlob('src/components/Button.ts', '**/*.tsx')).toBe(false);
  });
});
