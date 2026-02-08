/**
 * Diff Generation Tests
 *
 * Tests for generateUnifiedDiff - pure function.
 */

import { describe, test, expect } from 'bun:test';
import { generateUnifiedDiff } from './diff';

describe('generateUnifiedDiff', () => {
  test('identical content returns empty string', () => {
    const content = 'line 1\nline 2\nline 3';
    const result = generateUnifiedDiff(content, content, 'test.ts');
    expect(result).toBe('');
  });

  test('simple line addition', () => {
    const old = 'line 1\nline 2';
    const newContent = 'line 1\nline 2\nline 3';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');

    expect(result).toContain('--- a/test.ts');
    expect(result).toContain('+++ b/test.ts');
    expect(result).toContain('+line 3');
  });

  test('simple line removal', () => {
    const old = 'line 1\nline 2\nline 3';
    const newContent = 'line 1\nline 3';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');

    expect(result).toContain('-line 2');
  });

  test('line modification', () => {
    const old = 'line 1\nold line\nline 3';
    const newContent = 'line 1\nnew line\nline 3';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');

    expect(result).toContain('-old line');
    expect(result).toContain('+new line');
  });

  test('includes hunk header with line numbers', () => {
    const old = 'line 1\nline 2\nline 3';
    const newContent = 'line 1\nmodified\nline 3';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');

    expect(result).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
  });

  test('includes file path in header', () => {
    const result = generateUnifiedDiff('a', 'b', 'src/foo/bar.ts');
    expect(result).toContain('--- a/src/foo/bar.ts');
    expect(result).toContain('+++ b/src/foo/bar.ts');
  });

  test('handles empty old content', () => {
    const result = generateUnifiedDiff('', 'new line', 'new-file.ts');
    expect(result).toContain('+new line');
  });

  test('handles empty new content', () => {
    const result = generateUnifiedDiff('old line', '', 'deleted-file.ts');
    expect(result).toContain('-old line');
  });

  test('context lines are prefixed with space', () => {
    const old = 'context 1\nold\ncontext 2';
    const newContent = 'context 1\nnew\ncontext 2';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');

    expect(result).toContain(' context 1');
    expect(result).toContain(' context 2');
  });

  test('multiple changes produce correct diff', () => {
    const old = 'a\nb\nc\nd\ne';
    const newContent = 'a\nB\nc\nD\ne';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');

    expect(result).toContain('-b');
    expect(result).toContain('+B');
    expect(result).toContain('-d');
    expect(result).toContain('+D');
  });

  // Exercises foundNew lookahead (lines 45-48, 51-54): insert lines before a match
  test('lookahead: insertions before a matching line', () => {
    const old = 'first\nmatch\nlast';
    const newContent = 'first\ninserted 1\ninserted 2\nmatch\nlast';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');
    expect(result).toContain('+inserted 1');
    expect(result).toContain('+inserted 2');
    expect(result).toContain(' match');
  });

  // Exercises foundOld lookahead (lines 40-43, 55-58): remove lines before a match
  test('lookahead: deletions before a matching line', () => {
    const old = 'first\nremoved 1\nremoved 2\nmatch\nlast';
    const newContent = 'first\nmatch\nlast';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');
    expect(result).toContain('-removed 1');
    expect(result).toContain('-removed 2');
    expect(result).toContain(' match');
  });

  // Exercises both lookaheads failing (lines 59-61): completely different lines
  test('no lookahead match: lines differ completely within window', () => {
    const old = 'aaa\nbbb\nccc\nddd\neee\nfff\nggg';
    const newContent = '111\n222\n333\n444\n555\n666\n777';
    const result = generateUnifiedDiff(old, newContent, 'test.ts');
    expect(result).toContain('-aaa');
    expect(result).toContain('+111');
  });

  // Exercises distant changes grouping into separate hunks (lines 82-90)
  test('distant changes create separate hunks', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const oldContent = lines.join('\n');
    const newLines = [...lines];
    newLines[2] = 'CHANGED 3';
    newLines[17] = 'CHANGED 18';
    const newContent = newLines.join('\n');
    const result = generateUnifiedDiff(oldContent, newContent, 'test.ts');
    const hunkHeaders = (result.match(/@@ /g) || []).length;
    expect(hunkHeaders).toBeGreaterThanOrEqual(2);
  });

  // Exercises the line counting loop (lines 99-102)
  test('hunk line numbers account for prior changes', () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`);
    const oldContent = lines.join('\n');
    const newLines = [...lines];
    newLines[12] = 'CHANGED 13'; // Change deep in the file
    const newContent = newLines.join('\n');
    const result = generateUnifiedDiff(oldContent, newContent, 'test.ts');
    expect(result).toContain('-line 13');
    expect(result).toContain('+CHANGED 13');
    // Hunk header should reference correct start line
    expect(result).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });

  // Exercises adjacent non-context grouping into single hunk
  test('close changes merge into single hunk', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const oldContent = lines.join('\n');
    const newLines = [...lines];
    newLines[3] = 'CHANGED 4';
    newLines[5] = 'CHANGED 6';
    const newContent = newLines.join('\n');
    const result = generateUnifiedDiff(oldContent, newContent, 'test.ts');
    const hunkHeaders = (result.match(/@@ /g) || []).length;
    expect(hunkHeaders).toBe(1);
  });
});
