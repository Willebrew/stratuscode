import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { multiEditTool } from './multi-edit';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

let tmpDir: string;
let tmpFile: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'multi-edit-test-'));
  tmpFile = path.join(tmpDir, 'test.txt');
  await fs.writeFile(tmpFile, 'alpha\nbeta\ngamma\ndelta\n');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('multi-edit tool', () => {
  test('applies multiple edits sequentially', async () => {
    const result = await multiEditTool.execute({
      file_path: tmpFile,
      edits: [
        { old_string: 'alpha', new_string: 'ALPHA' },
        { old_string: 'gamma', new_string: 'GAMMA' },
      ],
    }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.editsApplied).toBe(2);
    expect(parsed.totalReplacements).toBe(2);

    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content).toContain('ALPHA');
    expect(content).toContain('GAMMA');
    expect(content).not.toContain('alpha');
  });

  test('is atomic — no changes if any edit fails', async () => {
    const original = await fs.readFile(tmpFile, 'utf-8');
    try {
      await multiEditTool.execute({
        file_path: tmpFile,
        edits: [
          { old_string: 'alpha', new_string: 'ALPHA' },
          { old_string: 'nonexistent', new_string: 'X' },
        ],
      }, ctx as any);
    } catch {
      // Expected
    }
    // File should be unchanged since the tool reads, applies in memory, then writes
    // Actually the tool throws before writing, so original content should remain
    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content).toBe(original);
  });

  test('throws for non-absolute path', async () => {
    expect(
      multiEditTool.execute({
        file_path: 'relative.txt',
        edits: [{ old_string: 'a', new_string: 'b' }],
      }, ctx as any)
    ).rejects.toThrow('absolute');
  });

  test('throws for empty edits array', async () => {
    expect(
      multiEditTool.execute({ file_path: tmpFile, edits: [] }, ctx as any)
    ).rejects.toThrow('No edits');
  });

  test('throws when old_string equals new_string', async () => {
    expect(
      multiEditTool.execute({
        file_path: tmpFile,
        edits: [{ old_string: 'alpha', new_string: 'alpha' }],
      }, ctx as any)
    ).rejects.toThrow('identical');
  });

  test('throws when old_string not found', async () => {
    expect(
      multiEditTool.execute({
        file_path: tmpFile,
        edits: [{ old_string: 'zzz', new_string: 'x' }],
      }, ctx as any)
    ).rejects.toThrow('not found');
  });

  test('throws for non-unique match without replace_all', async () => {
    await fs.writeFile(tmpFile, 'foo bar foo baz foo');
    expect(
      multiEditTool.execute({
        file_path: tmpFile,
        edits: [{ old_string: 'foo', new_string: 'qux' }],
      }, ctx as any)
    ).rejects.toThrow('3 times');
  });

  test('replace_all works within multi-edit', async () => {
    await fs.writeFile(tmpFile, 'foo bar foo baz foo');
    const result = await multiEditTool.execute({
      file_path: tmpFile,
      edits: [{ old_string: 'foo', new_string: 'qux', replace_all: true }],
    }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.totalReplacements).toBe(3);

    const content = await fs.readFile(tmpFile, 'utf-8');
    expect(content).toBe('qux bar qux baz qux');
  });

  test('returns diff in result', async () => {
    const result = await multiEditTool.execute({
      file_path: tmpFile,
      edits: [{ old_string: 'alpha', new_string: 'ALPHA' }],
    }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.diff).toContain('-alpha');
    expect(parsed.diff).toContain('+ALPHA');
  });
});
