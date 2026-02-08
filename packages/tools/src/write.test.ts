import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { writeTool } from './write';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('write tool', () => {
  test('creates a new file with content', async () => {
    const filePath = path.join(tmpDir, 'new-file.txt');
    const result = await writeTool.execute(
      { file_path: filePath, content: 'hello world\n' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.lines).toBe(2);
    expect(parsed.bytes).toBeGreaterThan(0);
    expect(parsed.diff).toBeTruthy();

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello world\n');
  });

  test('creates parent directories automatically', async () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'file.ts');
    const result = await writeTool.execute(
      { file_path: filePath, content: 'const x = 1;' },
      ctx as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('const x = 1;');
  });

  test('throws for non-absolute path', async () => {
    expect(
      writeTool.execute({ file_path: 'relative.txt', content: 'x' }, ctx as any)
    ).rejects.toThrow('absolute');
  });

  test('throws if file already exists', async () => {
    const filePath = path.join(tmpDir, 'existing.txt');
    await fs.writeFile(filePath, 'already here');

    expect(
      writeTool.execute({ file_path: filePath, content: 'new content' }, ctx as any)
    ).rejects.toThrow('already exists');
  });
});
