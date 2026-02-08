import { describe, expect, test } from 'bun:test';
import { Snapshot } from './snapshot';

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
    // This test runs inside the stratuscode repo
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
