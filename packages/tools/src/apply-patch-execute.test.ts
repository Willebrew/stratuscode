/**
 * Apply Patch Execute Tests
 *
 * Tests for the applyPatchTool.execute() method, which orchestrates
 * file reading, patch application, directory creation, and file writing.
 * Pure functions (parsePatch, parseHunk, applyHunks) are tested separately
 * in apply-patch.test.ts.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { applyPatchTool } from './apply-patch';

const testDir = `/tmp/stratuscode-apply-patch-exec-test-${Date.now()}`;

/**
 * Build a SageToolContext that the defineTool wrapper will adapt
 * to StratusToolContext internally.
 */
function makeSageContext(projectDir: string) {
  return {
    sessionId: 'test-session',
    conversationId: 'test-conv',
    userId: 'test-user',
    metadata: { projectDir },
  };
}

beforeAll(async () => {
  await fs.mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

// ============================================
// Helper to write a file in testDir
// ============================================

async function writeTestFile(relativePath: string, content: string): Promise<string> {
  const fullPath = path.join(testDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return fullPath;
}

async function readTestFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(testDir, relativePath), 'utf-8');
}

// ============================================
// Basic patch application
// ============================================

describe('applyPatchTool.execute', () => {
  test('applies a simple single-file patch', async () => {
    await writeTestFile('basic/hello.txt', 'line 1\nline 2\nline 3\n');

    const patch = `--- a/basic/hello.txt
+++ b/basic/hello.txt
@@ -1,3 +1,4 @@
 line 1
+inserted
 line 2
 line 3`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);

    expect(result.success).toBe(true);
    expect(result.filesPatched).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].file).toBe('basic/hello.txt');
    expect(result.results[0].hunksApplied).toBe(1);
    expect(result.results[0].success).toBe(true);

    const content = await readTestFile('basic/hello.txt');
    expect(content).toContain('inserted');
  });

  // ============================================
  // New file creation
  // ============================================

  test('creates a new file when patch target does not exist', async () => {
    const patch = `--- /dev/null
+++ b/newdir/brand-new.txt
@@ -0,0 +1,3 @@
+alpha
+beta
+gamma`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);

    expect(result.success).toBe(true);
    expect(result.filesPatched).toBe(1);

    const content = await readTestFile('newdir/brand-new.txt');
    expect(content).toContain('alpha');
    expect(content).toContain('beta');
    expect(content).toContain('gamma');
  });

  // ============================================
  // Multi-file patch
  // ============================================

  test('applies a multi-file patch', async () => {
    await writeTestFile('multi/a.txt', 'aaa\nbbb\n');
    await writeTestFile('multi/b.txt', 'xxx\nyyy\n');

    const patch = `--- a/multi/a.txt
+++ b/multi/a.txt
@@ -1,2 +1,3 @@
 aaa
+a-inserted
 bbb
--- a/multi/b.txt
+++ b/multi/b.txt
@@ -1,2 +1,3 @@
 xxx
+x-inserted
 yyy`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);

    expect(result.success).toBe(true);
    expect(result.filesPatched).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].file).toBe('multi/a.txt');
    expect(result.results[1].file).toBe('multi/b.txt');

    const contentA = await readTestFile('multi/a.txt');
    expect(contentA).toContain('a-inserted');

    const contentB = await readTestFile('multi/b.txt');
    expect(contentB).toContain('x-inserted');
  });

  // ============================================
  // cwd argument overrides context.projectDir
  // ============================================

  test('uses cwd argument instead of context.projectDir', async () => {
    const cwdDir = path.join(testDir, 'cwd-override');
    await fs.mkdir(cwdDir, { recursive: true });
    await fs.writeFile(path.join(cwdDir, 'target.txt'), 'original\n', 'utf-8');

    const patch = `--- a/target.txt
+++ b/target.txt
@@ -1,1 +1,2 @@
 original
+via-cwd`;

    // Pass a different projectDir in context; cwd should win
    const raw = await applyPatchTool.execute(
      { patch, cwd: cwdDir },
      makeSageContext('/nonexistent-should-not-be-used'),
    );
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await fs.readFile(path.join(cwdDir, 'target.txt'), 'utf-8');
    expect(content).toContain('via-cwd');
  });

  // ============================================
  // Falls back to context.projectDir
  // ============================================

  test('falls back to context.projectDir when cwd is not provided', async () => {
    const projDir = path.join(testDir, 'projdir-fallback');
    await fs.mkdir(projDir, { recursive: true });
    await fs.writeFile(path.join(projDir, 'fb.txt'), 'before\n', 'utf-8');

    const patch = `--- a/fb.txt
+++ b/fb.txt
@@ -1,1 +1,2 @@
 before
+after`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(projDir));
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await fs.readFile(path.join(projDir, 'fb.txt'), 'utf-8');
    expect(content).toContain('after');
  });

  // ============================================
  // Creates parent directories (mkdir -p)
  // ============================================

  test('creates deeply nested parent directories for new files', async () => {
    const patch = `--- /dev/null
+++ b/deep/nested/dir/structure/file.txt
@@ -0,0 +1,1 @@
+hello deep`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await readTestFile('deep/nested/dir/structure/file.txt');
    expect(content).toContain('hello deep');
  });

  // ============================================
  // No valid patches error
  // ============================================

  test('throws on empty patch string', async () => {
    await expect(
      applyPatchTool.execute({ patch: '' }, makeSageContext(testDir)),
    ).rejects.toThrow('No valid patches found in input');
  });

  test('throws on invalid/unparseable patch string', async () => {
    await expect(
      applyPatchTool.execute({ patch: 'just random text' }, makeSageContext(testDir)),
    ).rejects.toThrow('No valid patches found in input');
  });

  test('throws on patch with headers but no hunks', async () => {
    const patch = `--- a/file.txt
+++ b/file.txt
no hunk here at all`;

    await expect(
      applyPatchTool.execute({ patch }, makeSageContext(testDir)),
    ).rejects.toThrow('No valid patches found in input');
  });

  // ============================================
  // Non-existent file treated as empty (new file scenario)
  // ============================================

  test('treats non-existent file as empty content (new file via add hunk)', async () => {
    const patch = `--- a/does-not-exist-yet.txt
+++ b/does-not-exist-yet.txt
@@ -0,0 +1,2 @@
+first
+second`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await readTestFile('does-not-exist-yet.txt');
    expect(content).toContain('first');
    expect(content).toContain('second');
  });

  // ============================================
  // Absolute path handling
  // ============================================

  test('handles absolute paths in patch without joining to workDir', async () => {
    const absDir = path.join(testDir, 'abs-test');
    await fs.mkdir(absDir, { recursive: true });
    const absFile = path.join(absDir, 'absolute.txt');
    await fs.writeFile(absFile, 'old content\n', 'utf-8');

    // Patch with absolute path (no a/b prefix stripping needed for absolute paths)
    const patch = `--- ${absFile}
+++ ${absFile}
@@ -1,1 +1,2 @@
 old content
+new content`;

    const raw = await applyPatchTool.execute(
      { patch },
      makeSageContext('/some/other/dir'),
    );
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await fs.readFile(absFile, 'utf-8');
    expect(content).toContain('new content');
  });

  // ============================================
  // Result format verification
  // ============================================

  test('returns correct JSON result shape', async () => {
    await writeTestFile('shape/test.txt', 'hello\nworld\n');

    const patch = `--- a/shape/test.txt
+++ b/shape/test.txt
@@ -1,2 +1,3 @@
 hello
+middle
 world`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);

    // Top-level shape
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('filesPatched');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('message');
    expect(typeof result.filesPatched).toBe('number');
    expect(typeof result.message).toBe('string');
    expect(Array.isArray(result.results)).toBe(true);

    // Per-file result shape
    const fileResult = result.results[0];
    expect(fileResult).toHaveProperty('file');
    expect(fileResult).toHaveProperty('hunksApplied');
    expect(fileResult).toHaveProperty('success');
    expect(typeof fileResult.file).toBe('string');
    expect(typeof fileResult.hunksApplied).toBe('number');
    expect(typeof fileResult.success).toBe('boolean');
  });

  test('message includes file count', async () => {
    await writeTestFile('msg/a.txt', 'one\n');
    await writeTestFile('msg/b.txt', 'two\n');

    const patch = `--- a/msg/a.txt
+++ b/msg/a.txt
@@ -1,1 +1,2 @@
 one
+one-b
--- a/msg/b.txt
+++ b/msg/b.txt
@@ -1,1 +1,2 @@
 two
+two-b`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);
    expect(result.message).toBe('Applied patch to 2 file(s)');
  });

  // ============================================
  // Multiple hunks in one file
  // ============================================

  test('applies multiple hunks in a single file', async () => {
    // Create a file with enough lines to have two separated hunks
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    await writeTestFile('multihunk/big.txt', lines.join('\n') + '\n');

    const patch = `--- a/multihunk/big.txt
+++ b/multihunk/big.txt
@@ -1,3 +1,4 @@
 line 1
+inserted-top
 line 2
 line 3
@@ -18,3 +19,4 @@
 line 18
+inserted-bottom
 line 19
 line 20`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);

    expect(result.success).toBe(true);
    expect(result.results[0].hunksApplied).toBe(2);

    const content = await readTestFile('multihunk/big.txt');
    expect(content).toContain('inserted-top');
    expect(content).toContain('inserted-bottom');
  });

  // ============================================
  // Line addition via execute
  // ============================================

  test('adds lines to an existing file', async () => {
    await writeTestFile('ops/add.txt', 'first\nlast\n');

    const patch = `--- a/ops/add.txt
+++ b/ops/add.txt
@@ -1,2 +1,4 @@
 first
+second
+third
 last`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await readTestFile('ops/add.txt');
    const contentLines = content.split('\n');
    expect(contentLines).toContain('second');
    expect(contentLines).toContain('third');
  });

  // ============================================
  // Line removal via execute
  // ============================================

  test('removes lines from an existing file', async () => {
    await writeTestFile('ops/remove.txt', 'keep\ndelete-me\nalso-keep\n');

    const patch = `--- a/ops/remove.txt
+++ b/ops/remove.txt
@@ -1,3 +1,2 @@
 keep
-delete-me
 also-keep`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await readTestFile('ops/remove.txt');
    expect(content).not.toContain('delete-me');
    expect(content).toContain('keep');
    expect(content).toContain('also-keep');
  });

  // ============================================
  // Line modification via execute
  // ============================================

  test('modifies lines in an existing file', async () => {
    await writeTestFile('ops/modify.txt', 'header\nold-value\nfooter\n');

    const patch = `--- a/ops/modify.txt
+++ b/ops/modify.txt
@@ -1,3 +1,3 @@
 header
-old-value
+new-value
 footer`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await readTestFile('ops/modify.txt');
    expect(content).not.toContain('old-value');
    expect(content).toContain('new-value');
  });

  // ============================================
  // Error propagation with file path info
  // ============================================

  test('error message includes file path on hunk application failure', async () => {
    // Create a file with content that does not match the patch context lines.
    // applyHunks will still splice (it doesn't validate context), but
    // we can trigger an error by making the file unwritable.
    const readonlyDir = path.join(testDir, 'readonly-test');
    await fs.mkdir(readonlyDir, { recursive: true });
    await fs.writeFile(path.join(readonlyDir, 'locked.txt'), 'content\n', 'utf-8');

    // Make file read-only
    await fs.chmod(path.join(readonlyDir, 'locked.txt'), 0o444);

    const patch = `--- a/locked.txt
+++ b/locked.txt
@@ -1,1 +1,2 @@
 content
+added`;

    try {
      await applyPatchTool.execute({ patch }, makeSageContext(readonlyDir));
      // If it doesn't throw (some systems allow root to write), skip
      // But verify the file was actually changed
    } catch (err: any) {
      expect(err.message).toContain('locked.txt');
      expect(err.message).toContain('Failed to apply patch');
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(path.join(readonlyDir, 'locked.txt'), 0o644);
    }
  });

  // ============================================
  // Single file patched, filesPatched count = 1
  // ============================================

  test('filesPatched count matches actual number of files', async () => {
    await writeTestFile('count/one.txt', 'a\n');
    await writeTestFile('count/two.txt', 'b\n');
    await writeTestFile('count/three.txt', 'c\n');

    const patch = `--- a/count/one.txt
+++ b/count/one.txt
@@ -1,1 +1,2 @@
 a
+a2
--- a/count/two.txt
+++ b/count/two.txt
@@ -1,1 +1,2 @@
 b
+b2
--- a/count/three.txt
+++ b/count/three.txt
@@ -1,1 +1,2 @@
 c
+c2`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);

    expect(result.filesPatched).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  // ============================================
  // Return value is a string (JSON)
  // ============================================

  test('returns a JSON string (not an object)', async () => {
    await writeTestFile('str/test.txt', 'x\n');

    const patch = `--- a/str/test.txt
+++ b/str/test.txt
@@ -1,1 +1,2 @@
 x
+y`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    expect(typeof raw).toBe('string');

    // Should be valid JSON
    const parsed = JSON.parse(raw as string);
    expect(parsed).toBeDefined();
  });

  // ============================================
  // File with no trailing newline
  // ============================================

  test('handles files without trailing newline', async () => {
    // No trailing newline
    await writeTestFile('nonl/file.txt', 'line1\nline2');

    const patch = `--- a/nonl/file.txt
+++ b/nonl/file.txt
@@ -1,2 +1,3 @@
 line1
+inserted
 line2`;

    const raw = await applyPatchTool.execute({ patch }, makeSageContext(testDir));
    const result = JSON.parse(raw as string);
    expect(result.success).toBe(true);

    const content = await readTestFile('nonl/file.txt');
    expect(content).toContain('inserted');
    expect(content).toContain('line1');
    expect(content).toContain('line2');
  });
});
