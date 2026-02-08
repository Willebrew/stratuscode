import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { lsTool } from './ls';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-test-'));
  await fs.writeFile(path.join(tmpDir, 'file1.txt'), 'hello');
  await fs.writeFile(path.join(tmpDir, 'file2.ts'), 'const x = 1;');
  await fs.mkdir(path.join(tmpDir, 'subdir'));
  await fs.writeFile(path.join(tmpDir, 'subdir', 'nested.txt'), 'nested');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ls tool', () => {
  test('lists files and directories', async () => {
    const result = await lsTool.execute({ directory_path: tmpDir }, ctx as any);
    const text = result as string;
    expect(text).toContain('file1.txt');
    expect(text).toContain('file2.ts');
    expect(text).toContain('subdir/');
  });

  test('shows directories before files', async () => {
    const result = await lsTool.execute({ directory_path: tmpDir }, ctx as any);
    const text = result as string;
    const subdirIdx = text.indexOf('subdir');
    const file1Idx = text.indexOf('file1.txt');
    expect(subdirIdx).toBeLessThan(file1Idx);
  });

  test('shows item count for directories', async () => {
    const result = await lsTool.execute({ directory_path: tmpDir }, ctx as any);
    const text = result as string;
    expect(text).toContain('1 items'); // subdir has 1 file
  });

  test('shows file sizes', async () => {
    const result = await lsTool.execute({ directory_path: tmpDir }, ctx as any);
    const text = result as string;
    // file1.txt is 5 bytes
    expect(text).toContain('5 B');
  });

  test('throws for non-absolute path', async () => {
    expect(
      lsTool.execute({ directory_path: 'relative' }, ctx as any)
    ).rejects.toThrow('absolute');
  });

  test('throws for nonexistent path', async () => {
    expect(
      lsTool.execute({ directory_path: '/tmp/nonexistent_xyz_987' }, ctx as any)
    ).rejects.toThrow('not found');
  });

  test('throws for file path (not directory)', async () => {
    expect(
      lsTool.execute({ directory_path: path.join(tmpDir, 'file1.txt') }, ctx as any)
    ).rejects.toThrow('not a directory');
  });
});
