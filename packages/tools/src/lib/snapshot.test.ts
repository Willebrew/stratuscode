import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Snapshot } from './snapshot';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

describe('snapshot: summarize', () => {
  test('summarizes file changes correctly', () => {
    const files = [
      { path: 'src/foo.ts', additions: 10, deletions: 3, status: 'modified' as const },
      { path: 'src/bar.ts', additions: 5, deletions: 0, status: 'added' as const },
      { path: 'src/old.ts', additions: 0, deletions: 20, status: 'deleted' as const },
    ];
    const summary = Snapshot.summarize(files);
    expect(summary).toContain('3 file(s) changed');
    expect(summary).toContain('+15 additions');
    expect(summary).toContain('-23 deletions');
    expect(summary).toContain('[M] src/foo.ts');
    expect(summary).toContain('[+] src/bar.ts');
    expect(summary).toContain('[-] src/old.ts');
  });
  test('handles empty file list', () => {
    const summary = Snapshot.summarize([]);
    expect(summary).toContain('0 file(s) changed');
    expect(summary).toContain('+0 additions');
  });
});
describe('snapshot: isAvailable', () => {
  test('returns true for the current repo', async () => {
    const available = await Snapshot.isAvailable(process.cwd());
    expect(available).toBe(true);
  });
  test('returns false for non-git directory', async () => {
    const available = await Snapshot.isAvailable('/tmp');
    expect(available).toBe(false);
  });
});
describe('snapshot: getCurrentHash', () => {
  test('returns a hash for current repo', async () => {
    const hash = await Snapshot.getCurrentHash(process.cwd());
    expect(hash).toBeTruthy();
    expect(hash!.length).toBeGreaterThan(5);
  });
  test('returns null for non-git directory', async () => {
    const hash = await Snapshot.getCurrentHash('/tmp');
    expect(hash).toBeNull();
  });
});
describe('snapshot: getChangedFiles', () => {
  test('returns array (may be empty) for HEAD', async () => {
    const hash = await Snapshot.getCurrentHash(process.cwd());
    if (hash) {
      const files = await Snapshot.getChangedFiles(process.cwd(), hash);
      expect(Array.isArray(files)).toBe(true);
    }
  });
});
describe('snapshot: cleanup', () => {
  test('does not throw for non-git directory', async () => {
    await expect(Snapshot.cleanup('/tmp')).resolves.toBeUndefined();
  });
});
function createTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'file1.txt'), 'initial content');
  execSync('git add -A && git commit -m "initial"', { cwd: dir, stdio: 'pipe' });
  return dir;
}
function removeTempDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
describe('snapshot: track (real repo)', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempGitRepo(); });
  afterEach(() => { removeTempDir(tmpDir); });
  test('creates snapshot and returns hash', async () => {
    const result = await Snapshot.track(tmpDir);
    expect(result.success).toBe(true);
    expect(result.hash).toBeTruthy();
    expect(result.hash!.length).toBeGreaterThan(5);
  });
  test('captures uncommitted changes', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'modified content');
    const result = await Snapshot.track(tmpDir);
    expect(result.success).toBe(true);
    expect(result.hash).toBeTruthy();
  });
  test('captures new untracked files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'newfile.txt'), 'new file');
    const result = await Snapshot.track(tmpDir);
    expect(result.success).toBe(true);
    expect(result.hash).toBeTruthy();
  });
  test('returns error for non-git directory', async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-nongit-'));
    try {
      const result = await Snapshot.track(nonGitDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not a git repository');
    } finally { removeTempDir(nonGitDir); }
  });
});
describe('snapshot: diff (real repo)', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempGitRepo(); });
  afterEach(() => { removeTempDir(tmpDir); });
  test('returns null for non-git directory', async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-nongit-'));
    try {
      const result = await Snapshot.diff(nonGitDir, 'abcdef');
      expect(result).toBeNull();
    } finally { removeTempDir(nonGitDir); }
  });
  test('returns empty files when no changes', async () => {
    const hash = await Snapshot.getCurrentHash(tmpDir);
    expect(hash).toBeTruthy();
    const result = await Snapshot.diff(tmpDir, hash!);
    expect(result).toBeTruthy();
    expect(result!.files).toEqual([]);
    expect(result!.patch).toBe('');
  });
  test('detects modified files', async () => {
    const initialHash = await Snapshot.getCurrentHash(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'changed content');
    execSync('git add -A && git commit -m "modify"', { cwd: tmpDir, stdio: 'pipe' });
    const result = await Snapshot.diff(tmpDir, initialHash!);
    expect(result).toBeTruthy();
    expect(result!.files.length).toBeGreaterThan(0);
    const f = result!.files.find(f => f.path === 'file1.txt');
    expect(f).toBeTruthy();
    expect(f!.status).toBe('modified');
  });
  test('detects added files', async () => {
    const initialHash = await Snapshot.getCurrentHash(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'added.txt'), 'new file content');
    execSync('git add -A && git commit -m "add"', { cwd: tmpDir, stdio: 'pipe' });
    const result = await Snapshot.diff(tmpDir, initialHash!);
    const f = result!.files.find(f => f.path === 'added.txt');
    expect(f).toBeTruthy();
    expect(f!.status).toBe('added');
    expect(f!.additions).toBeGreaterThan(0);
    expect(f!.deletions).toBe(0);
  });
  test('detects deleted files', async () => {
    const initialHash = await Snapshot.getCurrentHash(tmpDir);
    fs.unlinkSync(path.join(tmpDir, 'file1.txt'));
    execSync('git add -A && git commit -m "delete"', { cwd: tmpDir, stdio: 'pipe' });
    const result = await Snapshot.diff(tmpDir, initialHash!);
    const f = result!.files.find(f => f.path === 'file1.txt');
    expect(f).toBeTruthy();
    expect(f!.status).toBe('deleted');
    expect(f!.additions).toBe(0);
    expect(f!.deletions).toBeGreaterThan(0);
  });
  test('patch contains unified diff output', async () => {
    const initialHash = await Snapshot.getCurrentHash(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'patched content');
    execSync('git add -A && git commit -m "patch"', { cwd: tmpDir, stdio: 'pipe' });
    const result = await Snapshot.diff(tmpDir, initialHash!);
    expect(result!.patch).toContain('diff --git');
    expect(result!.patch).toContain('file1.txt');
  });
});
describe('snapshot: restore (real repo)', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempGitRepo(); });
  afterEach(() => { removeTempDir(tmpDir); });
  test('returns error for non-git directory', async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-nongit-'));
    try {
      const result = await Snapshot.restore(nonGitDir, 'abcdef');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not a git repository');
    } finally { removeTempDir(nonGitDir); }
  });
  test('restores working directory to snapshot state', async () => {
    const snapshotResult = await Snapshot.track(tmpDir);
    expect(snapshotResult.success).toBe(true);
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'modified after snapshot');
    const restoreResult = await Snapshot.restore(tmpDir, snapshotResult.hash!);
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.hash).toBe(snapshotResult.hash);
    expect(fs.readFileSync(path.join(tmpDir, 'file1.txt'), 'utf-8')).toBe('initial content');
  });
  test('returns error for invalid hash', async () => {
    const result = await Snapshot.restore(tmpDir, 'invalidhash123');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
describe('snapshot: revertFiles (real repo)', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempGitRepo(); });
  afterEach(() => { removeTempDir(tmpDir); });
  test('returns error for non-git directory', async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-nongit-'));
    try {
      const result = await Snapshot.revertFiles(nonGitDir, 'abcdef', ['file.txt']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not a git repository');
    } finally { removeTempDir(nonGitDir); }
  });
  test('reverts specific file to snapshot state', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'file2 initial');
    execSync('git add -A && git commit -m "add file2"', { cwd: tmpDir, stdio: 'pipe' });
    const hash = await Snapshot.getCurrentHash(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'file1 changed');
    fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'file2 changed');
    const result = await Snapshot.revertFiles(tmpDir, hash!, ['file1.txt']);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, 'file1.txt'), 'utf-8')).toBe('initial content');
    expect(fs.readFileSync(path.join(tmpDir, 'file2.txt'), 'utf-8')).toBe('file2 changed');
  });
  test('reverts multiple files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'file2 initial');
    execSync('git add -A && git commit -m "add file2"', { cwd: tmpDir, stdio: 'pipe' });
    const hash = await Snapshot.getCurrentHash(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'changed1');
    fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'changed2');
    const result = await Snapshot.revertFiles(tmpDir, hash!, ['file1.txt', 'file2.txt']);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, 'file1.txt'), 'utf-8')).toBe('initial content');
    expect(fs.readFileSync(path.join(tmpDir, 'file2.txt'), 'utf-8')).toBe('file2 initial');
  });
  test('returns error for nonexistent file', async () => {
    const hash = await Snapshot.getCurrentHash(tmpDir);
    const result = await Snapshot.revertFiles(tmpDir, hash!, ['nonexistent.txt']);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to revert nonexistent.txt');
  });
});
describe('snapshot: getWorkingTreeHash (real repo)', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempGitRepo(); });
  afterEach(() => { removeTempDir(tmpDir); });
  test('returns hash for clean repo', async () => {
    const hash = await Snapshot.getWorkingTreeHash(tmpDir);
    expect(hash).toBeTruthy();
    expect(hash!.length).toBeGreaterThan(5);
  });
  test('returns different hash after modifying files', async () => {
    const hash1 = await Snapshot.getWorkingTreeHash(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'different content');
    const hash2 = await Snapshot.getWorkingTreeHash(tmpDir);
    expect(hash1).not.toBe(hash2);
  });
  test('returns same hash for identical content', async () => {
    const hash1 = await Snapshot.getWorkingTreeHash(tmpDir);
    const hash2 = await Snapshot.getWorkingTreeHash(tmpDir);
    expect(hash1).toBe(hash2);
  });
  test('returns null for non-git directory', async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-nongit-'));
    try {
      const hash = await Snapshot.getWorkingTreeHash(nonGitDir);
      expect(hash).toBeNull();
    } finally { removeTempDir(nonGitDir); }
  });
});
describe('snapshot: cleanup with refs (real repo)', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempGitRepo(); });
  afterEach(() => { removeTempDir(tmpDir); });
  test('removes old snapshot refs beyond retention period', async () => {
    const result = await Snapshot.track(tmpDir);
    expect(result.success).toBe(true);
    const oldRef = 'refs/stratuscode/snapshots/1000';
    execSync(`git update-ref ${oldRef} ${result.hash}`, { cwd: tmpDir, stdio: 'pipe' });
    await Snapshot.cleanup(tmpDir);
    const afterRefs = execSync('git for-each-ref --format="%(refname)" refs/stratuscode/snapshots/', { cwd: tmpDir }).toString().trim();
    expect(afterRefs).not.toContain(oldRef);
  });
  test('keeps recent snapshot refs within retention period', async () => {
    const result = await Snapshot.track(tmpDir);
    expect(result.success).toBe(true);
    await Snapshot.cleanup(tmpDir);
    const afterRefs = execSync('git for-each-ref --format="%(refname)" refs/stratuscode/snapshots/', { cwd: tmpDir }).toString().trim();
    expect(afterRefs.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(1);
  });
  test('cleanup with zero retention removes all refs', async () => {
    const result = await Snapshot.track(tmpDir);
    expect(result.success).toBe(true);
    await Snapshot.cleanup(tmpDir, 0);
    const afterRefs = execSync('git for-each-ref --format="%(refname)" refs/stratuscode/snapshots/', { cwd: tmpDir }).toString().trim();
    expect(afterRefs).toBe('');
  });
});
