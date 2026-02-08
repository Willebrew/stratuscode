import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { readTool } from './read';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

let tmpDir: string;
let tmpFile: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-test-'));
  tmpFile = path.join(tmpDir, 'test.txt');
  await fs.writeFile(tmpFile, 'line one\nline two\nline three\nline four\nline five\n');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('read tool', () => {
  test('reads entire file with line numbers', async () => {
    const result = await readTool.execute({ file_path: tmpFile }, ctx as any);
    const text = result as string;
    expect(text).toContain('line one');
    expect(text).toContain('line two');
    expect(text).toContain('(6 lines)');
  });

  test('supports offset and limit', async () => {
    const result = await readTool.execute(
      { file_path: tmpFile, offset: 2, limit: 2 },
      ctx as any
    );
    const text = result as string;
    expect(text).toContain('line two');
    expect(text).toContain('line three');
    expect(text).not.toContain('line one');
    expect(text).toContain('lines 2-3');
  });

  test('throws for non-absolute path', async () => {
    expect(
      readTool.execute({ file_path: 'relative.txt' }, ctx as any)
    ).rejects.toThrow('absolute');
  });

  test('throws for missing file', async () => {
    expect(
      readTool.execute({ file_path: '/tmp/nonexistent_xyz_123.txt' }, ctx as any)
    ).rejects.toThrow('not found');
  });

  test('throws for directory path', async () => {
    expect(
      readTool.execute({ file_path: tmpDir }, ctx as any)
    ).rejects.toThrow('directory');
  });

  test('truncates long lines', async () => {
    const longLine = 'x'.repeat(3000);
    await fs.writeFile(tmpFile, longLine);
    const result = await readTool.execute({ file_path: tmpFile }, ctx as any);
    const text = result as string;
    expect(text).toContain('[truncated]');
  });
});
