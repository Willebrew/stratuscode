/**
 * Apply Patch Tests
 *
 * Tests for parsePatch, parseHunk, and applyHunks - pure patch parsing and application.
 */

import { describe, test, expect } from 'bun:test';
import { parsePatch, parseHunk, applyHunks } from './apply-patch';
import type { Hunk, HunkLine } from './apply-patch';

// ============================================
// parsePatch
// ============================================

describe('parsePatch', () => {
  test('parses single file patch', () => {
    const patch = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line 1
+new line
 line 2
 line 3`;

    const result = parsePatch(patch);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('file.txt');
    expect(result[0].hunks).toHaveLength(1);
  });

  test('strips a/ and b/ prefix from paths', () => {
    const patch = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,1 +1,2 @@
 original
+added`;

    const result = parsePatch(patch);
    expect(result[0].path).toBe('src/index.ts');
  });

  test('parses multi-file patch', () => {
    const patch = `--- a/file1.ts
+++ b/file1.ts
@@ -1,1 +1,2 @@
 line1
+added1
--- a/file2.ts
+++ b/file2.ts
@@ -1,1 +1,2 @@
 line2
+added2`;

    const result = parsePatch(patch);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('file1.ts');
    expect(result[1].path).toBe('file2.ts');
  });

  test('returns empty array for empty input', () => {
    expect(parsePatch('')).toEqual([]);
  });

  test('returns empty array for no valid patches', () => {
    expect(parsePatch('just some random text')).toEqual([]);
  });

  test('returns empty array for header with no hunks', () => {
    const patch = `--- a/file.txt
+++ b/file.txt
no hunk headers here`;

    const result = parsePatch(patch);
    expect(result).toEqual([]);
  });

  test('parses patch with multiple hunks in one file', () => {
    const patch = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line 1
+added early
 line 2
 line 3
@@ -10,3 +11,4 @@
 line 10
 line 11
+added late
 line 12`;

    const result = parsePatch(patch);
    expect(result).toHaveLength(1);
    expect(result[0].hunks).toHaveLength(2);
  });

  test('handles paths without a/b prefix', () => {
    const patch = `--- file.txt
+++ file.txt
@@ -1,1 +1,2 @@
 original
+new`;

    const result = parsePatch(patch);
    expect(result[0].path).toBe('file.txt');
  });
});

// ============================================
// parseHunk
// ============================================

describe('parseHunk', () => {
  test('parses standard hunk header', () => {
    const lines = ['@@ -1,3 +1,4 @@', ' context', '+added', ' context2'];
    const result = parseHunk(lines, 0);

    expect(result).not.toBeNull();
    expect(result!.hunk.oldStart).toBe(1);
    expect(result!.hunk.oldCount).toBe(3);
    expect(result!.hunk.newStart).toBe(1);
    expect(result!.hunk.newCount).toBe(4);
    expect(result!.hunk.lines).toHaveLength(3);
  });

  test('parses hunk with single-line count (no comma)', () => {
    const lines = ['@@ -1 +1 @@', '-old', '+new'];
    const result = parseHunk(lines, 0);

    expect(result).not.toBeNull();
    expect(result!.hunk.oldCount).toBe(1);
    expect(result!.hunk.newCount).toBe(1);
  });

  test('returns null for invalid header', () => {
    const lines = ['not a hunk header'];
    expect(parseHunk(lines, 0)).toBeNull();
  });

  test('returns null for empty line', () => {
    expect(parseHunk([], 0)).toBeNull();
  });

  test('classifies line types correctly', () => {
    const lines = [
      '@@ -1,4 +1,4 @@',
      ' context line',
      '-removed line',
      '+added line',
      ' another context',
    ];
    const result = parseHunk(lines, 0);

    expect(result!.hunk.lines[0].type).toBe('context');
    expect(result!.hunk.lines[0].content).toBe('context line');
    expect(result!.hunk.lines[1].type).toBe('remove');
    expect(result!.hunk.lines[1].content).toBe('removed line');
    expect(result!.hunk.lines[2].type).toBe('add');
    expect(result!.hunk.lines[2].content).toBe('added line');
    expect(result!.hunk.lines[3].type).toBe('context');
  });

  test('stops at next hunk header', () => {
    const lines = [
      '@@ -1,2 +1,2 @@',
      ' line 1',
      '-old',
      '@@ -5,2 +5,2 @@',
      ' line 5',
    ];
    const result = parseHunk(lines, 0);

    expect(result!.hunk.lines).toHaveLength(2);
    expect(result!.nextIndex).toBe(3);
  });

  test('stops at file header (---)', () => {
    const lines = [
      '@@ -1,1 +1,1 @@',
      '-old',
      '--- a/other.ts',
    ];
    const result = parseHunk(lines, 0);

    expect(result!.hunk.lines).toHaveLength(1);
    expect(result!.nextIndex).toBe(2);
  });

  test('empty line breaks hunk parsing (falsy check)', () => {
    // Empty string is falsy, so parseHunk stops at empty lines
    const lines = ['@@ -1,2 +1,2 @@', '', ' content'];
    const result = parseHunk(lines, 0);

    expect(result).not.toBeNull();
    expect(result!.hunk.lines).toHaveLength(0);
    expect(result!.nextIndex).toBe(1);
  });
});

// ============================================
// applyHunks
// ============================================

describe('applyHunks', () => {
  test('adds a new line', () => {
    const content = 'line 1\nline 2\nline 3';
    const hunks: Hunk[] = [{
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 4,
      lines: [
        { type: 'context', content: 'line 1' },
        { type: 'add', content: 'new line' },
        { type: 'context', content: 'line 2' },
        { type: 'context', content: 'line 3' },
      ],
    }];

    const result = applyHunks(content, hunks);
    expect(result).toBe('line 1\nnew line\nline 2\nline 3');
  });

  test('removes a line', () => {
    const content = 'line 1\nline 2\nline 3';
    const hunks: Hunk[] = [{
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 2,
      lines: [
        { type: 'context', content: 'line 1' },
        { type: 'remove', content: 'line 2' },
        { type: 'context', content: 'line 3' },
      ],
    }];

    const result = applyHunks(content, hunks);
    expect(result).toBe('line 1\nline 3');
  });

  test('modifies a line (remove + add)', () => {
    const content = 'line 1\nold line\nline 3';
    const hunks: Hunk[] = [{
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 3,
      lines: [
        { type: 'context', content: 'line 1' },
        { type: 'remove', content: 'old line' },
        { type: 'add', content: 'new line' },
        { type: 'context', content: 'line 3' },
      ],
    }];

    const result = applyHunks(content, hunks);
    expect(result).toBe('line 1\nnew line\nline 3');
  });

  test('applies to empty content', () => {
    const hunks: Hunk[] = [{
      oldStart: 1,
      oldCount: 0,
      newStart: 1,
      newCount: 2,
      lines: [
        { type: 'add', content: 'first line' },
        { type: 'add', content: 'second line' },
      ],
    }];

    const result = applyHunks('', hunks);
    expect(result).toContain('first line');
    expect(result).toContain('second line');
  });

  test('handles empty hunks array', () => {
    expect(applyHunks('unchanged', [])).toBe('unchanged');
  });

  test('applies multiple hunks with offset tracking', () => {
    const content = 'a\nb\nc\nd\ne';
    const hunks: Hunk[] = [
      {
        oldStart: 1,
        oldCount: 2,
        newStart: 1,
        newCount: 3,
        lines: [
          { type: 'context', content: 'a' },
          { type: 'add', content: 'A2' },
          { type: 'context', content: 'b' },
        ],
      },
      {
        oldStart: 4,
        oldCount: 2,
        newStart: 5,
        newCount: 3,
        lines: [
          { type: 'context', content: 'd' },
          { type: 'add', content: 'D2' },
          { type: 'context', content: 'e' },
        ],
      },
    ];

    const result = applyHunks(content, hunks);
    const lines = result.split('\n');
    expect(lines).toContain('A2');
    expect(lines).toContain('D2');
  });
});
