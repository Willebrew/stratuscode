import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { revertTool } from './revert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

const ctx = { sessionId: 'test', metadata: { projectDir: '/tmp' } };

function createTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revert-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'file1.txt'), 'initial content');
  fs.writeFileSync(path.join(dir, 'file2.txt'), 'file2 initial');
  execSync('git add -A && git commit -m "initial"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

function removeTempDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('revert tool', () => {
  test('has correct tool metadata', () => {
    expect(revertTool.name).toBe('revert');
    expect(revertTool.description).toBeTruthy();
    expect(revertTool.parameters).toBeDefined();
  });

  test('returns error when snapshots not available (non-git dir)', async () => {
    const result = await revertTool.execute({}, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('not available');
  });
});

describe('revert tool: real git repo', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempGitRepo(); });
  afterEach(() => { removeTempDir(tmpDir); });

  test('reverts all files to HEAD when no hash provided', async () => {
    const repoCtx = { sessionId: 'test', metadata: { projectDir: tmpDir } };
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'changed content');
    const result = await revertTool.execute({}, repoCtx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.hash).toBeTruthy();
    expect(fs.readFileSync(path.join(tmpDir, 'file1.txt'), 'utf-8')).toBe('initial content');
  });

  test('reverts specific files when files array provided', async () => {
    const repoCtx = { sessionId: 'test', metadata: { projectDir: tmpDir } };
    const headHash = execSync('git rev-parse HEAD', { cwd: tmpDir }).toString().trim();
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'changed1');
    fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'changed2');
    const result = await revertTool.execute({ hash: headHash, files: ['file1.txt'] }, repoCtx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.filesReverted).toEqual(['file1.txt']);
    expect(fs.readFileSync(path.join(tmpDir, 'file1.txt'), 'utf-8')).toBe('initial content');
    expect(fs.readFileSync(path.join(tmpDir, 'file2.txt'), 'utf-8')).toBe('changed2');
  });

  test('reverts to a specific commit hash', async () => {
    const repoCtx = { sessionId: 'test', metadata: { projectDir: tmpDir } };
    const initialHash = execSync('git rev-parse HEAD', { cwd: tmpDir }).toString().trim();
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'second commit content');
    execSync('git add -A && git commit -m "second"', { cwd: tmpDir, stdio: 'pipe' });
    const result = await revertTool.execute({ hash: initialHash }, repoCtx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.hash).toBe(initialHash);
    expect(fs.readFileSync(path.join(tmpDir, 'file1.txt'), 'utf-8')).toBe('initial content');
  });

  test('success response includes summary', async () => {
    const repoCtx = { sessionId: 'test', metadata: { projectDir: tmpDir } };
    const initialHash = execSync('git rev-parse HEAD', { cwd: tmpDir }).toString().trim();
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'modified for summary');
    execSync('git add -A && git commit -m "modify"', { cwd: tmpDir, stdio: 'pipe' });
    const result = await revertTool.execute({ hash: initialHash }, repoCtx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.summary).toBeTruthy();
    expect(parsed.summary).toContain('file(s) changed');
  });

  test('returns error for invalid hash', async () => {
    const repoCtx = { sessionId: 'test', metadata: { projectDir: tmpDir } };
    const result = await revertTool.execute({ hash: 'invalidhash999' }, repoCtx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toBeTruthy();
  });
});

describe('revert tool: empty git repo (no HEAD)', () => {
  test('returns error when no HEAD exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revert-empty-'));
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
    const repoCtx = { sessionId: 'test', metadata: { projectDir: dir } };
    try {
      const result = await revertTool.execute({}, repoCtx as any);
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('No snapshots found');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
