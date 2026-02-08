import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { editTool } from './edit';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

let tmpDir: string;
let tmpFile: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-test-'));
  tmpFile = path.join(tmpDir, 'test.txt');
  await fs.writeFile(tmpFile, 'line one\nline two\nline three\n');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('edit tool', () => {
  test('replaces a unique string in file', async () => {
    const result = await editTool.execute(
      { file_path: tmpFile, old_string: 'line two', new_string: 'line TWO' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.replacements).toBe(1);

    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content).toContain('line TWO');
    expect(content).not.toContain('line two');
  });

  test('throws when old_string equals new_string', async () => {
    expect(
      editTool.execute(
        { file_path: tmpFile, old_string: 'line one', new_string: 'line one' },
        ctx as any
      )
    ).rejects.toThrow('identical');
  });

  test('throws when old_string not found', async () => {
    expect(
      editTool.execute(
        { file_path: tmpFile, old_string: 'nonexistent', new_string: 'x' },
        ctx as any
      )
    ).rejects.toThrow('not found');
  });

  test('throws for non-absolute path', async () => {
    expect(
      editTool.execute(
        { file_path: 'relative.txt', old_string: 'a', new_string: 'b' },
        ctx as any
      )
    ).rejects.toThrow('absolute');
  });

  test('throws for missing file', async () => {
    expect(
      editTool.execute(
        { file_path: '/tmp/definitely-does-not-exist-abc123.txt', old_string: 'a', new_string: 'b' },
        ctx as any
      )
    ).rejects.toThrow('not found');
  });

  test('throws when old_string matches multiple times without replace_all', async () => {
    await fs.writeFile(tmpFile, 'foo bar foo baz foo');
    expect(
      editTool.execute(
        { file_path: tmpFile, old_string: 'foo', new_string: 'qux' },
        ctx as any
      )
    ).rejects.toThrow('3 times');
  });

  test('replace_all replaces all occurrences', async () => {
    await fs.writeFile(tmpFile, 'foo bar foo baz foo');
    const result = await editTool.execute(
      { file_path: tmpFile, old_string: 'foo', new_string: 'qux', replace_all: true },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.replacements).toBe(3);

    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content).toBe('qux bar qux baz qux');
  });

  test('returns diff in result', async () => {
    const result = await editTool.execute(
      { file_path: tmpFile, old_string: 'line one', new_string: 'LINE ONE' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.diff).toBeTruthy();
    expect(parsed.diff).toContain('-line one');
    expect(parsed.diff).toContain('+LINE ONE');
  });
});
